import logging
import math


logger = logging.getLogger(__name__)


ON_CURVE = 0x00
OFF_CURVE_QUAD = 0x01
OFF_CURVE_CUBIC = 0x02
SMOOTH_FLAG = 0x08
POINT_TYPE_MASK = 0x07


class PackedPathPointPen:
    def __init__(self):
        self.coordinates = []
        self.pointTypes = []
        self.contourInfo = []
        self.components = []
        self._currentContour = None

    def getPath(self):
        if self.coordinates:
            return dict(
                coordinates=self.coordinates,
                pointTypes=self.pointTypes,
                contourInfo=self.contourInfo,
            )
        else:
            return None

    def beginPath(self, **kwargs):
        self._currentContour = []

    def addPoint(self, pt, segmentType=None, smooth=False, *args, **kwargs):
        self._currentContour.append((pt, segmentType, smooth))

    def endPath(self):
        if not self._currentContour:
            return
        isClosed = self._currentContour[0][1] != "move"
        isQuadBlob = all(
            segmentType is None for _, segmentType, _ in self._currentContour
        )
        if isQuadBlob:
            self.pointTypes.extend([OFF_CURVE_QUAD] * len(self._currentContour))
            for pt, _, _ in self._currentContour:
                self.coordinates.extend(pt)
        else:
            pointTypes = []
            for pt, segmentType, smooth in self._currentContour:
                smoothFlag = SMOOTH_FLAG if smooth else 0x00
                if segmentType is None:
                    pointTypes.append(OFF_CURVE_CUBIC)
                elif segmentType in {"move", "line", "curve", "qcurve"}:
                    pointTypes.append(ON_CURVE | smoothFlag)
                else:
                    raise TypeError(f"unexpected segment type: {segmentType}")

                self.coordinates.extend(pt)
            assert len(pointTypes) == len(self._currentContour)
            # Fix the quad point types
            for i, (_, segmentType, _) in enumerate(self._currentContour):
                if segmentType == "qcurve":
                    stopIndex = i - len(pointTypes) if isClosed else -1
                    for j in range(i - 1, stopIndex, -1):
                        if pointTypes[j] != OFF_CURVE_CUBIC:
                            break
                        pointTypes[j] = OFF_CURVE_QUAD
            self.pointTypes.extend(pointTypes)
        self.contourInfo.append(
            dict(endPoint=len(self.coordinates) // 2 - 1, isClosed=isClosed)
        )
        self._currentContour = None

    def addComponent(self, glyphName, transformation, **kwargs):
        xx, xy, yx, yy, dx, dy = transformation
        rotation, scalex, scaley, skewx, skewy = decomposeTwoByTwo((xx, xy, yx, yy))
        # TODO rotation is problematic with interpolation: should interpolation
        # go clockwise or counter-clockwise? That ambiguous, and get more complicated
        # with > 2 masters. Perhaps we can "normalize" the rotations angles in some
        # way to have reasonable behavior in common cases.
        if rotation == -0.0:
            rotation = 0.0
        if abs(skewx) > 0.00001:
            logger.warn(f"x skew is not yet supported ({glyphName}, {skewx})")
        if abs(skewy) > 0.00001:
            logger.warn(f"y skew is not yet supported ({glyphName}, {skewy})")
        transformation = dict(
            x=dx,
            y=dy,
            scalex=scalex,
            scaley=scaley,
            rotation=math.degrees(rotation),
            tcenterx=0,
            tcentery=0,
        )

        self.components.append(
            {
                "name": glyphName,
                "transformation": transformation,
            }
        )


def decomposeTwoByTwo(twoByTwo):
    """Decompose a 2x2 transformation matrix into components:
    - rotation
    - scalex
    - scaley
    - skewx
    - skewy
    """
    a, b, c, d = twoByTwo
    delta = a * d - b * c

    rotation = 0
    scalex = scaley = 0
    skewx = skewy = 0

    # Apply the QR-like decomposition.
    if a != 0 or b != 0:
        r = math.sqrt(a * a + b * b)
        rotation = math.acos(a / r) if b > 0 else -math.acos(a / r)
        scalex, scaley = (r, delta / r)
        skewx, skewy = (math.atan((a * c + b * d) / (r * r)), 0)
    elif c != 0 or d != 0:
        s = math.sqrt(c * c + d * d)
        rotation = math.pi / 2 - (math.acos(-c / s) if d > 0 else -math.acos(c / s))
        scalex, scaley = (delta / s, s)
        skewx, skewy = (0, math.atan((a * c + b * d) / (s * s)))
    else:
        # a = b = c = d = 0
        pass

    return rotation, scalex, scaley, skewx, skewy


_pointToSegmentType = {
    OFF_CURVE_CUBIC: "curve",
    OFF_CURVE_QUAD: "qcurve",
}


def drawPackedPathToPointPen(path, pen):
    startPoint = 0
    for contourInfo in path["contourInfo"]:
        endPoint = contourInfo["endPoint"] + 1
        coordinates = path["coordinates"][startPoint * 2 : endPoint * 2]
        points = list(pairwise(coordinates))
        pointTypes = path["pointTypes"][startPoint:endPoint]
        assert len(points) == len(pointTypes)
        pen.beginPath()
        segmentType = (
            _pointToSegmentType.get(pointTypes[-1] & POINT_TYPE_MASK, "line")
            if contourInfo["isClosed"]
            else "move"
        )
        for point, pointType in zip(points, pointTypes):
            isSmooth = bool(pointType & SMOOTH_FLAG)
            pointType = pointType & POINT_TYPE_MASK
            pen.addPoint(
                point,
                segmentType=segmentType if pointType == 0 else None,
                smooth=isSmooth,
            )
            segmentType = _pointToSegmentType.get(pointType, "line")
        pen.endPath()
        startPoint = endPoint


def pairwise(iterable):
    it = iter(iterable)
    return zip(it, it)


def deleteContour(path, contourIndex):
    contourIndex = _normalizeContourIndex(path, contourIndex)
    contour = path["contourInfo"][contourIndex]
    startPoint = _getContourStartPoint(path, contourIndex)
    numPoints = contour["endPoint"] + 1 - startPoint
    _replacePoints(path, startPoint, numPoints, [], [])
    del path["contourInfo"][contourIndex]
    _moveEndPoints(path, contourIndex, -numPoints)


def insertContour(path, contourIndex, contour):
    contourIndex = _normalizeContourIndex(path, contourIndex, True)
    startPoint = _getContourStartPoint(path, contourIndex)
    _replacePoints(path, startPoint, 0, contour["coordinates"], contour["pointTypes"])
    contourInfo = {"endPoint": startPoint - 1, "isClosed": contour["isClosed"]}
    path["contourInfo"].insert(contourIndex, contourInfo)
    _moveEndPoints(path, contourIndex, len(contour["pointTypes"]))


def deletePoint(path, contourIndex, contourPointIndex):
    contourIndex = _normalizeContourIndex(path, contourIndex)
    pointIndex = _getAbsolutePointIndex(path, contourIndex, contourPointIndex)
    _replacePoints(path, pointIndex, 1, [], [])
    _moveEndPoints(path, contourIndex, -1)


def insertPoint(path, contourIndex, contourPointIndex, point):
    contourIndex = _normalizeContourIndex(path, contourIndex)
    pointIndex = _getAbsolutePointIndex(path, contourIndex, contourPointIndex, True)
    _insertPoint(path, contourIndex, pointIndex, point)


def _insertPoint(path, contourIndex, pointIndex, point):
    pointType = packPointType(point.get("type"), point.get("smooth"))
    _replacePoints(path, pointIndex, 0, [point["x"], point["y"]], [pointType])
    _moveEndPoints(path, contourIndex, 1)


def _getContourStartPoint(path, contourIndex):
    return (
        0
        if contourIndex == 0
        else path["contourInfo"][contourIndex - 1]["endPoint"] + 1
    )


def _getAbsolutePointIndex(path, contourIndex, contourPointIndex, forInsert=False):
    startPoint = _getContourStartPoint(path, contourIndex)
    contour = path["contourInfo"][contourIndex]
    numPoints = contour["endPoint"] + 1 - startPoint
    originalContourPointIndex = contourPointIndex
    if contourPointIndex < 0:
        contourPointIndex += numPoints
    if contourPointIndex < 0 or (
        contourPointIndex >= numPoints + (1 if forInsert else 0)
    ):
        raise IndexError(
            f"contourPointIndex out of bounds: {originalContourPointIndex}"
        )
    return startPoint + contourPointIndex


def _normalizeContourIndex(path, contourIndex, forInsert=False):
    originalContourIndex = contourIndex
    numContours = len(path["contourInfo"])
    if contourIndex < 0:
        contourIndex += numContours
    bias = 1 if forInsert else 0
    if contourIndex < 0 or contourIndex >= numContours + bias:
        raise IndexError(f"contourIndex out of bounds: {originalContourIndex}")
    return contourIndex


def _replacePoints(path, startPoint, numPoints, coordinates, pointTypes):
    dblIndex = startPoint * 2
    path["coordinates"][dblIndex : dblIndex + numPoints * 2] = coordinates
    path["pointTypes"][startPoint : startPoint + numPoints] = pointTypes


def _moveEndPoints(path, fromContourIndex, offset):
    for contourInfo in path["contourInfo"][fromContourIndex:]:
        contourInfo["endPoint"] += offset


def unpackPath(packedPath):
    unpackedPath = []
    coordinates = packedPath["coordinates"]
    pointTypes = packedPath["pointTypes"]
    startIndex = 0
    for contourInfo in packedPath["contourInfo"]:
        endIndex = contourInfo["endIndex"] + 1
        points = list(_iterPoints(coordinates, pointTypes, startIndex, endIndex))
        unpackedPath.append(dict(points=points, isClosed=contourInfo["isClosed"]))
        startIndex = endIndex
    return unpackedPath


def _iterPoints(coordinates, pointTypes, startIndex, endIndex):
    for i in range(startIndex, endIndex):
        point = dict(x=coordinates[i * 2], y=coordinates[i * 2 + 1])
        pointType = pointTypes[i] & POINT_TYPE_MASK
        if pointType:
            point["type"] = "cubic" if pointType == OFF_CURVE_CUBIC else "quad"
        elif pointTypes[i] & SMOOTH_FLAG:
            point["smooth"] = True
        yield point


def packPath(unpackedPath):
    coordinates = []
    pointTypes = []
    contourInfo = []
    packedContours = [packContour(c) for c in unpackedPath]
    for packedContour in packedContours:
        coordinates.extend(packedContour["coordinates"])
        pointTypes.extend(packedContour["pointTypes"])
        contourInfo.append(
            dict(endPoint=len(pointTypes) - 1, isClosed=packedContour["isClosed"])
        )
    return dict(coordinates=coordinates, pointTypes=pointTypes, contourInfo=contourInfo)


def packContour(unpackedContour):
    coordinates = []
    pointTypes = []
    for point in unpackedContour["points"]:
        coordinates.append(point["x"])
        coordinates.append(point["y"])
        pointTypes.append(packPointType(point.get("type"), point.get("smooth")))
    return dict(
        coordinates=coordinates,
        pointTypes=pointTypes,
        isClosed=unpackedContour["isClosed"],
    )


def packPointType(type, smooth):
    if type:
        pointType = OFF_CURVE_CUBIC if type == "cubic" else OFF_CURVE_QUAD
    elif smooth:
        pointType = ON_CURVE | SMOOTH_FLAG
    else:
        pointType = ON_CURVE
    return pointType
