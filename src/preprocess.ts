/** Remove long, straight dark rules before OCR, preserving short character strokes.
 * This operates only on a temporary recognition crop; the user's preview stays intact.
 */
export function removeTableRules(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const mask = new Uint8Array(width * height);
  const dark = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return data[i] < 160 && data[i + 1] < 160 && data[i + 2] < 160;
  };
  const horizontal = Math.max(100, Math.round(width * 0.35)),
    vertical = Math.max(80, Math.round(height * 0.35));
  for (let y = 0; y < height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      if (x < width && dark(x, y)) {
        if (start < 0) start = x;
      } else if (start >= 0) {
        if (x - start >= horizontal)
          for (
            let yy = Math.max(0, y - 3);
            yy <= Math.min(height - 1, y + 3);
            yy++
          )
            for (
              let xx = Math.max(0, start - 2);
              xx < Math.min(width, x + 2);
              xx++
            )
              mask[yy * width + xx] = 1;
        start = -1;
      }
    }
  }
  for (let x = 0; x < width; x++) {
    let start = -1;
    for (let y = 0; y <= height; y++) {
      if (y < height && dark(x, y)) {
        if (start < 0) start = y;
      } else if (start >= 0) {
        if (y - start >= vertical)
          for (
            let xx = Math.max(0, x - 3);
            xx <= Math.min(width - 1, x + 3);
            xx++
          )
            for (
              let yy = Math.max(0, start - 2);
              yy < Math.min(height, y + 2);
              yy++
            )
              mask[yy * width + xx] = 1;
        start = -1;
      }
    }
  }
  for (let i = 0; i < mask.length; i++)
    if (mask[i]) {
      data[i * 4] = 255;
      data[i * 4 + 1] = 255;
      data[i * 4 + 2] = 255;
      data[i * 4 + 3] = 255;
    }
}
