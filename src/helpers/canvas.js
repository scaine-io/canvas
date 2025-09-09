import {Events} from "../events";

export function CanvasRerender() {
    document.dispatchEvent(new CustomEvent(Events.EVENT_RERENDER));
}
