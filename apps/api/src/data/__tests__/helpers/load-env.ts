import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

// helpers -> __tests__ -> data -> src -> api -> apps -> repository root
const rootEnvFile = resolve(__dirname, '../../../../../../.env');

// Jest gives each test file its own copy of `process.env`, so `process.loadEnvFile` (which writes
// to the real environment) would not be visible to the tests. Parse the file into the copy instead.
// Like loadEnvFile, existing variables are never overridden.
if (existsSync(rootEnvFile)) {
  const values = parseEnv(readFileSync(rootEnvFile, 'utf8'));
  for (const [name, value] of Object.entries(values)) {
    process.env[name] ??= value;
  }
}
