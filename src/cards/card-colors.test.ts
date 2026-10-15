import { cardColors, contrastRatio, CONTRAST_MIN } from './card-colors';

// Colors sampled from blueprint/reference/cardsheet.png.
const LA_PINOSA = ['#85439a', '#ffcc03'] as const;
const LOS_CERRICOS = ['#da143b', '#0047ab'] as const;
const ESCANOLA = ['#319a66', '#a9d9bb'] as const;
const SAN_MATEO = ['#363332', '#abdfe9'] as const;

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colors', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#336699', '#336699')).toBe(1);
  });

  it('is symmetric', () => {
    expect(contrastRatio(...LA_PINOSA)).toBe(contrastRatio(LA_PINOSA[1], LA_PINOSA[0]));
  });
});

describe('cardColors', () => {
  it.each([LA_PINOSA, ESCANOLA, SAN_MATEO])('uses primary pills for %s', (primary, secondary) => {
    expect(contrastRatio(primary, secondary)).toBeGreaterThanOrEqual(CONTRAST_MIN);
    const c = cardColors(primary, secondary);
    expect(c).toMatchObject({ topFill: primary, bottomFill: primary, number: primary, stars: primary });
    expect(c.sportsmanship).toEqual({ standard: primary, goalie: primary });
  });

  it('uses the secondary color for pill text, so it is readable whichever color is lighter', () => {
    expect(cardColors(...LA_PINOSA).pillText).toBe('#ffcc03');
    expect(cardColors(...SAN_MATEO).pillText).toBe('#abdfe9');
    // primary lighter: dark secondary text on light primary pills
    expect(cardColors('#f97316', '#1e3a8a').pillText).toBe('#1e3a8a');
    expect(cardColors('#ffcc03', '#85439a').pillText).toBe('#85439a');
  });

  it('uses the secondary color for values and stars whenever the primary is the lighter color', () => {
    for (const [primary, secondary] of [
      ['#ffcc03', '#85439a'],
      ['#f97316', '#1e3a8a'],
      ['#abdfe9', '#363332'],
    ] as const) {
      const c = cardColors(primary, secondary);
      expect(c).toMatchObject({
        topFill: primary,
        bottomFill: primary,
        pillText: secondary,
        number: secondary,
        stars: secondary,
      });
      expect(c.sportsmanship).toEqual({ standard: secondary, goalie: secondary });
    }
  });

  it('uses the Los Cerricos look when the colors are too close', () => {
    expect(contrastRatio(...LOS_CERRICOS)).toBeLessThan(CONTRAST_MIN);
    const c = cardColors(...LOS_CERRICOS);
    expect(c.topFill).toBe('#da143b');
    expect(c.bottomFill).toBe('#0047ab');
    expect(c.pillText).toBe('#ffffff');
    expect(c.number).toBe('#da143b');
    expect(c.sportsmanship).toEqual({ standard: '#da143b', goalie: '#0047ab' });
    expect(c.stars).toBe('#0047ab');
  });
});
