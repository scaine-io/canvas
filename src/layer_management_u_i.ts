import {
    getLayerById,
    getSortedLayers,
    renameLayer,
    setLayerImageFromFile,
    getLayerImage, flipLayerImage
} from './layer_management_functions';
import {moveItem} from './helpers/array';
import {CanvasRerender} from "./helpers/canvas";
import {Events} from "./types/events";

let layerListElRef: HTMLUListElement | null = null;
let addLayerHandler: (() => void) | null = null;
// Track drag source for reordering
let dragSrcLayerId: number | null = null;
// Track selected layer for details panel + highlight
let selectedLayerId: number | null = null;
// Details panel element (optional, if present in DOM)
let layerDetailsElRef: HTMLDivElement | null = null;

// ... existing code ...
function appendEmpty(panel: HTMLElement, text: string): void {
    const empty = document.createElement('div');
    empty.className = 'layer-details-empty';
    empty.textContent = text;
    panel.appendChild(empty);
}

function setPreview(preview: HTMLImageElement, info?: { url?: string; name?: string }, layerId?: number): void {
    const data = info ?? (layerId != null ? getLayerImage(layerId) : undefined);
    if (data?.url) {
        preview.src = data.url;
        preview.style.display = '';
        preview.alt = data.name ? `Layer image preview: ${data.name}` : 'Layer image preview';
    } else {
        preview.removeAttribute('src');
        preview.style.display = 'none';
        preview.alt = 'Layer image preview';
    }
}

function refreshFlipButtons(h: HTMLButtonElement, v: HTMLButtonElement, locked: boolean, preview: HTMLImageElement): void {
    const disabled = locked || preview.style.display === 'none';
    h.disabled = disabled;
    v.disabled = disabled;
}

async function onFileChange(input: HTMLInputElement, layerId: number, preview: HTMLImageElement, h: HTMLButtonElement, v: HTMLButtonElement, locked: boolean): Promise<void> {
    const file = input.files?.[0];
    if (!file) return;
    try {
        const info = await setLayerImageFromFile(layerId, file);
        setPreview(preview, info);
        refreshFlipButtons(h, v, locked, preview);
        CanvasRerender();
    } catch (err) {
        console.error('Failed to set layer image from file:', err);
    }
}

async function onFlip(axis: 'horizontal' | 'vertical', layerId: number, preview: HTMLImageElement): Promise<void> {
    try {
        const updated = await flipLayerImage(layerId, axis);
        setPreview(preview, updated);
        CanvasRerender();
    } catch (e) {
        console.error(`Flip ${axis === 'horizontal' ? 'H' : 'V'} failed`, e);
    }
}

function renderLayerDetails() {
    const panel = layerDetailsElRef;
    if (!panel) return;

    panel.innerHTML = '';

    if (selectedLayerId === null) {
        appendEmpty(panel, 'Select a layer to see details');
        return;
    }

    const layer = getLayerById(selectedLayerId);
    if (!layer) {
        appendEmpty(panel, 'Layer not found');
        return;
    }

    const title = document.createElement('div');
    title.className = 'layer-details-title';
    title.textContent = `Layer: ${layer.name}`;

    const previewWrap = document.createElement('div');
    previewWrap.className = 'layer-preview-wrap';

    const preview = document.createElement('img');
    preview.className = 'layer-preview';
    preview.alt = 'Layer image preview';

    const stored = getLayerImage(layer.id);
    setPreview(preview, stored);

    const fileLabel = document.createElement('label');
    fileLabel.className = 'file-input-label';
    fileLabel.textContent = 'Select image...';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileLabel.appendChild(fileInput);

    const controlsRow = document.createElement('div');
    controlsRow.style.display = 'flex';
    controlsRow.style.gap = '6px';
    controlsRow.style.alignItems = 'center';
    controlsRow.style.flexWrap = 'wrap';

    const flipHBtn = document.createElement('button');
    flipHBtn.type = 'button';
    flipHBtn.textContent = 'Flip H';
    flipHBtn.title = 'Flip horizontally (updates the image)';

    const flipVBtn = document.createElement('button');
    flipVBtn.type = 'button';
    flipVBtn.textContent = 'Flip V';
    flipVBtn.title = 'Flip vertically (updates the image)';

    const isLocked = !!layer.locked;
    refreshFlipButtons(flipHBtn, flipVBtn, isLocked, preview);

    fileInput.addEventListener('change', () => onFileChange(fileInput, layer.id, preview, flipHBtn, flipVBtn, isLocked));
    flipHBtn.addEventListener('click', () => {
        if (!isLocked) onFlip('horizontal', layer.id, preview);
    });
    flipVBtn.addEventListener('click', () => {
        if (!isLocked) onFlip('vertical', layer.id, preview);
    });

    controlsRow.appendChild(fileLabel);
    controlsRow.appendChild(flipHBtn);
    controlsRow.appendChild(flipVBtn);

    previewWrap.appendChild(preview);
    panel.appendChild(title);
    panel.appendChild(previewWrap);
    panel.appendChild(controlsRow);
}

// ... existing code ...

let nameClickTimer: number | null = null;

function attachRenameHandlers(nameSpan: HTMLElement) {
    // Single click on the name selects the layer (with a short delay so dblclick can cancel it)
    nameSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        const span = e.currentTarget as HTMLElement;
        const li = span.closest('li.layer-item') as HTMLLIElement | null;
        if (!li) return;
        const id = Number(li.dataset.layerId);
        if (!Number.isFinite(id)) return;

        // If a dblclick follows, we'll cancel this pending selection
        if (nameClickTimer != null) {
            clearTimeout(nameClickTimer);
            nameClickTimer = null;
        }
        nameClickTimer = window.setTimeout(() => {
            selectedLayerId = id;
            document.dispatchEvent(new CustomEvent(Events.EVENT_SELECTION_CHANGED, {detail: {id}}));
            CanvasRerender();
            renderLayerList();
            renderLayerDetails();
            nameClickTimer = null;
        }, 200);
    });

    // Double-click to start inline rename
    nameSpan.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Cancel pending single-click selection if any
        if (nameClickTimer != null) {
            clearTimeout(nameClickTimer);
            nameClickTimer = null;
        }

        const span = e.currentTarget as HTMLElement;
        const li = span.closest('li.layer-item') as HTMLLIElement | null;
        if (!li) return;
        const id = Number(li.dataset.layerId);
        if (!Number.isFinite(id)) return;
        startInlineRename(li, id, span);
    });
}


function startInlineRename(li: HTMLLIElement, id: number, nameEl: HTMLElement) {
    const current = nameEl.textContent ?? '';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = current;
    input.className = 'layer-rename-input';
    input.style.width = '100%';
    input.style.boxSizing = 'border-box';

    nameEl.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
        renameLayer(id, input.value);
        renderLayerList();
    };
    const cancel = () => {
        renderLayerList();
    };

    input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            commit();
        } else if (ev.key === 'Escape') {
            ev.preventDefault();
            cancel();
        }
    });

    input.addEventListener('blur', () => {
        commit();
    });
}


// ----- Drag & Drop ordering via z-height -----
// Locked layers (e.g., Background) cannot be dragged and always remain at the bottom.
function attachDndHandlers(li: HTMLLIElement) {
    li.addEventListener('dragstart', (e) => {
        // If the drag started on the name, prevent it so dblclick-to-rename works reliably
        const target = e.target as HTMLElement | null;
        if (target && target.closest('.layer-name')) {
            e.preventDefault();
            return;
        }

        const id = Number(li.dataset.layerId);
        const layer = getLayerById(id);
        if (!layer || layer.locked) {
            e.preventDefault();
            return;
        }

        dragSrcLayerId = id;
        li.classList.add('dragging');
        e.dataTransfer?.setData('text/plain', String(id));
        e.dataTransfer?.setDragImage(li, 10, 10);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });


    li.addEventListener('dragenter', () => {
        li.classList.add('drag-over');
    });

    li.addEventListener('dragover', (e) => {
        e.preventDefault(); // allow drop
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    });

    li.addEventListener('dragleave', () => {
        li.classList.remove('drag-over');
    });

    li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('drag-over');

        const targetId = Number(li.dataset.layerId);
        const srcIdFromData = Number(e.dataTransfer?.getData('text/plain'));
        const srcId = Number.isFinite(srcIdFromData) ? srcIdFromData : dragSrcLayerId;

        if (!Number.isFinite(targetId) || !Number.isFinite(srcId!) || srcId === targetId) {
            cleanupDraggingClasses();
            return;
        }

        const srcLayer = getLayerById(srcId!);
        const targetLayer = getLayerById(targetId);
        if (!srcLayer || !targetLayer) {
            cleanupDraggingClasses();
            return;
        }

        // Disallow moving locked layers
        if (srcLayer.locked) {
            cleanupDraggingClasses();
            return;
        }

        // Compute new visual order using current z-sorted list
        const current = getSortedLayers();
        const fromIdx = current.findIndex(l => l.id === srcId);
        const toIdx = current.findIndex(l => l.id === targetId);
        if (fromIdx === -1 || toIdx === -1) {
            cleanupDraggingClasses();
            return;
        }

        moveItem(current, fromIdx, toIdx);

        // Keep locked layers at the bottom (stable)
        const unlocked = current.filter(l => !l.locked);
        const locked = current.filter(l => l.locked);
        const newOrdered = [...unlocked, ...locked];

        // Reassign z so index 0 is top-most (largest z)
        const topZ = Math.max(newOrdered.length - 1, 0);
        for (let i = 0; i < newOrdered.length; i++) {
            const l = newOrdered[i];
            l.z = topZ - i;
        }

        dragSrcLayerId = null;
        renderLayerList();

        // Request canvas rerender after reordering
        CanvasRerender();
    });


    li.addEventListener('dragend', () => {
        cleanupDraggingClasses();
        dragSrcLayerId = null;
    });
}


function cleanupDraggingClasses() {
    const layerListEl = layerListElRef;
    if (!layerListEl) return;
    for (const item of Array.from(layerListEl.querySelectorAll('.dragging, .drag-over'))) {
        item.classList.remove('dragging', 'drag-over');
    }
}


// Helper constants for selectors/ids to avoid magic strings
const LAYER_DETAILS_ID = 'layer-details';
const LAYER_ITEM_SELECTOR = 'li.layer-item';
const LAYER_NAME_SELECTOR = '.layer-name';

// Creates or finds the layer details panel next to the list, returns the panel element
function ensureLayerDetailsPanel(listEl: HTMLUListElement): HTMLDivElement {
    let panel = document.getElementById(LAYER_DETAILS_ID) as HTMLDivElement | null;
    if (!panel) {
        panel = document.createElement('div');
        panel.id = LAYER_DETAILS_ID;
        panel.setAttribute('aria-live', 'polite');
        panel.setAttribute('aria-label', 'Layer details panel');
        // Minimal inline styling so it’s visible even without CSS changes
        panel.style.borderTop = '1px solid #2a2a2a';
        panel.style.paddingTop = '10px';
        listEl.insertAdjacentElement('afterend', panel);
    }
    return panel;
}

// Attaches the "add layer" button listener that dispatches the proper request event
function attachAddLayerButton(button: HTMLButtonElement, listEl: HTMLUListElement) {
    addLayerHandler = () => {
        const evt = new CustomEvent(Events.EVENT_LAYER_ADDED);
        listEl.dispatchEvent(evt);
    };
    button.addEventListener('click', addLayerHandler);
}

// Extract layer id from an li element dataset in a type-safe manner
function getLayerIdFromItem(li: HTMLLIElement): number | null {
    const raw = li.dataset.layerId;
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) ? id : null;
}

/**
 * * Mouse event from user interactions (click, dblclick, move).
 *  * Provides pointer position, button state, and modifier keys.
 *  * Used to handle UI interactions.
 */
function handleLayerListDblClick(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const nameEl = target.closest(LAYER_NAME_SELECTOR) as HTMLElement | null;
    if (!nameEl) return;

    const li = nameEl.closest(LAYER_ITEM_SELECTOR) as HTMLLIElement | null;
    if (!li) return;

    const id = getLayerIdFromItem(li);
    if (id === null) return;

    startInlineRename(li, id, nameEl);
}

export function setupLayerUI(layerListEl: HTMLUListElement, addLayerBtn?: HTMLButtonElement) {
    layerListElRef = layerListEl;

    // Initialize or create the details panel once
    layerDetailsElRef = ensureLayerDetailsPanel(layerListEl);

    if (addLayerBtn) {
        attachAddLayerButton(addLayerBtn, layerListEl);
    }
    // Fallback double-click rename delegation (for any dynamic items)
    layerListEl.addEventListener('dblclick', handleLayerListDblClick);

    // Initial render
    renderLayerList();
}


/**
 * Renders the layer list UI by creating list items for each layer.
 * Updates layer visual states including selection, visibility, and z-index.
 * Attaches event handlers for layer selection, renaming, and drag-drop reordering.
 */
export function renderLayerList() {
    const layerListEl = layerListElRef;
    if (!layerListEl) return;
    layerListEl.innerHTML = '';

    const ordered = getSortedLayers();
    for (const layer of ordered) {
        const li = document.createElement('li');
        li.className = 'layer-item';
        li.dataset.layerId = String(layer.id);
        li.draggable = !layer.locked;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'layer-name';
        nameSpan.textContent = layer.name;
        nameSpan.title = layer.locked ? 'Layer locked' : 'Double-click to rename';

        const metaSpan = document.createElement('span');
        metaSpan.className = 'layer-meta';
        metaSpan.textContent = layer.visible ? `z:${layer.z}` : `z:${layer.z} (hidden)`;

        // Highlight selection
        if (selectedLayerId === layer.id) {
            li.classList.add('selected');
        }

        // Prevent the first click on the name from selecting/re-rendering (so dblclick can start rename)
        nameSpan.addEventListener('click', (ev) => {
            ev.stopPropagation();
        });

        // Click to select and open details (but ignore if renaming or clicked on name)
        li.addEventListener('click', (ev) => {
            const target = ev.target as HTMLElement | null;
            if (!target) return;

            if (target.closest('input.layer-rename-input')) {
                return;
            }
            if (target.closest('.layer-name')) {
                return; // handled in attachRenameHandlers
            }

            selectedLayerId = layer.id;
            document.dispatchEvent(new CustomEvent(Events.EVENT_SELECTION_CHANGED, {detail: {id: layer.id}}));
            CanvasRerender();
            renderLayerList();
            renderLayerDetails();
        });

        li.appendChild(nameSpan);
        li.appendChild(metaSpan);
        attachDndHandlers(li);
        attachRenameHandlers(nameSpan);
        layerListEl.appendChild(li);
    }

    // Re-render details in case selection changed or list re-rendered
    renderLayerDetails();
}
