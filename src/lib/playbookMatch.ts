/**
 * P6 D1: one shared playbook <-> trade.setup matcher (trim + lowercase).
 * Used by the playbook edge stats and by the rename dialog count, so both always agree.
 * Zero imports (plain-Node loadable, like screenshotStorage.ts).
 */

/** Normalized key of a setup / playbook title: trimmed and lowercased; empty for missing. */
export function normalizePlaybookName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

/** True when a trade's `setup` belongs to the playbook `title` (trim + lowercase, empty never matches). */
export function matchesPlaybook(setup: string | null | undefined, title: string | null | undefined): boolean {
  const key = normalizePlaybookName(title);
  return key !== "" && normalizePlaybookName(setup) === key;
}

/** Trades whose `setup` matches the playbook `title`. */
export function tradesForPlaybook<T extends { setup?: string | null }>(trades: readonly T[], title: string): T[] {
  return trades.filter((t) => matchesPlaybook(t.setup, title));
}

/** True when a rename changes the matching key (so old trades stop matching). */
export function isPlaybookRename(oldTitle: string, newTitle: string): boolean {
  return normalizePlaybookName(oldTitle) !== normalizePlaybookName(newTitle);
}
