export type Result<T> = { ok: true; value: T } | { ok: false; error: Error };

export type Op =
  | { type: 'put'; collection: string; id: string; value: unknown }
  | { type: 'delete'; collection: string; id: string };

export interface Database {
  get<T>(collection: string, id: string): Promise<Result<T | null>>;
  list<T>(collection: string): Promise<Result<{ id: string; value: T }[]>>;
  /** Applies every op or none of them. */
  batch(ops: Op[]): Promise<Result<void>>;
}

export function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(e: unknown): Result<T> {
  return { ok: false, error: toError(e) };
}

/** Serializes every put up front so a bad value fails the whole batch before anything is written. */
export type PreparedOp =
  | { type: 'put'; collection: string; id: string; json: string }
  | { type: 'delete'; collection: string; id: string };

export function prepareOps(ops: Op[]): PreparedOp[] {
  return ops.map((op) =>
    op.type === 'put'
      ? { type: 'put', collection: op.collection, id: op.id, json: JSON.stringify(op.value) }
      : op,
  );
}
