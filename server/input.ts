import type { JobOptions } from "../src/job-types";
export const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const TOKEN = /^[a-f0-9]{64}$/;
export function parseOptions(raw: string): JobOptions {
  if (raw.length > 1024) throw new Error("invalid_options");
  const o = JSON.parse(raw);
  if (
    !o ||
    Object.keys(o).sort().join(",") !== "crop,language,mode,page,traffic" ||
    !Number.isSafeInteger(o.page) ||
    o.page < 1 ||
    o.page > 500 ||
    !["eng", "chi_sim"].includes(o.language) ||
    !["sample", "provided"].includes(o.mode) ||
    !["test", "browser"].includes(o.traffic) ||
    !o.crop ||
    Object.keys(o.crop).sort().join(",") !== "height,left,top,width"
  )
    throw new Error("invalid_options");
  const { left, top, width, height } = o.crop;
  if (
    ![left, top, width, height].every(Number.isFinite) ||
    left < 0 ||
    top < 0 ||
    width < 1 ||
    height < 1 ||
    left + width > 100.001 ||
    top + height > 100.001
  )
    throw new Error("invalid_options");
  return o;
}
export function validMagic(header: Buffer, mime: string) {
  if (mime === "image/png")
    return header
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/jpeg")
    return header[0] === 255 && header[1] === 216 && header[2] === 255;
  return (
    mime === "application/pdf" && header.subarray(0, 5).toString() === "%PDF-"
  );
}
