/**
 * Types entrypoint
 */

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

export interface Identifiable {
  id: string;
}

export interface Timestamped {
  createdAt: Date;
  updatedAt: Date;
}
