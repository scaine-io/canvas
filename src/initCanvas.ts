import {getSortedLayers} from './layer_management_functions';

// Simple in-memory image cache so we don't recreate Image objects each render.
const imgCache = new Map<string, HTMLImageElement>();

function getImage(url: string, onLoaded: () => void): HTMLImageElement {
    let img = imgCache.get(url);
    if (!img) {
        img = new Image();
        img.onload = () => onLoaded();
        img.src = url;
        imgCache.set(url, img);
    } else if (!img.complete) {
        // If it's still loading, ensure onload triggers a rerender once done
        img.onload = () => onLoaded();
    }
    return img;
}

// Compute target rect to "contain" the source within the destination.
function containRect(
    srcW: number,
    srcH: number,
    dstW: number,
    dstH: number
): { x: number; y: number; w: number; h: number } {
    const scale = Math.min(dstW / srcW, dstH / srcH);
    const w = Math.max(0, Math.floor(srcW * scale));
    const h = Math.max(0, Math.floor(srcH * scale));
    const x = Math.floor((dstW - w) / 2);
    const y = Math.floor((dstH - h) / 2);
    return {x, y, w, h};
}

// ----- Interaction state for moving/resizing non-background layers -----
type HandleId = 'nw' | 'ne' | 'se' | 'sw' | null;

let selectedId: number | null = null;
let dragMode: 'move' | 'resize' | null = null;
let activeHandle: HandleId = null;
let dragStart = {x: 0, y: 0};
let startRect = {x: 0, y: 0, w: 0, h: 0};
let showSelectionOverlays = true;

const HANDLE_SIZE = 8;

function toCanvasSpace(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const r = canvas.getBoundingClientRect();
    const x = (clientX - r.left) * (canvas.width / r.width);
    const y = (clientY - r.top) * (canvas.height / r.height);
    return {x, y};
}

function pointInRect(px: number, py: number, x: number, y: number, w: number, h: number) {
    return px >= x && py >= y && px <= x + w && py <= y + h;
}

function getHandleAt(layer: any, px: number, py: number): HandleId {
    const corners = [
        {id: 'nw' as const, x: layer.x, y: layer.y},
        {id: 'ne' as const, x: layer.x + layer.w, y: layer.y},
        {id: 'se' as const, x: layer.x + layer.w, y: layer.y + layer.h},
        {id: 'sw' as const, x: layer.x, y: layer.y + layer.h},
    ];
    for (const c of corners) {
        if (pointInRect(px, py, c.x - HANDLE_SIZE / 2, c.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)) {
            return c.id;
        }
    }
    return null;
}

function applyResize(handle: HandleId, dx: number, dy: number, rect: { x: number; y: number; w: number; h: number }) {
    const minSize = 8;
    let {x, y, w, h} = rect;

    switch (handle) {
        case 'nw':
            x += dx;
            y += dy;
            w -= dx;
            h -= dy;
            break;
        case 'ne':
            y += dy;
            w += dx;
            h -= dy;
            break;
        case 'se':
            w += dx;
            h += dy;
            break;
        case 'sw':
            x += dx;
            w -= dx;
            h += dy;
            break;
        default:
            break;
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

    return {x, y, w, h};
}

export function initCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    // Initial draw
    renderLayers(canvas, ctx);

    // Re-render whenever someone dispatches a rerender event (e.g., after image set or reorder)
    document.addEventListener('canvas:rerender', () => {
        renderLayers(canvas, ctx);
    });
    document.addEventListener('canvas:export:begin', () => {
        showSelectionOverlays = false;
        renderLayers(canvas, ctx);
    });
    document.addEventListener('canvas:export:end', () => {
        showSelectionOverlays = true;
        renderLayers(canvas, ctx);
    });

    document.addEventListener('layers:selection-changed', (e: Event) => {
        selectedId = (e as CustomEvent<{ id: number | null }>).detail?.id ?? null;
        // Ensure overlays are visible when the user changes selection in the UI
        showSelectionOverlays = true;
        renderLayers(canvas, ctx);
    });


    // Pointer interactions for moving/resizing
    canvas.addEventListener('pointerdown', (e) => {
        const p = toCanvasSpace(canvas, e.clientX, e.clientY);
        const layersTopFirst = getSortedLayers();

        // pick top-most non-locked layer under cursor (skip locked)
        const layer = layersTopFirst.find(l => l.id === selectedId && !l.locked);
        if (!layer) {
            // No selected or locked: ignore interaction
            renderLayers(canvas, ctx);
            return;
        }

        const w = layer.w && layer.w > 0 ? layer.w : layer.image?.width ?? 0;
        const h = layer.h && layer.h > 0 ? layer.h : layer.image?.height ?? 0;

        if (!(w > 0 && h > 0 && pointInRect(p.x, p.y, layer.x, layer.y, w, h))) {
            // Click wasn't inside selected layer bounds:
            // - hide selection rectangle/handles
            // - disable moving/resizing (already ignored by early return)
            showSelectionOverlays = false;
            renderLayers(canvas, ctx);
            return;
        }

        showSelectionOverlays = true;


        // Determine if pointer is on a resize handle
        const handle = getHandleAt({x: layer.x, y: layer.y, w, h}, p.x, p.y);
        if (handle) {
            dragMode = 'resize';
            activeHandle = handle;
        } else {
            dragMode = 'move';
            activeHandle = null;
        }

        dragStart = {x: p.x, y: p.y};
        startRect = {x: layer.x, y: layer.y, w, h};
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
    });


    canvas.addEventListener('pointermove', (e) => {
        const p = toCanvasSpace(canvas, e.clientX, e.clientY);
        const layers = getSortedLayers();
        const layer = layers.find(l => l.id === selectedId);

        // Cursor feedback
        if (!dragMode) {
            canvas.style.cursor = 'default';
            if (layer && !layer.locked) {
                const w = layer.w && layer.w > 0 ? layer.w : layer.image?.width ?? 0;
                const h = layer.h && layer.h > 0 ? layer.h : layer.image?.height ?? 0;
                if (w > 0 && h > 0 && pointInRect(p.x, p.y, layer.x, layer.y, w, h)) {
                    const hId = getHandleAt({x: layer.x, y: layer.y, w, h}, p.x, p.y);
                    if (hId) {
                        canvas.style.cursor = (hId === 'nw' || hId === 'se') ? 'nwse-resize' : 'nesw-resize';
                    } else {
                        canvas.style.cursor = 'move';
                    }
                }
            }
        }

        if (!dragMode || !layer || layer.locked) {
            return;
        }

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
        document.dispatchEvent(new CustomEvent('canvas:rerender'));
    });

    canvas.addEventListener('pointerup', (e) => {
        dragMode = null;
        activeHandle = null;
        canvas.releasePointerCapture(e.pointerId);
        canvas.style.cursor = 'default';
    });

    canvas.addEventListener('pointerleave', () => {
        if (!dragMode) {
            canvas.style.cursor = 'default';
        }
    });

    canvas.addEventListener('wheel', (e) => {
        // Do not resize while dragging
        if (dragMode) return;

        const layers = getSortedLayers();
        const layer = layers.find(l => l.id === selectedId && !l.locked);
        if (!layer) return;

        const p = toCanvasSpace(canvas, e.clientX, e.clientY);

        // Determine current draw size (fall back to intrinsic if unset)
        const imgW = layer.image?.width ?? 0;
        const imgH = layer.image?.height ?? 0;
        if (imgW <= 0 || imgH <= 0) return;

        const curW = (layer.w && layer.w > 0) ? layer.w : imgW;
        const curH = (layer.h && layer.h > 0) ? layer.h : imgH;

        // Only resize if cursor is over the selected layer
        if (!pointInRect(p.x, p.y, layer.x, layer.y, curW, curH)) return;

        // Scale factor: negative deltaY => zoom in; positive => zoom out
        // Using exponential for smooth scaling across devices
        const scale = Math.exp(-e.deltaY * 0.001);
        if (!isFinite(scale) || scale <= 0) return;

        const minSize = 8;
        let newW = Math.max(minSize, curW * scale);
        let newH = Math.max(minSize, curH * scale);

        // Keep the cursor anchored: adjust x/y so the point under the cursor stays fixed
        const offsetX = p.x - layer.x;
        const offsetY = p.y - layer.y;
        const sx = newW / curW;
        const sy = newH / curH;

        let newX = p.x - offsetX * sx;
        let newY = p.y - offsetY * sy;

        // Round values to integers for crisp rendering
        layer.x = Math.round(newX);
        layer.y = Math.round(newY);
        layer.w = Math.round(newW);
        layer.h = Math.round(newH);

        // Prevent page scroll while resizing
        e.preventDefault();

        renderLayers(canvas, ctx);
        document.dispatchEvent(new CustomEvent('canvas:rerender'));
    }, {passive: false});

}

// Draw all visible layers' images on the canvas.
// Assumes getSortedLayers returns top-most first; we draw bottom-first so top layers appear above.
export function renderLayers(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const layersTopFirst = getSortedLayers();
    const layersBottomFirst = layersTopFirst.slice().reverse();

    // Identify the bottom-most locked layer as the "background"
    const backgroundLayer = layersBottomFirst.find(l => l.locked);

    for (const layer of layersBottomFirst) {
        if (!layer.visible || !layer.image?.url) continue;

        const {url, width, height} = layer.image;
        const img = getImage(url, () => {
            // Trigger another draw once the image finishes loading
            document.dispatchEvent(new CustomEvent('canvas:rerender'));
        });

        if (!(img.complete && img.naturalWidth > 0)) {
            continue; // wait for load; onload will rerender
        }

        if (backgroundLayer && layer.id === backgroundLayer.id) {
            // Fit background within canvas (contain) and center it
            const {x, y, w, h} = containRect(width, height, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, width, height, x, y, w, h);
            continue;
        }

        // Non-background: draw using layer transform (x, y, w, h fallback to intrinsic)
        const dw = layer.w && layer.w > 0 ? layer.w : width;
        const dh = layer.h && layer.h > 0 ? layer.h : height;
        const dx = layer.x ?? 0;
        const dy = layer.y ?? 0;
        ctx.drawImage(img, 0, 0, width, height, dx, dy, dw, dh);

        // If selected, draw selection rectangle and resize handles
        if (showSelectionOverlays && selectedId === layer.id) {
            ctx.save();
            ctx.strokeStyle = '#5b9cff';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 2]);
            ctx.strokeRect(dx, dy, dw, dh);
            ctx.setLineDash([]);
            ctx.fillStyle = '#5b9cff';
            const half = HANDLE_SIZE / 2;
            const corners = [
                {x: dx, y: dy},
                {x: dx + dw, y: dy},
                {x: dx + dw, y: dy + dh},
                {x: dx, y: dy + dh},
            ];
            for (const c of corners) {
                ctx.fillRect(c.x - half, c.y - half, HANDLE_SIZE, HANDLE_SIZE);
            }
            ctx.restore();
        }
    }
}
