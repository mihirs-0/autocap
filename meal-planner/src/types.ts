export type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type Part = 'plan' | 'eaten';

export const SLOTS: { id: Slot; label: string; plural: string }[] = [
  { id: 'breakfast', label: 'Breakfast', plural: 'Breakfast' },
  { id: 'lunch', label: 'Lunch', plural: 'Lunch' },
  { id: 'dinner', label: 'Dinner', plural: 'Dinner' },
  { id: 'snack', label: 'Snack', plural: 'Snacks' },
];

export function slotLabel(slot: Slot): string {
  return SLOTS.find((s) => s.id === slot)?.label ?? slot;
}

/** One side of a meal: what was planned, or what was eaten. Empty string = not filled in. */
export interface MealEntry {
  name: string;
  /** "HH:MM" from the time picker, or "" */
  time: string;
  /** One ingredient per line */
  ingredients: string;
  portions: string;
  notes: string;
  photoIds: string[];
}

/**
 * A meal keeps the plan and the record of what was eaten apart,
 * so recording what you ate never overwrites the plan.
 */
export interface Meal {
  id: string;
  /** Local date "YYYY-MM-DD" */
  date: string;
  slot: Slot;
  plan: MealEntry | null;
  eaten: MealEntry | null;
  createdAt: number;
  updatedAt: number;
}

/** Small record for each photo: the thumbnail plus where it belongs. */
export interface PhotoMeta {
  id: string;
  mealId: string;
  date: string;
  part: Part;
  width: number;
  height: number;
  createdAt: number;
  thumb: ArrayBuffer;
  thumbType: string;
}

/** The full-size photo. Kept in a separate store so lists load fast. */
export interface PhotoData {
  id: string;
  type: string;
  data: ArrayBuffer;
}

export interface Favorite {
  id: string;
  name: string;
  time: string;
  ingredients: string;
  portions: string;
  notes: string;
  slot: Slot | null;
  createdAt: number;
}

export function emptyEntry(): MealEntry {
  return { name: '', time: '', ingredients: '', portions: '', notes: '', photoIds: [] };
}

export function allPhotoIds(meal: Meal): string[] {
  return [...(meal.plan?.photoIds ?? []), ...(meal.eaten?.photoIds ?? [])];
}

export function newId(): string {
  const c: Crypto = crypto;
  // randomUUID is missing on iOS before 15.4.
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x: number) => x.toString(16).padStart(2, '0')).join('');
}

/** Sort by date, then breakfast → snack, then time (empty last), then creation order. */
export function sortMeals(meals: Meal[]): Meal[] {
  const order = (s: Slot) => SLOTS.findIndex((x) => x.id === s);
  const time = (m: Meal) => m.eaten?.time || m.plan?.time || '99:99';
  return [...meals].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      order(a.slot) - order(b.slot) ||
      time(a).localeCompare(time(b)) ||
      a.createdAt - b.createdAt,
  );
}
