import { recordChanges } from "../core/change-recorder.js";
import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { enumerate, hexToRgba, range, rgbaToHex } from "../core/utils.js";
import { BaseInfoPanel } from "./panel-base.js";
import { message } from "/web-components/modal-dialog.js";

const defaultStatusFieldDefinitions = {
  "fontra.sourceStatusFieldDefinitions": [
    {
      color: [1, 0, 0, 1],
      isDefault: true,
      label: "In progress",
      value: 0,
    },
    {
      color: [1, 0.5, 0, 1],
      label: "Checking-1",
      value: 1,
    },
    {
      color: [1, 1, 0, 1],
      label: "Checking-2",
      value: 2,
    },
    {
      color: [0, 0.5, 1, 1],
      label: "Checking-3",
      value: 3,
    },
    {
      color: [0, 1, 0.5, 1],
      label: "Validated",
      value: 4,
    },
  ],
};

addStyleSheet(`
.fontra-ui-font-info-statusDefs-panel {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
}
`);

export class DevelopmentStatusDefinitionsPanel extends BaseInfoPanel {
  static title = "Status definitions";
  static id = "development-status-definitions-panel";
  static fontAttributes = ["statusDefinitions"];

  async setupUI() {
    const statusDefinitions = getStatusFieldDefinitions(this.fontController);

    const statusDefsContainer = html.div({
      style: "display: grid; gap: 0.5em;",
    });
    for (const index of range(statusDefinitions.length)) {
      statusDefsContainer.appendChild(
        new StatusDefinitionBox(
          this.fontController,
          index,
          this.postChange.bind(this),
          this.setupUI.bind(this)
        )
      );
    }

    this.panelElement.innerHTML = "";
    this.panelElement.style = `
    gap: 1em;
    `;
    this.panelElement.appendChild(
      html.input({
        type: "button",
        style: `justify-self: start;`,
        value: "New status definition",
        onclick: (event) => this.newStatusDefinition(),
      })
    );
    this.panelElement.appendChild(statusDefsContainer);
    this.panelElement.focus();
  }

  async newStatusDefinition() {
    const statusFieldDefinitions =
      this.fontController.customData["fontra.sourceStatusFieldDefinitions"];
    const nextStatusValue = !statusFieldDefinitions
      ? 0
      : statusFieldDefinitions
          .map((statusDef) => statusDef.value)
          .sort()
          .pop() + 1;

    const defaultStatuses =
      defaultStatusFieldDefinitions["fontra.sourceStatusFieldDefinitions"];
    let statusDef = defaultStatuses.find(
      (statusDef) => statusDef.value == nextStatusValue
    );

    if (!statusDef) {
      statusDef = {
        color: [1, 0, 0, 1],
        label: `Status definition ${nextStatusValue}`,
        value: nextStatusValue,
      };
    }

    const undoLabel = `add status definition ${statusDef.value} '${statusDef.label}'`;
    const root = { customData: this.fontController.customData };
    const changes = recordChanges(root, (root) => {
      if (!statusFieldDefinitions) {
        root.customData["fontra.sourceStatusFieldDefinitions"] = [statusDef];
      } else {
        root.customData["fontra.sourceStatusFieldDefinitions"].push(statusDef);
      }
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }
}

function getStatusFieldDefinitions(fontController) {
  const statusFieldDefinitions =
    fontController.customData["fontra.sourceStatusFieldDefinitions"];
  if (statusFieldDefinitions) {
    return statusFieldDefinitions;
  }
  return [];
}

addStyleSheet(`
.fontra-ui-font-info-status-definitions-panel-status-def-box {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
  display: grid;
  grid-template-rows: auto auto;
  grid-template-columns: max-content max-content max-content max-content auto;
  grid-row-gap: 0.1em;
  grid-column-gap: 1em;
}

.fontra-ui-font-info-status-definitions-panel-status-def-box-value {
  width: 2.5em;
  text-align: center;
}

.fontra-ui-font-info-status-definitions-panel-status-def-box-delete {
  justify-self: end;
}

.fontra-ui-font-info-status-definitions-panel-status-def-box-color-input {
  width: 8em;
  /*height: 1.6em; without height: best compromise for all browsers*/
  margin: 0;
  padding: 0;
  outline: none;
  border: none;
  border-color: transparent;
  border-radius: 0.25em;
}
`);

class StatusDefinitionBox extends HTMLElement {
  constructor(fontController, statusIndex, postChange, setupUI) {
    super();
    this.classList.add("fontra-ui-font-info-status-definitions-panel-status-def-box");
    this.fontController = fontController;
    this.statusIndex = statusIndex;
    this.postChange = postChange;
    this.setupUI = setupUI;
    this._updateContents();
  }

  get statusDef() {
    return this.fontController.customData["fontra.sourceStatusFieldDefinitions"][
      this.statusIndex
    ];
  }

  checkStatusDefValue(statusDefValue) {
    let errorMessage = "";
    const statusDefinitions =
      this.fontController.customData["fontra.sourceStatusFieldDefinitions"];
    if (statusDefinitions.some((statusDef) => statusDef.value == statusDefValue)) {
      errorMessage = `“${statusDefValue}” exists already, please use a different value.`;
    }

    if (!Number.isInteger(statusDefValue) || statusDefValue < 0) {
      errorMessage = "Value must be a positive number.";
    }

    if (errorMessage) {
      message(`Can’t edit status definition value`, errorMessage);
      return false;
    }
    return true;
  }

  replaceStatusDef(newStatusDef, undoLabel, statusIndex = this.statusIndex) {
    const root = { customData: this.fontController.customData };
    const changes = recordChanges(root, (root) => {
      root.customData["fontra.sourceStatusFieldDefinitions"][statusIndex] =
        newStatusDef;
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  deleteStatusDef(statusIndex) {
    const undoLabel = `delete status definition '${this.statusDef.name}'`;
    const root = { customData: this.fontController.customData };
    const changes = recordChanges(root, (root) => {
      root.customData["fontra.sourceStatusFieldDefinitions"].splice(statusIndex, 1);
      if (root.customData["fontra.sourceStatusFieldDefinitions"].length === 0) {
        delete root.customData["fontra.sourceStatusFieldDefinitions"];
      }
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  changeStatusDefIsDefault(event) {
    const undoLabel = `change status definition isDefault`;
    const statusDefinitions =
      this.fontController.customData["fontra.sourceStatusFieldDefinitions"];

    let newStatusDefinitions = [];
    for (const [index, oldStatusDef] of enumerate(statusDefinitions)) {
      const newStatusDef = { ...oldStatusDef };
      delete newStatusDef["isDefault"];
      if (index === this.statusIndex && event.target.checked) {
        newStatusDef["isDefault"] = true;
      }
      newStatusDefinitions.push(newStatusDef);
    }

    const root = { customData: this.fontController.customData };
    const changes = recordChanges(root, (root) => {
      root.customData["fontra.sourceStatusFieldDefinitions"] = newStatusDefinitions;
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  changeStatusDefValue(value) {
    const undoLabel = `change status definition value`;
    let statusDefinitions =
      this.fontController.customData["fontra.sourceStatusFieldDefinitions"];

    let newStatusDefinitions = [];
    for (const [index, oldStatusDef] of enumerate(statusDefinitions)) {
      const newStatusDef = { ...oldStatusDef };
      if (index === this.statusIndex) {
        newStatusDef.value = value;
      }
      newStatusDefinitions.push(newStatusDef);
    }

    // sort by value
    newStatusDefinitions.sort((a, b) => a.value - b.value);

    const root = { customData: this.fontController.customData };
    const changes = recordChanges(root, (root) => {
      root.customData["fontra.sourceStatusFieldDefinitions"] = newStatusDefinitions;
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  _updateContents() {
    this.innerHTML = "";
    const statusDef = this.statusDef;
    this.append(
      html.input({
        type: "text",
        class: "fontra-ui-font-info-status-definitions-panel-status-def-box-value",
        value: statusDef.value,
        onchange: (event) => {
          const statusDefValue = Number(event.target.value);
          if (!this.checkStatusDefValue(statusDefValue)) {
            this.setupUI();
            return;
          }
          this.changeStatusDefValue(statusDefValue);
        },
      })
    );

    this.append(
      html.input({
        "type": "color",
        "class":
          "fontra-ui-font-info-status-definitions-panel-status-def-box-color-input",
        "value": rgbaToHex(statusDef.color.slice(0, 3).concat([1])),
        "onchange": (event) => {
          const updatedStatusDef = {
            ...statusDef,
            color: hexToRgba(event.target.value),
          };
          this.replaceStatusDef(updatedStatusDef, "change status definition color");
        },
        "data-tooltip": "Specify the color for this status definition",
        "data-tooltipposition": "top",
      })
    );

    this.append(
      html.input({
        type: "text",
        value: statusDef.label,
        onchange: (event) => {
          const updatedStatusDef = {
            ...statusDef,
            label: event.target.value,
          };
          this.replaceStatusDef(updatedStatusDef, "change status definition label");
        },
      })
    );

    const checkBoxIdentifier = `statusDefIsDefault${this.statusIndex}`;
    this.append(
      html.div(
        {
          "style": "margin: auto;",
          "data-tooltip":
            "If set: This color will be used if a source status is not set.",
          "data-tooltipposition": "top",
        },
        [
          html.input({
            type: "checkbox",
            checked: statusDef.isDefault,
            id: checkBoxIdentifier,
            onchange: (event) => this.changeStatusDefIsDefault(event),
          }),
          html.label(
            {
              for: checkBoxIdentifier,
              style: "margin: auto;",
            },
            ["Is Default"]
          ),
        ]
      )
    );

    this.append(
      html.createDomElement("icon-button", {
        "class": "fontra-ui-font-info-status-definitions-panel-status-def-box-delete",
        "src": "/tabler-icons/trash.svg",
        "onclick": (event) => this.deleteStatusDef(this.statusIndex),
        "data-tooltip": "Delete status definition",
        "data-tooltipposition": "left",
      })
    );
  }
}

customElements.define("status-def-box", StatusDefinitionBox);
