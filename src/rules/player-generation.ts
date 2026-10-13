import {
  draftAge,
  draftGoaltending,
  draftTotal,
  initialAge,
  initialGoaltending,
  initialTotal,
  splitFor,
  splitNeedsRoll,
  sportsmanshipFor,
  starsFor,
  type Grade,
  type Stars,
} from './charts';
import { roll2d6, rollDie, type Rng } from './dice';

/** `roll` is the 2d6 total or d6 face that selected `value`; null when no roll was needed. */
export interface Rolled<T> {
  value: T;
  roll: number | null;
}

export interface StandardPlayerRatings {
  age: Rolled<number>;
  total: Rolled<number>;
  split: { offense: number; defense: number; roll: number | null };
  stars: Rolled<Stars>;
  sportsmanship: Rolled<number>;
}

export interface GoaltenderRatings {
  age: Rolled<number>;
  goaltending: Rolled<number>;
  sportsmanship: Rolled<number>;
}

function rolled<T>(rng: Rng, lookup: (roll: number) => T): Rolled<T> {
  const roll = roll2d6(rng);
  return { value: lookup(roll), roll };
}

export function splitTotal(total: number, rng: Rng): StandardPlayerRatings['split'] {
  if (!splitNeedsRoll(total)) return { ...splitFor(total, 1), roll: null };
  const roll = rollDie(rng);
  return { ...splitFor(total, roll), roll };
}

export function controlStars(total: number, rng: Rng): Rolled<Stars> {
  return rolled(rng, (roll) => starsFor(total, roll));
}

function buildStandardPlayer(
  rng: Rng,
  ageOf: (roll: number) => number,
  totalOf: (roll: number) => number,
): StandardPlayerRatings {
  const age = rolled(rng, ageOf);
  const total = rolled(rng, totalOf);
  const split = splitTotal(total.value, rng);
  const stars = controlStars(total.value, rng);
  const sportsmanship = rolled(rng, sportsmanshipFor);
  return { age, total, split, stars, sportsmanship };
}

function buildGoaltender(
  rng: Rng,
  ageOf: (roll: number) => number,
  goaltendingOf: (roll: number) => number,
): GoaltenderRatings {
  const age = rolled(rng, ageOf);
  const goaltending = rolled(rng, goaltendingOf);
  const sportsmanship = rolled(rng, sportsmanshipFor);
  return { age, goaltending, sportsmanship };
}

/** Roll order: age, total, split (skipped for a total of 2), stars, sportsmanship. */
export function generateStandardPlayer(grade: Grade, rng: Rng): StandardPlayerRatings {
  return buildStandardPlayer(rng, initialAge, (roll) => initialTotal(grade, roll));
}

/** Roll order: age, goaltending, sportsmanship. */
export function generateGoaltender(grade: Grade, rng: Rng): GoaltenderRatings {
  return buildGoaltender(rng, initialAge, (roll) => initialGoaltending(grade, roll));
}

export function generateDraftStandardPlayer(rng: Rng): StandardPlayerRatings {
  return buildStandardPlayer(rng, draftAge, draftTotal);
}

export function generateDraftGoaltender(rng: Rng): GoaltenderRatings {
  return buildGoaltender(rng, draftAge, draftGoaltending);
}
