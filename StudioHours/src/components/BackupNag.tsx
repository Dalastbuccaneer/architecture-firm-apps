// Slim reminder that this browser is the ONLY copy of the timesheet. Shown when
// there's data at risk (entries exist) and no recent backup exists to protect it.

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X } from 'lucide-react';
import { db, patchFlags } from '../db';
import { useApp } from '../AppContext';
import { buildBackup } from '../lib/backup';
import { downloadText } from '../lib/download';
import { nowISO } from '../lib/dates';

const NAG_AFTER_DAYS = 14;

export default function BackupNag() {
  const { flags } = useApp();
  const [dismissed, setDismissed] = useState(false);
  const entryCount = useLiveQuery(() => db.entries.count(), []);
  const backup = useLiveQuery(() => buildBackup(), []);

  if (dismissed || flags === undefined || entryCount === undefined) return null;
  // Don't nag about backing up sample data — it's fake, and a first-time explorer
  // doesn't need a second banner competing for attention.
  if (flags.sampleLoaded) return null;

  const lastBackupAt = flags.lastBackupAt;
  const daysSince = lastBackupAt ? Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / 86_400_000) : null;
  const stale = lastBackupAt === null || (daysSince !== null && daysSince >= NAG_AFTER_DAYS);
  if (entryCount === 0 || !stale) return null;

  const onBackup = () => {
    if (!backup) return; // still building — click again once ready
    downloadText(backup.fileName, backup.content);
    void patchFlags({ lastBackupAt: nowISO() });
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-neutral-50 px-6 py-2 print:hidden">
      <span className="min-w-0 flex-1">
        {lastBackupAt === null ? 'Last backup: never' : `Last backup: ${daysSince} day${daysSince === 1 ? '' : 's'} ago`}
        {' — your timesheet lives only in this browser.'}
      </span>
      <button
        type="button"
        onClick={onBackup}
        className="ml-auto min-h-11 cursor-pointer bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft"
      >
        Back up now
      </button>
      <button
        type="button"
        aria-label="Dismiss backup reminder"
        onClick={() => setDismissed(true)}
        className="-m-2 cursor-pointer p-2 text-ink-soft transition-colors duration-200 hover:text-ink"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
