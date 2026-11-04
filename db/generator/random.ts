// Deterministic randomness for the dataset generator (BR-DATA-01): every draw comes from one seeded PRNG, so a seed
// always produces the same dataset. Never use Math.random() or the clock in the generator.

/** sfc32 PRNG (small, fast, good statistical quality), seeded from a string. */
export class Random {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string) {
    // xmur3 string hash to four 32-bit states.
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i += 1) {
      h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    const next = (): number => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
    this.a = next();
    this.b = next();
    this.c = next();
    this.d = next();
    for (let i = 0; i < 15; i += 1) this.next();
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** One element, uniformly. */
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Normal draw (Box-Muller), clamped to [min, max]. */
  normal(mean: number, sd: number, min: number, max: number): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.min(max, Math.max(min, mean + z * sd));
  }

  /** `count` distinct elements (or all of them when fewer), in random order. */
  sample<T>(items: readonly T[], count: number): T[] {
    const copy = [...items];
    const n = Math.min(count, copy.length);
    for (let i = 0; i < n; i += 1) {
      const j = i + Math.floor(this.next() * (copy.length - i));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  }
}

/** Weighted choice in O(log n) after an O(n) build. */
export class WeightedPicker<T> {
  private readonly cumulative: number[] = [];
  private readonly total: number;
  private readonly items: readonly T[];

  constructor(items: readonly T[], weight: (item: T) => number) {
    this.items = items;
    let sum = 0;
    for (const item of items) {
      sum += Math.max(0, weight(item));
      this.cumulative.push(sum);
    }
    this.total = sum;
  }

  get size(): number {
    return this.items.length;
  }

  pick(random: Random): T {
    const target = random.next() * this.total;
    let low = 0;
    let high = this.cumulative.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.cumulative[mid] <= target) low = mid + 1;
      else high = mid;
    }
    return this.items[low];
  }
}

const HEX = '0123456789abcdef';

/**
 * A UUID v7 for an instant, with its random part drawn from the seeded PRNG. Like the dev fixtures, the generator
 * writes explicit ids so a seed always produces the same ids; they stay time-ordered like the database's uuidv7().
 */
export function uuidv7At(instant: Date, random: Random): string {
  const ms = Math.max(0, Math.floor(instant.getTime()));
  let hex = ms.toString(16).padStart(12, '0').slice(-12);
  hex += '7';
  for (let i = 0; i < 3; i += 1) hex += HEX[random.int(0, 15)];
  hex += HEX[8 + random.int(0, 3)];
  for (let i = 0; i < 15; i += 1) hex += HEX[random.int(0, 15)];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
