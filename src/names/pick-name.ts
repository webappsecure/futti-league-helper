import type { Rng } from '@/rules/dice';

const RANDOM_PROBES = 50;

function randomIndex(length: number, rng: Rng): number {
  const value = rng();
  if (!(value >= 0 && value < 1)) throw new RangeError(`Rng must return a value in [0, 1), got ${value}`);
  return Math.floor(value * length);
}

/** A uniformly random name from the pool that is not in `unavailable`, or null when none is left. */
export function pickRandomName(
  pool: readonly string[],
  unavailable: ReadonlySet<string>,
  rng: Rng,
): string | null {
  if (pool.length === 0) return null;
  for (let attempt = 0; attempt < RANDOM_PROBES; attempt += 1) {
    const name = pool[randomIndex(pool.length, rng)];
    if (!unavailable.has(name)) return name;
  }
  const available = pool.filter((name) => !unavailable.has(name));
  if (available.length === 0) return null;
  return available[randomIndex(available.length, rng)];
}
