import { pillTextScale, PILL_TEXT_MAX_IN, PILL_TEXT_MAX_SCALE } from './pill-text';
import { textWidthPt } from './bevan-widths';

describe('textWidthPt', () => {
  it('measures with the Bevan widths', () => {
    // M is 2357 and I is 968 units of 2048
    expect(textWidthPt('M', 2048)).toBe(2357);
    expect(textWidthPt('MI', 2048)).toBe(2357 + 968);
  });

  it('counts unknown characters as the widest glyph', () => {
    expect(textWidthPt('\u4e2d', 2048)).toBe(2692);
  });
});

describe('pillTextScale', () => {
  it('sets short text at 75% width', () => {
    expect(pillTextScale('LEE')).toBe(0.75);
    expect(pillTextScale('PEÑA')).toBe(0.75);
    expect(PILL_TEXT_MAX_SCALE).toBe(0.75);
  });

  it('never goes wider than 75% and fits the pill when longer', () => {
    for (const name of ['MALDONADO', 'RODRIGUEZ-MONTENEGRO', 'SAN FRANCISCO DE CAMPECHE', 'WWWWWWWWWWWWWWWWWWWW']) {
      const scale = pillTextScale(name);
      expect(scale).toBeLessThanOrEqual(0.75);
      expect(textWidthPt(name, 16) * scale).toBeLessThanOrEqual(PILL_TEXT_MAX_IN * 72);
    }
    expect(pillTextScale('RODRIGUEZ-MONTENEGRO')).toBeLessThan(0.75);
  });

  it('compresses more for longer text', () => {
    expect(pillTextScale('MALDONADO-RODRIGUEZ-X')).toBeLessThan(pillTextScale('MALDONADO-RODRIGUEZ'));
  });
});
