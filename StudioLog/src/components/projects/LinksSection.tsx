// File links for one project: label + URL rows that open in a new tab.
// StudioLog never stores files — these are shortcuts into the user's own
// folders (Dropbox, Drive, OneDrive, office server). Plain inline "Add link"
// form, no dialog.

import { useState, type FormEvent } from 'react';
import { ExternalLink } from 'lucide-react';
import type { Project } from '../../types';
import { patchProject } from '../../db';
import { normalizeUrl } from '../../lib/url';

export default function LinksSection({ project }: { project: Project }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    const l = label.trim();
    const u = url.trim();
    if (!l || !u) return; // native `required` already blocks this
    void patchProject(project.projectId, { links: [...project.links, { label: l, url: normalizeUrl(u) }] });
    setLabel('');
    setUrl('');
  };

  const onRemove = (index: number) => {
    const link = project.links[index];
    if (!window.confirm(`Remove the link "${link.label}"? The files themselves are untouched — this only removes the shortcut.`)) return;
    void patchProject(project.projectId, { links: project.links.filter((_, i) => i !== index) });
  };

  return (
    <div>
      <p className="text-ink-soft">
        Your drawings and documents stay in your own folders — StudioLog only keeps links to them.
      </p>

      {project.links.length === 0 ? (
        <p className="mt-3 text-ink-soft">
          No links yet. Paste a link to this project's folder so it's one click away.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-line border border-line">
          {project.links.map((link, i) => (
            <li key={`${link.url}-${i}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center gap-1.5 font-bold underline underline-offset-4 transition-colors duration-200 hover:text-ink-soft"
              >
                {link.label}
                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              <span className="min-w-0 flex-1 truncate text-ink-soft">{link.url}</span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Remove link ${link.label}`}
                className="min-h-11 cursor-pointer px-2 text-ink-soft underline underline-offset-4 transition-colors duration-200 hover:text-alert"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onAdd} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">Label</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            placeholder="e.g. Drawings folder"
            className="h-11 w-48 border border-line px-2"
          />
        </label>
        <label className="flex min-w-52 flex-1 flex-col gap-1">
          <span className="text-ink-soft">Link (paste it here)</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            placeholder="https://…"
            className="h-11 w-full border border-line px-2"
          />
        </label>
        <button
          type="submit"
          className="min-h-11 cursor-pointer border border-line px-4 py-2 transition-colors duration-200 hover:border-ink"
        >
          Add link
        </button>
      </form>
    </div>
  );
}
