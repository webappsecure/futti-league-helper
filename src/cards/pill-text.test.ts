import { pillTextScale, PILL_TEXT_MAX_IN } from './pill-text';
import { textWidthPt } from './rockwell-widths';

describe('textWidthPt', () => {
  it('measures with the Rockwell Nova Condensed Bold widths', () => {
    // M is 1550 and I is 709 units of 2048
    expect(textWidthPt('M', 2048)).toBe(1550);
    expect(textWidthPt('MI', 2048)).toBe(1550 + 709);
  });

  it('counts unknown characters as the widest glyph', () => {
    expect(textWidthPt('中', 2048)).toBe(1653);
  });
});

describe('pillTextScale', () => {
  it('leaves short names alone', () => {
    expect(pillTextScale('LEE')).toBe(1);
    expect(pillTextScale('PEÑA')).toBe(1);
  });

  it('compresses long text to fit the pill', () => {
    for (const name of ['RODRIGUEZ-MONTENEGRO', 'SAN FRANCISCO DE CAMPECHE', 'WWWWWWWWWWWWWWWWWWWW']) {
      const scale = pillTextScale(name);
      expect(scale).toBeLessThan(1);
      expect(textWidthPt(name, 16) * scale).toBeLessThanOrEqual(PILL_TEXT_MAX_IN * 72);
    }
  });

  it('compresses more for longer text', () => {
    expect(pillTextScale('MALDONADO-RODRIGUEZ-X')).toBeLessThan(pillTextScale('MALDONADO-RODRIGUEZ'));
  });
});
