import type { Rng } from './dice';

/** Replays the given d6 faces in order, then throws; for tests. */
export function rngFromDice(...faces: number[]): Rng {
  for (const face of faces) {
    if (!Number.isInteger(face) || face < 1 || face > 6) {
      throw new RangeError(`Not a d6 face: ${face}`);
    }
  }
  let next = 0;
  return () => {
    if (next >= faces.length) throw new Error('Scripted dice exhausted');
    return (faces[next++] - 0.5) / 6;
  };
}
