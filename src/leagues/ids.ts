export function createId(
  now: () => number = Date.now,
  random: () => number = Math.random,
): string {
  const time = Math.floor(now()).toString(36);
  const salt = Math.floor(random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0');
  return `${time}-${salt}`;
}
