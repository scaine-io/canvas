import { initCanvas } from './initCanvas';
import { addLayer } from './layer_management_functions';
import { setupLayerUI, renderLayerList } from './layer_management_u_i';


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
// ... existing code ...
