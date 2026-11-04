// Checks BR-DATA-01: the same seed and anchor give the same dataset, ids included; another seed gives another one.
// Run: node db/generator/check-determinism.ts (no database needed).
import { createHash } from 'node:crypto';
import { type Reference, simulate } from './simulate.ts';

const municipalities = Array.from({ length: 60 }, (_, i) => ({
  id: `00000000-0000-7000-8000-${String(i).padStart(12, '0')}`,
  name: `Town ${i}`,
  insee: String(10000 + i),
  department: i < 20 ? '69' : String(10 + (i % 5)),
  population: 1000 * (i + 1),
  lat: 45 + i / 100,
  lng: 4 + i / 100,
}));
const reference: Reference = {
  municipalities,
  sports: [
    { id: 's-football', code: 'football', environment: 'outdoor', duration: 90, max: 14 },
    { id: 's-tennis', code: 'tennis', environment: 'both', duration: 60, max: 4 },
    { id: 's-chess', code: 'chess', environment: 'indoor', duration: 60, max: 2 },
  ],
  skillLevels: [1, 2, 3, 4].map((rank) => ({ id: `l-${rank}`, rank })),
  cheerTypes: ['fair_play', 'punctual'],
  reportReasons: { spam: 'r-spam' },
};
const digest = (seed: string): string =>
  createHash('sha256')
    .update(JSON.stringify(simulate(reference, { seed, users: 800, years: 1, anchor: '2026-06-01' })))
    .digest('hex');

const a = digest('alpha');
const b = digest('alpha');
const c = digest('beta');
if (a !== b) throw new Error('Same seed, different datasets: the generator is not deterministic');
if (a === c) throw new Error('Different seeds gave the same dataset');
console.log(`Deterministic: ${a.slice(0, 16)} (seed alpha, twice); seed beta differs.`);
