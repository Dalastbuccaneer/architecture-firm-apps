// Guards against the one storage failure mode we can detect synchronously and
// explain: opening the offline single-file build directly from disk (file://),
// where browsers other than Chrome/Edge refuse to grant any storage at all.
// (Ported from StudioHours, retargeted.)

export interface StorageStatus {
  ok: boolean;
  reason: 'file-no-storage' | null;
}

export function storageStatus(): StorageStatus {
  try {
    const probeKey = '__studio-log-storage-probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return { ok: true, reason: null };
  } catch {
    if (window.location.protocol === 'file:') {
      return { ok: false, reason: 'file-no-storage' };
    }
    return { ok: true, reason: null };
  }
}

export const FILE_STORAGE_MSG =
  "This browser can't save data for a local file. Open the hosted StudioLog app instead — or use Chrome/Edge for the offline file.";
