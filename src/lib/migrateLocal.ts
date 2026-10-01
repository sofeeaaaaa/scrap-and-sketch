import type { JournalState } from "@/components/journal/types";
import { loadLocalProfiles, saveProfile } from "@/components/journal/handwritingStorage";
import { createJournal } from "./journalCloud";

const LOCAL_KEY = "tucked-away-journal-v1";

/** Moves the journal and handwriting saved in this browser into the signed-in account, once per account. */
export async function migrateLocalData(userId: string) {
  const flag = `tucked-away-moved-${userId}`;
  if (window.localStorage.getItem(flag)) return false;
  let moved = false;
  const stored = window.localStorage.getItem(LOCAL_KEY);
  if (stored) {
    try {
      const journal = JSON.parse(stored) as JournalState;
      if (journal.pages?.length) { await createJournal("My first journal", "rust", journal.pages); moved = true; }
    } catch { /* ignore unreadable local data */ }
  }
  for (const profile of await loadLocalProfiles()) { await saveProfile(profile).catch(() => undefined); moved = true; }
  window.localStorage.setItem(flag, "1");
  return moved;
}
