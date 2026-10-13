import { createLatestOnly } from './latest-only';

describe('createLatestOnly', () => {
  it('treats a started task as latest until another starts', () => {
    const latest = createLatestOnly();
    const first = latest.begin();
    expect(first()).toBe(true);
    const second = latest.begin();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it('keeps the newest token valid when an older task finishes last', () => {
    const latest = createLatestOnly();
    const initial = latest.begin();
    const refresh = latest.begin();
    expect([initial(), refresh()]).toEqual([false, true]);
  });

  it('cancel invalidates every token', () => {
    const latest = createLatestOnly();
    const a = latest.begin();
    const b = latest.begin();
    latest.cancel();
    expect([a(), b()]).toEqual([false, false]);
  });

  it('tokens started after a cancel are valid again', () => {
    const latest = createLatestOnly();
    latest.cancel();
    expect(latest.begin()()).toBe(true);
  });
});
