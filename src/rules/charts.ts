// Transcribed from blueprint/reference/futti-program-specs.txt; rows keep the spec's layout so they can be proofread.

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export type Stars = 0 | 1 | 2;

export const GRADES: readonly Grade[] = ['A', 'B', 'C', 'D', 'F'];

const GRADE_COLUMN: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 3, F: 4 };

type GradeRow = readonly [number, number, number, number, number];

// Index 0 is a 2d6 roll of 2, index 10 is a roll of 12.
const INITIAL_AGE = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30] as const;

const DRAFT_AGE = [18, 18, 19, 19, 20, 20, 20, 21, 21, 22, 22] as const;

// Columns: A, B, C, D, F
const INITIAL_TOTAL: readonly GradeRow[] = [
  [2, 4, 5, 8, 4], // 2
  [3, 2, 5, 4, 5], // 3
  [6, 3, 2, 6, 4], // 4
  [4, 4, 3, 2, 3], // 5
  [7, 6, 5, 4, 4], // 6
  [5, 5, 4, 3, 2], // 7
  [6, 7, 6, 5, 5], // 8
  [7, 8, 7, 5, 3], // 9
  [8, 6, 8, 7, 6], // 10
  [8, 7, 6, 6, 7], // 11
  [8, 5, 7, 8, 8], // 12
];

const DRAFT_TOTAL = [8, 4, 6, 2, 4, 3, 4, 4, 7, 6, 8] as const;

// Columns: A, B, C, D, F
const INITIAL_GOALTENDING: readonly GradeRow[] = [
  [36, 35, 34, 33, 32], // 2
  [36, 35, 34, 33, 32], // 3
  [41, 36, 35, 34, 33], // 4
  [41, 36, 35, 34, 33], // 5
  [42, 41, 36, 35, 34], // 6
  [43, 42, 41, 36, 35], // 7
  [44, 43, 42, 41, 36], // 8
  [45, 44, 43, 42, 41], // 9
  [45, 44, 43, 42, 41], // 10
  [46, 45, 44, 43, 42], // 11
  [46, 45, 44, 43, 42], // 12
];

const DRAFT_GOALTENDING = [31, 32, 33, 34, 35, 36, 41, 42, 43, 44, 45] as const;

interface Band<T> {
  upTo: number;
  value: T;
}

const SPORTSMANSHIP: readonly Band<number>[] = [
  { upTo: 3, value: 1 },
  { upTo: 5, value: 2 },
  { upTo: 8, value: 3 },
  { upTo: 10, value: 4 },
  { upTo: 12, value: 5 },
];

export interface Split {
  offense: number;
  defense: number;
}

// d6 bands per total of offense and defense.
const SPLIT: Record<number, readonly Band<Split>[]> = {
  2: [{ upTo: 6, value: { offense: 1, defense: 1 } }],
  3: [
    { upTo: 3, value: { offense: 2, defense: 1 } },
    { upTo: 6, value: { offense: 1, defense: 2 } },
  ],
  4: [
    { upTo: 4, value: { offense: 2, defense: 2 } },
    { upTo: 5, value: { offense: 3, defense: 1 } },
    { upTo: 6, value: { offense: 1, defense: 3 } },
  ],
  5: [
    { upTo: 2, value: { offense: 3, defense: 2 } },
    { upTo: 4, value: { offense: 2, defense: 3 } },
    { upTo: 5, value: { offense: 4, defense: 1 } },
    { upTo: 6, value: { offense: 1, defense: 4 } },
  ],
  6: [
    { upTo: 2, value: { offense: 3, defense: 3 } },
    { upTo: 3, value: { offense: 4, defense: 2 } },
    { upTo: 4, value: { offense: 2, defense: 4 } },
    { upTo: 5, value: { offense: 5, defense: 1 } },
    { upTo: 6, value: { offense: 1, defense: 5 } },
  ],
  7: [
    { upTo: 2, value: { offense: 4, defense: 3 } },
    { upTo: 4, value: { offense: 3, defense: 4 } },
    { upTo: 5, value: { offense: 5, defense: 2 } },
    { upTo: 6, value: { offense: 2, defense: 5 } },
  ],
  8: [
    { upTo: 4, value: { offense: 4, defense: 4 } },
    { upTo: 5, value: { offense: 5, defense: 3 } },
    { upTo: 6, value: { offense: 3, defense: 5 } },
  ],
};

// 2d6 bands per total of offense and defense.
const STARS: Record<number, readonly Band<Stars>[]> = {
  2: [
    { upTo: 2, value: 1 },
    { upTo: 12, value: 0 },
  ],
  3: [
    { upTo: 3, value: 1 },
    { upTo: 12, value: 0 },
  ],
  4: [
    { upTo: 2, value: 2 },
    { upTo: 4, value: 1 },
    { upTo: 12, value: 0 },
  ],
  5: [
    { upTo: 2, value: 2 },
    { upTo: 5, value: 1 },
    { upTo: 12, value: 0 },
  ],
  6: [
    { upTo: 3, value: 2 },
    { upTo: 6, value: 1 },
    { upTo: 12, value: 0 },
  ],
  7: [
    { upTo: 3, value: 2 },
    { upTo: 7, value: 1 },
    { upTo: 12, value: 0 },
  ],
  8: [
    { upTo: 4, value: 2 },
    { upTo: 8, value: 1 },
    { upTo: 12, value: 0 },
  ],
};

function assertRoll(roll: number, min: number, max: number, what: string): void {
  if (!Number.isInteger(roll) || roll < min || roll > max) {
    throw new RangeError(`${what} roll must be an integer from ${min} to ${max}, got ${roll}`);
  }
}

function fromBands<T>(bands: readonly Band<T>[], roll: number): T {
  const band = bands.find((b) => roll <= b.upTo);
  if (!band) throw new RangeError(`Roll ${roll} is outside the chart`);
  return band.value;
}

function assertGrade(grade: string): asserts grade is Grade {
  if (!GRADES.includes(grade as Grade)) throw new RangeError(`Unknown grade: ${grade}`);
}

function twoD6<T>(table: readonly T[], roll: number, what: string): T {
  assertRoll(roll, 2, 12, what);
  return table[roll - 2];
}

export function initialAge(roll: number): number {
  return twoD6(INITIAL_AGE, roll, 'Age');
}

export function draftAge(roll: number): number {
  return twoD6(DRAFT_AGE, roll, 'Draft age');
}

export function initialTotal(grade: Grade, roll: number): number {
  assertGrade(grade);
  return twoD6(INITIAL_TOTAL, roll, 'Total')[GRADE_COLUMN[grade]];
}

export function draftTotal(roll: number): number {
  return twoD6(DRAFT_TOTAL, roll, 'Draft total');
}

export function splitNeedsRoll(total: number): boolean {
  assertTotal(total);
  return total !== 2;
}

function assertTotal(total: number): void {
  if (!Number.isInteger(total) || total < 2 || total > 8) {
    throw new RangeError(`Total of offense and defense must be 2 to 8, got ${total}`);
  }
}

/** `roll` is a d6; it is ignored for a total of 2, which always splits 1 and 1. */
export function splitFor(total: number, roll: number): Split {
  assertTotal(total);
  assertRoll(roll, 1, 6, 'Split');
  return { ...fromBands(SPLIT[total], roll) };
}

export function starsFor(total: number, roll: number): Stars {
  assertTotal(total);
  assertRoll(roll, 2, 12, 'Stars');
  return fromBands(STARS[total], roll);
}

export function sportsmanshipFor(roll: number): number {
  assertRoll(roll, 2, 12, 'Sportsmanship');
  return fromBands(SPORTSMANSHIP, roll);
}

export function initialGoaltending(grade: Grade, roll: number): number {
  assertGrade(grade);
  return twoD6(INITIAL_GOALTENDING, roll, 'Goaltending')[GRADE_COLUMN[grade]];
}

export function draftGoaltending(roll: number): number {
  return twoD6(DRAFT_GOALTENDING, roll, 'Draft goaltending');
}
