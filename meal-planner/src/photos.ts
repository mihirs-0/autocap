// Makes a smaller copy of each photo before it is saved.
// Full size: longest side 1600 px, JPEG quality 0.82. Enough to see food detail
// (about 200–500 KB each). Thumbnail: longest side 360 px for lists.

import type { Meal, Part, PhotoData, PhotoMeta } from './types';
import { newId } from './types';
import type { NewPhoto } from './db';

const FULL_MAX = 1600;
const FULL_QUALITY = 0.82;
const THUMB_MAX = 360;
const THUMB_QUALITY = 0.7;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This file could not be read as a photo.'));
    };
    img.src = url;
  });
}

async function resize(img: HTMLImageElement, max: number, quality: number) {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The phone could not process this photo.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
  // Free the canvas memory at once (iPhones have a low canvas memory limit).
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error('The phone could not compress this photo.');
  return { data: await blob.arrayBuffer(), width, height };
}

export async function preparePhoto(file: Blob, meal: Meal, part: Part): Promise<NewPhoto> {
  const img = await loadImage(file);
  const full = await resize(img, FULL_MAX, FULL_QUALITY);
  const thumb = await resize(img, THUMB_MAX, THUMB_QUALITY);
  const id = newId();
  const meta: PhotoMeta = {
    id,
    mealId: meal.id,
    date: meal.date,
    part,
    width: full.width,
    height: full.height,
    createdAt: Date.now(),
    thumb: thumb.data,
    thumbType: 'image/jpeg',
  };
  const data: PhotoData = { id, type: 'image/jpeg', data: full.data };
  return { meta, data };
}
