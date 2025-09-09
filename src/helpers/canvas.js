import {Events} from "../events.js";

export function CanvasRerender() {
    document.dispatchEvent(new CustomEvent(Events.EVENT_RERENDER));
}
