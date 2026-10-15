import { isPrintCancelled } from './print-cancelled';

describe('isPrintCancelled', () => {
  it('recognizes the iOS cancel error', () => {
    expect(isPrintCancelled(new Error('PrintIncompleteException: Printing did not complete'))).toBe(true);
    expect(isPrintCancelled(Object.assign(new Error('x'), { code: 'ERR_PRINT_INCOMPLETE', name: 'PrintIncompleteException' }))).toBe(true);
  });

  it('does not hide other failures', () => {
    expect(isPrintCancelled(new Error('No printer available'))).toBe(false);
    expect(isPrintCancelled('boom')).toBe(false);
  });
});
