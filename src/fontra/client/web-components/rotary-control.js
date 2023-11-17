import * as html from "../core/html-utils.js";
import { round } from "../core/utils.js";
import { distance, subVectors } from "../core/vector.js";

export class RotaryControl extends html.UnlitElement {
  static styles = `
  :host {
    --knob-size: 1.4rem;
    --thumb-size: calc(var(--knob-size) / 5);
  }

  .knob {
    width: var(--knob-size);
    height: var(--knob-size);
    border-radius: 50%;
    background: #e3e3e3;
    display: flex;
    justify-content: center;
  }

  .thumb {
    width: var(--thumb-size);
    height: var(--thumb-size);
    background: rgb(89, 89, 89);
    border-radius: 50%;
    margin-top: calc(var(--knob-size) / 8);
  }

  .rotary-control {
    display: flex;
    gap: 0.4rem;
    margin: 0.2rem;
  }

  .overlay {
    position: fixed;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    z-index: 1;
  }
  `;

  constructor() {
    super();
    this.onChangeCallback = () => {};
  }

  set value(value) {
    value %= 360;
    if (value < 0) {
      value = 360 + value;
    }
    this._value = value;
    if (this.knob) {
      this.knob.style.transform = `rotate(${this.value}deg)`;
    }
  }

  get value() {
    return this._value;
  }

  dispatch(value) {
    if (value > 180) {
      value -= 360;
    }
    this.onChangeCallback(value);
  }

  attachOverlay() {
    const overlay = html.div(
      {
        class: "overlay",
        onmouseup: () => {
          this.coordinatesDragBegin = undefined;
          this.angleWhenDragStart = undefined;
          this.shadowRoot.removeChild(overlay);
        },
        onmousemove: (event) => {
          if (this.coordinatesDragBegin === undefined) {
            return;
          }
          const diff = distance(this.coordinatesDragBegin, {
            x: event.clientX,
            y: event.clientY,
          });
          let value = this.angleWhenDragStart + diff;
          if (
            event.clientX < this.coordinatesDragBegin.x ||
            event.clientY < this.coordinatesDragBegin.y
          ) {
            value *= -1;
          }
          this.value = round(value);
          this.dispatch(this.value);
        },
      },
      []
    );
    this.overlay = overlay;
    this.shadowRoot.appendChild(overlay);
  }

  render() {
    return html.div({ class: "rotary-control" }, [
      (this.knob = html.div(
        {
          onwheel: (event) => {
            const delta =
              Math.abs(event.deltaX) > Math.abs(event.deltaY)
                ? -1 * event.deltaX
                : event.deltaY;
            this.value = this.value + delta;
            this.dispatch(this.value);
          },
          class: "knob",
          style: `transform: rotate(${this.value}deg);`,
          onmousedown: (event) => {
            this.coordinatesDragBegin = { x: event.clientX, y: event.clientY };
            this.angleWhenDragStart = this.value;
            event.preventDefault();
            this.attachOverlay();
          },
        },
        [html.div({ class: "thumb" })]
      )),
    ]);
  }
}

function originOfElement(element) {
  const boundingClientRect = element.getBoundingClientRect();
  return {
    x: boundingClientRect.x + boundingClientRect.width / 2,
    y: boundingClientRect.y + boundingClientRect.height / 2,
  };
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

customElements.define("rotary-control", RotaryControl);
