// Copy text, and hand files to the phone (share sheet or download).

export async function copyText(text: string, fallbackField?: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* try the older way below */
  }
  if (fallbackField) {
    fallbackField.focus();
    fallbackField.setSelectionRange(0, fallbackField.value.length);
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
  return false;
}

export function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Opens the iPhone share sheet (Save to Files, AirDrop, other apps). */
export async function shareFile(file: File): Promise<'shared' | 'cancelled'> {
  try {
    await navigator.share({ files: [file], title: file.name });
    return 'shared';
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'cancelled';
    throw e;
  }
}

export function downloadFile(file: Blob, name: string): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
