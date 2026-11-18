/**
 * Backdrop blob geometry shared with the mobile renderer. react-native-svg ignores the alpha channel of
 * `stopColor`, so alpha must be passed separately as `stopOpacity`; and CSS `radial-gradient(circle at x y,
 * color, transparent N%)` sizes the circle to the FARTHEST CORNER, not to a percent of width/height.
 */
export interface ParsedColor {
  /** `#rrggbb` (opaque) */
  hex: string;
  /** 0..1 */
  alpha: number;
}

const toHex = (n: number) =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');

/** Splits `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()` or `rgba()` into an opaque hex plus alpha. */
export function splitColor(input: string): ParsedColor {
  const s = input.trim();
  const rgba =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(s);
  if (rgba) {
    const a =
      rgba[4] === undefined
        ? 1
        : rgba[4].endsWith('%')
          ? parseFloat(rgba[4]) / 100
          : parseFloat(rgba[4]);
    return { hex: `#${toHex(+rgba[1]!)}${toHex(+rgba[2]!)}${toHex(+rgba[3]!)}`, alpha: a };
  }
  const h = /^#([0-9a-f]{3,8})$/i.exec(s)?.[1];
  if (h) {
    if (h.length === 3 || h.length === 4) {
      const [r, g, b, a] = [...h].map((c) => parseInt(c + c, 16));
      return { hex: `#${toHex(r!)}${toHex(g!)}${toHex(b!)}`, alpha: a === undefined ? 1 : a / 255 };
    }
    if (h.length === 6) return { hex: `#${h.toLowerCase()}`, alpha: 1 };
    if (h.length === 8)
      return { hex: `#${h.slice(0, 6).toLowerCase()}`, alpha: parseInt(h.slice(6), 16) / 255 };
  }
  throw new Error(`Unsupported colour: ${input}`);
}

export interface BlobGeometry {
  cx: number;
  cy: number;
  /** Radius where the gradient reaches transparent, in px. */
  r: number;
}

/** CSS `circle at x% y%` with `transparent stop%`: radius = stop% of the distance to the farthest corner. */
export function blobGeometry(
  blob: { x: number; y: number; stop: number },
  width: number,
  height: number,
): BlobGeometry {
  const cx = (blob.x / 100) * width;
  const cy = (blob.y / 100) * height;
  const farthest = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy));
  return { cx, cy, r: (blob.stop / 100) * farthest };
}
