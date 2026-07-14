// Settings. Ported near-verbatim from StudioLog's Backup/Restore + Danger
// zone (same "Last backup: Never" flags line, drag-and-drop .json restore
// zone, replace-vs-merge radio group, double-confirm erase-all pattern),
// retargeted to StudioCRM's buildBackup/restoreBackup and its five domain
// tables (clients, contacts, leads, interactions, reminders). Replay-a-tour
// section ported from StudioHours' Settings.tsx (its staff/manager replay
// buttons), extended from 2 tours to StudioCRM's 5 — each button jumps to
// that screen via setView, then fires the tour after a 300ms settle delay so
// the screen's data-tour anchors exist before driver.js looks for them.
// Install-as-app + Offline-copy sections ported near-verbatim (structure and
// copy) from StudioLog's Settings.tsx, retargeted to StudioCRM's name/offline
// filename. Firm name is a single optional kv value (key "firmName", read/
// written directly via kvGet/kvSet — it is NOT part of AppFlags) used only
// cosmetically to prefix export filenames (see lib/clientsExport.ts); the
// text input follows the same defaultValue+onBlur convention as StudioLog's
// StageTable.tsx so re-renders from the live kv query never clobber typing —
// the `key` swap from "loading" to "loaded" reseeds defaultValue exactly once,
// the moment the stored value first arrives from IndexedDB.
//
// Each section below is its own clearly delimited block ({/* Name */} ...
// </section>).

import { useRef, useState, type DragEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, FileDown, PlayCircle, Smartphone, Trash2, Upload } from 'lucide-react';
import { kvGet, kvSet, patchFlags, resetAll } from '../db';
import { useApp, type View } from '../AppContext';
import { buildBackup, restoreBackup } from '../lib/backup';
import { downloadText } from '../lib/download';
import { nowISO } from '../lib/dates';
import type { BeforeInstallPromptEvent } from '../components/InstallBanner';
import {
  startClientsTour,
  startPipelineTour,
  startReportsTour,
  startSettingsTour,
  startTodayTour,
} from '../lib/tours';

type RestoreMode = 'replace' | 'merge';

/** One row per screen's tour — jump to that screen, then fire its tour once
 *  it's had a moment to mount, exactly the setView-then-setTimeout(300) pattern
 *  StudioHours' Settings.tsx uses for its staff/manager replay buttons. Firing
 *  these never touches the once-per-install tourXDone flags, so a fresh
 *  install's automatic first-visit tour is unaffected by a manual replay. */
const TOUR_REPLAYS: Array<{ view: View; label: string; start: () => void }> = [
  { view: 'clients', label: 'Clients', start: startClientsTour },
  { view: 'pipeline', label: 'Pipeline', start: startPipelineTour },
  { view: 'today', label: 'Today', start: startTodayTour },
  { view: 'reports', label: 'Reports', start: startReportsTour },
  { view: 'settings', label: 'Settings', start: startSettingsTour },
];

export default function Settings() {
  const { flags, setView } = useApp();
  const backup = useLiveQuery(() => buildBackup(), []);
  const firmName = useLiveQuery(() => kvGet<string>('firmName'), []);

  const [mode, setMode] = useState<RestoreMode>('replace');
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!flags) return null;

  const onBackupNow = () => {
    if (!backup) return; // still building — button can be clicked again once ready
    downloadText(backup.fileName, backup.content);
    void patchFlags({ lastBackupAt: nowISO() });
  };

  const doRestore = async (file: File) => {
    setResult(null);
    if (mode === 'replace') {
      const sure = window.confirm(
        'Replace ALL current data with this backup? Everything on this computer will be erased first. This cannot be undone.',
      );
      if (!sure) return;
    } else {
      const sure = window.confirm(
        "Merge this backup? Clients and records with matching IDs will be overwritten by the file's version.",
      );
      if (!sure) return;
    }
    try {
      const text = await file.text();
      const { clientCount } = await restoreBackup(text, mode);
      setResult({
        ok: true,
        message: `Restored ${clientCount} client${clientCount === 1 ? '' : 's'} from "${file.name}".`,
      });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Restore failed.' });
    }
  };

  const onDrop = (ev: DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    setDragOver(false);
    const file = ev.dataTransfer.files?.[0];
    if (file) void doRestore(file);
  };

  const onEraseAll = async () => {
    const first = window.confirm(
      'Erase ALL data on this computer? Every client, contact, lead, interaction, and reminder will be gone.',
    );
    if (!first) return;
    const second = window.confirm('Really erase everything? This cannot be undone — back up first if you have not.');
    if (!second) return;
    await resetAll();
    setResult(null);
  };

  const onReplayTour = (replay: (typeof TOUR_REPLAYS)[number]) => {
    setView(replay.view);
    setTimeout(() => replay.start(), 300);
  };

  const installPrompt = (typeof window !== 'undefined' ? window.__crmInstallPrompt : undefined) as
    | BeforeInstallPromptEvent
    | undefined;

  const onInstallClick = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Firm name */}
      <section className="mt-6 border border-line p-4">
        <h2 className="mb-2 font-bold">Firm name</h2>
        <p className="text-ink-soft">
          Optional — used only to prefix export filenames (e.g. the clients-for-studio hand-off). Nothing else in
          StudioCRM reads it.
        </p>
        <input
          key={firmName === undefined ? 'loading' : 'loaded'}
          type="text"
          defaultValue={firmName ?? ''}
          onBlur={(e) => void kvSet('firmName', e.target.value.trim())}
          placeholder="e.g. Atelier North Architecture"
          className="mt-3 h-12 w-full max-w-sm border border-line px-2"
        />
      </section>

      {/* Backup */}
      <section data-tour="backup-section" className="mt-6 border border-line p-4">
        <h2 className="mb-2 font-bold">Backup</h2>
        <p className="text-ink-soft">
          One file with everything StudioCRM knows — clients, contacts, leads, interactions, and reminders. Keep it
          somewhere safe.
        </p>
        <p className="mt-2">
          Last backup:{' '}
          {flags.lastBackupAt ? (
            new Date(flags.lastBackupAt).toLocaleString()
          ) : (
            <span className="font-bold text-alert">Never</span>
          )}
        </p>
        <button
          type="button"
          onClick={onBackupNow}
          className="mt-3 flex min-h-11 cursor-pointer items-center gap-2 bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft"
        >
          <Download className="h-4 w-4" aria-hidden /> Back up now
        </button>
      </section>

      {/* Restore */}
      <section className="mt-6 border border-line p-4">
        <h2 className="mb-2 font-bold">Restore</h2>
        <p className="text-ink-soft">Load a StudioCRM backup file (.json) on this computer.</p>

        <div className="mt-3 flex flex-col gap-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="restore-mode"
              checked={mode === 'replace'}
              onChange={() => setMode('replace')}
              className="h-4 w-4 cursor-pointer accent-ink"
            />
            <span>Replace — erase current data, then load the backup exactly as it was.</span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="restore-mode"
              checked={mode === 'merge'}
              onChange={() => setMode('merge')}
              className="h-4 w-4 cursor-pointer accent-ink"
            />
            <span>Merge — keep current data, add the backup's clients and records (matching IDs overwrite).</span>
          </label>
        </div>

        <div
          onDragOver={(ev) => {
            ev.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`mt-3 flex flex-col items-center gap-2 border border-dashed p-6 text-center transition-colors duration-200 ${
            dragOver ? 'border-ink bg-neutral-50' : 'border-line'
          }`}
        >
          <Upload className="h-4 w-4 text-ink-soft" aria-hidden />
          <p className="text-ink-soft">Drop a backup .json file here, or</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-11 cursor-pointer border border-line px-4 py-2 transition-colors duration-200 hover:border-ink"
          >
            Choose file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            aria-label="Choose backup file"
            className="hidden"
            onChange={(ev) => {
              const file = ev.target.files?.[0];
              ev.target.value = ''; // allow re-picking the same file
              if (file) void doRestore(file);
            }}
          />
        </div>

        {result && (
          <p role={result.ok ? 'status' : 'alert'} className={`mt-3 ${result.ok ? 'text-ok' : 'font-bold text-alert'}`}>
            {result.message}
          </p>
        )}
      </section>

      {/* Replay a tour */}
      <section className="mt-6 border border-line p-4">
        <h2 className="mb-2 font-bold">Replay a tour</h2>
        <p className="text-ink-soft">
          Each screen's guided walk-through only runs on its own the first time you visit. Replay any of them here —
          handy when you're showing someone else around.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {TOUR_REPLAYS.map((r) => (
            <button
              key={r.view}
              type="button"
              onClick={() => onReplayTour(r)}
              className="flex min-h-11 cursor-pointer items-center gap-2 border border-line px-4 py-2 transition-colors duration-200 hover:border-ink"
            >
              <PlayCircle className="h-4 w-4" aria-hidden /> {r.label}
            </button>
          ))}
        </div>
      </section>

      {/* Install as app */}
      <section className="mt-6 border border-line p-4">
        <h2 className="mb-2 font-bold">Install as app</h2>
        <p className="text-ink-soft">
          Safari (and some other browsers) clear storage for sites you haven't visited in 7 days. Installing
          StudioCRM as an app keeps that from ever happening.
        </p>
        <ul className="mt-3 flex flex-col gap-1 text-ink-soft">
          <li>Chrome / Edge (desktop): click the install icon in the address bar.</li>
          <li>iOS Safari: Share → Add to Home Screen.</li>
          <li>macOS Safari: File → Add to Dock.</li>
          <li>Firefox (desktop): no install available — just visit regularly and back up often.</li>
        </ul>
        {installPrompt && (
          <button
            type="button"
            onClick={() => void onInstallClick()}
            className="mt-3 flex min-h-11 cursor-pointer items-center gap-2 bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft"
          >
            <Smartphone className="h-4 w-4" aria-hidden /> Install StudioCRM
          </button>
        )}
      </section>

      {/* Offline copy */}
      <section className="mt-6 border border-line p-4">
        <h2 className="mb-2 font-bold">Offline copy</h2>
        <a
          href="./studio-crm-offline.html"
          download
          className="flex min-h-11 w-fit cursor-pointer items-center gap-2 border border-line px-4 py-2 transition-colors duration-200 hover:border-ink"
        >
          <FileDown className="h-4 w-4" aria-hidden /> Download offline copy (Chrome/Edge only)
        </a>
        <p className="mt-2 text-ink-soft">
          A single-file version of the app — good for a USB drive or a machine with no internet. Safari and Firefox
          can't store data for a file opened straight from disk (file://); use the hosted app there instead.
        </p>
      </section>

      {/* About */}
      <section className="mt-6 border border-line p-4">
        <h2 className="mb-2 font-bold">About</h2>
        <p>
          StudioCRM tracks clients, contacts, and opportunities — the win-work stage that happens before a project
          exists in StudioHours or StudioLog. It is a standalone app; nothing here changes the other two.
        </p>
        <p className="mt-2 font-bold">Your data lives on this device. Back it up.</p>
        <p className="mt-1 text-ink-soft">No account, no cloud — nothing you type ever leaves this computer.</p>
      </section>

      {/* Danger zone */}
      <section className="mt-6 border border-alert p-4">
        <h2 className="mb-2 font-bold">Danger zone</h2>
        <p className="text-ink-soft">Permanently erase everything stored on this computer.</p>
        <button
          type="button"
          onClick={() => void onEraseAll()}
          className="mt-3 flex min-h-11 cursor-pointer items-center gap-2 border border-alert px-4 py-2 text-alert transition-colors duration-200 hover:bg-alert hover:text-paper"
        >
          <Trash2 className="h-4 w-4" aria-hidden /> Erase all data
        </button>
      </section>
    </div>
  );
}
