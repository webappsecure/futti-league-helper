// Goaltending ratings are two digits, each 1-6: 36 is followed by 41 and 31 minus 1 is 26.

const MIN_RATING = 11;
const MAX_RATING = 66;
const RETIRED_AT_OR_BELOW = 26;

export interface GoaltendingBounds {
  min?: number;
  max?: number;
}

export function isValidGoaltending(rating: number): boolean {
  if (!Number.isInteger(rating)) return false;
  const tens = Math.floor(rating / 10);
  const units = rating % 10;
  return tens >= 1 && tens <= 6 && units >= 1 && units <= 6;
}

function assertValid(rating: number): void {
  if (!isValidGoaltending(rating)) throw new RangeError(`Invalid goaltending rating: ${rating}`);
}

function toIndex(rating: number): number {
  return (Math.floor(rating / 10) - 1) * 6 + ((rating % 10) - 1);
}

function fromIndex(index: number): number {
  return (Math.floor(index / 6) + 1) * 10 + (index % 6) + 1;
}

/** Moves `steps` along the 1-6 digit sequence, then clamps to `bounds` when given. */
export function addGoaltending(rating: number, steps: number, bounds: GoaltendingBounds = {}): number {
  assertValid(rating);
  if (!Number.isInteger(steps)) throw new RangeError(`Steps must be an integer: ${steps}`);
  if (bounds.min !== undefined) assertValid(bounds.min);
  if (bounds.max !== undefined) assertValid(bounds.max);
  if (bounds.min !== undefined && bounds.max !== undefined && bounds.min > bounds.max) {
    throw new RangeError(`Goaltending bounds are reversed: min ${bounds.min}, max ${bounds.max}`);
  }

  let index = toIndex(rating) + steps;
  if (bounds.min !== undefined) index = Math.max(index, toIndex(bounds.min));
  if (bounds.max !== undefined) index = Math.min(index, toIndex(bounds.max));
  if (index < toIndex(MIN_RATING) || index > toIndex(MAX_RATING)) {
    throw new RangeError(`Goaltending rating out of range: ${rating} moved by ${steps}`);
  }
  return fromIndex(index);
}

export function isGoaltendingRetired(rating: number): boolean {
  assertValid(rating);
  return rating <= RETIRED_AT_OR_BELOW;
}
