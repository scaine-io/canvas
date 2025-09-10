import {Layer} from "./types/layer.js";

const layers = [];
let nextLayerId = 1;

function getMaxZ() {
    return layers.length ? Math.max(...layers.map(l => l.z)) : -1;
}

function getSortedLayers() {
    return layers.slice().sort((a, b) => b.z - a.z);
}

function addLayer(name, locked = false) {
    const layer = new Layer(
        nextLayerId++,
        name ?? `Layer ${nextLayerId - 1}`,
        true,
        getMaxZ() + 1,
        locked
    );
    layers.push(layer);
    return layer;
}

// Load an image to read its intrinsic size.
function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
        img.src = url;
    });
}

// Replace any existing image on the layer with an image from URL.
async function setLayerImageFromURL(layerId, url, name) {
    const layer = getLayerById(layerId);
    if (!layer) return;

    const img = await loadImage(url);

    if (layer.image?.url && layer.image.url.startsWith('blob:')) {
        URL.revokeObjectURL(layer.image.url);
    }

    const next = {
        url,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        name,
    };
    layer.image = next;

    if (!layer.locked) {
        if (!layer.w || layer.w <= 0) layer.w = next.width;
        if (!layer.h || layer.h <= 0) layer.h = next.height;
    }

    return next;
}

// Set layer image from a File chosen by the user.
async function setLayerImageFromFile(layerId, file) {
    const layer = getLayerById(layerId);
    if (!layer) return;

    const objectURL = URL.createObjectURL(file);
    try {
        return await setLayerImageFromURL(layerId, objectURL, file.name);
    } catch (e) {
        URL.revokeObjectURL(objectURL);
        throw e;
    }
}

// Remove the image from the layer.
function clearLayerImage(layerId) {
    const layer = getLayerById(layerId);
    if (!layer) return;

    if (layer.image?.url && layer.image.url.startsWith('blob:')) {
        URL.revokeObjectURL(layer.image.url);
    }
    layer.image = undefined;

    if (!layer.locked) {
        layer.w = 0;
        layer.h = 0;
    }
}

function getLayerImage(layerId) {
    return getLayerById(layerId)?.image;
}

function layerHasImage(layerId) {
    return !!getLayerById(layerId)?.image;
}

function getLayerById(id) {
    return layers.find(l => l.id === id);
}

// Flip image horizontally or vertically
async function flipLayerImage(layerId, axis) {
    const layer = getLayerById(layerId);
    if (!layer || layer.locked) return;
    const current = layer.image;
    if (!current?.url) return;

    const img = await loadImage(current.url);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context not available');

    ctx.save();
    if (axis === 'horizontal') {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
    } else {
        ctx.translate(0, h);
        ctx.scale(1, -1);
    }
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();

    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Failed to create blob'))), 'image/png');
    });

    const newUrl = URL.createObjectURL(blob);
    const newName = current.name
        ? `${current.name} (${axis === 'horizontal' ? 'flipped H' : 'flipped V'})`
        : undefined;

    return await setLayerImageFromURL(layerId, newUrl, newName);
}

function renameLayer(id, newName) {
    const layer = getLayerById(id);
    if (!layer) return;
    const trimmed = newName.trim();
    if (trimmed.length === 0) return;
    layer.name = trimmed;
}

function getAllLayers() {
    return layers;
}

export {
    getMaxZ,
    getSortedLayers,
    addLayer,
    setLayerImageFromURL,
    setLayerImageFromFile,
    clearLayerImage,
    getLayerImage,
    layerHasImage,
    getLayerById,
    flipLayerImage,
    renameLayer,
    getAllLayers
};

