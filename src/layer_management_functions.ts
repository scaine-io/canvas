// src/layers/store.ts
import { Layer, LayerImage } from './types/layer';

const layers: Layer[] = [];
let nextLayerId = 1;

export function getMaxZ(): number {
  return layers.length ? Math.max(...layers.map(l => l.z)) : -1;
}

export function getSortedLayers(): Layer[] {
  // Render top-most first
  return layers.slice().sort((a, b) => b.z - a.z);
}

export function addLayer(name?: string, locked = false): Layer {
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

// ... existing code ...

// Load an image to read its intrinsic size.
async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

// Replace any existing image on the layer with an image from URL.
// Safely revokes previous blob URLs.
export async function setLayerImageFromURL(layerId: number, url: string, name?: string): Promise<LayerImage | undefined> {
  const layer = getLayerById(layerId);
  if (!layer) return;
  if (layer.locked) return;

  const img = await loadImage(url);

  // Revoke existing blob URL if necessary
  if (layer.image?.url && layer.image.url.startsWith('blob:')) {
    URL.revokeObjectURL(layer.image.url);
  }

  const next: LayerImage = {
    url,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    name,
  };
  layer.image = next;
  return next;
}

// Set layer image from a File chosen by the user.
// Creates a blob URL and revokes it on replacement/clear.
export async function setLayerImageFromFile(layerId: number, file: File): Promise<LayerImage | undefined> {
  const layer = getLayerById(layerId);
  if (!layer) return;
  if (layer.locked) return;

  const objectURL = URL.createObjectURL(file);
  try {
    return await setLayerImageFromURL(layerId, objectURL, file.name);
  } catch (e) {
    URL.revokeObjectURL(objectURL);
    throw e;
  }
}

// Remove the image from the layer and revoke blob URL if used.
export function clearLayerImage(layerId: number): void {
  const layer = getLayerById(layerId);
  if (!layer) return;

  if (layer.image?.url && layer.image.url.startsWith('blob:')) {
    URL.revokeObjectURL(layer.image.url);
  }
  layer.image = undefined;
}

// Accessors
export function getLayerImage(layerId: number): LayerImage | undefined {
  return getLayerById(layerId)?.image;
}

export function layerHasImage(layerId: number): boolean {
  return !!getLayerById(layerId)?.image;
}

export function getLayerById(id: number): Layer | undefined {
  return layers.find(l => l.id === id);
}

export function renameLayer(id: number, newName: string) {
  const layer = getLayerById(id);
  if (!layer) return;
  const trimmed = newName.trim();
  if (trimmed.length === 0) return;
  layer.name = trimmed;
}

export function getAllLayers(): Layer[] {
  return layers;
}
