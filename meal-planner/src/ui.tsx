import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PhotoMeta } from './types';

// ---------- notices (short success messages and error banners) ----------

type Kind = 'ok' | 'error';
interface Notice {
  id: number;
  kind: Kind;
  text: string;
}
type Notify = (text: string, kind?: Kind) => void;
const NotifyContext = createContext<Notify>(() => {});

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const next = useRef(1);
  const remove = (id: number) => setNotices((n) => n.filter((x) => x.id !== id));
  const notify = useCallback<Notify>((text, kind = 'ok') => {
    const id = next.current++;
    // Only one success message at a time; errors stay until closed.
    setNotices((n) => [...n.filter((x) => x.kind === 'error' && x.text !== text), { id, kind, text }]);
    // Errors stay until you close them, so you do not miss them.
    if (kind === 'ok') setTimeout(() => remove(id), 2600);
  }, []);
  return (
    <NotifyContext.Provider value={notify}>
      {children}
      <div className="notices" aria-live="polite">
        {notices.map((n) => (
          <div key={n.id} className={`notice notice-${n.kind}`} role={n.kind === 'error' ? 'alert' : 'status'}>
            <span>{n.text}</span>
            {n.kind === 'error' && (
              <button className="notice-close" onClick={() => remove(n.id)} aria-label="Close message">
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </NotifyContext.Provider>
  );
}

export const useNotify = () => useContext(NotifyContext);

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------- images ----------

export function useObjectUrl(data: ArrayBuffer | Blob | null | undefined, type = 'image/jpeg'): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!data) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [data, type]);
  return url;
}

export function Thumb({ meta, onOpen, size = 'md' }: { meta: PhotoMeta; onOpen: () => void; size?: 'md' | 'lg' }) {
  const url = useObjectUrl(meta.thumb, meta.thumbType);
  return (
    <button
      type="button"
      className={`thumb thumb-${size}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      aria-label="Enlarge photo"
    >
      {url && <img src={url} alt="" />}
    </button>
  );
}

// ---------- full-screen sheet ----------

export function Sheet({
  title,
  onClose,
  closeLabel = 'Close',
  action,
  children,
}: {
  title: string;
  onClose: () => void;
  closeLabel?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    document.body.classList.add('sheet-open');
    return () => document.body.classList.remove('sheet-open');
  }, []);
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
      <header className="sheet-header">
        <button type="button" className="link-btn" onClick={onClose}>
          {closeLabel}
        </button>
        <h2>{title}</h2>
        <div className="sheet-action">{action}</div>
      </header>
      <div className="sheet-body">{children}</div>
    </div>
  );
}
