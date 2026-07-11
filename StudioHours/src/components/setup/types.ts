import type { FirmFile } from '../../types';

/** Clone-mutate-persist helper shared by the Setup panels and the People
 *  screen: pass a mutator that edits the draft in place; the host screen
 *  applies it to a fresh clone of the current firm and persists via
 *  setFirm() — the kv live query then refreshes every screen that reads
 *  the firm. */
export type FirmUpdater = (mutate: (draft: FirmFile) => void) => Promise<void>;
