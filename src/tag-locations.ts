import { linesFromWords } from "./ocr-table";
import { tagSpans } from "./pid-tags";
import type { Crop, Word } from "./types";
export type TagLocation = { tag: string; box: Crop };
export function locateTags(
  words: Word[],
  prefixes: string,
  width: number,
  height: number,
): TagLocation[] {
  if (!(width > 0 && height > 0)) return [];
  const locations: TagLocation[] = [];
  for (const line of linesFromWords(words)) {
    let text = "";
    const spans = line.map((word, i) => {
      // Do not join a prefix to a distant unrelated number on the same baseline.
      if (i)
        text +=
          word.x - (line[i - 1].x + line[i - 1].width) >
          Math.max(word.height, line[i - 1].height) * 2.5
            ? "\n"
            : " ";
      const start = text.length;
      text += word.text;
      return { word, start, end: text.length };
    });
    for (const match of tagSpans(text, prefixes)) {
      const pieces = spans
        .filter((s) => s.start < match.end && s.end > match.start)
        .map((s) => s.word);
      if (!pieces.length) continue;
      const left = Math.max(0, Math.min(...pieces.map((w) => w.x))),
        top = Math.max(0, Math.min(...pieces.map((w) => w.y)));
      const right = Math.min(
          width,
          Math.max(...pieces.map((w) => w.x + w.width)),
        ),
        bottom = Math.min(
          height,
          Math.max(...pieces.map((w) => w.y + w.height)),
        );
      if (right <= left || bottom <= top) continue;
      locations.push({
        tag: match.tag,
        box: {
          left: (left / width) * 100,
          top: (top / height) * 100,
          width: ((right - left) / width) * 100,
          height: ((bottom - top) / height) * 100,
        },
      });
    }
  }
  return locations;
}
export function locationText(locations: TagLocation[]) {
  return locations
    .map(
      ({ box: b }) =>
        `left=${b.left.toFixed(2)}%; top=${b.top.toFixed(2)}%; width=${b.width.toFixed(2)}%; height=${b.height.toFixed(2)}%`,
    )
    .join(" | ");
}
