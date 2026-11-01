// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as db from '../src/db';
import { buildBackup, parseBackup, restoreBackup } from '../src/backup';
import type { Meal, PhotoData, PhotoMeta } from '../src/types';

const bytes = (n: number, seed: number) => new Uint8Array(n).map((_, i) => (i + seed) % 256).buffer;

function photo(id: string, mealId: string): { meta: PhotoMeta; data: PhotoData } {
  return {
    meta: { id, mealId, date: '2026-11-01', part: 'eaten', width: 10, height: 10, createdAt: 1, thumb: bytes(50, 1), thumbType: 'image/jpeg' },
    data: { id, type: 'image/jpeg', data: bytes(500, 2) },
  };
}

const meal: Meal = {
  id: 'm1',
  date: '2026-11-01',
  slot: 'dinner',
  plan: { name: 'Pasta', time: '19:00', ingredients: 'pasta\nsauce', portions: '', notes: '', photoIds: [] },
  eaten: { name: 'Pizza', time: '', ingredients: '', portions: '2 slices', notes: '', photoIds: ['p1'] },
  createdAt: 1,
  updatedAt: 1,
};

describe('database', () => {
  it('saves a meal with a photo and keeps plan and eaten apart', async () => {
    await db.saveMeal(meal, [photo('p1', 'm1')], []);
    const [m] = await db.getMealsByDate('2026-11-01');
    expect(m.plan?.name).toBe('Pasta');
    expect(m.eaten?.name).toBe('Pizza');
    expect((await db.getPhotoData(['p1'])).get('p1')?.data.byteLength).toBe(500);
  });

  it('edits a meal, moves its date, and removes a deleted photo', async () => {
    await db.saveMeal({ ...meal, date: '2026-11-02', eaten: { ...meal.eaten!, photoIds: ['p2'] } }, [photo('p2', 'm1')], ['p1']);
    expect(await db.getMealsByDate('2026-11-01')).toHaveLength(0);
    expect((await db.getPhotoData(['p1'])).size).toBe(0);
    const metas = await db.getPhotoMetasInRange('2026-11-02', '2026-11-02');
    expect(metas.map((x) => x.id)).toEqual(['p2']);
  });

  it('round-trips a full backup, including photo bytes', async () => {
    await db.saveFavorite({ id: 'f1', name: 'Oats', time: '', ingredients: '', portions: '', notes: '', slot: 'breakfast', createdAt: 1 });
    const { blob, counts } = await buildBackup();
    expect(counts).toEqual({ meals: 1, photos: 1, favorites: 1 });
    const parsed = parseBackup(await blob.text());
    await db.writeEverything({ meals: [], favorites: [], photos: [], photoData: [] }, true);
    expect((await db.countEverything()).meals).toBe(0);
    await restoreBackup(parsed, 'replace');
    expect(await db.countEverything()).toEqual({ meals: 1, photos: 1, favorites: 1 });
    const d = (await db.getPhotoData(['p2'])).get('p2')!;
    expect(new Uint8Array(d.data)).toEqual(new Uint8Array(bytes(500, 2)));
  });

  it('rejects a damaged backup without touching data', () => {
    expect(() => parseBackup('{"format":"other"}')).toThrow(/not a valid Meal Planner backup/);
    expect(() => parseBackup('not json')).toThrow(/Nothing was changed/);
  });

  it('deletes a meal with all its photos', async () => {
    await db.deleteMeal('m1');
    expect(await db.countEverything()).toEqual({ meals: 0, photos: 0, favorites: 1 });
  });

  it('turns a full-storage error into a clear message', () => {
    const e = db.explainStorageError(new DOMException('full', 'QuotaExceededError'), 'save the meal');
    expect(e.message).toMatch(/not enough storage space.*Nothing was changed/);
  });
});
