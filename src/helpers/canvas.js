import {Events} from "../types/events.js";

export function CanvasRerender() {
    document.dispatchEvent(new CustomEvent(Events.EVENT_RERENDER));
}
