import {initCanvas} from './initCanvas';
import {addLayer} from './layer_management_functions';
import {setupLayerUI, renderLayerList} from './layer_management_u_i';


const canvas = document.getElementById('app-canvas') as HTMLCanvasElement | null;
if (!canvas) {
    throw new Error('Canvas element with id "app-canvas" not found');
}

const ctx = canvas.getContext('2d');
if (!ctx) {
    throw new Error('2D context not available');
}

initCanvas(canvas, ctx);

const layerListEl = document.getElementById('layer-list') as HTMLUListElement | null;
const addLayerBtn = document.getElementById('add-layer-btn') as HTMLButtonElement | null;
const exportBtn = document.getElementById('export-btn') as HTMLButtonElement | null;


if (layerListEl) {
    setupLayerUI(layerListEl, addLayerBtn ?? undefined);
    // Wire the add-layer request to actually add and re-render
    layerListEl.addEventListener('layers:add-request', () => {
        addLayer();
        renderLayerList();
    });
} else {
    console.warn('Layer list element not found (id="layer-list")');
}

// Seed with a default background layer (locked and always at the bottom)
addLayer('Background', true);
renderLayerList();
if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
        // Ensure the latest frame is rendered before exporting
        document.dispatchEvent(new CustomEvent('canvas:export:begin'));
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

        const download = (blob: Blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const ts = new Date();
            const pad = (n: number) => n.toString().padStart(2, '0');
            const filename = `canvas-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.png`;
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        };

        if ('toBlob' in canvas && typeof canvas.toBlob === 'function') {
            canvas.toBlob((blob) => {
                document.dispatchEvent(new CustomEvent('canvas:export:end'));

                if (blob) download(blob);
            }, 'image/png');
        } else {
            // Fallback for very old browsers
            const dataUrl = canvas.toDataURL('image/png');
            document.dispatchEvent(new CustomEvent('canvas:export:end'));

            const res = await fetch(dataUrl);
            const blob = await res.blob();
            download(blob);
        }
    });
}
