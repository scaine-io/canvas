import {Events} from "../types/layer";

export async function ConvertCanvasToBlob(canvas: HTMLCanvasElement) {
    //convert canvas to blob
    const blob = await new Promise<Blob | null>((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Failed to convert canvas to blob'));
            }
        }, 'image/png');
    });

    document.dispatchEvent(new CustomEvent(Events.EVENT_CANVAS_EXPORT_END));
        return blob;
}


export async function ConvertCanvasToPng(canvas: HTMLCanvasElement) {

}


export function CanvasRerender(){
    document.dispatchEvent(new CustomEvent(Events.EVENT_RERENDER));
}
