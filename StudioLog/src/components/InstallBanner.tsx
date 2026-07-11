// Slim top banner nudging installation as a PWA — this is what keeps Safari
// (and friends) from garbage-collecting a site's storage after 7 days of no
// visits. The beforeinstallprompt event is transient and browser-fired at
// unpredictable times, so it's captured at module scope (not inside the
// component) and mirrored onto window.__slInstallPrompt for Settings to reuse.
// (Ported from StudioHours.)

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../AppContext';
import { patchFlags } from '../db';
import { nowISO } from '../lib/dates';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __slInstallPrompt?: BeforeInstallPromptEvent;
  }
}

let capturedPrompt: BeforeInstallPromptEvent | null = null;
let appInstalled = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    capturedPrompt = e as BeforeInstallPromptEvent;
    window.__slInstallPrompt = capturedPrompt;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    appInstalled = true;
    capturedPrompt = null;
    window.__slInstallPrompt = undefined;
    notify();
  });
}

const DISMISS_DAYS = 7;

export default function InstallBanner() {
  const { flags, setView } = useApp();
  const [, bump] = useState(0);

  useEffect(() => {
    void navigator.storage?.persist?.();
    const onChange = () => bump((n) => n + 1);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  const standalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;
  if (standalone || appInstalled) return null;

  const dismissedAt = flags?.installBannerDismissedAt ?? null;
  const dismissedRecently =
    dismissedAt !== null && Date.now() - new Date(dismissedAt).getTime() < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  if (dismissedRecently) return null;

  const onInstall = async () => {
    if (!capturedPrompt) {
      setView('settings');
      return;
    }
    await capturedPrompt.prompt();
    await capturedPrompt.userChoice;
    capturedPrompt = null;
    window.__slInstallPrompt = undefined;
    bump((n) => n + 1);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-neutral-50 px-6 py-2 print:hidden">
      <span className="min-w-0 flex-1">Install StudioLog as an app — keeps your data safe from browser cleanup.</span>
      <button
        type="button"
        onClick={() => void onInstall()}
        className="ml-auto min-h-11 cursor-pointer border border-line px-3 py-1.5 transition-colors duration-200 hover:border-ink"
      >
        {capturedPrompt ? 'Install' : 'How to install'}
      </button>
      <button
        type="button"
        aria-label="Dismiss install reminder"
        onClick={() => void patchFlags({ installBannerDismissedAt: nowISO() })}
        className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center text-ink-soft transition-colors duration-200 hover:text-ink"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
