/**
 * Minimum contrast ratio between a team's two colors for the primary-pill look. Measured on the sample
 * sheet: Los Cerricos (red, blue) is 1.66 and Escanola (green, pale green) is 2.24, so 2 separates them.
 */
export const CONTRAST_MIN = 2;

function channel(hex: string, start: number): number {
  const v = parseInt(hex.slice(start, start + 2), 16) / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a `#rrggbb` color. */
export function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** WCAG contrast ratio between two `#rrggbb` colors, from 1 (identical) to 21. */
export function contrastRatio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export interface CardColors {
  topFill: string;
  bottomFill: string;
  /** Text color on both pills. */
  pillText: string;
  /** The large rating numbers. */
  number: string;
  sportsmanship: { standard: string; goalie: string };
  stars: string;
}

const WHITE = '#ffffff';

/** The color roles for one team's cards; both colors must be `#rrggbb`. */
export function cardColors(primary: string, secondary: string): CardColors {
  if (contrastRatio(primary, secondary) >= CONTRAST_MIN) {
    // Pills are always the primary color with the secondary color as their text. The values and stars are
    // the primary color, except when the primary is the lighter color: then they are the darker secondary.
    const ink = luminance(primary) > luminance(secondary) ? secondary : primary;
    return {
      topFill: primary,
      bottomFill: primary,
      pillText: secondary,
      number: ink,
      sportsmanship: { standard: ink, goalie: ink },
      stars: ink,
    };
  }
  return {
    topFill: primary,
    bottomFill: secondary,
    pillText: WHITE,
    number: primary,
    sportsmanship: { standard: primary, goalie: secondary },
    stars: secondary,
  };
}
