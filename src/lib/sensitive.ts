/**
 * Utility functions for detecting and handling sensitive / +18 adult content in Komy.
 * Only explicit adult / sensitive / hidden tags chosen by the user are matched.
 * Normal genres like Gore, Horror, or Action are NEVER automatically hidden.
 */

export const SENSITIVE_KEYWORDS = [
  "+18",
  "18+",
  "nsfw",
  "oculto",
  "adulto",
  "adultos",
  "hentai",
];

export function isWorkSensitive(work?: {
  tags?: string | null;
  isNsfw?: boolean;
} | null): boolean {
  if (!work) return false;
  if ((work as any).isNsfw) return true;

  const raw = (work.tags || "").toLowerCase();
  if (!raw.trim()) return false;

  const tagsList = raw
    .split(",")
    .map((t) => t.replace(/\.+$/, "").trim().toLowerCase())
    .filter(Boolean);

  for (const tag of tagsList) {
    for (const kw of SENSITIVE_KEYWORDS) {
      if (tag === kw) {
        return true;
      }
    }
  }

  // Also test direct regex in the raw string for tokens like +18, 18+, nsfw, oculto
  if (/\b18\+\b|\+18\b|\bnsfw\b|\bhentai\b|\boculto\b/i.test(raw)) {
    return true;
  }

  return false;
}
