// Full backup and restore as one JSON file. Photos are stored inside as base64 text.

import { isValidISO } from './dates';
import { readEverything, writeEverything, type Everything } from './db';
import { SLOTS, type Favorite, type Meal, type MealEntry, type PhotoData, type PhotoMeta } from './types';

export const BACKUP_FORMAT = 'meal-planner-backup';
export const BACKUP_VERSION = 1;

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function fromBase64(s: string): ArrayBuffer {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Builds the backup file in pieces, so one huge text string is not needed. */
export async function buildBackup(): Promise<{ blob: Blob; counts: { meals: number; photos: number; favorites: number } }> {
  const all = await readEverything();
  const dataById = new Map(all.photoData.map((d) => [d.id, d]));
  const parts: string[] = [];
  parts.push(
    `{"format":${JSON.stringify(BACKUP_FORMAT)},"version":${BACKUP_VERSION},` +
      `"exportedAt":${JSON.stringify(new Date().toISOString())},` +
      `"meals":${JSON.stringify(all.meals)},"favorites":${JSON.stringify(all.favorites)},"photos":[`,
  );
  let photos = 0;
  all.photos.forEach((m) => {
    const d = dataById.get(m.id);
    if (!d) return;
    const { thumb, ...rest } = m;
    parts.push(
      (photos ? ',' : '') +
        JSON.stringify({ ...rest, thumb: toBase64(thumb), type: d.type, data: toBase64(d.data) }),
    );
    photos++;
  });
  parts.push(']}');
  return {
    blob: new Blob(parts, { type: 'application/json' }),
    counts: { meals: all.meals.length, photos, favorites: all.favorites.length },
  };
}

export interface ParsedBackup {
  exportedAt: string;
  data: Everything;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function entry(v: unknown): MealEntry | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  return {
    name: str(o.name),
    time: str(o.time),
    ingredients: str(o.ingredients),
    portions: str(o.portions),
    notes: str(o.notes),
    photoIds: Array.isArray(o.photoIds) ? o.photoIds.filter((x): x is string => typeof x === 'string') : [],
  };
}

function bad(why: string): never {
  throw new Error(`This file is not a valid Meal Planner backup (${why}). Nothing was changed.`);
}

export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    bad('it is not readable JSON');
  }
  const o = raw as Record<string, unknown>;
  if (!o || o.format !== BACKUP_FORMAT) bad('wrong file type');
  if (typeof o.version !== 'number' || o.version > BACKUP_VERSION) bad('it was made by a newer version of the app');
  if (!Array.isArray(o.meals) || !Array.isArray(o.photos) || !Array.isArray(o.favorites)) bad('missing sections');
  const slotIds = new Set(SLOTS.map((s) => s.id));

  const meals: Meal[] = (o.meals as Record<string, unknown>[]).map((m, i) => {
    if (typeof m.id !== 'string' || !isValidISO(m.date) || !slotIds.has(m.slot as never)) bad(`meal ${i + 1} is damaged`);
    return {
      id: m.id as string,
      date: m.date as string,
      slot: m.slot as Meal['slot'],
      plan: entry(m.plan),
      eaten: entry(m.eaten),
      createdAt: Number(m.createdAt) || Date.now(),
      updatedAt: Number(m.updatedAt) || Date.now(),
    };
  });

  const favorites: Favorite[] = (o.favorites as Record<string, unknown>[]).map((f, i) => {
    if (typeof f.id !== 'string') bad(`favorite ${i + 1} is damaged`);
    return {
      id: f.id as string,
      name: str(f.name),
      time: str(f.time),
      ingredients: str(f.ingredients),
      portions: str(f.portions),
      notes: str(f.notes),
      slot: slotIds.has(f.slot as never) ? (f.slot as Favorite['slot']) : null,
      createdAt: Number(f.createdAt) || Date.now(),
    };
  });

  const photos: PhotoMeta[] = [];
  const photoData: PhotoData[] = [];
  (o.photos as Record<string, unknown>[]).forEach((p, i) => {
    if (typeof p.id !== 'string' || typeof p.data !== 'string' || typeof p.thumb !== 'string') bad(`photo ${i + 1} is damaged`);
    let data: ArrayBuffer, thumb: ArrayBuffer;
    try {
      data = fromBase64(p.data as string);
      thumb = fromBase64(p.thumb as string);
    } catch {
      bad(`photo ${i + 1} is damaged`);
    }
    photos.push({
      id: p.id as string,
      mealId: str(p.mealId),
      date: isValidISO(p.date) ? (p.date as string) : '0000-00-00',
      part: p.part === 'plan' ? 'plan' : 'eaten',
      width: Number(p.width) || 0,
      height: Number(p.height) || 0,
      createdAt: Number(p.createdAt) || Date.now(),
      thumb,
      thumbType: str(p.thumbType) || 'image/jpeg',
    });
    photoData.push({ id: p.id as string, type: str(p.type) || 'image/jpeg', data });
  });

  return { exportedAt: str(o.exportedAt), data: { meals, favorites, photos, photoData } };
}

export function restoreBackup(parsed: ParsedBackup, mode: 'merge' | 'replace'): Promise<void> {
  return writeEverything(parsed.data, mode === 'replace');
}
