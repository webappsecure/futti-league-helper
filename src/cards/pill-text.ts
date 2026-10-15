import { textWidthPt } from './bevan-widths';

export const PILL_FONT_PT = 16;
/** Bevan is wide, so pill text is always set at 75% width, and narrower only when the text still would not fit. */
export const PILL_TEXT_MAX_SCALE = 0.75;
/** Room for text inside a pill: the pill is about 1.17in wide, less a little padding. */
export const PILL_TEXT_MAX_IN = 1.05;

/** Horizontal scale (at most 75%) for `text` at the pill font size. */
export function pillTextScale(text: string): number {
  const width = textWidthPt(text, PILL_FONT_PT);
  const fit = (PILL_TEXT_MAX_IN * 72) / width;
  return Math.floor(Math.min(PILL_TEXT_MAX_SCALE, fit) * 1000) / 1000;
}
