/** Reads a required environment variable. Throws a clear error when it is missing or empty. */
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}
