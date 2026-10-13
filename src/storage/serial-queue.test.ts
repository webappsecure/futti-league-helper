import { createSerialQueue } from './serial-queue';

describe('createSerialQueue', () => {
  it('runs tasks in order without overlapping', async () => {
    const enqueue = createSerialQueue();
    const log: string[] = [];
    const task = (name: string, ms: number) => async () => {
      log.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`end ${name}`);
      return name;
    };
    const results = await Promise.all([enqueue(task('a', 20)), enqueue(task('b', 1))]);
    expect(results).toEqual(['a', 'b']);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b']);
  });

  it('keeps running after a task rejects', async () => {
    const enqueue = createSerialQueue();
    const failing = enqueue(async () => {
      throw new Error('boom');
    });
    await expect(failing).rejects.toThrow('boom');
    await expect(enqueue(async () => 'next')).resolves.toBe('next');
  });
});
