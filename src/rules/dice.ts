/** A random source returning a value in [0, 1), like `Math.random`. */
export type Rng = () => number;

export function rollDie(rng: Rng): number {
  const value = rng();
  if (!(value >= 0 && value < 1)) throw new RangeError(`Rng must return a value in [0, 1), got ${value}`);
  return 1 + Math.floor(value * 6);
}

export function roll2d6(rng: Rng): number {
  return rollDie(rng) + rollDie(rng);
}
