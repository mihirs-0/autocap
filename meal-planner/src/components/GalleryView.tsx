import { useEffect, useState } from 'react';
import { addMonths, formatLong, formatMonth, monthEnd, monthStart, todayISO } from '../dates';
import { getPhotoMetasInRange } from '../db';
import type { PhotoMeta } from '../types';
import { Thumb, errorText, useNotify } from '../ui';
import type { LightboxTarget } from './Lightbox';

export function GalleryView({ version, onPhoto, onOpenDay }: { version: number; onPhoto: (t: LightboxTarget) => void; onOpenDay: (d: string) => void }) {
  const notify = useNotify();
  const [month, setMonth] = useState(monthStart(todayISO()));
  const [photos, setPhotos] = useState<PhotoMeta[] | null>(null);

  useEffect(() => {
    let alive = true;
    setPhotos(null);
    getPhotoMetasInRange(month, monthEnd(month))
      .then((p) => alive && setPhotos(p))
      .catch((e) => {
        if (alive) {
          setPhotos([]);
          notify(errorText(e), 'error');
        }
      });
    return () => {
      alive = false;
    };
  }, [month, version, notify]);

  const byDate = new Map<string, PhotoMeta[]>();
  for (const p of [...(photos ?? [])].sort((a, b) => b.date.localeCompare(a.date) || a.createdAt - b.createdAt)) {
    byDate.set(p.date, [...(byDate.get(p.date) ?? []), p]);
  }

  return (
    <div className="page">
      <header className="day-header">
        <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
          ‹
        </button>
        <div className="day-title">
          <h1>{formatMonth(month)}</h1>
          <span className="muted">{photos ? `${photos.length} photo${photos.length === 1 ? '' : 's'}` : ' '}</span>
        </div>
        <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
          ›
        </button>
      </header>
      {photos === null && <p className="muted center">Loading…</p>}
      {photos?.length === 0 && <p className="muted center">No photos this month.</p>}
      {[...byDate.entries()].map(([date, list]) => (
        <section key={date} className="gallery-day">
          <button className="gallery-date link-btn" onClick={() => onOpenDay(date)}>
            {formatLong(date)} ›
          </button>
          <div className="gallery-grid">
            {list.map((p) => (
              <Thumb key={p.id} meta={p} size="lg" onOpen={() => onPhoto({ id: p.id })} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
