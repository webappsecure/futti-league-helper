import { isTwoPane } from './master-detail-layout';

describe('isTwoPane', () => {
  it('is single pane below 768', () => {
    expect(isTwoPane(767)).toBe(false);
  });
  it('is two pane at 768 and above', () => {
    expect(isTwoPane(768)).toBe(true);
    expect(isTwoPane(1280)).toBe(true);
  });
});
