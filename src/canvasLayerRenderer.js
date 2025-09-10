import { getSortedLayers } from './layerController.js';
import { CanvasRerender } from './helpers/canvas.js';
import { Events } from './types/events.js';
// Simple in-memory image cache
const imgCache = new Map();

/**
 * A simple in-memory image caching function.
 * Retrieves an image from the cache if available, otherwise loads it from the given URL.
 * Calls the provided `onLoaded` callback once the image is loaded.
 */
function getImage(url, onLoaded) {
    let img = imgCache.get(url);
    if (!img) {
        img = new Image();
        img.onload = () => onLoaded();
        img.src = url;
        imgCache.set(url, img);
    } else if (!img.complete) {
        img.onload = () => onLoaded();
    }
    return img;
}

function containRect(srcW, srcH, dstW, dstH) {
    const scale = Math.min(dstW / srcW, dstH / srcH);
    const w = Math.max(0, Math.floor(srcW * scale));
    const h = Math.max(0, Math.floor(srcH * scale));
    const x = Math.floor((dstW - w) / 2);
    const y = Math.floor((dstH - h) / 2);
    return { x, y, w, h };
}

// ----- Interaction state -----
let selectedId = null;
let dragMode = null;
let activeHandle = null;
let dragStart = { x: 0, y: 0 };
let startRect = { x: 0, y: 0, w: 0, h: 0 };
let showSelectionOverlays = true;

const HANDLE_SIZE = 8;

/**
 * Converts client coordinates (e.g., from a mouse pointer event) to canvas space coordinates.
 * This accounts for the canvas's size and position within the viewport.
 *
 */
function toCanvasSpace(canvas, clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const x = (clientX - r.left) * (canvas.width / r.width);
    const y = (clientY - r.top) * (canvas.height / r.height);
    return { x, y };
}

function pointInRect(px, py, x, y, w, h) {
    return px >= x && py >= y && px <= x + w && py <= y + h;
}


/**
 * Determines whether a given point (px, py) lies within the bounds of a rectangle
 * defined by its position (x, y) and dimensions (w, h).
 *
 * Useful for detecting user interactions such as clicks or drags within specific
 * areas of a canvas or UI component.
 */
function getHandleAt(layer, px, py) {
    const corners = [
        { id: 'nw', x: layer.x, y: layer.y },
        { id: 'ne', x: layer.x + layer.w, y: layer.y },
        { id: 'se', x: layer.x + layer.w, y: layer.y + layer.h },
        { id: 'sw', x: layer.x, y: layer.y + layer.h },
    ];
    for (const c of corners) {
        if (pointInRect(px, py, c.x - HANDLE_SIZE / 2, c.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)) {
            return c.id;
        }
    }
    return null;
}


/**
 * Determines which resizing handle (if any) is located at the given coordinates (px, py)
 * relative to the specified layer's rectangle.
 */
function applyResize(handle, dx, dy, rect) {
    const minSize = 8;
    let { x, y, w, h } = rect;

    switch (handle) {
        case 'nw':
            x += dx; y += dy; w -= dx; h -= dy; break;
        case 'ne':
            y += dy; w += dx; h -= dy; break;
        case 'se':
            w += dx; h += dy; break;
        case 'sw':
            x += dx; w -= dx; h += dy; break;
    }

    if (w < minSize) {
        const diff = minSize - w;
        if (handle === 'nw' || handle === 'sw') x -= diff;
        w = minSize;
    }
    if (h < minSize) {
        const diff = minSize - h;
        if (handle === 'nw' || handle === 'ne') y -= diff;
        h = minSize;
    }

    return { x, y, w, h };
}


/**
 * Initializes the canvas by setting up rendering, event listeners, and interaction handlers.
 *
 * This function establishes the rendering mechanism for layers on the canvas, handles custom events
 * to update the canvas during actions like exporting or selection changes, and defines pointer-based
 * interactions for moving or resizing layers on the canvas.
 */
function initCanvas(canvas, ctx) {
    renderLayers(canvas, ctx);

    document.addEventListener(Events.EVENT_RERENDER, () => renderLayers(canvas, ctx));
    document.addEventListener(Events.EVENT_EXPORT_BEGIN, () => { showSelectionOverlays = false; renderLayers(canvas, ctx); });
    document.addEventListener(Events.EVENT_EXPORT_END, () => { showSelectionOverlays = true; renderLayers(canvas, ctx); });

    document.addEventListener(Events.EVENT_SELECTION_CHANGED, (e) => {
        selectedId = e.detail?.id ?? null;
        showSelectionOverlays = true;
        renderLayers(canvas, ctx);
    });

    canvas.addEventListener('pointerdown', (e) => {
        const p = toCanvasSpace(canvas, e.clientX, e.clientY);
        const layersTopFirst = getSortedLayers();
        const layer = layersTopFirst.find(l => l.id === selectedId && !l.locked);
        if (!layer) { showSelectionOverlays = false; renderLayers(canvas, ctx); return; }

        const w = layer.w > 0 ? layer.w : layer.image?.width || 0;
        const h = layer.h > 0 ? layer.h : layer.image?.height || 0;

        if (!(w > 0 && h > 0 && pointInRect(p.x, p.y, layer.x, layer.y, w, h))) {
            showSelectionOverlays = false;
            renderLayers(canvas, ctx);
            return;
        }

        showSelectionOverlays = true;

        const handle = getHandleAt({ x: layer.x, y: layer.y, w, h }, p.x, p.y);
        if (handle) { dragMode = 'resize'; activeHandle = handle; }
        else { dragMode = 'move'; activeHandle = null; }

        dragStart = { x: p.x, y: p.y };
        startRect = { x: layer.x, y: layer.y, w, h };
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
    });

    canvas.addEventListener('pointermove', (e) => {
        const p = toCanvasSpace(canvas, e.clientX, e.clientY);
        const layers = getSortedLayers();
        const layer = layers.find(l => l.id === selectedId);

        if (!dragMode) {
            canvas.style.cursor = 'default';
            if (layer && !layer.locked) {
                const w = layer.w > 0 ? layer.w : layer.image?.width || 0;
                const h = layer.h > 0 ? layer.h : layer.image?.height || 0;
                if (w > 0 && h > 0 && pointInRect(p.x, p.y, layer.x, layer.y, w, h)) {
                    const hId = getHandleAt({ x: layer.x, y: layer.y, w, h }, p.x, p.y);
                    canvas.style.cursor = hId ? ((hId === 'nw' || hId === 'se') ? 'nwse-resize' : 'nesw-resize') : 'move';
                }
            }
        }

        if (!dragMode || !layer || layer.locked) return;

        const dx = p.x - dragStart.x;
        const dy = p.y - dragStart.y;

        if (dragMode === 'move') {
            layer.x = Math.round(startRect.x + dx);
            layer.y = Math.round(startRect.y + dy);
        } else if (dragMode === 'resize' && activeHandle) {
            const next = applyResize(activeHandle, dx, dy, startRect);
            layer.x = Math.round(next.x);
            layer.y = Math.round(next.y);
            layer.w = Math.round(next.w);
            layer.h = Math.round(next.h);
        }

        renderLayers(canvas, ctx);
        CanvasRerender();
    });

    canvas.addEventListener('pointerup', (e) => {
        dragMode = null; activeHandle = null; canvas.releasePointerCapture(e.pointerId); canvas.style.cursor = 'default';
    });

    canvas.addEventListener('pointerleave', () => { if (!dragMode) canvas.style.cursor = 'default'; });
    canvas.addEventListener('wheel', (e) => scrollResizeHandler(e, canvas, ctx), { passive: false });
}


/**
 * Renders the layers on the provided canvas and context.
 * Clears the canvas, orders layers, and draws each layer in sequence.
 * Handles special rendering for background layers and selected overlays.
 */
function renderLayers(canvas, ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const layersTopFirst = getSortedLayers();
    const layersBottomFirst = layersTopFirst.slice().reverse();
    const backgroundLayer = layersBottomFirst.find(l => l.z === 0);

    for (const layer of layersBottomFirst) {
        if (!layer.visible || !layer.image?.url) continue;
        const { url, width, height } = layer.image;
        const img = getImage(url, () => CanvasRerender());
        if (!(img.complete && img.naturalWidth > 0)) continue;

        if (backgroundLayer && layer.id === backgroundLayer.id) {
            const { x, y, w, h } = containRect(width, height, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, width, height, x, y, w, h);
            continue;
        }

        const dw = layer.w > 0 ? layer.w : width;
        const dh = layer.h > 0 ? layer.h : height;
        const dx = layer.x || 0;
        const dy = layer.y || 0;
        ctx.drawImage(img, 0, 0, width, height, dx, dy, dw, dh);

        if (showSelectionOverlays && selectedId === layer.id) {
            drawBox(ctx, layer, dw, dh, dx, dy);
        }
    }
}


/**
 * Handles canvas scroll events for resizing layers dynamically.
 * Adjusts the size and position of the selected layer based on scroll input.
 */
function scrollResizeHandler(e, canvas, ctx) {
    e.preventDefault();
    if (dragMode) return;

    const layers = getSortedLayers();
    const layer = layers.find(l => l.id === selectedId && !l.locked);
    if (!layer) return;

    const p = toCanvasSpace(canvas, e.clientX, e.clientY);
    const imgW = layer.image?.width || 0;
    const imgH = layer.image?.height || 0;
    if (imgW <= 0 || imgH <= 0) return;

    const curW = layer.w > 0 ? layer.w : imgW;
    const curH = layer.h > 0 ? layer.h : imgH;
    if (!pointInRect(p.x, p.y, layer.x, layer.y, curW, curH)) return;

    const scale = Math.exp(-e.deltaY * 0.001);
    if (!isFinite(scale) || scale <= 0) return;

    const minSize = 8;
    const newW = Math.max(minSize, curW * scale);
    const newH = Math.max(minSize, curH * scale);
    const offsetX = p.x - layer.x;
    const offsetY = p.y - layer.y;
    const sx = newW / curW;
    const sy = newH / curH;
    layer.x = Math.round(p.x - offsetX * sx);
    layer.y = Math.round(p.y - offsetY * sy);
    layer.w = Math.round(newW);
    layer.h = Math.round(newH);

    renderLayers(canvas, ctx);
    CanvasRerender();
}

function drawBox(ctx, layer, dw, dh, dx, dy) {
    ctx.save();
    ctx.strokeStyle = '#5b9cff';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 2]);
    ctx.strokeRect(dx, dy, dw, dh);
    ctx.setLineDash([]);
    ctx.fillStyle = '#5b9cff';
    const half = HANDLE_SIZE / 2;
    const corners = [
        { x: dx, y: dy },
        { x: dx + dw, y: dy },
        { x: dx + dw, y: dy + dh },
        { x: dx, y: dy + dh },
    ];
    for (const c of corners) {
        ctx.fillRect(c.x - half, c.y - half, HANDLE_SIZE, HANDLE_SIZE);
    }
    ctx.restore();
}
export { initCanvas, renderLayers };
