/** Lets only the most recently started async task apply its result. */
export function createLatestOnly() {
  let current = 0;
  return {
    begin(): () => boolean {
      const mine = ++current;
      return () => mine === current;
    },
    cancel(): void {
      current += 1;
    },
  };
}
