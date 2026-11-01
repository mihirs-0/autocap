// Local storage for meals, photos and favorites, using IndexedDB.
// Every write runs in one transaction: it either saves completely or
// changes nothing. Errors are turned into plain messages for the screen.

import type { Favorite, Meal, Part, PhotoData, PhotoMeta } from './types';

const DB_NAME = 'meal-planner';
const DB_VERSION = 1;
type StoreName = 'meals' | 'photos' | 'photoData' | 'favorites';
const ALL_STORES: StoreName[] = ['meals', 'photos', 'photoData', 'favorites'];

export class StorageError extends Error {
  constructor(message: string, readonly original?: unknown) {
    super(message);
    this.name = 'StorageError';
  }
}

export function explainStorageError(err: unknown, action: string): StorageError {
  if (err instanceof StorageError) return err;
  const name = (err as { name?: string } | null)?.name ?? '';
  const message = (err as { message?: string } | null)?.message ?? '';
  if (name === 'QuotaExceededError' || /quota/i.test(message)) {
    return new StorageError(
      `Could not ${action}: there is not enough storage space on this device. Nothing was changed. ` +
        'Free up space on your phone, or delete some old photos, and then try again.',
      err,
    );
  }
  if (name === 'InvalidStateError' || name === 'UnknownError') {
    return new StorageError(
      `Could not ${action}: the local database is not available right now. Nothing was changed. ` +
        'Close the app fully, open it again, and try again.',
      err,
    );
  }
  return new StorageError(
    `Could not ${action}: ${message || name || 'unknown storage error'}. Nothing was changed.`,
    err,
  );
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new StorageError('This browser does not give the app local storage (IndexedDB), so nothing can be saved.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meals')) {
        db.createObjectStore('meals', { keyPath: 'id' }).createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('photos')) {
        const s = db.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('mealId', 'mealId');
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('photoData')) db.createObjectStore('photoData', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('favorites')) db.createObjectStore('favorites', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(explainStorageError(req.error, 'open the local database'));
    req.onblocked = () =>
      reject(new StorageError('The database is in use by another tab of this app. Close the other tab and try again.'));
  });
  dbPromise = p;
  p.catch(() => {
    if (dbPromise === p) dbPromise = null;
  });
  return p;
}

/**
 * Runs one transaction. `body` queues requests and returns a function that
 * reads the results. The promise resolves only after the data is committed.
 */
async function run<T>(
  stores: StoreName[],
  mode: IDBTransactionMode,
  action: string,
  body: (t: IDBTransaction) => () => T,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    let t: IDBTransaction;
    try {
      t = db.transaction(stores, mode);
    } catch (e) {
      reject(explainStorageError(e, action));
      return;
    }
    let read: () => T;
    t.oncomplete = () => {
      try {
        resolve(read());
      } catch (e) {
        reject(explainStorageError(e, action));
      }
    };
    t.onabort = () => reject(explainStorageError(t.error ?? new Error('the save was cancelled'), action));
    try {
      read = body(t);
    } catch (e) {
      reject(explainStorageError(e, action));
      try {
        t.abort();
      } catch {
        /* already finished */
      }
    }
  });
}

// ---------- meals ----------

export function getMealsByDate(date: string): Promise<Meal[]> {
  return run(['meals'], 'readonly', 'load meals', (t) => {
    const r = t.objectStore('meals').index('date').getAll(date);
    return () => r.result as Meal[];
  });
}

export function getMealsInRange(start: string, end: string): Promise<Meal[]> {
  return run(['meals'], 'readonly', 'load meals', (t) => {
    const r = t.objectStore('meals').index('date').getAll(IDBKeyRange.bound(start, end));
    return () => r.result as Meal[];
  });
}

export function getMeal(id: string): Promise<Meal | undefined> {
  return run(['meals'], 'readonly', 'load the meal', (t) => {
    const r = t.objectStore('meals').get(id);
    return () => r.result as Meal | undefined;
  });
}

export interface NewPhoto {
  meta: PhotoMeta;
  data: PhotoData;
}

/** Saves a meal with its new photos and removes deleted photos, all at once. */
export function saveMeal(meal: Meal, newPhotos: NewPhoto[], deletePhotoIds: string[]): Promise<void> {
  return run(['meals', 'photos', 'photoData'], 'readwrite', 'save the meal', (t) => {
    const meals = t.objectStore('meals');
    const photos = t.objectStore('photos');
    const photoData = t.objectStore('photoData');
    meals.put(meal);
    const partOf = (id: string): Part => (meal.plan?.photoIds.includes(id) ? 'plan' : 'eaten');
    const newIds = new Set<string>();
    for (const p of newPhotos) {
      newIds.add(p.meta.id);
      photos.put({ ...p.meta, date: meal.date, mealId: meal.id, part: partOf(p.meta.id) });
      photoData.put(p.data);
    }
    for (const id of deletePhotoIds) {
      photos.delete(id);
      photoData.delete(id);
    }
    // Keep date and part of older photos in step with the meal (the date or slot may have changed).
    for (const part of ['plan', 'eaten'] as Part[]) {
      for (const id of meal[part]?.photoIds ?? []) {
        if (newIds.has(id)) continue;
        const g = photos.get(id);
        g.onsuccess = () => {
          const m = g.result as PhotoMeta | undefined;
          if (m && (m.date !== meal.date || m.part !== part || m.mealId !== meal.id)) {
            photos.put({ ...m, date: meal.date, part, mealId: meal.id });
          }
        };
      }
    }
    return () => undefined;
  });
}

export function addMeals(list: Meal[]): Promise<void> {
  return run(['meals'], 'readwrite', 'copy the meals', (t) => {
    const s = t.objectStore('meals');
    for (const m of list) s.put(m);
    return () => undefined;
  });
}

export function deleteMeal(id: string): Promise<void> {
  return run(['meals', 'photos', 'photoData'], 'readwrite', 'delete the meal', (t) => {
    t.objectStore('meals').delete(id);
    const photos = t.objectStore('photos');
    const photoData = t.objectStore('photoData');
    const keys = photos.index('mealId').getAllKeys(id);
    keys.onsuccess = () => {
      for (const k of keys.result) {
        photos.delete(k);
        photoData.delete(k);
      }
    };
    return () => undefined;
  });
}

// ---------- photos ----------

export function getPhotoMetas(ids: string[]): Promise<PhotoMeta[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return run(['photos'], 'readonly', 'load photos', (t) => {
    const s = t.objectStore('photos');
    const reqs = ids.map((id) => s.get(id));
    return () => reqs.map((r) => r.result as PhotoMeta | undefined).filter((m): m is PhotoMeta => !!m);
  });
}

export function getPhotoMetasInRange(start: string, end: string): Promise<PhotoMeta[]> {
  return run(['photos'], 'readonly', 'load photos', (t) => {
    const r = t.objectStore('photos').index('date').getAll(IDBKeyRange.bound(start, end));
    return () => r.result as PhotoMeta[];
  });
}

export function getPhotoData(ids: string[]): Promise<Map<string, PhotoData>> {
  return run(['photoData'], 'readonly', 'load photos', (t) => {
    const s = t.objectStore('photoData');
    const reqs = ids.map((id) => s.get(id));
    return () => {
      const out = new Map<string, PhotoData>();
      for (const r of reqs) if (r.result) out.set((r.result as PhotoData).id, r.result as PhotoData);
      return out;
    };
  });
}

// ---------- favorites ----------

export function listFavorites(): Promise<Favorite[]> {
  return run(['favorites'], 'readonly', 'load favorites', (t) => {
    const r = t.objectStore('favorites').getAll();
    return () => (r.result as Favorite[]).sort((a, b) => a.name.localeCompare(b.name));
  });
}

export function saveFavorite(f: Favorite): Promise<void> {
  return run(['favorites'], 'readwrite', 'save the favorite', (t) => {
    t.objectStore('favorites').put(f);
    return () => undefined;
  });
}

export function deleteFavorite(id: string): Promise<void> {
  return run(['favorites'], 'readwrite', 'delete the favorite', (t) => {
    t.objectStore('favorites').delete(id);
    return () => undefined;
  });
}

// ---------- backup ----------

export interface Everything {
  meals: Meal[];
  favorites: Favorite[];
  photos: PhotoMeta[];
  photoData: PhotoData[];
}

export function readEverything(): Promise<Everything> {
  return run(ALL_STORES, 'readonly', 'read your data for the backup', (t) => {
    const m = t.objectStore('meals').getAll();
    const f = t.objectStore('favorites').getAll();
    const p = t.objectStore('photos').getAll();
    const d = t.objectStore('photoData').getAll();
    return () => ({
      meals: m.result as Meal[],
      favorites: f.result as Favorite[],
      photos: p.result as PhotoMeta[],
      photoData: d.result as PhotoData[],
    });
  });
}

/** Writes restored data. With replace=true, current data is removed first, in the same transaction. */
export function writeEverything(data: Everything, replace: boolean): Promise<void> {
  return run(ALL_STORES, 'readwrite', 'restore the backup', (t) => {
    if (replace) for (const s of ALL_STORES) t.objectStore(s).clear();
    for (const x of data.meals) t.objectStore('meals').put(x);
    for (const x of data.favorites) t.objectStore('favorites').put(x);
    for (const x of data.photos) t.objectStore('photos').put(x);
    for (const x of data.photoData) t.objectStore('photoData').put(x);
    return () => undefined;
  });
}

export function countEverything(): Promise<{ meals: number; photos: number; favorites: number }> {
  return run(['meals', 'photos', 'favorites'], 'readonly', 'count your data', (t) => {
    const m = t.objectStore('meals').count();
    const p = t.objectStore('photos').count();
    const f = t.objectStore('favorites').count();
    return () => ({ meals: m.result, photos: p.result, favorites: f.result });
  });
}
