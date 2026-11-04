import { DataError, InternalDataError } from '../errors';

const CONSTRAINT_VIOLATION_CODES = new Set([
  '23505', // unique_violation
  '23514', // check_violation
  '23P01', // exclusion_violation
  '23503', // foreign_key_violation
  '23001', // restrict_violation (ON DELETE RESTRICT)
]);

/** True when `err` looks like a PostgreSQL driver error (has a SQLSTATE `code`). */
export function isPgError(
  err: unknown,
): err is { code: string; constraint?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof err.code === 'string'
  );
}

/**
 * Converts any error raised while running a query into a `DataError`.
 * - A `DataError` is returned unchanged.
 * - A unique, check, exclusion or foreign key violation whose constraint name is a key of
 *   `byConstraint` is mapped to the typed error built by that factory.
 * - Anything else becomes an `InternalDataError`. SQL and parameters are never included.
 */
export function mapDbError(
  err: unknown,
  byConstraint: Record<string, () => DataError> = {},
): DataError {
  if (err instanceof DataError) {
    return err;
  }
  if (
    isPgError(err) &&
    CONSTRAINT_VIOLATION_CODES.has(err.code) &&
    err.constraint !== undefined &&
    Object.prototype.hasOwnProperty.call(byConstraint, err.constraint)
  ) {
    return byConstraint[err.constraint]();
  }
  return new InternalDataError();
}
