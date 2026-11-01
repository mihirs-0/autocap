import { useEffect, useState } from 'react';
import { formatShort, todayISO } from '../dates';
import { listFavorites } from '../db';
import { SLOTS, emptyEntry, newId, type Favorite, type Meal, type MealEntry, type Part, type Slot } from '../types';
import { Sheet, errorText, useNotify } from '../ui';

export function AddMealSheet({
  date,
  slot: initialSlot,
  onClose,
  onStart,
}: {
  date: string;
  slot: Slot;
  onClose: () => void;
  onStart: (meal: Meal, part: Part) => void;
}) {
  const notify = useNotify();
  const [part, setPart] = useState<Part>(date < todayISO() ? 'eaten' : 'plan');
  const [slot, setSlot] = useState<Slot>(initialSlot);
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  useEffect(() => {
    listFavorites()
      .then(setFavorites)
      .catch((e) => notify(errorText(e), 'error'));
  }, [notify]);

  const start = (entry: MealEntry) => {
    const now = Date.now();
    onStart(
      {
        id: newId(),
        date,
        slot,
        plan: part === 'plan' ? entry : null,
        eaten: part === 'eaten' ? entry : null,
        createdAt: now,
        updatedAt: now,
      },
      part,
    );
  };

  const shown = [...favorites].sort((a, b) => Number(b.slot === slot) - Number(a.slot === slot));

  return (
    <Sheet title={`Add to ${formatShort(date)}`} onClose={onClose} closeLabel="Cancel">
      <div className="segmented" role="radiogroup" aria-label="What are you adding?">
        <button role="radio" aria-checked={part === 'plan'} className={part === 'plan' ? 'on' : ''} onClick={() => setPart('plan')}>
          Plan a meal
        </button>
        <button role="radio" aria-checked={part === 'eaten'} className={part === 'eaten' ? 'on' : ''} onClick={() => setPart('eaten')}>
          Log what I ate
        </button>
      </div>
      <p className="hint">
        {part === 'plan'
          ? 'A plan is what you intend to eat. You can record what you actually ate later.'
          : 'Use this for food you ate, planned or not. It is saved as eaten, without a plan.'}
      </p>

      <div className="chips" role="radiogroup" aria-label="Meal">
        {SLOTS.map((s) => (
          <button key={s.id} role="radio" aria-checked={slot === s.id} className={`chip ${slot === s.id ? 'on' : ''}`} onClick={() => setSlot(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      <button className="btn btn-big" onClick={() => start(emptyEntry())}>
        New {part === 'plan' ? 'plan' : 'entry'}
      </button>

      <h3 className="section-title">Or reuse a favorite</h3>
      {favorites.length === 0 ? (
        <p className="muted">
          No favorites yet. When you edit a meal, tap “Save as favorite” to reuse it here.
        </p>
      ) : (
        <ul className="list">
          {shown.map((f) => (
            <li key={f.id}>
              <button
                className="list-btn"
                onClick={() =>
                  start({ name: f.name, time: f.time, ingredients: f.ingredients, portions: f.portions, notes: f.notes, photoIds: [] })
                }
              >
                <span className="list-main">{f.name}</span>
                <span className="list-sub">
                  {[f.slot && SLOTS.find((s) => s.id === f.slot)?.label, f.portions, f.ingredients.split('\n').filter(Boolean).length ? `${f.ingredients.split('\n').filter(Boolean).length} ingredients` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
