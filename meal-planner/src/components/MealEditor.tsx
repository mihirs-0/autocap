import { useEffect, useRef, useState } from 'react';
import { getPhotoMetas, saveFavorite, saveMeal, deleteMeal, type NewPhoto } from '../db';
import { preparePhoto } from '../photos';
import { SLOTS, allPhotoIds, emptyEntry, newId, slotLabel, type Meal, type MealEntry, type Part, type PhotoMeta } from '../types';
import { Sheet, Thumb, errorText, useNotify } from '../ui';
import type { LightboxTarget } from './Lightbox';

interface Props {
  initial: Meal;
  isNew: boolean;
  startPart: Part;
  onClose: () => void;
  /** meal = the saved meal, or null after delete. then = what to open next. */
  onSaved: (meal: Meal | null, then?: 'export') => void;
  onOpenPhoto: (t: LightboxTarget) => void;
}

const snapshot = (date: string, slot: string, plan: MealEntry | null, eaten: MealEntry | null) =>
  JSON.stringify({ date, slot, plan, eaten });

export function MealEditor({ initial, isNew, startPart, onClose, onSaved, onOpenPhoto }: Props) {
  const notify = useNotify();
  const [date, setDate] = useState(initial.date);
  const [slot, setSlot] = useState(initial.slot);
  const [plan, setPlan] = useState<MealEntry | null>(initial.plan);
  const [eaten, setEaten] = useState<MealEntry | null>(initial.eaten);
  const [part, setPart] = useState<Part>(startPart);
  const [metas, setMetas] = useState<Map<string, PhotoMeta>>(new Map());
  const [newPhotos, setNewPhotos] = useState<Map<string, NewPhoto>>(new Map());
  const [processing, setProcessing] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Part, string>>>({});

  useEffect(() => {
    getPhotoMetas(allPhotoIds(initial))
      .then((list) => setMetas((m) => new Map([...list.map((x) => [x.id, x] as const), ...m])))
      .catch((e) => notify(errorText(e), 'error'));
  }, [initial, notify]);

  const dirty =
    newPhotos.size > 0 || snapshot(date, slot, plan, eaten) !== snapshot(initial.date, initial.slot, initial.plan, initial.eaten);

  const setEntry = (p: Part, fn: (e: MealEntry | null) => MealEntry | null) => (p === 'plan' ? setPlan(fn) : setEaten(fn));
  const entry = part === 'plan' ? plan : eaten;

  const addFiles = async (p: Part, files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    setProcessing((n) => n + list.length);
    for (const file of list) {
      try {
        const photo = await preparePhoto(file, { ...initial, date }, p);
        setNewPhotos((m) => new Map(m).set(photo.meta.id, photo));
        setMetas((m) => new Map(m).set(photo.meta.id, photo.meta));
        setEntry(p, (e) => (e ? { ...e, photoIds: [...e.photoIds, photo.meta.id] } : e));
      } catch (e) {
        notify(`Photo not added: ${errorText(e)}`, 'error');
      } finally {
        setProcessing((n) => n - 1);
      }
    }
  };

  const save = async (then?: 'export') => {
    if (processing > 0) {
      notify('Wait until the photos finish processing.', 'error');
      return;
    }
    const errs: Partial<Record<Part, string>> = {};
    if (plan && !plan.name.trim()) errs.plan = 'Add a name for the planned meal.';
    if (eaten && !eaten.name.trim()) errs.eaten = 'Add a name for what you ate.';
    setErrors(errs);
    if (!plan && !eaten) {
      notify('Add a plan or record what you ate first.', 'error');
      return;
    }
    if (errs.plan || errs.eaten) {
      setPart(errs[part] ? part : errs.plan ? 'plan' : 'eaten');
      return;
    }
    const trim = (e: MealEntry | null): MealEntry | null =>
      e && { ...e, name: e.name.trim(), portions: e.portions.trim(), ingredients: e.ingredients.trim(), notes: e.notes.trim() };
    const meal: Meal = { ...initial, date, slot, plan: trim(plan), eaten: trim(eaten), updatedAt: Date.now() };
    const keep = new Set(allPhotoIds(meal));
    const added = [...newPhotos.values()].filter((p) => keep.has(p.meta.id));
    const removed = allPhotoIds(initial).filter((id) => !keep.has(id));
    setBusy(true);
    try {
      await saveMeal(meal, added, removed);
      notify('Saved');
      onSaved(meal, then);
    } catch (e) {
      // Keep the editor open with everything you typed, so nothing is lost.
      notify(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (dirty && !window.confirm('Discard your changes to this meal?')) return;
    onClose();
  };

  const remove = async () => {
    if (!window.confirm('Delete this meal and its photos? This cannot be undone.')) return;
    setBusy(true);
    try {
      await deleteMeal(initial.id);
      notify('Meal deleted');
      onSaved(null);
    } catch (e) {
      notify(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const favorite = async () => {
    if (!entry?.name.trim()) {
      notify('Add a name first, then save it as a favorite.', 'error');
      return;
    }
    try {
      await saveFavorite({
        id: newId(),
        name: entry.name.trim(),
        time: entry.time,
        ingredients: entry.ingredients.trim(),
        portions: entry.portions.trim(),
        notes: entry.notes.trim(),
        slot,
        createdAt: Date.now(),
      });
      notify(`“${entry.name.trim()}” saved as a favorite (without photos).`);
    } catch (e) {
      notify(errorText(e), 'error');
    }
  };

  return (
    <Sheet
      title={isNew ? `New ${slotLabel(slot).toLowerCase()}` : slotLabel(slot)}
      onClose={close}
      closeLabel="Cancel"
      action={
        <button className="link-btn strong" onClick={() => save()} disabled={busy || processing > 0}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      }
    >
      <div className="row-2">
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Meal</span>
          <select value={slot} onChange={(e) => setSlot(e.target.value as Meal['slot'])}>
            {SLOTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={part === 'plan'} className={part === 'plan' ? 'on' : ''} onClick={() => setPart('plan')}>
          Planned {plan ? '' : '(none)'}
        </button>
        <button role="tab" aria-selected={part === 'eaten'} className={part === 'eaten' ? 'on' : ''} onClick={() => setPart('eaten')}>
          What I ate {eaten ? '' : '(none)'}
        </button>
      </div>

      {part === 'plan' &&
        (plan ? (
          <EntryForm
            key="plan"
            part="plan"
            entry={plan}
            onChange={(e) => setPlan(e)}
            metas={metas}
            error={errors.plan}
            processing={processing}
            onFiles={(f) => addFiles('plan', f)}
            onOpenPhoto={(id) => onOpenPhoto({ id, data: newPhotos.get(id)?.data })}
          />
        ) : (
          <div className="empty-part">
            <p>This meal was not planned.</p>
            <button className="btn btn-secondary" onClick={() => setPlan(emptyEntry())}>
              Add a plan
            </button>
          </div>
        ))}

      {part === 'eaten' &&
        (eaten ? (
          <EntryForm
            key="eaten"
            part="eaten"
            entry={eaten}
            onChange={(e) => setEaten(e)}
            metas={metas}
            error={errors.eaten}
            processing={processing}
            onFiles={(f) => addFiles('eaten', f)}
            onOpenPhoto={(id) => onOpenPhoto({ id, data: newPhotos.get(id)?.data })}
          />
        ) : (
          <div className="empty-part">
            <p>Nothing recorded yet. Your plan stays as it is.</p>
            {plan && (
              <button className="btn" onClick={() => setEaten({ ...plan, photoIds: [] })}>
                I ate it as planned
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => setEaten(emptyEntry())}>
              {plan ? 'I ate something different' : 'Record what I ate'}
            </button>
          </div>
        ))}

      {part === 'plan' && plan && eaten && (
        <button className="link-btn danger" onClick={() => window.confirm('Remove the plan? What you ate stays.') && setPlan(null)}>
          Remove the plan
        </button>
      )}
      {part === 'eaten' && eaten && plan && (
        <button
          className="link-btn danger"
          onClick={() => window.confirm('Remove the record of what you ate? The plan stays.') && setEaten(null)}
        >
          Remove what I ate
        </button>
      )}

      <div className="editor-actions">
        {entry && (
          <button className="btn btn-secondary" onClick={favorite}>
            ☆ Save as favorite
          </button>
        )}
        <button className="btn btn-secondary" onClick={() => save('export')} disabled={busy || processing > 0}>
          Save and copy for LLM / export
        </button>
        {!isNew && (
          <button className="btn btn-danger" onClick={remove} disabled={busy}>
            Delete meal
          </button>
        )}
      </div>
    </Sheet>
  );
}

function EntryForm({
  part,
  entry,
  onChange,
  metas,
  error,
  processing,
  onFiles,
  onOpenPhoto,
}: {
  part: Part;
  entry: MealEntry;
  onChange: (e: MealEntry) => void;
  metas: Map<string, PhotoMeta>;
  error?: string;
  processing: number;
  onFiles: (f: FileList | null) => void;
  onOpenPhoto: (id: string) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof MealEntry, v: string) => onChange({ ...entry, [k]: v });
  const label = part === 'plan' ? 'planned' : 'eaten';

  return (
    <div className={`entry-form entry-${part}`}>
      <label className="field">
        <span>
          Name <em>(required)</em>
        </span>
        <input
          type="text"
          value={entry.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder={part === 'plan' ? 'e.g. Chicken salad' : 'e.g. Chicken salad and bread'}
          autoCapitalize="sentences"
          enterKeyHint="next"
          aria-invalid={!!error}
        />
        {error && <span className="field-error">{error}</span>}
      </label>

      <div className="photos-block">
        <span className="field-label">Photos</span>
        {entry.photoIds.length > 0 && (
          <div className="thumb-row">
            {entry.photoIds.map((id) => {
              const m = metas.get(id);
              return (
                <div key={id} className="thumb-wrap">
                  {m ? <Thumb meta={m} size="lg" onOpen={() => onOpenPhoto(id)} /> : <div className="thumb thumb-lg" />}
                  <button
                    className="thumb-remove"
                    aria-label="Remove photo"
                    onClick={() =>
                      window.confirm('Remove this photo? It is deleted when you save.') &&
                      onChange({ ...entry, photoIds: entry.photoIds.filter((x) => x !== id) })
                    }
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {processing > 0 && <p className="muted">Processing {processing} photo{processing === 1 ? '' : 's'}…</p>}
        <div className="row-2">
          <button className="btn btn-secondary" onClick={() => cameraRef.current?.click()}>
            📷 Camera
          </button>
          <button className="btn btn-secondary" onClick={() => libraryRef.current?.click()}>
            🖼 Library
          </button>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          aria-label={`Take a photo of the ${label} meal`}
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          data-testid={`photo-input-${part}`}
          aria-label={`Choose photos of the ${label} meal`}
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <label className="field">
        <span>Approximate time</span>
        <div className="time-row">
          <input type="time" value={entry.time} onChange={(e) => set('time', e.target.value)} />
          {entry.time && (
            <button className="link-btn" onClick={() => set('time', '')}>
              Clear
            </button>
          )}
        </div>
      </label>

      <label className="field">
        <span>Ingredients</span>
        <textarea
          rows={4}
          value={entry.ingredients}
          onChange={(e) => set('ingredients', e.target.value)}
          placeholder={'One per line, with amounts if you know them\n2 eggs\n1 slice whole-grain toast'}
          autoCapitalize="sentences"
        />
      </label>

      <label className="field">
        <span>Portions</span>
        <input
          type="text"
          value={entry.portions}
          onChange={(e) => set('portions', e.target.value)}
          placeholder="e.g. 1 large bowl, about 350 g"
          autoCapitalize="sentences"
          enterKeyHint="next"
        />
      </label>

      <label className="field">
        <span>Notes</span>
        <textarea
          rows={3}
          value={entry.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="e.g. Restaurant meal, extra dressing, ate half"
          autoCapitalize="sentences"
        />
      </label>
    </div>
  );
}
