export const TWO_PANE_MIN_WIDTH = 768;

export function isTwoPane(width: number): boolean {
  return width >= TWO_PANE_MIN_WIDTH;
}
