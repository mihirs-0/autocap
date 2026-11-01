// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assignPhotoFiles, buildExport, CALORIE_INSTRUCTION } from '../src/exportText';
import type { Meal } from '../src/types';

const base = { createdAt: 1, updatedAt: 1 };
const meals: Meal[] = [
  {
    ...base,
    id: 'a',
    date: '2026-11-01',
    slot: 'lunch',
    plan: { name: 'Chicken salad', time: '12:30', ingredients: 'chicken\nlettuce', portions: '1 bowl', notes: '', photoIds: [] },
    eaten: { name: 'Chicken salad and bread', time: '13:00', ingredients: '', portions: '', notes: 'ate half\nvery good', photoIds: ['p1', 'p2'] },
  },
  {
    ...base,
    id: 'b',
    date: '2026-11-01',
    slot: 'breakfast',
    plan: { name: 'Oatmeal', time: '', ingredients: '', portions: '', notes: '', photoIds: [] },
    eaten: null,
  },
  {
    ...base,
    id: 'c',
    date: '2026-11-01',
    slot: 'snack',
    plan: null,
    eaten: { name: 'Apple', time: '', ingredients: '', portions: '', notes: '', photoIds: [] },
  },
];

describe('text export', () => {
  const text = buildExport({ format: 'text', scope: 'days', dates: ['2026-11-01', '2026-11-02'], meals, includeInstruction: true });

  it('separates planned and eaten food, and marks missing details as unknown', () => {
    expect(text).toContain('LUNCH: Chicken salad and bread (planned and eaten)');
    expect(text).toContain('BREAKFAST: Oatmeal (planned only, eating not recorded)');
    expect(text).toContain('EATEN: not recorded');
    expect(text).toContain('SNACK: Apple (unplanned, eaten)');
    expect(text).toContain('PLANNED: none (this was not planned)');
    expect(text).toContain('Portions: unknown');
    expect(text).toContain('Time: unknown');
    expect(text).toContain('DINNER: nothing planned or recorded');
    expect(text).toContain('Nothing planned or recorded for this day.');
  });

  it('says photos are not in the text and includes the optional instruction', () => {
    expect(text).toContain('2 in the app (not included in this text)');
    expect(text).toContain('Photos are NOT included in this text');
    expect(text).toContain(CALORIE_INSTRUCTION);
    const without = buildExport({ format: 'text', scope: 'days', dates: ['2026-11-01'], meals, includeInstruction: false });
    expect(without).not.toContain('INSTRUCTION');
  });

  it('lists breakfast before lunch, with dates', () => {
    expect(text.indexOf('BREAKFAST')).toBeLessThan(text.indexOf('LUNCH'));
    expect(text).toContain('Sunday, November 1, 2026 (2026-11-01)');
  });

  it('exports a single meal only', () => {
    const one = buildExport({ format: 'text', scope: 'meal', dates: ['2026-11-01'], meals: [meals[0]], includeInstruction: false });
    expect(one).toContain('MEAL LOG: LUNCH ON 2026-11-01');
    expect(one).not.toContain('Oatmeal');
    expect(one).not.toContain('DINNER');
  });

  it('puts photo file names beside meals in Markdown', () => {
    const files = assignPhotoFiles(meals);
    expect(files.get('p1')).toBe('photos/2026-11-01_lunch-1_eaten_1.jpg');
    const md = buildExport({ format: 'markdown', scope: 'days', dates: ['2026-11-01'], meals, includeInstruction: false, photoFiles: files });
    expect(md).toContain('`photos/2026-11-01_lunch-1_eaten_1.jpg`, `photos/2026-11-01_lunch-1_eaten_2.jpg`');
    expect(md).toContain('### Lunch: Chicken salad and bread');
    expect(md).toContain('**EATEN:** not recorded');
  });
});
