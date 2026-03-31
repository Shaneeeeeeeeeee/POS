export const INVENTORY_CATEGORIES_KEY = "inventory_categories";

export function normalizeCategory(raw: string | null | undefined) {
  return (raw ?? "").trim();
}

export function parseStoredCategories(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeCategory(typeof item === "string" ? item : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function uniqueCategories(...groups: string[][]): string[] {
  const map = new Map<string, string>();
  for (const group of groups) {
    for (const raw of group) {
      const v = normalizeCategory(raw);
      if (!v) continue;
      const key = v.toLowerCase();
      if (!map.has(key)) map.set(key, v);
    }
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
