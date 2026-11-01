import { useEffect, useState } from 'react';
import { formatShort } from '../dates';
import { getMeal, getPhotoData, getPhotoMetas } from '../db';
import { slotLabel, type PhotoData } from '../types';
import { errorText, useObjectUrl } from '../ui';

export interface LightboxTarget {
  id: string;
  /** Given for photos that are not saved yet. */
  data?: PhotoData;
}

export function Lightbox({ target, onClose, onOpenDay }: { target: LightboxTarget; onClose: () => void; onOpenDay?: (d: string) => void }) {
  const [data, setData] = useState<PhotoData | null>(target.data ?? null);
  const [caption, setCaption] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [error, setError] = useState('');
  const url = useObjectUrl(data?.data, data?.type);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!target.data) {
          const d = (await getPhotoData([target.id])).get(target.id);
          if (alive) d ? setData(d) : setError('This photo is not saved yet or was deleted.');
        }
        const [meta] = await getPhotoMetas([target.id]);
        if (!meta || !alive) return;
        const meal = await getMeal(meta.mealId);
        if (!alive) return;
        const name = meal?.[meta.part]?.name;
        setDate(meta.date);
        setCaption(
          [formatShort(meta.date), meal && slotLabel(meal.slot), meta.part === 'plan' ? 'Planned' : 'Eaten', name].filter(Boolean).join(' · '),
        );
      } catch (e) {
        if (alive) setError(errorText(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close photo">
        ✕
      </button>
      {url ? <img src={url} alt={caption || 'Meal photo'} /> : <p>{error || 'Loading…'}</p>}
      {(caption || (onOpenDay && date)) && (
        <div className="lightbox-caption" onClick={(e) => e.stopPropagation()}>
          <span>{caption}</span>
          {onOpenDay && date && (
            <button className="btn btn-small" onClick={() => onOpenDay(date)}>
              Open day
            </button>
          )}
        </div>
      )}
    </div>
  );
}
