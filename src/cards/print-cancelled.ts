/** iOS rejects `printAsync` with `PrintIncompleteException` when the user dismisses the print dialog. */
export function isPrintCancelled(e: unknown): boolean {
  const text = e instanceof Error ? `${e.name} ${e.message} ${(e as { code?: string }).code ?? ''}` : String(e);
  return /PrintIncomplete|Printing did not complete/i.test(text);
}
