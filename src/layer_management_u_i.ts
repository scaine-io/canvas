import {
    getAllLayers,
    getLayerById,
    getSortedLayers,
    renameLayer,
    setLayerImageFromFile,
    getLayerImage
} from './layer_management_functions';
import {moveItem} from './arrayItemMover';

let layerListElRef: HTMLUListElement | null = null;
let addLayerHandler: (() => void) | null = null;
// Track drag source for reordering
let dragSrcLayerId: number | null = null;
// Track selected layer for details panel + highlight
let selectedLayerId: number | null = null;
// Details panel element (optional, if present in DOM)
let layerDetailsElRef: HTMLDivElement | null = null;

// ... existing code ...
function renderLayerDetails() {
    const panel = layerDetailsElRef;
    if (!panel) return;

    panel.innerHTML = '';

    if (selectedLayerId == null) {
        const empty = document.createElement('div');
        empty.className = 'layer-details-empty';
        empty.textContent = 'Select a layer to see details';
        panel.appendChild(empty);
        return;
    }

    const layer = getLayerById(selectedLayerId);
    if (!layer) {
        const empty = document.createElement('div');
        empty.className = 'layer-details-empty';
        empty.textContent = 'Layer not found';
        panel.appendChild(empty);
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

    // Use the stored image info so it persists between selections
    const stored = getLayerImage(layer.id);
    if (stored?.url) {
        preview.src = stored.url;
        preview.style.display = '';
        if (stored.name) preview.alt = `Layer image preview: ${stored.name}`;
    } else {
        preview.style.display = 'none';
    }

    const fileLabel = document.createElement('label');
    fileLabel.className = 'file-input-label';
    fileLabel.textContent = 'Select image...';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    fileLabel.appendChild(fileInput);

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        try {
            // Update the layer's image in the store; it will manage blob URLs safely
            const info = await setLayerImageFromFile(layer.id, file);

            // Reflect the stored image in the preview (persists when re-opening)
            if (info?.url) {
                preview.src = info.url;
                preview.style.display = '';
                if (info.name) preview.alt = `Layer image preview: ${info.name}`;
            } else {
                // Fallback in case no info returned
                const latest = getLayerImage(layer.id);
                if (latest?.url) {
                    preview.src = latest.url;
                    preview.style.display = '';
                    if (latest.name) preview.alt = `Layer image preview: ${latest.name}`;
                }
            }

            // Request canvas to rerender after setting the image
            document.dispatchEvent(new CustomEvent('canvas:rerender'));
        } catch (err) {
            console.error('Failed to set layer image from file:', err);
        }
    });


    previewWrap.appendChild(preview);
    panel.appendChild(title);
    panel.appendChild(previewWrap);
    panel.appendChild(fileLabel);
}
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
        document.dispatchEvent(new CustomEvent('canvas:rerender'));
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


export function setupLayerUI(layerListEl: HTMLUListElement, addLayerBtn?: HTMLButtonElement) {
    layerListElRef = layerListEl;

    // Try to find the details panel once during setup
    layerDetailsElRef = document.getElementById('layer-details') as HTMLDivElement | null;

    // If not present in HTML, create it right after the layer list
    if (!layerDetailsElRef) {
        const panel = document.createElement('div');
        panel.id = 'layer-details';
        panel.setAttribute('aria-live', 'polite');
        panel.setAttribute('aria-label', 'Layer details panel');
        // Minimal inline styling so it’s visible even without CSS changes
        panel.style.borderTop = '1px solid #2a2a2a';
        panel.style.paddingTop = '10px';
        layerListEl.insertAdjacentElement('afterend', panel);
        layerDetailsElRef = panel;
    }

    if (addLayerBtn) {
        addLayerHandler = () => {
            const evt = new CustomEvent('layers:add-request');
            layerListEl.dispatchEvent(evt);
        };
        addLayerBtn.addEventListener('click', addLayerHandler);
    }

    // Fallback double-click rename delegation (for any dynamic items)
    layerListEl.addEventListener('dblclick', (e) => {
        const target = e.target as HTMLElement;
        if (!target) return;
        const nameSpan = target.closest('.layer-name') as HTMLElement | null;
        if (!nameSpan) return;

        const li = nameSpan.closest('li.layer-item') as HTMLLIElement | null;
        if (!li) return;

        const id = Number(li.dataset.layerId);
        if (!Number.isFinite(id)) return;

        startInlineRename(li, id, nameSpan);
    });

    layerListEl.addEventListener('layers:add-request', () => {
        // no-op by default; index.ts wires the actual add + render
    });

    // Initial render
    renderLayerList();
}

// ... existing code ...
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

