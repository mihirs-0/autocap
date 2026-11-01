import { useEffect, useState } from 'react';
import { openDb } from './db';
import { todayISO } from './dates';
import type { Meal, Part, Slot } from './types';
import { onUpdateReady } from './swRegister';
import { errorText } from './ui';
import { DayView } from './components/DayView';
import { MealEditor } from './components/MealEditor';
import { AddMealSheet } from './components/AddMealSheet';
import { CopyDaySheet } from './components/CopyDaySheet';
import { ExportSheet, ExportView, type ExportScope } from './components/ExportPanel';
import { GalleryView } from './components/GalleryView';
import { MoreView } from './components/MoreView';
import { Lightbox, type LightboxTarget } from './components/Lightbox';

type Tab = 'day' | 'photos' | 'export' | 'more';
type Overlay =
  | { kind: 'editor'; meal: Meal; isNew: boolean; part: Part }
  | { kind: 'add'; date: string; slot: Slot }
  | { kind: 'export'; scope: ExportScope }
  | { kind: 'copyDay'; date: string }
  | null;

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'day', label: 'Day', icon: '🍽' },
  { id: 'photos', label: 'Photos', icon: '🖼' },
  { id: 'export', label: 'Export', icon: '⤴︎' },
  { id: 'more', label: 'Data', icon: '⚙︎' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('day');
  const [date, setDate] = useState(todayISO());
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [lightbox, setLightbox] = useState<LightboxTarget | null>(null);
  const [version, setVersion] = useState(0);
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    onUpdateReady((apply) => setApplyUpdate(() => apply));
    openDb().catch((e) => setDbError(errorText(e)));
    // Ask the browser to keep this app's data even when space runs low.
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  const openDay = (d: string) => {
    setDate(d);
    setTab('day');
    setLightbox(null);
    setOverlay(null);
  };

  return (
    <div className="app">
      {applyUpdate && (
        <div className="update-bar">
          <span>A new version of the app is ready.</span>
          <button className="btn btn-small" onClick={applyUpdate}>
            Update
          </button>
        </div>
      )}
      {dbError && (
        <div className="db-error" role="alert">
          <strong>Local storage is not working.</strong> {dbError} Your meals cannot be saved until this is fixed.
          If you use Private Browsing, open the app in a normal Safari window or from the Home Screen.
        </div>
      )}

      <main className="main">
        {tab === 'day' && (
          <DayView
            date={date}
            setDate={setDate}
            version={version}
            refresh={refresh}
            onEdit={(meal, part) => setOverlay({ kind: 'editor', meal, isNew: false, part })}
            onAdd={(slot) => setOverlay({ kind: 'add', date, slot })}
            onPhoto={setLightbox}
            onExportDay={() => setOverlay({ kind: 'export', scope: { kind: 'range', start: date, end: date } })}
            onCopyDay={() => setOverlay({ kind: 'copyDay', date })}
          />
        )}
        {tab === 'photos' && <GalleryView version={version} onPhoto={setLightbox} onOpenDay={openDay} />}
        {tab === 'export' && <ExportView />}
        {tab === 'more' && <MoreView version={version} refresh={refresh} />}
      </main>

      <nav className="tabbar" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'tab-active' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-icon" aria-hidden="true">
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
      </nav>

      {overlay?.kind === 'add' && (
        <AddMealSheet
          date={overlay.date}
          slot={overlay.slot}
          onClose={() => setOverlay(null)}
          onStart={(meal, part) => setOverlay({ kind: 'editor', meal, isNew: true, part })}
        />
      )}
      {overlay?.kind === 'editor' && (
        <MealEditor
          key={overlay.meal.id}
          initial={overlay.meal}
          isNew={overlay.isNew}
          startPart={overlay.part}
          onClose={() => setOverlay(null)}
          onSaved={(meal, then) => {
            refresh();
            if (meal && meal.date !== date) setDate(meal.date);
            setOverlay(then === 'export' && meal ? { kind: 'export', scope: { kind: 'meal', mealId: meal.id } } : null);
          }}
          onOpenPhoto={setLightbox}
        />
      )}
      {overlay?.kind === 'export' && <ExportSheet scope={overlay.scope} onClose={() => setOverlay(null)} />}
      {overlay?.kind === 'copyDay' && (
        <CopyDaySheet
          date={overlay.date}
          onClose={() => setOverlay(null)}
          onDone={(target) => {
            refresh();
            openDay(target);
          }}
        />
      )}
      {lightbox && <Lightbox target={lightbox} onClose={() => setLightbox(null)} onOpenDay={overlay ? undefined : openDay} />}
    </div>
  );
}
