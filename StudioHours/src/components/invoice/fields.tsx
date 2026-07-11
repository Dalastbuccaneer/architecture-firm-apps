// Small editable primitives shared by the invoice document. They render as
// obviously-editable bordered inputs on screen but drop their borders/padding on
// print (`print:*`), so the same DOM is both the editor and the printout.

import { useEffect, useRef, useState } from 'react';

const fmtNum = (n: number): string => String(Math.round(n * 100) / 100);

function parseNum(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  if (s === '') return 0;
  const n = Number(s);
  // Commit at 2-decimal precision so the stored value always equals what the field
  // re-displays (via fmtNum) — otherwise hidden precision makes Hours×Rate≠Amount
  // and CSV line items disagree with the subtotal.
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** A numeric input that tolerates in-progress text ("12.") while keeping the
 *  parent's number live, and re-syncs when the value is changed from outside
 *  (e.g. amount recomputed after hours edits). */
export function NumField({
  value,
  onCommit,
  ariaLabel,
  className = '',
}: {
  value: number;
  onCommit: (n: number) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [text, setText] = useState(fmtNum(value));
  const [invalid, setInvalid] = useState(false);
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(fmtNum(value));
      setInvalid(false);
    }
  }, [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={`${ariaLabel}${invalid ? ', invalid — enter a number' : ''}`}
      aria-invalid={invalid || undefined}
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const n = parseNum(t);
        if (n !== null) {
          setInvalid(false);
          last.current = n;
          onCommit(n);
        } else {
          // Unparseable ("50 hours", "abc") — flag it red instead of silently
          // reverting; the stored value stays at the last good number.
          setInvalid(true);
        }
      }}
      onBlur={() => {
        const n = parseNum(text);
        if (n === null) return; // keep the invalid text visible + flagged
        setInvalid(false);
        last.current = n;
        setText(fmtNum(n));
        if (n !== value) onCommit(n);
      }}
      className={`h-11 border px-2 tabular-nums print:h-auto print:border-0 print:px-0 ${
        invalid ? 'border-alert' : 'border-line'
      } ${className}`}
    />
  );
}

export function TextField({
  value,
  onCommit,
  ariaLabel,
  placeholder,
  className = '',
}: {
  value: string;
  onCommit: (v: string) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onCommit(e.target.value)}
      className={`h-11 border border-line px-2 print:h-auto print:border-0 print:px-0 ${className}`}
    />
  );
}
