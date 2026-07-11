import { useRef, useState } from 'react';
import { Upload, FileUp } from 'lucide-react';
import { importFiles, type ImportOutcome } from '../../lib/importEngine';
import { importCsvFile } from '../../lib/harvestImport';

// --- folder-drop traversal (webkitGetAsEntry) --------------------------------

function fileFromEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readAllDirEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch: FileSystemEntry[] = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    all.push(...batch);
  }
  return all;
}

async function walkEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    out.push(await fileFromEntry(entry as FileSystemFileEntry));
  } else if (entry.isDirectory) {
    const children = await readAllDirEntries((entry as FileSystemDirectoryEntry).createReader());
    for (const c of children) await walkEntry(c, out);
  }
}

/** Collect File[] from a drop, recursing into any dropped folders. */
async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const roots: FileSystemEntry[] = [];
  for (let i = 0; i < dt.items.length; i++) {
    const entry = dt.items[i].webkitGetAsEntry?.();
    if (entry) roots.push(entry);
  }
  if (roots.length) {
    const out: File[] = [];
    for (const r of roots) await walkEntry(r, out);
    return out;
  }
  return Array.from(dt.files); // fallback: browser without entry API
}

const isUsable = (f: File): boolean => {
  if (f.name.startsWith('.') || f.name === '.DS_Store') return false;
  const n = f.name.toLowerCase();
  return n.endsWith('.json') || n.endsWith('.csv');
};

export default function ImportZone({ onActivity }: { onActivity?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcomes, setOutcomes] = useState<ImportOutcome[] | null>(null);

  async function process(files: File[]) {
    onActivity?.(); // keep the panel open so the result is visible
    const usable = files.filter(isUsable);
    if (!usable.length) {
      setOutcomes([{ importId: '', fileName: 'No files', ok: false, message: 'No .json or .csv files found in the drop.' }]);
      return;
    }
    setBusy(true);
    try {
      const json = usable.filter((f) => f.name.toLowerCase().endsWith('.json'));
      const csv = usable.filter((f) => f.name.toLowerCase().endsWith('.csv'));
      const results: ImportOutcome[] = [];
      if (json.length) results.push(...(await importFiles(json)));
      for (const f of csv) results.push(...(await importCsvFile(f)));
      setOutcomes(results);
    } finally {
      setBusy(false);
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void filesFromDataTransfer(e.dataTransfer).then(process);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = ''; // allow re-picking the same file
    if (files.length) void process(files);
  };

  return (
    <section data-tour="drop-zone" aria-label="Import timesheet files">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!dragging) setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 border border-dashed px-6 py-12 text-center transition-colors duration-200 ${
          dragging ? 'border-ink bg-neutral-50' : 'border-line'
        }`}
      >
        <Upload className="h-4 w-4 text-ink-soft" aria-hidden />
        <p className="text-ink-soft" role="status" aria-live="polite">
          {busy ? 'Importing…' : 'Drop timesheet files (or a whole folder) here'}
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex min-h-11 cursor-pointer items-center gap-2 border border-line px-4 py-2 transition-colors duration-200 hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FileUp className="h-4 w-4" aria-hidden /> Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".json,.csv"
          onChange={onPick}
          className="hidden"
          aria-label="Choose timesheet files"
        />
      </div>

      {outcomes && (
        <ul className="mt-3 flex flex-col gap-1" aria-live="polite">
          {outcomes.map((o, i) => (
            <li key={`${o.fileName}-${i}`} className="flex items-baseline gap-2 border border-line px-3 py-2">
              <span className="truncate font-bold">{o.fileName}</span>
              {o.ok ? (
                <span className="text-ink-soft">
                  {o.personName ?? 'Imported'} — {o.entryCount ?? 0} entries
                  {o.replacedCount ? `, replaced ${o.replacedCount}` : ''}
                </span>
              ) : (
                <span className="text-alert">{o.message ?? 'Import failed'}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
