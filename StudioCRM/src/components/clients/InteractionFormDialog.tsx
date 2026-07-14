// Log a new interaction — call/email/meeting/site visit/other — tied to this
// client and optionally to one of its contacts and/or one of its
// opportunities (leads). An optional "Set a follow-up" toggle reveals a
// due-date + label pair; when it's on, submit calls db.ts's logInteraction
// with {createFollowUp: true} so a linked Reminder is written in the same
// call and shows up on Today without a second trip. Dialog shape/Tailwind
// classes match StudioLog's ContactFormDialog.tsx exactly.

import { useId, useRef, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import type { Client, Contact, InteractionKind, Lead } from '../../types';
import { INTERACTION_KIND_LABEL, LEAD_STAGE_LABEL } from '../../types';
import { logInteraction, type NewInteraction } from '../../db';
import { todayISO } from '../../lib/dates';

const ALL_KINDS = Object.keys(INTERACTION_KIND_LABEL) as InteractionKind[];

export default function InteractionFormDialog({
  client,
  contacts,
  leads,
  dataTour,
}: {
  client: Client;
  /** this client's contacts/leads — the tab already loads these for its list,
   *  so the dialog reuses them instead of re-querying */
  contacts: Contact[];
  leads: Lead[];
  /** driver.js tour anchor — only pass this on the one instance a tour should
   *  target */
  dataTour?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const [kind, setKind] = useState<InteractionKind>('call');
  const [date, setDate] = useState('');
  const [summary, setSummary] = useState('');
  const [contactId, setContactId] = useState('');
  const [leadId, setLeadId] = useState('');
  const [followUp, setFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpLabel, setFollowUpLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const openDialog = () => {
    setKind('call');
    setDate(todayISO());
    setSummary('');
    setContactId('');
    setLeadId('');
    setFollowUp(false);
    setFollowUpDate('');
    setFollowUpLabel('');
    setBusy(false);
    dialogRef.current?.showModal();
  };
  const closeDialog = () => dialogRef.current?.close();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const summaryTrim = summary.trim();
    if (!summaryTrim || !date) return; // native `required` already blocks this
    if (followUp && !followUpDate) return; // native `required` on the revealed field blocks this too
    setBusy(true);
    try {
      const data: NewInteraction = {
        clientId: client.id,
        contactId: contactId || undefined,
        leadId: leadId || undefined,
        kind,
        date,
        summary: summaryTrim,
        followUpDate: followUp ? followUpDate : undefined,
      };
      await logInteraction(data, {
        createFollowUp: followUp,
        followUpLabel: followUp ? followUpLabel.trim() || undefined : undefined,
      });
    } finally {
      setBusy(false);
    }
    closeDialog();
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        data-tour={dataTour}
        className="flex min-h-11 cursor-pointer items-center gap-2 bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft"
      >
        <Plus className="h-4 w-4" aria-hidden /> Log interaction
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="w-full max-w-lg border border-line bg-paper p-6 text-ink backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) closeDialog();
        }}
      >
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <h2 id={titleId} className="font-bold">
            Log interaction
          </h2>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Kind</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as InteractionKind)}
              className="h-12 w-full cursor-pointer border border-line px-2"
            >
              {ALL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {INTERACTION_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="h-12 w-full cursor-pointer border border-line px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Summary</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              required
              rows={4}
              placeholder="What was said or decided"
              className="w-full border border-line p-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Contact (optional)</span>
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="h-12 w-full cursor-pointer border border-line px-2"
            >
              <option value="">— Not tied to a specific contact —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.role ? ` — ${c.role}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Opportunity (optional)</span>
            <select
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="h-12 w-full cursor-pointer border border-line px-2"
            >
              <option value="">— Not tied to a specific opportunity —</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title} ({LEAD_STAGE_LABEL[l.stage]})
                </option>
              ))}
            </select>
          </label>

          <fieldset className="flex flex-col gap-3 border border-line p-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={followUp}
                onChange={(e) => setFollowUp(e.target.checked)}
                className="h-5 w-5 shrink-0 cursor-pointer accent-ink"
              />
              <span>Set a follow-up</span>
            </label>

            {followUp && (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-ink-soft">Follow-up due</span>
                  <input
                    type="date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    required
                    className="h-12 w-full cursor-pointer border border-line px-2"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-ink-soft">Label (optional)</span>
                  <input
                    value={followUpLabel}
                    onChange={(e) => setFollowUpLabel(e.target.value)}
                    placeholder={`Follow up: ${summary.trim() || '…'}`}
                    className="h-12 w-full border border-line px-2"
                  />
                </label>
              </div>
            )}
          </fieldset>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeDialog}
              className="min-h-11 cursor-pointer border border-line px-4 transition-colors duration-200 hover:border-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 cursor-pointer bg-ink px-4 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              Save interaction
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
