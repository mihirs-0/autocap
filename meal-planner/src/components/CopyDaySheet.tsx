import { useEffect, useState } from 'react';
import { addDays, formatLong } from '../dates';
import { addMeals, getMealsByDate } from '../db';
import { newId, sortMeals, type Meal } from '../types';
import { Sheet, errorText, useNotify } from '../ui';

type Source = 'plan' | 'eaten';

export function CopyDaySheet({ date, onClose, onDone }: { date: string; onClose: () => void; onDone: (target: string) => void }) {
  const notify = useNotify();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [target, setTarget] = useState(addDays(date, 1));
  const [source, setSource] = useState<Source>('plan');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getMealsByDate(date)
      .then((m) => setMeals(sortMeals(m)))
      .catch((e) => notify(errorText(e), 'error'));
  }, [date, notify]);

  // "plan": copy each plan. "eaten": copy what was eaten; use the plan where nothing was recorded.
  const toCopy = meals
    .map((m) => ({ m, entry: source === 'plan' ? m.plan : m.eaten ?? m.plan }))
    .filter((x) => x.entry !== null);

  const copy = async () => {
    if (!target) return;
    setBusy(true);
    const now = Date.now();
    const created: Meal[] = toCopy.map(({ m, entry }, i) => ({
      id: newId(),
      date: target,
      slot: m.slot,
      plan: { ...entry!, photoIds: [] },
      eaten: null,
      createdAt: now + i,
      updatedAt: now + i,
    }));
    try {
      await addMeals(created);
      notify(`Copied ${created.length} meal${created.length === 1 ? '' : 's'} as plans to ${formatLong(target)}.`);
      onDone(target);
    } catch (e) {
      notify(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Copy day's plan" onClose={onClose} closeLabel="Cancel">
      <p className="hint">From {formatLong(date)}</p>
      <label className="field">
        <span>Copy to</span>
        <input type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
      </label>

      <fieldset className="radio-group">
        <legend>What to copy</legend>
        <label>
          <input type="radio" checked={source === 'plan'} onChange={() => setSource('plan')} /> The planned meals
        </label>
        <label>
          <input type="radio" checked={source === 'eaten'} onChange={() => setSource('eaten')} /> What I actually ate (uses
          the plan where nothing was recorded)
        </label>
      </fieldset>

      <p className="hint">
        The copies are added as <strong>plans</strong> on the new day. Meals already on that day stay. Photos are not
        copied.
      </p>
      <ul className="plain-list">
        {toCopy.map(({ m, entry }) => (
          <li key={m.id}>
            {m.slot}: {entry!.name}
          </li>
        ))}
      </ul>
      <button className="btn btn-big" onClick={copy} disabled={busy || toCopy.length === 0 || !target || target === date}>
        {toCopy.length === 0 ? 'Nothing to copy' : `Copy ${toCopy.length} meal${toCopy.length === 1 ? '' : 's'}`}
      </button>
    </Sheet>
  );
}
