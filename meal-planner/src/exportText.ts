// Builds the "Copy for LLM" plain text and the Markdown file for the ZIP.
// Rules: planned food and eaten food are always labelled apart,
// and any detail you did not fill in is written as "unknown".

import { formatLong } from './dates';
import { SLOTS, slotLabel, sortMeals, type Meal, type MealEntry, type Part } from './types';

export const CALORIE_INSTRUCTION =
  'Estimate calories for the recorded food actually eaten. Give a plausible range, state assumptions, ' +
  "and flag missing portion information. Don't treat planned meals as consumed.";

export type ExportFormat = 'text' | 'markdown';

export interface ExportOptions {
  format: ExportFormat;
  /** 'meal' = one meal only; 'days' = every day in `dates`, empty days included */
  scope: 'meal' | 'days';
  dates: string[];
  meals: Meal[];
  includeInstruction: boolean;
  /** photo id → file name inside the ZIP (Markdown only) */
  photoFiles?: Map<string, string>;
}

const UNKNOWN = 'unknown';

function lines(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function exportDate(date: string): string {
  return `${formatLong(date, 'en-US')} (${date})`;
}

export function exportTitle(opts: Pick<ExportOptions, 'scope' | 'dates' | 'meals'>): string {
  if (opts.scope === 'meal' && opts.meals[0]) {
    const m = opts.meals[0];
    return `Meal log: ${slotLabel(m.slot)} on ${m.date}`;
  }
  const first = opts.dates[0];
  const last = opts.dates[opts.dates.length - 1];
  return first === last ? `Meal log: ${first}` : `Meal log: ${first} to ${last}`;
}

/** Gives every photo a clear, unique file name for the ZIP, in export order. */
export function assignPhotoFiles(meals: Meal[]): Map<string, string> {
  const out = new Map<string, string>();
  const counter = new Map<string, number>();
  for (const m of sortMeals(meals)) {
    const key = `${m.date}_${m.slot}`;
    const n = (counter.get(key) ?? 0) + 1;
    counter.set(key, n);
    for (const part of ['plan', 'eaten'] as Part[]) {
      const ids = m[part]?.photoIds ?? [];
      ids.forEach((id, i) => {
        out.set(id, `photos/${m.date}_${m.slot}-${n}_${part === 'plan' ? 'planned' : 'eaten'}_${i + 1}.jpg`);
      });
    }
  }
  return out;
}

function guide(format: ExportFormat): string[] {
  const photoLine =
    format === 'text'
      ? 'Photos are NOT included in this text. Only the number of photos in the app is listed.'
      : 'Photo files are in the "photos" folder of this export. Each file name is listed beside its meal.';
  return [
    'How to read this log:',
    '- PLANNED = what I intended to eat. It does not mean I ate it.',
    '- EATEN = what I recorded that I actually ate.',
    '- "EATEN: not recorded" = I did not log whether or what I ate. Do not assume the plan was eaten.',
    '- "unknown" = I did not fill in that detail.',
    '- Times are approximate.',
    `- ${photoLine}`,
  ];
}

function entryBlock(
  label: 'PLANNED' | 'EATEN',
  entry: MealEntry,
  format: ExportFormat,
  photoFiles?: Map<string, string>,
): string[] {
  const out: string[] = [];
  const md = format === 'markdown';
  const ind = md ? '' : '    ';
  const bullet = md ? '- ' : '';
  const field = (name: string, value: string) => `${ind}${bullet}${md ? `**${name}:**` : `${name}:`} ${value}`;

  out.push(md ? `**${label}**` : `  ${label}`);
  out.push(field('Meal', entry.name.trim() || UNKNOWN));
  out.push(field('Time', entry.time.trim() || UNKNOWN));

  const ing = lines(entry.ingredients);
  if (ing.length === 0) out.push(field('Ingredients', UNKNOWN));
  else {
    out.push(`${ind}${bullet}${md ? '**Ingredients:**' : 'Ingredients:'}`);
    for (const i of ing) out.push(`${ind}${md ? '  - ' : '  - '}${i}`);
  }

  const portions = lines(entry.portions);
  out.push(field('Portions', portions.length ? portions.join('; ') : UNKNOWN));

  const notes = lines(entry.notes);
  if (notes.length <= 1) out.push(field('Notes', notes[0] ?? UNKNOWN));
  else {
    out.push(`${ind}${bullet}${md ? '**Notes:**' : 'Notes:'}`);
    for (const n of notes) out.push(`${ind}  ${md ? '- ' : ''}${n}`);
  }

  const ids = entry.photoIds;
  if (ids.length === 0) out.push(field('Photos', 'none'));
  else if (md && photoFiles) {
    out.push(field('Photos', ids.map((id) => `\`${photoFiles.get(id) ?? 'missing file'}\``).join(', ')));
  } else {
    out.push(field('Photos', `${ids.length} in the app (not included in this text)`));
  }
  return out;
}

function mealBlock(m: Meal, format: ExportFormat, photoFiles?: Map<string, string>): string[] {
  const md = format === 'markdown';
  const name = m.eaten?.name.trim() || m.plan?.name.trim() || UNKNOWN;
  const status = m.eaten ? (m.plan ? 'planned and eaten' : 'unplanned, eaten') : 'planned only, eating not recorded';
  const out: string[] = [];
  out.push(md ? `### ${slotLabel(m.slot)}: ${name} (${status})` : `${slotLabel(m.slot).toUpperCase()}: ${name} (${status})`);
  if (md) out.push('');
  if (m.plan) out.push(...entryBlock('PLANNED', m.plan, format, photoFiles));
  else out.push(md ? '**PLANNED:** none (this was not planned)' : '  PLANNED: none (this was not planned)');
  if (md) out.push('');
  if (m.eaten) out.push(...entryBlock('EATEN', m.eaten, format, photoFiles));
  else out.push(md ? '**EATEN:** not recorded' : '  EATEN: not recorded');
  out.push('');
  return out;
}

export function buildExport(opts: ExportOptions): string {
  const { format } = opts;
  const md = format === 'markdown';
  const out: string[] = [];
  const title = exportTitle(opts);
  out.push(md ? `# ${title}` : title.toUpperCase());
  out.push('');
  if (opts.includeInstruction) {
    out.push(md ? `**Instruction:** ${CALORIE_INSTRUCTION}` : `INSTRUCTION: ${CALORIE_INSTRUCTION}`);
    out.push('');
  }
  const g = guide(format);
  out.push(...(md ? g.map((l, i) => (i === 0 ? `> ${l}` : `> ${l}`)) : g));
  out.push('');

  const meals = sortMeals(opts.meals);
  if (opts.scope === 'meal') {
    const m = meals[0];
    if (m) {
      out.push(md ? `## ${exportDate(m.date)}` : `=== ${exportDate(m.date)} ===`);
      out.push('');
      out.push(...mealBlock(m, format, opts.photoFiles));
    }
    return out.join('\n').trimEnd() + '\n';
  }

  for (const date of opts.dates) {
    out.push(md ? `## ${exportDate(date)}` : `=== ${exportDate(date)} ===`);
    out.push('');
    const day = meals.filter((m) => m.date === date);
    if (day.length === 0) {
      out.push('Nothing planned or recorded for this day.');
      out.push('');
      continue;
    }
    for (const s of SLOTS) {
      const inSlot = day.filter((m) => m.slot === s.id);
      if (inSlot.length === 0) {
        out.push(md ? `### ${s.plural}: nothing planned or recorded` : `${s.plural.toUpperCase()}: nothing planned or recorded`);
        out.push('');
        continue;
      }
      for (const m of inSlot) out.push(...mealBlock(m, format, opts.photoFiles));
    }
  }
  return out.join('\n').trimEnd() + '\n';
}
