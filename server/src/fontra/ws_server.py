import asyncio
import json
import logging
import traceback
import websockets


logger = logging.getLogger(__name__)


class WebSocketServer:
    def __init__(self, subjectFactory, *, clients=None, verboseErrors=False):
        self.clients = clients if clients is not None else {}
        self.subjectFactory = subjectFactory
        self.verboseErrors = verboseErrors

    def getServerTask(self, host="localhost", port=8001):
        return websockets.serve(self.incomingConnection, host, port)

    def run(self, host="localhost", port=8001):
        startServer = self.getServerTask()
        asyncio.get_event_loop().run_until_complete(startServer)
        asyncio.get_event_loop().run_forever()

    def registerClient(self, client):
        self.clients[client.websocket] = client

    def unregisterClient(self, client):
        del self.clients[client.websocket]

    async def incomingConnection(self, websocket, path):
        client = Client(websocket, path, self.subjectFactory, self.verboseErrors)
        self.registerClient(client)
        try:
            await client.handleConnection()
        finally:
            self.unregisterClient(client)


class ClientException(Exception):
    pass


class Client:
    def __init__(self, websocket, path, subjectFactory, verboseErrors):
        self.websocket = websocket
        self.path = path
        self.subjectFactory = subjectFactory
        self.verboseErrors = verboseErrors
        self.clientUUID = None
        self.callReturnFutures = {}
        self.getNextServerCallID = _genNextServerCallID()

    @property
    def proxy(self):
        return ClientProxy(self)

    async def handleConnection(self):
        try:
            await self._handleConnection()
        except websockets.exceptions.ConnectionClosedError as e:
            logger.info(f"websocket connection closed: {e!r}")

    async def _handleConnection(self):
        logger.info(f"incoming connection: {self.path!r}")
        tasks = []
        subject = None
        async for message in self.websocket:
            message = json.loads(message)
            if "client-uuid" in message:
                self.clientUUID = message["client-uuid"]
                token = message["autorization-token"]
                remoteIP = self.websocket.remote_address[0]
                subject = await self.subjectFactory(self.path, token, remoteIP)
                continue
            if subject is None:
                raise ClientException("unauthorized")
            if message.get("connection") == "close":
                logger.info("client requested connection close")
                break
            tasks = [task for task in tasks if not task.done()]
            if "client-call-id" in message:
                # this is an incoming client -> server call
                tasks.append(
                    asyncio.create_task(self._performCall(message, subject))
                )
            elif "server-call-id" in message:
                # this is a response to a server -> client call
                fut = self.callReturnFutures[message["server-call-id"]]
                returnValue = message.get("return-value")
                error = message.get("error")
                if error is None:
                    fut.set_result(returnValue)
                else:
                    fut.set_exception(ClientException(error))

    async def _performCall(self, message, subject):
        clientCallID = "unknown-client-call-id"
        try:
            clientCallID = message["client-call-id"]
            methodName = message["method-name"]
            arguments = message.get("arguments", [])
            if methodName in subject.remoteMethodNames:
                methodHandler = getattr(subject, methodName)
                returnValue = await methodHandler(*arguments, client=self)
                response = {"client-call-id": clientCallID, "return-value": returnValue}
            else:
                response = {
                    "client-call-id": clientCallID,
                    "exception": f"unknown method {methodName}",
                }
        except Exception as e:
            logger.error("uncaught exception: %r", e)
            if self.verboseErrors:
                traceback.print_exc()
            response = {"client-call-id": clientCallID, "exception": repr(e)}
        await self.sendMessage(response)

    async def sendMessage(self, message):
        await self.websocket.send(json.dumps(message, separators=(",", ":")))


class ClientProxy:
    def __init__(self, client):
        self._client = client

    def __getattr__(self, methodName):
        if methodName.startswith("_"):
            return super().__getattr__(methodName)

        async def methodWrapper(*args):
            serverCallID = next(self._client.getNextServerCallID)
            message = {
                "server-call-id": serverCallID,
                "method-name": methodName,
                "arguments": args,
            }
            returnFuture = asyncio.get_running_loop().create_future()
            self._client.callReturnFutures[serverCallID] = returnFuture
            await self._client.sendMessage(message)
            return await returnFuture

        return methodWrapper


def _genNextServerCallID():
    serverCallID = 0
    while True:
        yield serverCallID
        serverCallID += 1
