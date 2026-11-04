// TeamDrop dataset generator (BR-DATA-01, BR-DATA-02). Deterministic (seed), inserts directly with SQL into a dev or
// test database, as the owner role. Run from the repository root with Node 24:
//   node db/generator/generate.ts --seed demo --users 10000 --years 2
// Options: --seed <text> (default "teamdrop"), --users <n> (default 10000), --years <n> (default 2),
//          --anchor <YYYY-MM-DD> (last day of history, default today in Europe/Paris),
//          --database-url <url> (default DATABASE_URL_OWNER from .env), --append (allow a database with users),
//          --dry-run (simulate and print the counts, write nothing).
// Requires the reference seeds (sports, levels, municipalities, cheer types, report reasons): npm run db:fixtures.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { type Dataset, type Reference, simulate } from './simulate.ts';

type Args = {
  seed: string;
  users: number;
  years: number;
  anchor: string;
  databaseUrl: string | undefined;
  append: boolean;
  dryRun: boolean;
};

const CHUNK = 5000;
const PASSWORD_HASH = '$argon2id$v=19$m=65536,t=3,p=4$7p7NlqMZGVR2M6tZAaDsmg$pXIGNpVfPzq6voaOdNzqjezIEljhTueot+S4IinV02A';

function parisToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

function parseArgs(argv: string[]): Args {
  const args: Args = { seed: 'teamdrop', users: 10000, years: 2, anchor: parisToday(), databaseUrl: undefined, append: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = (): string => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`Missing value for ${flag}`);
      i += 1;
      return v;
    };
    if (flag === '--seed') args.seed = value();
    else if (flag === '--users') args.users = Number(value());
    else if (flag === '--years') args.years = Number(value());
    else if (flag === '--anchor') args.anchor = value();
    else if (flag === '--database-url') args.databaseUrl = value();
    else if (flag === '--append') args.append = true;
    else if (flag === '--dry-run') args.dryRun = true;
    else throw new Error(`Unknown option ${flag}`);
  }
  if (!Number.isInteger(args.users) || args.users < 10) throw new Error('--users must be an integer >= 10');
  if (!(args.years > 0 && args.years <= 10)) throw new Error('--years must be between 0 and 10');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.anchor)) throw new Error('--anchor must be YYYY-MM-DD');
  return args;
}

/**
 * A column of a bulk insert. `name: null` marks an input-only array (used by expressions of other columns). In `expr`,
 * `{i}` is the i-th input array and `{$k}` the k-th extra parameter.
 */
type Column = { name: string | null; type: string; values: unknown[]; expr?: string };

/** Inserts rows column by column with unnest(): one statement per chunk. */
async function insert(
  client: pg.PoolClient,
  table: string,
  columns: Column[],
  extraParams: unknown[] = [],
): Promise<void> {
  const total = columns[0].values.length;
  const target = columns.filter((c) => c.name !== null);
  const names = target.map((c) => c.name).join(', ');
  const aliases = columns.map((_, i) => `c${i}`).join(', ');
  const unnest = columns.map((c, i) => `$${i + 1}::${c.type}[]`).join(', ');
  const expression = (c: Column): string =>
    (c.expr ?? `{${columns.indexOf(c)}}`)
      .replace(/\{\$(\d+)\}/g, (_, k: string) => `$${columns.length + 1 + Number(k)}`)
      .replace(/\{(\d+)\}/g, (_, i: string) => `c${i}`);
  const select = target.map(expression).join(', ');
  for (let offset = 0; offset < total; offset += CHUNK) {
    const params = columns.map((c) => c.values.slice(offset, offset + CHUNK));
    await client.query(
      `INSERT INTO ${table} (${names}) SELECT ${select} FROM unnest(${unnest}) AS t(${aliases})`,
      [...params, ...extraParams],
    );
  }
}

async function loadReference(client: pg.PoolClient): Promise<Reference> {
  const municipalities = await client.query(`
    SELECT m.id, m.name, m.insee_code AS insee, m.department_code AS department, m.population,
      ST_Y(m.center::geometry) AS lat, ST_X(m.center::geometry) AS lng
    FROM municipality m
    WHERE m.population > 0
      AND NOT EXISTS (SELECT 1 FROM municipality c WHERE c.parent_municipality_id = m.id)
    ORDER BY m.insee_code`);
  const sports = await client.query(`
    SELECT id, code, environment, default_duration_minutes AS duration, default_max_participants AS max
    FROM sport WHERE is_active ORDER BY code`);
  const levels = await client.query('SELECT id, rank FROM skill_level ORDER BY rank');
  const cheerTypes = await client.query('SELECT code FROM cheer_type WHERE is_active ORDER BY sort_order');
  const reasons = await client.query('SELECT id, code FROM report_reason');
  if (municipalities.rowCount === 0 || sports.rowCount === 0 || levels.rowCount !== 4 || cheerTypes.rowCount === 0 || reasons.rowCount === 0) {
    throw new Error('Reference data missing: load the reference seeds first (npm run db:fixtures).');
  }
  return {
    municipalities: municipalities.rows.map((r) => ({ ...r, population: Number(r.population), lat: Number(r.lat), lng: Number(r.lng) })),
    sports: sports.rows.map((r) => ({ ...r, duration: Number(r.duration), max: r.max === null ? null : Number(r.max) })),
    skillLevels: levels.rows.map((r) => ({ id: r.id, rank: Number(r.rank) })),
    cheerTypes: cheerTypes.rows.map((r) => r.code),
    reportReasons: Object.fromEntries(reasons.rows.map((r) => [r.code, r.id])),
  };
}

async function write(client: pg.PoolClient, data: Dataset): Promise<void> {
  const encryptionKey = process.env.DATA_ENCRYPTION_KEY;
  const hmacKey = process.env.DATA_HMAC_KEY;
  if (!encryptionKey || !hmacKey) throw new Error('DATA_ENCRYPTION_KEY and DATA_HMAC_KEY are required (see .env.example).');
  const u = data.users;
  // Emails and birth dates are encrypted, the email hash is the keyed HMAC, as the data layer does (BR-ACC-04).
  await insert(client, 'user_account', [
    { name: 'id', type: 'uuid', values: u.map((x) => x.id) },
    { name: 'username', type: 'text', values: u.map((x) => x.username) },
    { name: 'email_ciphertext', type: 'text', values: u.map((x) => x.email), expr: 'pgp_sym_encrypt(lower({2}), {$0}::text)' },
    { name: 'email_hash', type: 'text', values: u.map((x) => x.email), expr: "hmac(lower({3}), {$1}::text, 'sha256')" },
    { name: 'email_verified_at', type: 'timestamptz', values: u.map((x) => x.createdAt) },
    { name: 'first_name', type: 'text', values: u.map((x) => x.firstName) },
    { name: 'birth_date_ciphertext', type: 'text', values: u.map((x) => x.birthDate), expr: 'pgp_sym_encrypt({6}, {$0}::text)' },
    { name: 'gender', type: 'gender', values: u.map((x) => x.gender) },
    { name: 'municipality_id', type: 'uuid', values: u.map((x) => x.municipalityId) },
    { name: 'role', type: 'user_role', values: u.map((x) => x.role) },
    { name: 'created_at', type: 'timestamptz', values: u.map((x) => x.createdAt) },
    { name: 'last_active_at', type: 'timestamptz', values: u.map((x) => x.lastActiveAt) },
    { name: 'inactivity_warned_at', type: 'timestamptz', values: u.map((x) => x.inactivityWarnedAt) },
    { name: 'deletion_requested_at', type: 'timestamptz', values: u.map((x) => x.deletionRequestedAt) },
  ], [encryptionKey, hmacKey]);
  await insert(client, 'auth_identity', [
    { name: 'user_id', type: 'uuid', values: u.map((x) => x.id) },
    { name: 'provider', type: 'auth_provider', values: u.map(() => 'password') },
    { name: 'password_hash', type: 'text', values: u.map(() => PASSWORD_HASH) },
  ]);
  await insert(client, 'user_setting', [
    { name: 'user_id', type: 'uuid', values: u.map((x) => x.id) },
    { name: 'hide_from_rankings', type: 'boolean', values: u.map((x) => x.hideFromRankings) },
    { name: 'is_private_account', type: 'boolean', values: u.map((x) => x.isPrivate) },
  ]);
  await insert(client, 'user_sport', [
    { name: 'user_id', type: 'uuid', values: data.userSports.map((x) => x.userId) },
    { name: 'sport_id', type: 'uuid', values: data.userSports.map((x) => x.sportId) },
    { name: 'skill_level_id', type: 'uuid', values: data.userSports.map((x) => x.levelId) },
  ]);
  await insert(client, 'follow', [
    { name: 'follower_id', type: 'uuid', values: data.follows.map((x) => x.followerId) },
    { name: 'followed_id', type: 'uuid', values: data.follows.map((x) => x.followedId) },
    { name: 'status', type: 'follow_status', values: data.follows.map((x) => x.status) },
    { name: 'created_at', type: 'timestamptz', values: data.follows.map((x) => x.createdAt) },
    { name: 'accepted_at', type: 'timestamptz', values: data.follows.map((x) => x.createdAt) },
  ]);
  await insert(client, 'user_block', [
    { name: 'blocker_id', type: 'uuid', values: data.blocks.map((x) => x.blockerId) },
    { name: 'blocked_id', type: 'uuid', values: data.blocks.map((x) => x.blockedId) },
    { name: 'created_at', type: 'timestamptz', values: data.blocks.map((x) => x.createdAt) },
  ]);
  // Circles and communities: their chats are created by trigger (BR-SOC-08, BR-SOC-09).
  await insert(client, 'circle', [
    { name: 'id', type: 'uuid', values: data.circles.map((x) => x.id) },
    { name: 'name', type: 'text', values: data.circles.map((x) => x.name) },
    { name: 'created_at', type: 'timestamptz', values: data.circles.map((x) => x.createdAt) },
  ]);
  await insert(client, 'circle_member', [
    { name: 'circle_id', type: 'uuid', values: data.circleMembers.map((x) => x.circleId) },
    { name: 'user_id', type: 'uuid', values: data.circleMembers.map((x) => x.userId) },
    { name: 'role', type: 'circle_role', values: data.circleMembers.map((x) => x.role) },
    { name: 'joined_at', type: 'timestamptz', values: data.circleMembers.map((x) => x.joinedAt) },
  ]);
  await insert(client, 'community', [
    { name: 'id', type: 'uuid', values: data.communities.map((x) => x.id) },
    { name: 'name', type: 'text', values: data.communities.map((x) => x.name) },
    { name: 'join_policy', type: 'community_join_policy', values: data.communities.map((x) => x.joinPolicy) },
    { name: 'created_at', type: 'timestamptz', values: data.communities.map((x) => x.createdAt) },
  ]);
  await insert(client, 'community_member', [
    { name: 'community_id', type: 'uuid', values: data.communityMembers.map((x) => x.communityId) },
    { name: 'user_id', type: 'uuid', values: data.communityMembers.map((x) => x.userId) },
    { name: 'role', type: 'community_role', values: data.communityMembers.map((x) => x.role) },
    { name: 'joined_at', type: 'timestamptz', values: data.communityMembers.map((x) => x.joinedAt) },
  ]);
  const e = data.events;
  await insert(client, 'event', [
    { name: 'id', type: 'uuid', values: e.map((x) => x.id) },
    { name: 'owner_id', type: 'uuid', values: e.map((x) => x.ownerId) },
    { name: 'sport_id', type: 'uuid', values: e.map((x) => x.sportId) },
    { name: 'title', type: 'text', values: e.map((x) => x.title) },
    { name: 'skill_level_min_id', type: 'uuid', values: e.map((x) => x.levelMinId) },
    { name: 'skill_level_max_id', type: 'uuid', values: e.map((x) => x.levelMaxId) },
    { name: 'adults_only', type: 'boolean', values: e.map((x) => x.adultsOnly) },
    { name: 'min_participants', type: 'int', values: e.map((x) => x.minParticipants) },
    { name: 'max_participants', type: 'int', values: e.map((x) => x.maxParticipants) },
    { name: 'registration_mode', type: 'registration_mode', values: e.map((x) => x.registrationMode) },
    { name: 'address', type: 'text', values: e.map((x) => x.address) },
    { name: 'municipality_id', type: 'uuid', values: e.map((x) => x.municipalityId) },
    { name: 'location', type: 'float8', values: e.map((x) => x.lng), expr: 'ST_SetSRID(ST_MakePoint({12}, {22}), 4326)::geography' },
    { name: 'location_hidden', type: 'boolean', values: e.map((x) => x.locationHidden) },
    { name: 'start_date', type: 'date', values: e.map((x) => x.startDate) },
    { name: 'start_time', type: 'time', values: e.map((x) => x.startTime) },
    { name: 'duration_minutes', type: 'int', values: e.map((x) => x.duration) },
    { name: 'recurrence_rule', type: 'text', values: e.map((x) => x.rule) },
    { name: 'recurrence_until', type: 'date', values: e.map((x) => x.until) },
    { name: 'status', type: 'event_status', values: e.map((x) => x.status) },
    { name: 'published_at', type: 'timestamptz', values: e.map((x) => x.publishedAt) },
    { name: 'created_at', type: 'timestamptz', values: e.map((x) => x.createdAt) },
    // Input only: the latitude of the location (column 12 holds the longitude).
    { name: null, type: 'float8', values: e.map((x) => x.lat) },
  ]);
  const o = data.occurrences;
  await insert(client, 'event_occurrence', [
    { name: 'id', type: 'uuid', values: o.map((x) => x.id) },
    { name: 'event_id', type: 'uuid', values: o.map((x) => x.eventId) },
    { name: 'original_starts_at', type: 'timestamptz', values: o.map((x) => x.startsAt) },
    { name: 'starts_at', type: 'timestamptz', values: o.map((x) => x.startsAt) },
    { name: 'status', type: 'occurrence_status', values: o.map((x) => x.status) },
    { name: 'completed_at', type: 'timestamptz', values: o.map((x) => x.completedAt) },
    { name: 'cancelled_at', type: 'timestamptz', values: o.map((x) => x.cancelledAt) },
    { name: 'cancelled_by_id', type: 'uuid', values: o.map((x) => x.cancelledById) },
    { name: 'created_at', type: 'timestamptz', values: o.map((x) => x.createdAt) },
  ]);
  const r = data.registrations;
  await insert(client, 'registration', [
    { name: 'id', type: 'uuid', values: r.map((x) => x.id) },
    { name: 'occurrence_id', type: 'uuid', values: r.map((x) => x.occurrenceId) },
    { name: 'user_id', type: 'uuid', values: r.map((x) => x.userId) },
    { name: 'status', type: 'registration_status', values: r.map((x) => x.status) },
    { name: 'is_late_cancellation', type: 'boolean', values: r.map((x) => x.isLate) },
    { name: 'attendance', type: 'attendance_status', values: r.map((x) => x.attendance) },
    { name: 'attendance_set_at', type: 'timestamptz', values: r.map((x) => (x.attendance === null ? null : x.confirmedAt)) },
    { name: 'created_at', type: 'timestamptz', values: r.map((x) => x.createdAt) },
    { name: 'confirmed_at', type: 'timestamptz', values: r.map((x) => x.confirmedAt) },
    { name: 'cancelled_at', type: 'timestamptz', values: r.map((x) => x.cancelledAt) },
  ]);
  await insert(client, 'registration_guest', [
    { name: 'id', type: 'uuid', values: data.guests.map((x) => x.id) },
    { name: 'registration_id', type: 'uuid', values: data.guests.map((x) => x.registrationId) },
    { name: 'display_name', type: 'text', values: data.guests.map((x) => x.displayName) },
    { name: 'created_at', type: 'timestamptz', values: data.guests.map((x) => x.createdAt) },
  ]);
  await insert(client, 'conversation', [
    { name: 'id', type: 'uuid', values: data.conversations.map((x) => x.id) },
    { name: 'kind', type: 'conversation_kind', values: data.conversations.map(() => 'occurrence') },
    { name: 'occurrence_id', type: 'uuid', values: data.conversations.map((x) => x.occurrenceId) },
    { name: 'created_at', type: 'timestamptz', values: data.conversations.map((x) => x.createdAt) },
  ]);
  const m = data.messages;
  const target = (key: 'occurrenceConversationId' | 'circleId' | 'communityId') =>
    m.map((x) => (key in x.target ? (x.target as Record<string, string>)[key] : null));
  await insert(client, 'message', [
    { name: 'id', type: 'uuid', values: m.map((x) => x.id) },
    {
      name: 'conversation_id', type: 'uuid', values: target('occurrenceConversationId'),
      expr: 'COALESCE({1}, (SELECT id FROM conversation WHERE circle_id = {6}), (SELECT id FROM conversation WHERE community_id = {7}))',
    },
    { name: 'sender_id', type: 'uuid', values: m.map((x) => x.senderId) },
    { name: 'client_message_id', type: 'uuid', values: m.map((x) => x.clientMessageId) },
    { name: 'body', type: 'text', values: m.map((x) => x.body) },
    { name: 'created_at', type: 'timestamptz', values: m.map((x) => x.createdAt) },
    { name: null, type: 'uuid', values: target('circleId') },
    { name: null, type: 'uuid', values: target('communityId') },
  ]);
  await insert(client, 'cheer', [
    { name: 'id', type: 'uuid', values: data.cheers.map((x) => x.id) },
    { name: 'occurrence_id', type: 'uuid', values: data.cheers.map((x) => x.occurrenceId) },
    { name: 'giver_id', type: 'uuid', values: data.cheers.map((x) => x.giverId) },
    { name: 'recipient_id', type: 'uuid', values: data.cheers.map((x) => x.recipientId) },
    { name: 'cheer_type_id', type: 'text', values: data.cheers.map((x) => x.cheerTypeCode), expr: '(SELECT id FROM cheer_type WHERE code = {4})' },
    { name: 'created_at', type: 'timestamptz', values: data.cheers.map((x) => x.createdAt) },
  ]);
  await insert(client, 'report', [
    { name: 'id', type: 'uuid', values: data.reports.map((x) => x.id) },
    { name: 'reporter_id', type: 'uuid', values: data.reports.map((x) => x.reporterId) },
    { name: 'report_reason_id', type: 'text', values: data.reports.map((x) => x.reasonCode), expr: '(SELECT id FROM report_reason WHERE code = {2})' },
    { name: 'target_user_id', type: 'uuid', values: data.reports.map((x) => x.targetUserId) },
    { name: 'target_event_id', type: 'uuid', values: data.reports.map((x) => x.targetEventId) },
    { name: 'status', type: 'report_status', values: data.reports.map((x) => x.status) },
    { name: 'created_at', type: 'timestamptz', values: data.reports.map((x) => x.createdAt) },
    { name: 'assigned_at', type: 'timestamptz', values: data.reports.map((x) => (x.status === 'open' ? null : x.createdAt)) },
    { name: 'closed_at', type: 'timestamptz', values: data.reports.map((x) => x.closedAt) },
    { name: 'resolution_note', type: 'text', values: data.reports.map((x) => (x.closedAt === null ? null : 'Handled (generated).')) },
  ]);
  await insert(client, 'user_sanction', [
    { name: 'id', type: 'uuid', values: data.sanctions.map((x) => x.id) },
    { name: 'user_id', type: 'uuid', values: data.sanctions.map((x) => x.userId) },
    { name: 'kind', type: 'sanction_kind', values: data.sanctions.map((x) => x.kind) },
    { name: 'reason', type: 'text', values: data.sanctions.map((x) => x.reason) },
    { name: 'report_id', type: 'uuid', values: data.sanctions.map((x) => x.reportId) },
    { name: 'starts_at', type: 'timestamptz', values: data.sanctions.map((x) => x.startsAt) },
    { name: 'ends_at', type: 'timestamptz', values: data.sanctions.map((x) => x.endsAt) },
    { name: 'created_at', type: 'timestamptz', values: data.sanctions.map((x) => x.startsAt) },
  ]);
  // BR-MOD-04: permanent bans keep the email hash.
  await client.query(`
    INSERT INTO banned_identity (identity_kind, identity_hash)
    SELECT 'email', u.email_hash FROM user_sanction s JOIN user_account u ON u.id = s.user_id
    WHERE s.kind = 'permanent_ban'
    ON CONFLICT DO NOTHING`);
}

async function main(): Promise<void> {
  const rootEnv = resolve(import.meta.dirname, '../../.env');
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
  const args = parseArgs(process.argv.slice(2));
  const url = args.databaseUrl ?? process.env.DATABASE_URL_OWNER;
  if (!url) throw new Error('No database: pass --database-url or set DATABASE_URL_OWNER (.env).');

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    const db = (await client.query('SELECT current_database() AS name')).rows[0].name as string;
    // Safety: the generator only writes into local dev or test databases.
    if (!/_(dev|test)$/.test(db)) throw new Error(`Refusing to write into "${db}": dev or test databases only.`);
    const existing = Number((await client.query('SELECT count(*) AS n FROM user_account')).rows[0].n);
    if (existing > 100 && !args.append) {
      throw new Error(`"${db}" already has ${existing} users. Use a fresh database, or pass --append.`);
    }
    const started = Date.now();
    const reference = await loadReference(client);
    const data = simulate(reference, { seed: args.seed, users: args.users, years: args.years, anchor: args.anchor });
    console.log(`Simulated in ${((Date.now() - started) / 1000).toFixed(1)} s:`, JSON.stringify(data.stats));
    if (args.dryRun) return;

    await client.query('BEGIN');
    await write(client, data);
    await client.query('COMMIT');
    console.log(`Written in ${((Date.now() - started) / 1000).toFixed(1)} s.`);

    // Deleted accounts past their grace period are erased by the database function (BR-GDP-03 to BR-GDP-05).
    const erased = data.users.filter((u) => u.erase).map((u) => u.id);
    for (const userId of erased) await client.query('SELECT erase_user_account($1::uuid)', [userId]);
    // Anonymous aggregates over the whole history (BR-STA-06 to BR-STA-10), as the nightly jobs would.
    await client.query(`SELECT refresh_heatmap('2000-01-01'), refresh_sport_activity_daily('2000-01-01'),
      refresh_user_city_activity('2000-01-01'), refresh_platform_daily_stat($1::date - ($2::int * 366))`, [args.anchor, Math.ceil(args.years)]);
    console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)} s (${erased.length} accounts erased, aggregates refreshed).`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  // DEBUG=1 prints the stack trace.
  console.error(err instanceof Error ? (process.env.DEBUG ? err.stack : err.message) : err);
  process.exitCode = 1;
});
