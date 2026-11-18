import { describe, expect, it } from 'vitest';

import { blobGeometry, splitColor } from './blobs';

describe('splitColor', () => {
  it('keeps alpha separate from the opaque colour (stopColor ignores alpha on native)', () => {
    expect(splitColor('rgba(204, 255, 51, 0.13)')).toEqual({ hex: '#ccff33', alpha: 0.13 });
    expect(splitColor('rgb(204 255 51)')).toEqual({ hex: '#ccff33', alpha: 1 });
    expect(splitColor('#CFE5F1')).toEqual({ hex: '#cfe5f1', alpha: 1 });
    expect(splitColor('#ccff3321').alpha).toBeCloseTo(0x21 / 255);
  });
  it('rejects unknown formats', () => {
    expect(() => splitColor('lime')).toThrow();
  });
});

describe('blobGeometry', () => {
  it('sizes like CSS farthest-corner circles', () => {
    const g = blobGeometry({ x: 15, y: 20, stop: 40 }, 400, 800);
    expect(g.cx).toBe(60);
    expect(g.cy).toBe(160);
    expect(g.r).toBeCloseTo(0.4 * Math.hypot(340, 640));
  });
});
