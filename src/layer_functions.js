import {
  getLayerById,
  getSortedLayers,
  renameLayer,
  setLayerImageFromFile,
  getLayerImage,
    flipLayerImage,
    setLayerImageFromURL
} from './ui_functions.js';

import { moveItem } from './helpers/array.js';
import { CanvasRerender } from './helpers/canvas.js';
import { Events } from './events.js';
import {removeBackground} from "./helpers/cutout";

let layerListElRef = null;
let addLayerHandler = null;
// Track drag source for reordering
let dragSrcLayerId = null;
// Track selected layer for details panel + highlight
let selectedLayerId = null;
// Details panel element (optional, if present in DOM)
let layerDetailsElRef = null;

function appendEmpty(panel, text) {
    const empty = document.createElement('div');
    empty.className = 'layer-details-empty';
    empty.textContent = text;
    panel.appendChild(empty);
}

function setPreview(preview, info, layerId) {
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

function refreshFlipButtons(h, v, locked, preview) {
    const disabled = locked || preview.style.display === 'none';
    h.disabled = disabled;
    v.disabled = disabled;
}

async function onFileChange(input, layerId, preview, h, v, locked) {
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

async function onFlip(axis, layerId, preview) {
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

    const removeBackgroundBtn = document.createElement('button');
    removeBackgroundBtn.type = 'button';
    removeBackgroundBtn.textContent = 'Remove Background';
    removeBackgroundBtn.title = 'Remove image background';

    const isLocked = !!layer.locked;
    refreshFlipButtons(flipHBtn, flipVBtn, isLocked, preview);
    removeBackgroundBtn.disabled = isLocked || preview.style.display === 'none' || !layer.image?.url;

    fileInput.addEventListener('change', () =>
        onFileChange(fileInput, layer.id, preview, flipHBtn, flipVBtn, isLocked)
    );
    flipHBtn.addEventListener('click', () => {
        if (!isLocked) onFlip('horizontal', layer.id, preview);
    });
    flipVBtn.addEventListener('click', () => {
        if (!isLocked) onFlip('vertical', layer.id, preview);
    });


    removeBackgroundBtn.addEventListener('click', async () => {
        if (!isLocked) {
            removeBackgroundBtn.disabled = true;
            const spinner = document.createElement('div');
            spinner.className = 'spinner';
            removeBackgroundBtn.textContent = 'Removing';
            removeBackgroundBtn.appendChild(spinner);
            try {
                const updated = await removeBackground(layer.image.url);
                layer.hasBackgroundRemoved = true;
                const info = await setLayerImageFromURL(layer.id, updated);
                setPreview(preview, info);
                console.log(`Background removed for layer: ${layer.name}`);
                CanvasRerender();
            } catch (e) {
                console.error('Background removal failed:', e);
                alert('Failed to remove background: ' + (e.message || 'Unknown error'));
            } finally {
                const spinner = removeBackgroundBtn.querySelector('.spinner');
                if (spinner) {
                    spinner.remove();
                }
                removeBackgroundBtn.disabled = isLocked || preview.style.display === 'none' || !layer.image?.url;
                removeBackgroundBtn.textContent = 'Remove Background';
            }
        }
    });

    controlsRow.appendChild(fileLabel);
    controlsRow.appendChild(removeBackgroundBtn);
    controlsRow.appendChild(flipHBtn);
    controlsRow.appendChild(flipVBtn);

    previewWrap.appendChild(preview);
    panel.appendChild(title);
    panel.appendChild(previewWrap);
    panel.appendChild(controlsRow);
}

let nameClickTimer = null;

function attachRenameHandlers(nameSpan) {
    nameSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        const span = e.currentTarget;
        const li = span.closest('li.layer-item');
        if (!li) return;
        const id = Number(li.dataset.layerId);
        if (!Number.isFinite(id)) return;

        if (nameClickTimer != null) {
            clearTimeout(nameClickTimer);
            nameClickTimer = null;
        }
        nameClickTimer = window.setTimeout(() => {
            selectedLayerId = id;
            document.dispatchEvent(new CustomEvent(Events.EVENT_SELECTION_CHANGED, { detail: { id } }));
            CanvasRerender();
            renderLayerList();
            renderLayerDetails();
            nameClickTimer = null;
        }, 200);
    });

    nameSpan.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (nameClickTimer != null) {
            clearTimeout(nameClickTimer);
            nameClickTimer = null;
        }

        const span = e.currentTarget;
        const li = span.closest('li.layer-item');
        if (!li) return;
        const id = Number(li.dataset.layerId);
        if (!Number.isFinite(id)) return;
        startInlineRename(li, id, span);
    });
}

function startInlineRename(li, id, nameEl) {
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

function attachDndHandlers(li) {
    li.addEventListener('dragstart', (e) => {
        const target = e.target;
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
        e.preventDefault();
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

        if (!Number.isFinite(targetId) || !Number.isFinite(srcId) || srcId === targetId) {
            cleanupDraggingClasses();
            return;
        }

        const srcLayer = getLayerById(srcId);
        const targetLayer = getLayerById(targetId);
        if (!srcLayer || !targetLayer) {
            cleanupDraggingClasses();
            return;
        }

        if (srcLayer.locked) {
            cleanupDraggingClasses();
            return;
        }

        const current = getSortedLayers();
        const fromIdx = current.findIndex((l) => l.id === srcId);
        const toIdx = current.findIndex((l) => l.id === targetId);
        if (fromIdx === -1 || toIdx === -1) {
            cleanupDraggingClasses();
            return;
        }

        moveItem(current, fromIdx, toIdx);

        const unlocked = current.filter((l) => !l.locked);
        const locked = current.filter((l) => l.locked);
        const newOrdered = [...unlocked, ...locked];

        const topZ = Math.max(newOrdered.length - 1, 0);
        for (let i = 0; i < newOrdered.length; i++) {
            const l = newOrdered[i];
            l.z = topZ - i;
        }

        dragSrcLayerId = null;
        renderLayerList();
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

const LAYER_DETAILS_ID = 'layer-details';
const LAYER_ITEM_SELECTOR = 'li.layer-item';
const LAYER_NAME_SELECTOR = '.layer-name';

function ensureLayerDetailsPanel(listEl) {
    let panel = document.getElementById(LAYER_DETAILS_ID);
    if (!panel) {
        panel = document.createElement('div');
        panel.id = LAYER_DETAILS_ID;
        panel.setAttribute('aria-live', 'polite');
        panel.setAttribute('aria-label', 'Layer details panel');
        panel.style.borderTop = '1px solid #2a2a2a';
        panel.style.paddingTop = '10px';
        listEl.insertAdjacentElement('afterend', panel);
    }
    return panel;
}

function attachAddLayerButton(button, listEl) {
    addLayerHandler = () => {
        const evt = new CustomEvent(Events.EVENT_LAYER_ADDED);
        listEl.dispatchEvent(evt);
    };
    button.addEventListener('click', addLayerHandler);
}

function getLayerIdFromItem(li) {
    const raw = li.dataset.layerId;
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) ? id : null;
}

function handleLayerListDblClick(e) {
    const target = e.target;
    if (!target) return;

    const nameEl = target.closest(LAYER_NAME_SELECTOR);
    if (!nameEl) return;

    const li = nameEl.closest(LAYER_ITEM_SELECTOR);
    if (!li) return;

    const id = getLayerIdFromItem(li);
    if (id === null) return;

    startInlineRename(li, id, nameEl);
}

function setupLayerUI(layerListEl, addLayerBtn) {
    const style = document.createElement('style');
    style.textContent = `
        .spinner {
            display: inline-block;
            width: 12px;
            height: 12px;
            margin-left: 6px;
            border: 2px solid #ffffff3b;
            border-top: 2px solid #fff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
    layerListElRef = layerListEl;
    layerDetailsElRef = ensureLayerDetailsPanel(layerListEl);

    if (addLayerBtn) {
        attachAddLayerButton(addLayerBtn, layerListEl);
    }
    layerListEl.addEventListener('dblclick', handleLayerListDblClick);
    renderLayerList();
}

function renderLayerList() {
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
        metaSpan.textContent = layer.visible
            ? `z:${layer.z}${layer.hasBackgroundRemoved ? ' ✓' : ''}`
            : `z:${layer.z}${layer.hasBackgroundRemoved ? ' ✓' : ''} (hidden)`;

        if (selectedLayerId === layer.id) {
            li.classList.add('selected');
        }

        nameSpan.addEventListener('click', (ev) => {
            ev.stopPropagation();
        });

        li.addEventListener('click', (ev) => {
            const target = ev.target;
            if (!target) return;

            if (target.closest('input.layer-rename-input')) return;
            if (target.closest('.layer-name')) return;

            selectedLayerId = layer.id;
            document.dispatchEvent(new CustomEvent(Events.EVENT_SELECTION_CHANGED, { detail: { id: layer.id } }));
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

    renderLayerDetails();
}

export { setupLayerUI, renderLayerList };
