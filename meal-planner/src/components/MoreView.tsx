import { useEffect, useRef, useState } from 'react';
import { buildBackup, parseBackup, restoreBackup, type ParsedBackup } from '../backup';
import { countEverything, deleteFavorite, listFavorites } from '../db';
import { todayISO } from '../dates';
import { canShareFile, downloadFile, formatBytes, shareFile } from '../share';
import { slotLabel, type Favorite } from '../types';
import { errorText, useNotify } from '../ui';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function MoreView({ version, refresh }: { version: number; refresh: () => void }) {
  const notify = useNotify();
  const [counts, setCounts] = useState<{ meals: number; photos: number; favorites: number } | null>(null);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({});
  const [backup, setBackup] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [restore, setRestore] = useState<{ parsed: ParsedBackup; name: string } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    countEverything().then(setCounts).catch((e) => notify(errorText(e), 'error'));
    listFavorites().then(setFavorites).catch((e) => notify(errorText(e), 'error'));
    (async () => {
      const est = await navigator.storage?.estimate?.().catch(() => undefined);
      const persisted = await navigator.storage?.persisted?.().catch(() => undefined);
      setStorage({ usage: est?.usage, quota: est?.quota, persisted });
    })();
  }, [version, notify]);

  const makeBackup = async () => {
    setPreparing(true);
    try {
      const { blob } = await buildBackup();
      setBackup(new File([blob], `meal-planner-backup-${todayISO()}.json`, { type: 'application/json' }));
    } catch (e) {
      notify(errorText(e), 'error');
    } finally {
      setPreparing(false);
    }
  };

  const pickRestore = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      setRestore({ parsed: parseBackup(await file.text()), name: file.name });
    } catch (e) {
      notify(errorText(e), 'error');
    }
  };

  const doRestore = async (mode: 'merge' | 'replace') => {
    if (!restore) return;
    if (mode === 'replace' && !window.confirm('Replace ALL meals, photos and favorites on this device with the backup? Current data is removed.')) return;
    setRestoring(true);
    try {
      await restoreBackup(restore.parsed, mode);
      notify('Backup restored.');
      setRestore(null);
      refresh();
    } catch (e) {
      notify(errorText(e), 'error');
    } finally {
      setRestoring(false);
    }
  };

  const askPersist = async () => {
    const ok = await navigator.storage?.persist?.().catch(() => false);
    setStorage((s) => ({ ...s, persisted: !!ok }));
    notify(ok ? 'The browser will keep this data.' : 'The browser did not agree. Adding the app to the Home Screen helps on iPhone.', ok ? 'ok' : 'error');
  };

  const p = restore?.parsed.data;

  return (
    <div className="page">
      <h1 className="page-title">Your data</h1>

      <div className="warning-card">
        <strong>Your meals and photos are stored only on this device.</strong> There is no account and no cloud copy.
        If you clear Safari's website data, delete the Home Screen app, or iOS removes the data to free space,
        your records are erased. Make a backup now and then, and save it in Files or iCloud Drive.
      </div>

      <p className="muted">
        {counts ? [plural(counts.meals, 'meal'), plural(counts.photos, 'photo'), plural(counts.favorites, 'favorite')].join(' · ') : 'Counting…'}
        {storage.usage !== undefined && ` · about ${formatBytes(storage.usage)} used`}
      </p>
      <p className="muted">
        Data protection:{' '}
        {storage.persisted === undefined ? 'unknown on this browser' : storage.persisted ? 'the browser has agreed to keep this data' : 'not guaranteed'}
        {storage.persisted === false && (
          <>
            {' '}
            <button className="link-btn" onClick={askPersist}>
              Ask to keep data
            </button>
          </>
        )}
      </p>

      <h2 className="section-title">Backup</h2>
      <p className="hint">One JSON file with all meals, favorites and photos. Use it to move to another device.</p>
      {!backup ? (
        <button className="btn" onClick={makeBackup} disabled={preparing}>
          {preparing ? 'Preparing backup…' : 'Create backup'}
        </button>
      ) : (
        <div className="zip-ready">
          <p>
            Ready: <strong>{backup.name}</strong> ({formatBytes(backup.size)})
          </p>
          {canShareFile(backup) && (
            <button className="btn" onClick={() => shareFile(backup).catch((e) => notify(errorText(e), 'error'))}>
              Share or save backup…
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => downloadFile(backup, backup.name)}>
            Download backup
          </button>
          <button className="link-btn" onClick={() => setBackup(null)}>
            Done
          </button>
        </div>
      )}

      <h2 className="section-title">Restore</h2>
      {!restore ? (
        <>
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
            Choose backup file…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            data-testid="restore-input"
            onChange={(e) => {
              pickRestore(e.target.files);
              e.target.value = '';
            }}
          />
        </>
      ) : (
        <div className="zip-ready">
          <p>
            <strong>{restore.name}</strong>
            <br />
            {[plural(p!.meals.length, 'meal'), plural(p!.photos.length, 'photo'), plural(p!.favorites.length, 'favorite')].join(' · ')}
            {restore.parsed.exportedAt && <> · made {new Date(restore.parsed.exportedAt).toLocaleString()}</>}
          </p>
          <button className="btn" onClick={() => doRestore('merge')} disabled={restoring}>
            Add to my data (merge)
          </button>
          <p className="hint">Merge keeps your current data. Items with the same ID are replaced by the backup copy.</p>
          <button className="btn btn-danger" onClick={() => doRestore('replace')} disabled={restoring}>
            Replace all my data
          </button>
          <button className="link-btn" onClick={() => setRestore(null)}>
            Cancel
          </button>
        </div>
      )}

      <h2 className="section-title">Favorites</h2>
      {favorites.length === 0 ? (
        <p className="muted">No favorites yet. Open a meal and tap “Save as favorite”.</p>
      ) : (
        <ul className="list">
          {favorites.map((f) => (
            <li key={f.id} className="list-row">
              <span>
                <span className="list-main">{f.name}</span>
                <span className="list-sub">{[f.slot && slotLabel(f.slot), f.portions].filter(Boolean).join(' · ')}</span>
              </span>
              <button
                className="link-btn danger"
                onClick={async () => {
                  if (!window.confirm(`Delete the favorite “${f.name}”? Meals that used it are not changed.`)) return;
                  try {
                    await deleteFavorite(f.id);
                    refresh();
                  } catch (e) {
                    notify(errorText(e), 'error');
                  }
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <h2 className="section-title">About</h2>
      <p className="hint">
        The app works offline after the first load. It has no account, no server and no tracking. Calorie estimates are
        not done in the app: use “Copy for LLM” or “Export with photos” and ask your LLM.
      </p>
    </div>
  );
}
