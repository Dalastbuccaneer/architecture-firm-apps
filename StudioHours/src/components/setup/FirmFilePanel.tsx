// Firm file section of Setup: export the canonical firm file for the manager
// to drop into the shared drive. downloadText is called synchronously here —
// content is built from the already-loaded firm prop, no awaits in between.
// The content itself comes from buildFirmFileExport — the single, tested path
// that guarantees no salary/HR/payroll data can ride along (see serialize.ts).
import type { FirmFile } from '../../types';
import { downloadText } from '../../lib/download';
import { buildFirmFileExport, firmFilename } from '../../lib/serialize';

export default function FirmFilePanel({ firm }: { firm: FirmFile }) {
  const exportFirmFile = () => {
    downloadText(firmFilename(firm.firm.firmName), buildFirmFileExport(firm));
  };

  return (
    <section className="mt-10">
      <h2 className="mb-4 font-bold">Firm file</h2>
      <div className="border border-line p-4">
        <p className="mb-3 text-ink-soft">
          Save this into your shared drive. Your team imports it on first run so everyone logs against the same
          projects — re-share it whenever you change projects or phases.
        </p>
        <button
          type="button"
          data-tour="firm-file-export"
          onClick={exportFirmFile}
          className="min-h-11 cursor-pointer bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft"
        >
          Export firm file
        </button>
      </div>
    </section>
  );
}
