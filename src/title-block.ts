export const titleFields = [
  "drawingNumber",
  "title",
  "revision",
  "material",
  "scale",
  "sheet",
] as const;
export type TitleField = (typeof titleFields)[number];
export type TitleValues = Record<TitleField, string>;
export const titleLabels: Record<TitleField, string> = {
  drawingNumber: "Drawing number",
  title: "Drawing title",
  revision: "Revision",
  material: "Material",
  scale: "Scale",
  sheet: "Sheet",
};
export const blankTitle = (): TitleValues => ({
  drawingNumber: "",
  title: "",
  revision: "",
  material: "",
  scale: "",
  sheet: "",
});
const aliases: [TitleField, string][] = [
  [
    "drawingNumber",
    "(?:drawing\\s*(?:number|no\\.?|#)|dwg\\.?\\s*(?:no\\.?|number|#)|图号|图纸编号)",
  ],
  ["title", "(?:drawing\\s*title|title|名称|图名)"],
  ["revision", "(?:revision|rev\\.?|版本|版次)"],
  ["material", "(?:material|材质|材料)"],
  ["scale", "(?:scale|比例)"],
  ["sheet", "(?:sheet|页码|图幅页次)"],
];
// Only labelled text is suggested. Ambiguous repeated labels stay blank.
export function extractTitle(text: string): {
  values: TitleValues;
  ambiguous: TitleField[];
} {
  const values = blankTitle(),
    ambiguous: TitleField[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const [field, alias] of aliases) {
    const pattern = new RegExp(`^(?:${alias})(?:\\s*[:：]\\s*|\\s+)(.+)$`, "i");
    const matches = [
      ...new Set(
        lines.flatMap((line) => {
          const m = line.match(pattern);
          return m?.[1]?.trim() ? [m[1].trim()] : [];
        }),
      ),
    ];
    if (matches.length === 1) values[field] = matches[0];
    if (matches.length > 1) ambiguous.push(field);
  }
  return { values, ambiguous };
}
