import { initCanvas } from './canvasLayerRenderer.js';
import { addLayer } from './layerController.js';
import { setupLayerUI, renderLayerList } from './layerUIManager.js';
import { Events } from './types/events.js';

const canvas = document.getElementById('app-canvas');
if (!canvas) {
    throw new Error('Canvas element with id "app-canvas" not found');
}

const ctx = canvas.getContext('2d');
if (!ctx) {
    throw new Error('2D context not available');
}

initCanvas(canvas, ctx);

const layerListEl = document.getElementById('layer-list');
const addLayerBtn = document.getElementById('add-layer-btn');
const exportBtn = document.getElementById('export-btn');

if (layerListEl) {
    setupLayerUI(layerListEl, addLayerBtn || undefined);

    // Wire the add-layer request to actually add and re-render
    layerListEl.addEventListener(Events.EVENT_LAYER_ADDED, function () {
        const layer = addLayer();
        document.dispatchEvent(new CustomEvent(Events.EVENT_SELECTION_CHANGED, { detail: { id: layer.id } }));
        renderLayerList();
    });
} else {
    console.warn('Layer list element not found (id="layer-list")');
}

// Seed with a default background layer (locked and always at the bottom)
addLayer('Background', true);
renderLayerList();


if (exportBtn) {
    exportBtn.addEventListener('click', async function () {
        // Ensure the latest frame is rendered before exporting
        document.dispatchEvent(new CustomEvent(Events.EVENT_EXPORT_BEGIN));
        await new Promise(resolve => requestAnimationFrame(resolve));

        const download = function (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const ts = new Date();
            const pad = n => n.toString().padStart(2, '0');
            const filename = `canvas-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.png`;
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        };

        if (canvas.toBlob) {
            canvas.toBlob(function (blob) {
                document.dispatchEvent(new CustomEvent(Events.EVENT_EXPORT_END));
                if (blob) download(blob);
            }, 'image/png');
        } else {
            // Fallback for very old browsers
            const dataUrl = canvas.toDataURL('image/png');
            document.dispatchEvent(new CustomEvent(Events.EVENT_CANVAS_EXPORT_END));

            const res = await fetch(dataUrl);
            const blob = await res.blob();
            download(blob);
        }
    });
}
