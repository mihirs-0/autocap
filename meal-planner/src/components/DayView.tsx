import { useEffect, useState } from 'react';
import { addDays, formatLong, todayISO } from '../dates';
import { getMealsByDate, getPhotoMetas, saveMeal } from '../db';
import { SLOTS, allPhotoIds, sortMeals, type Meal, type MealEntry, type Part, type PhotoMeta, type Slot } from '../types';
import { Thumb, errorText, useNotify } from '../ui';
import type { LightboxTarget } from './Lightbox';

interface Props {
  date: string;
  setDate: (d: string) => void;
  version: number;
  refresh: () => void;
  onEdit: (meal: Meal, part: Part) => void;
  onAdd: (slot: Slot) => void;
  onPhoto: (t: LightboxTarget) => void;
  onExportDay: () => void;
  onCopyDay: () => void;
}

export function DayView({ date, setDate, version, refresh, onEdit, onAdd, onPhoto, onExportDay, onCopyDay }: Props) {
  const notify = useNotify();
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [thumbs, setThumbs] = useState<Map<string, PhotoMeta>>(new Map());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = sortMeals(await getMealsByDate(date));
        const metas = await getPhotoMetas(list.flatMap(allPhotoIds));
        if (!alive) return;
        setMeals(list);
        setThumbs(new Map(metas.map((m) => [m.id, m])));
      } catch (e) {
        if (alive) {
          setMeals([]);
          notify(errorText(e), 'error');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [date, version, notify]);

  const today = todayISO();
  const relative = date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : date === addDays(today, -1) ? 'Yesterday' : null;

  const ateAsPlanned = async (meal: Meal) => {
    if (!meal.plan) return;
    const eaten: MealEntry = { ...meal.plan, photoIds: [] };
    try {
      await saveMeal({ ...meal, eaten, updatedAt: Date.now() }, [], []);
      notify('Recorded as eaten. Your plan is kept. Tap the meal to change details or add a photo.');
      refresh();
    } catch (e) {
      notify(errorText(e), 'error');
    }
  };

  return (
    <div className="day">
      <header className="day-header">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
          ‹
        </button>
        <div className="day-title">
          <h1>{relative ?? formatLong(date).replace(/, \d{4}$/, '')}</h1>
          <label className="date-pick">
            <span>{relative ? formatLong(date) : 'Change date'}</span>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              aria-label="Pick a date"
            />
          </label>
        </div>
        <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">
          ›
        </button>
      </header>
      {date !== today && (
        <button className="link-btn today-link" onClick={() => setDate(today)}>
          Go to today
        </button>
      )}

      {meals === null ? (
        <p className="muted center">Loading…</p>
      ) : (
        SLOTS.map((s) => {
          const inSlot = meals.filter((m) => m.slot === s.id);
          return (
            <section key={s.id} className="slot">
              <h2 className="slot-title">{s.plural}</h2>
              {inSlot.map((m) => (
                <MealCard
                  key={m.id}
                  meal={m}
                  thumbs={thumbs}
                  onEdit={(part) => onEdit(m, part)}
                  onPhoto={onPhoto}
                  onAteAsPlanned={() => ateAsPlanned(m)}
                />
              ))}
              <button className="add-btn" onClick={() => onAdd(s.id)}>
                + Add {s.label.toLowerCase()}
              </button>
            </section>
          );
        })
      )}

      <section className="day-actions">
        <button className="btn" onClick={onExportDay}>
          Copy day for LLM / Export
        </button>
        <button className="btn btn-secondary" onClick={onCopyDay} disabled={!meals?.length}>
          Copy this day's plan to another day
        </button>
      </section>
    </div>
  );
}

function EntryLine({ label, entry, empty }: { label: string; entry: MealEntry | null; empty: string }) {
  return (
    <div className={`entry-line ${entry ? '' : 'entry-empty'}`}>
      <span className={`tag ${label === 'Ate' ? 'tag-ate' : 'tag-plan'}`}>{label}</span>
      {entry ? (
        <span className="entry-name">
          {entry.name}
          {entry.time && <span className="entry-time"> · {entry.time}</span>}
        </span>
      ) : (
        <span className="entry-name muted">{empty}</span>
      )}
    </div>
  );
}

function MealCard({
  meal,
  thumbs,
  onEdit,
  onPhoto,
  onAteAsPlanned,
}: {
  meal: Meal;
  thumbs: Map<string, PhotoMeta>;
  onEdit: (part: Part) => void;
  onPhoto: (t: LightboxTarget) => void;
  onAteAsPlanned: () => void;
}) {
  const metas = allPhotoIds(meal)
    .map((id) => thumbs.get(id))
    .filter((m): m is PhotoMeta => !!m);
  return (
    <div
      className="meal-card"
      role="button"
      tabIndex={0}
      onClick={() => onEdit(meal.eaten || !meal.plan ? 'eaten' : 'plan')}
      onKeyDown={(e) => e.key === 'Enter' && onEdit('plan')}
    >
      <div className="meal-lines">
        <EntryLine label="Plan" entry={meal.plan} empty="Not planned" />
        <EntryLine label="Ate" entry={meal.eaten} empty="Not recorded" />
      </div>
      {metas.length > 0 && (
        <div className="thumb-row">
          {metas.map((m) => (
            <Thumb key={m.id} meta={m} onOpen={() => onPhoto({ id: m.id })} />
          ))}
        </div>
      )}
      {meal.plan && !meal.eaten && (
        <button
          className="btn btn-small btn-secondary ate-btn"
          onClick={(e) => {
            e.stopPropagation();
            onAteAsPlanned();
          }}
        >
          ✓ Ate as planned
        </button>
      )}
      <span className="chevron" aria-hidden="true">
        ›
      </span>
    </div>
  );
}
