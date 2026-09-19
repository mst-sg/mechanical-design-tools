import { parseCsv } from "./csv";
export const defaultPrefixes =
  "P, TK, V, XV, CV, FV, PT, PI, PIT, FT, FI, FIT, TT, TI, TIT, LT, LI, LIT, LIC, PSV";
export function prefixesFrom(text: string): string[] {
  const values = [
    ...new Set(
      text
        .toUpperCase()
        .split(/[,\s]+/)
        .filter(Boolean),
    ),
  ];
  if (
    !values.length ||
    values.length > 50 ||
    values.some((v) => !/^[A-Z]{1,8}$/.test(v))
  )
    throw new Error(
      "Enter 1–50 letter prefixes separated by commas, such as P, PT, FT, TK.",
    );
  return values.sort((a, b) => b.length - a.length);
}
export function suggestTags(text: string, prefixText: string): string[] {
  const prefixes = prefixesFrom(prefixText);
  // Prefix + numeric sequence + optional suffix only. Preserve leading zeros.
  const pattern = new RegExp(
    `(?<![A-Z0-9_–—-])(${prefixes.join("|")})[ \\t]*(?:[-–—][ \\t]*|[ \\t]+)([0-9]{1,6}[A-Z]?)(?![A-Z0-9_–—-])`,
    "gi",
  );
  return [...text.matchAll(pattern)].map(
    (m) => `${m[1].toUpperCase()}-${m[2].toUpperCase()}`,
  );
}
export function normalizeTag(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, "-");
}
export function tagList(text: string): string[] {
  if (text.length > 1_000_000)
    throw new Error("Use a tag list smaller than 1 MB.");
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const key = (s: string) => s.toLowerCase().replace(/[\s_.#-]/g, "");
  const cols = rows[0].flatMap((h, i) =>
    [
      "tag",
      "tags",
      "tagno",
      "tagnumber",
      "equipmenttag",
      "instrumenttag",
      "位号",
    ].includes(key(h))
      ? [i]
      : [],
  );
  if (cols.length > 1)
    throw new Error("Keep one Tag column in the reference CSV.");
  if (rows[0].length > 1 && !cols.length)
    throw new Error("Use a CSV with a Tag column, or paste one tag per line.");
  const data = cols.length ? rows.slice(1) : rows;
  if (data.length > 10000) throw new Error("Use at most 10,000 tag entries.");
  return data.map((r, i) => {
    const tag = normalizeTag(r[cols[0] ?? 0] || "");
    if (!/^[A-Z]{1,8}-[0-9]{1,6}[A-Z]?$/.test(tag))
      throw new Error(
        `Entry ${i + 1}: use a tag such as PT-101, P-002A or TK-12. Check missing values and unsupported tag formats.`,
      );
    return tag;
  });
}
export type TagResult = {
  tag: string;
  status: "Matched" | "Only in drawing" | "Only in list";
  drawingCount: number;
  listCount: number;
};
export function compareTags(
  drawing: string[],
  reference: string[],
): TagResult[] {
  if (!drawing.length || !reference.length)
    throw new Error("Both lists need at least one reviewed tag.");
  const count = (tags: string[]) => {
    const m = new Map<string, number>();
    for (const t of tags) m.set(t, (m.get(t) || 0) + 1);
    return m;
  };
  const a = count(drawing),
    b = count(reference);
  return [...new Set([...a.keys(), ...b.keys()])]
    .sort()
    .map((tag) => ({
      tag,
      status:
        a.has(tag) && b.has(tag)
          ? "Matched"
          : a.has(tag)
            ? "Only in drawing"
            : "Only in list",
      drawingCount: a.get(tag) || 0,
      listCount: b.get(tag) || 0,
    }));
}
