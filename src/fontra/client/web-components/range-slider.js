import { html, css, LitElement } from "../third-party/lit.js";

export class RangeSlider extends LitElement {
  static styles = css`
    :host {
      --thumb-width: 20px;
    }

    .wrapper {
      position: relative;
      display: flex;
      gap: 0.5em;
      font-family: fontra-ui-regular, sans-serif;
    }

    .slider-name {
      min-width: 7ch;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .slider-name:hover {
      cursor: pointer;
    }

    .foldable-marker.active {
      display: inline-block;
      transform: rotate(90deg);
    }

    .foldable {
      display: none;
      margin: 0.55em 0 0.2em 0;
      font-size: 1em;
      color: var(--ui-list-row-foreground-color);
      background: var(--ui-list-row-selected-background-color);
      border: solid 1px var(--ui-list-border-color);
      border-radius: 0 0 10px 0;
      padding: 0 0.5em;
      z-index: 100;
    }

    .foldable > p {
      color: rgba(var(--foreground-color), 0.5);
      margin: 0;
    }

    .foldable.active {
      display: block;
    }

    .reset {
      position: absolute;
      top: -1.1em;
      right: 0;
      color: dimgray;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.2s ease-in-out;
    }

    .reset.active {
      opacity: 1;
    }

    .range-container {
      position: relative;
    }

    /* Chrome, Safari, Edge, Opera */
    .slider-default-value::-webkit-outer-spin-button,
    .slider-default-value::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    /* Firefox */
    .slider-default-value[type="number"] {
      -moz-appearance: textfield;
    }

    .slider {
      -webkit-appearance: none;
      position: relative;
      margin: 0;
      width: 100%;
      background: transparent;
    }

    /* Special styling for WebKit/Blink */
    .slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      height: 12px;
      width: var(--thumb-width);
      background: #282828;
      border: none;
      border-radius: 7px;
      cursor: pointer;
      margin-top: -3.5px; /* You need to specify a margin in Chrome, but in Firefox and IE it is automatic */
    }

    .slider::-webkit-slider-runnable-track {
      height: 5px;
      background: dimgray;
    }

    .slider:focus::-webkit-slider-runnable-track {
      background: dimgray;
    }

    /* Firefox */
    .slider::-moz-range-thumb {
      height: 12px;
      width: var(--thumb-width);
      background: #282828;
      border: none;
      cursor: pointer;
    }

    .slider::-moz-range-track {
      height: 5px;
      background: dimgray;
    }

    /* All the same stuff for IE */
    .slider::-ms-thumb {
      height: 12px;
      width: var(--thumb-width);
      background: #282828;
      border: none;
      cursor: pointer;
    }

    .slider::-ms-track {
      height: 5px;
      background: dimgray;
    }

    .range-container > input + div {
      margin-top: -11px;
      z-index: -1;
    }

    .range-container > .range-slider-options {
      position: relative;
      padding: 0 10px; // half of var(--thumb-width). Not recognised if referenced by variable
    }

    .range-container > .range-slider-options > span {
      display: block;
      position: relative;
      left: calc(var(--offset));
      width: 2px;
      height: 5.5px;
      opacity: 0.65;
      background: dimgray;
    }

    input {
      width: inherit;
    }

    .numeric-input > div {
      opacity: 0.3;
      font-size: 10px;
      padding: 5px;
      color: white;
      background-color: black;
      border: 1px solid black;
      border-radius: 5px;
      pointer-events: none;
    }

    .numeric-input > .slider-input {
      position: relative;
    }

    .numeric-input > .slider-input > .slider-default-value {
      width: 40px;
      border-radius: 5px;
      border: 1px solid dimgray;
      text-align: center;
      font-size: 0.85em;
    }
  `;

  static properties = {
    name: { type: String },
    minValue: { type: Number },
    maxValue: { type: Number },
    defaultValue: { type: Number },
    value: { type: Number },
    tickmarksPositions: { type: Array },
    step: { type: Number },
    onChangeCallback: { type: Function },
  };

  constructor() {
    super();
    // Fallbacks for attributes that are not defined when calling the component
    this.name = "Slider";
    this.minValue = 0;
    this.maxValue = 100;
    this.defaultValue = this.minValue;
    this.value = this.defaultValue;
    this.tickmarksPositions = [];
    this.step = "any";
    this.onChangeCallback = () => {};
  }

  render() {
    return html`
      <section class="wrapper">
        <div class="slider-name" @click=${() => this.toggleFoldable()}>
          <span class="foldable-marker">▶</span> ${this.name}
        </div>
        <div class="range-container">
          <span
            class="reset ${this.value !== this.defaultValue ? "active" : ""}"
            @click=${this.reset}
            >↺</span
          >
          <input
            type="range"
            @input=${this.changeValue}
            class="slider"
            min=${this.minValue}
            max=${this.maxValue}
            step=${this.step}
            .value=${this.value}
            list="markers"
          />
          <div class="range-slider-options">
            ${this.tickmarksPositions.map((pos) => {
              const posOffset =
                ((pos - this.minValue) / (this.maxValue - this.minValue)) * 100;
              return html`<span style="--offset: ${posOffset}%;"></span>`;
            })}
          </div>
          <datalist id="markers">
            ${this.tickmarksPositions.map(
              (pos) => html`<option value="${pos}"></option>`
            )}
          </datalist>
        </div>
        <div class="numeric-input">
          <section class="slider-input">
            <input
              type="number"
              @change=${this.changeValue}
              class="slider-default-value"
              min=${this.minValue}
              max=${this.maxValue}
              step=${this.step}
              pattern="[0-9]+"
              .value=${this.roundToDecimal(this.value)}
            />
          </section>
        </div>
      </section>
      <div class="foldable">
        <p><strong>${this.name}</strong></p>
        <p>
          <span>Min: <strong>${this.minValue}</strong></span
          >&nbsp; |
          <span
            >Default: <strong>${this.roundToDecimal(this.defaultValue)}</strong></span
          >&nbsp; |
          <span>Max: <strong>${this.maxValue}</strong></span>
        </p>
      </div>
    `;
  }

  changeValue(e) {
    const value = e.target.value;
    const isValid = e.target.reportValidity() && isNumeric(value);
    if (isValid) {
      this.value = value;
    } else {
      e.target.setAttribute("aria-invalid", !isValid);
      if (!isNumeric(value)) {
        this.value = this.defaultValue;
      } else if (value < this.minValue) {
        this.value = this.minValue;
      } else if (value > this.maxValue) {
        this.value = this.maxValue;
      } else {
        this.value = this.defaultValue;
      }
    }
    this.onChangeCallback();
  }

  toggleFoldable() {
    const marker = this.shadowRoot.querySelector(".foldable-marker");
    const foldable = this.shadowRoot.querySelector(".foldable");
    marker.classList.toggle("active");
    foldable.classList.toggle("active");
  }

  reset() {
    this.value = this.defaultValue;
    this.onChangeCallback(this.value);
  }

  buildTickmarks() {
    if (this.defaultValue > this.minValue && this.defaultValue <= this.maxValue) {
      this.tickmarksPositions.push(this.defaultValue);
    }
  }

  roundToDecimal(value) {
    return Number(Math.round(parseFloat(value + "e" + 2)) + "e-" + 2);
  }

  connectedCallback() {
    super.connectedCallback();
    this.buildTickmarks();
    this.reset();
  }
}

customElements.define("range-slider", RangeSlider);

function isNumeric(str) {
  if (typeof str != "string") return false; // we only process strings!
  return (
    !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !isNaN(parseFloat(str))
  ); // ...and ensure strings of whitespace fail
}
