import { test } from "node:test";
import assert from "node:assert/strict";
import { locateTags, locationText } from "../src/tag-locations";
import type { Word } from "../src/types";
const word = (text: string, x: number, y: number, width = 60): Word => ({
  text,
  x,
  y,
  width,
  height: 20,
  confidence: 90,
});
test("source locations preserve repeated and split tags on the original page", () => {
  const result = locateTags(
    [
      word("PT-001", 100, 50),
      word("PT", 200, 150, 20),
      word("-", 222, 150, 8),
      word("001", 232, 150, 30),
    ],
    "PT",
    1000,
    500,
  );
  assert.deepEqual(
    result.map((r) => r.tag),
    ["PT-001", "PT-001"],
  );
  assert.deepEqual(result[0].box, { left: 10, top: 10, width: 6, height: 4 });
  assert.match(locationText(result), /left=10.00%; top=10.00%/);
});
test("unrelated distant numbers and manually added tags get no invented coordinates", () => {
  const result = locateTags(
    [word("P", 0, 20, 10), word("101", 400, 20), word("FT-012", 600, 20)],
    "P,FT",
    1000,
    500,
  );
  assert.deepEqual(
    result.map((r) => r.tag),
    ["FT-012"],
  );
  assert.deepEqual(locateTags([], "P", 1000, 500), []);
  assert.deepEqual(locateTags([word("P-1", 0, 0)], "P", 0, 0), []);
});
