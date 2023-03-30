import { UnlitElement, div, input, label } from "/core/unlit.js";

export class SimpleSettings extends UnlitElement {
  static styles = `
    .header {
      margin-top: 0.6em;
      margin-bottom: 0.2em;
      font-weight: bold;
    }
  `;

  get model() {
    return this._model;
  }

  set model(model) {
    if (this._model) {
      this._model.removeEventListener("changed", this._modelListener);
    }
    this._model = model;
    this._modelListener = (event) => {
      if (this._keys.has(event.key)) {
        this.requestUpdate();
      }
    };
    this._model.addEventListener("changed", this._modelListener);
    this.requestUpdate();
  }

  get descriptions() {
    return this._descriptions;
  }

  set descriptions(descriptions) {
    this._descriptions = descriptions;
    this._keys = new Set(descriptions.map((description) => description.key));
    this.requestUpdate();
  }

  render() {
    if (!this._descriptions || !this._model) {
      return;
    }

    const wrapListener = this._wrapListener.bind(this);
    return this._descriptions.map((description) =>
      uiTypes[description.ui](wrapListener, description, this._model)
    );
  }

  _wrapListener(func) {
    const listenerWrapper = (event) => {
      let error;
      this._model.removeEventListener("changed", this._modelListener);
      try {
        func(event);
      } catch (e) {
        error = e;
      }
      this._model.addEventListener("changed", this._modelListener);
      if (error) {
        throw error;
      }
    };
    return listenerWrapper;
  }
}

const uiTypes = {
  header(wrapListener, description, model) {
    return div({ class: "header" }, [description.displayName]);
  },

  checkbox(wrapListener, description, model) {
    const id = `simple-settings.${description.key}`;
    const listener = wrapListener((event) => {
      model[description.key] = event.target.checked;
    });

    return div({}, [
      input({
        type: "checkbox",
        id: id,
        onchange: listener,
        checked: model[description.key],
      }),
      label({ for: id }, [description.displayName]),
    ]);
  },

  radio(wrapListener, description, model) {
    const id = `simple-settings.${description.key}`;
    const listener = wrapListener((event) => {
      model[description.key] = event.target.value;
    });

    return [
      description.displayName
        ? div({ class: "header" }, [description.displayName])
        : "",
      ...description.options.map((option) => {
        const itemID = `${id}.${option.key}`;
        return div({}, [
          input({
            type: "radio",
            id: itemID,
            name: id,
            value: option.key,
            onchange: listener,
            checked: model[description.key] == option.key,
          }),
          label({ for: itemID }, [option.displayName]),
        ]);
      }),
    ];
  },
};

customElements.define("simple-settings", SimpleSettings);