import { type RawBuilder, sql } from 'kysely';

/**
 * Gives a SQL fragment (for example a crypto helper, which is typed `unknown`) the TypeScript type of its value.
 * Only the type changes; the SQL is the same.
 */
export function asType<T>(expression: RawBuilder<unknown>): RawBuilder<T> {
  return sql<T>`${expression}`;
}

/** Escapes the LIKE wildcards (`%`, `_`) and the escape character so user input matches literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
