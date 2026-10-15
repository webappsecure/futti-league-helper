import { textWidthPt } from './rockwell-widths';

export const PILL_FONT_PT = 16;
/** Room for text inside a pill: the pill is about 1.17in wide, less a little padding. */
export const PILL_TEXT_MAX_IN = 1.05;

/** Horizontal scale (at most 1) that makes `text` fit a pill at the pill font size. */
export function pillTextScale(text: string): number {
  const width = textWidthPt(text, PILL_FONT_PT);
  const max = PILL_TEXT_MAX_IN * 72;
  return width <= max ? 1 : Math.floor((max / width) * 1000) / 1000;
}
