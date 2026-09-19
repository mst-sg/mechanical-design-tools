export type BomField =
  "item" | "partNumber" | "description" | "quantity" | "material";
export type BomRow = Record<BomField, string> & {
  id: string;
  confidence?: number;
};
export const fields: BomField[] = [
  "item",
  "partNumber",
  "description",
  "quantity",
  "material",
];
export const labels: Record<BomField, string> = {
  item: "Item",
  partNumber: "Part number",
  description: "Description",
  quantity: "Quantity",
  material: "Material",
};
export type Word = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};
export type Crop = { left: number; top: number; width: number; height: number };
export const fullCrop: Crop = { left: 0, top: 0, width: 100, height: 100 };
export function blankRow(): BomRow {
  return {
    id: crypto.randomUUID(),
    item: "",
    partNumber: "",
    description: "",
    quantity: "",
    material: "",
  };
}
