// FirstRun card 2: drag-drop / file-picker import of a shared
// studio-hours-firm.json. On success the parent screen (FirstRun) reacts to
// firm becoming non-null and swaps in the person picker automatically.
import { useRef, useState, type DragEvent } from 'react';
import { Upload } from 'lucide-react';
import { setFirm } from '../../db';
import { ParseError, parseFirmFile } from '../../lib/serialize';

export default function ImportFirmCard({ onCancel }: { onCancel: () => void }) {
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError('');
    setLoading(true);
    try {
      const text = await file.text();
      const parsed = parseFirmFile(text, file.name);
      await setFirm(parsed);
      // setFirm flips useApp().firm to non-null; FirstRun swaps to the person picker.
    } catch (err) {
      setError(err instanceof ParseError ? err.message : `${file.name}: could not read this file`);
      setLoading(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  return (
    <div className="w-full max-w-lg">
      <p className="mb-4 font-bold">Import your firm file</p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 border border-dashed p-8 text-center transition-colors duration-200 ${
          dragging ? 'border-ink bg-neutral-50' : 'border-line'
        }`}
      >
        <Upload className="h-4 w-4 text-ink-soft" aria-hidden />
        <p>Drag the studio-hours-firm.json file your manager shared here</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="min-h-11 cursor-pointer border border-line px-4 py-2 transition-colors duration-200 hover:border-ink"
        >
          Choose file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          aria-label="Choose firm file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void handleFile(f);
          }}
        />
      </div>
      {loading && <p className="mt-3 text-ink-soft">Reading file…</p>}
      {error && <p className="mt-3 text-alert">{error}</p>}
      <button
        type="button"
        onClick={onCancel}
        className="mt-4 min-h-11 cursor-pointer border border-line px-4 py-2 transition-colors duration-200 hover:border-ink"
      >
        Back
      </button>
    </div>
  );
}
