import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, daysBetween, monthStart, todayISO } from '../dates';
import { getMeal, getMealsInRange, getPhotoData } from '../db';
import { assignPhotoFiles, buildExport, exportTitle, CALORIE_INSTRUCTION } from '../exportText';
import { allPhotoIds, type Meal } from '../types';
import { createZip, type ZipEntry } from '../zip';
import { canShareFile, copyText, downloadFile, formatBytes, shareFile } from '../share';
import { Sheet, errorText, useNotify } from '../ui';

export type ExportScope = { kind: 'meal'; mealId: string } | { kind: 'range'; start: string; end: string };

const PREF_KEY = 'meal-planner:include-instruction';
const MAX_DAYS = 366;

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === '1';
  } catch {
    return false;
  }
}

export function ExportPanel({ scope }: { scope: ExportScope }) {
  const notify = useNotify();
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [withInstruction, setWithInstruction] = useState(readPref);
  const [zip, setZip] = useState<{ file: File; missing: number } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const scopeKey = JSON.stringify(scope);
  useEffect(() => {
    let alive = true;
    setMeals(null);
    setZip(null);
    (async () => {
      try {
        if (scope.kind === 'meal') {
          const m = await getMeal(scope.mealId);
          if (!alive) return;
          setMeals(m ? [m] : []);
          setDates(m ? [m.date] : []);
        } else {
          const list = await getMealsInRange(scope.start, scope.end);
          if (!alive) return;
          setMeals(list);
          setDates(daysBetween(scope.start, scope.end));
        }
      } catch (e) {
        if (alive) notify(errorText(e), 'error');
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, notify]);

  const opts = useMemo(
    () => ({ scope: scope.kind === 'meal' ? ('meal' as const) : ('days' as const), dates, meals: meals ?? [], includeInstruction: withInstruction }),
    [scope.kind, dates, meals, withInstruction],
  );
  const text = useMemo(() => (meals ? buildExport({ ...opts, format: 'text' }) : ''), [opts, meals]);
  const photoCount = (meals ?? []).flatMap(allPhotoIds).length;

  const toggleInstruction = (v: boolean) => {
    setWithInstruction(v);
    setZip(null);
    try {
      localStorage.setItem(PREF_KEY, v ? '1' : '0');
    } catch {
      /* the choice is not remembered; that is fine */
    }
  };

  const copy = async () => {
    const ok = await copyText(text, textRef.current);
    if (ok) notify(photoCount ? 'Text copied. Photos are not included in copied text.' : 'Text copied. Paste it into your LLM chat.');
    else {
      textRef.current?.focus();
      textRef.current?.select();
      notify('Could not copy by itself. The text is selected below: tap and hold, then tap Copy.', 'error');
    }
  };

  const fileBase = () => exportTitle(opts).replace(/^Meal log: /, 'meal-log ').replace(/[^\w-]+/g, '_').toLowerCase();

  const prepareZip = async () => {
    if (!meals) return;
    setPreparing(true);
    try {
      const photoFiles = assignPhotoFiles(meals);
      const md = buildExport({ ...opts, format: 'markdown', photoFiles });
      const data = await getPhotoData([...photoFiles.keys()]);
      const entries: ZipEntry[] = [{ name: 'meal-log.md', data: new TextEncoder().encode(md) }];
      let missing = 0;
      for (const [id, name] of photoFiles) {
        const d = data.get(id);
        if (d) entries.push({ name, data: new Uint8Array(d.data) });
        else missing++;
      }
      const blob = createZip(entries);
      setZip({ file: new File([blob], `${fileBase()}.zip`, { type: 'application/zip' }), missing });
    } catch (e) {
      notify(errorText(e), 'error');
    } finally {
      setPreparing(false);
    }
  };

  const share = async () => {
    if (!zip) return;
    try {
      await shareFile(zip.file);
    } catch (e) {
      notify(`Sharing did not work (${errorText(e)}). Use “Download ZIP” instead.`, 'error');
    }
  };

  if (!meals) return <p className="muted center">Loading…</p>;
  if (scope.kind === 'meal' && meals.length === 0) return <p className="muted">This meal was not found.</p>;

  return (
    <div className="export-panel">
      <label className="check">
        <input type="checkbox" checked={withInstruction} onChange={(e) => toggleInstruction(e.target.checked)} />
        <span>
          Add calorie-estimate instruction
          <small>“{CALORIE_INSTRUCTION}”</small>
        </span>
      </label>

      <button className="btn btn-big" onClick={copy}>
        Copy for LLM
      </button>
      <p className="note">
        <strong>Copying text does not copy photos.</strong>{' '}
        {photoCount > 0
          ? `These meals have ${photoCount} photo${photoCount === 1 ? '' : 's'}. To send them too, use “Export with photos”.`
          : 'There are no photos here.'}
      </p>

      <h3 className="section-title">Export with photos</h3>
      <p className="hint">
        Makes a ZIP file with <code>meal-log.md</code> (the same details as Markdown) and a <code>photos</code> folder.
        Each photo file name is written beside its meal. Unzip it in the Files app, then upload the files to your LLM.
      </p>
      {!zip ? (
        <button className="btn btn-secondary" onClick={prepareZip} disabled={preparing}>
          {preparing ? 'Preparing ZIP…' : `Export with photos (${photoCount})`}
        </button>
      ) : (
        <div className="zip-ready">
          <p>
            Ready: <strong>{zip.file.name}</strong> ({formatBytes(zip.file.size)})
            {zip.missing > 0 && <span className="field-error"> {zip.missing} photo(s) could not be found and are left out.</span>}
          </p>
          {canShareFile(zip.file) && (
            <button className="btn" onClick={share}>
              Share or save ZIP…
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => downloadFile(zip.file, zip.file.name)}>
            Download ZIP
          </button>
        </div>
      )}

      <h3 className="section-title">Preview of the copied text</h3>
      <textarea ref={textRef} className="preview" readOnly value={text} rows={12} aria-label="Text to copy" />
    </div>
  );
}

export function ExportSheet({ scope, onClose }: { scope: ExportScope; onClose: () => void }) {
  return (
    <Sheet title={scope.kind === 'meal' ? 'Export meal' : 'Export day'} onClose={onClose} closeLabel="Done">
      <ExportPanel scope={scope} />
    </Sheet>
  );
}

export function ExportView() {
  const today = todayISO();
  const [start, setStart] = useState(addDays(today, -6));
  const [end, setEnd] = useState(today);
  const days = start && end && start <= end ? daysBetween(start, end).length : 0;
  const valid = days > 0 && days <= MAX_DAYS;

  return (
    <div className="page">
      <h1 className="page-title">Export</h1>
      <p className="hint">Pick the dates to export. For one meal, open the meal and tap “Save and copy for LLM”.</p>
      <div className="chips">
        <button className="chip" onClick={() => (setStart(today), setEnd(today))}>
          Today
        </button>
        <button className="chip" onClick={() => (setStart(addDays(today, -6)), setEnd(today))}>
          Last 7 days
        </button>
        <button className="chip" onClick={() => (setStart(monthStart(today)), setEnd(today))}>
          This month
        </button>
      </div>
      <div className="row-2">
        <label className="field">
          <span>From</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      {!valid ? (
        <p className="field-error">
          {days > MAX_DAYS ? `Pick ${MAX_DAYS} days or fewer.` : 'The “From” date must be on or before the “To” date.'}
        </p>
      ) : (
        <ExportPanel scope={{ kind: 'range', start, end }} />
      )}
    </div>
  );
}
