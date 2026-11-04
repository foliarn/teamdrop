// Simulation of TeamDrop activity (BR-DATA-02): users all over metropolitan France weighted by population, organizers
// and their weekly series and one-off sessions, registrations with attendance, late cancellations and guests, social
// graph, chats, cheers, moderation and GDPR cases. Pure and deterministic: rows are built in memory from the reference
// data and the seed, then written by generate.ts.
import { Random, WeightedPicker, uuidv7At } from './random.ts';

export type Municipality = {
  id: string;
  name: string;
  insee: string;
  department: string;
  population: number;
  lat: number;
  lng: number;
};
export type Sport = { id: string; code: string; environment: 'indoor' | 'outdoor' | 'both'; duration: number; max: number | null };
export type Reference = {
  municipalities: Municipality[];
  sports: Sport[];
  skillLevels: { id: string; rank: number }[];
  cheerTypes: string[];
  reportReasons: Record<string, string>;
};

export type Options = {
  seed: string;
  users: number;
  years: number;
  /** Local date the history ends at (today by default), 'YYYY-MM-DD'. */
  anchor: string;
};

type Profile = 'regular' | 'casual' | 'rare' | 'serial_no_show' | 'abusive_organizer';

export type UserRow = {
  id: string;
  username: string;
  email: string;
  firstName: string;
  birthDate: string;
  gender: string | null;
  municipalityId: string;
  role: string;
  createdAt: Date;
  lastActiveAt: Date | null;
  inactivityWarnedAt: Date | null;
  deletionRequestedAt: Date | null;
  hideFromRankings: boolean;
  isPrivate: boolean;
  // Simulation only:
  profile: Profile;
  department: string;
  sports: string[];
  activeUntil: Date;
  erase: boolean;
  /** Local date of the 18th birthday: before it, the user is a minor (BR-ACC-03, BR-EVT-11). */
  adultFrom: string;
};

export type Dataset = {
  users: UserRow[];
  userSports: { userId: string; sportId: string; levelId: string }[];
  follows: { followerId: string; followedId: string; status: string; createdAt: Date }[];
  blocks: { blockerId: string; blockedId: string; createdAt: Date }[];
  circles: { id: string; name: string; createdAt: Date }[];
  circleMembers: { circleId: string; userId: string; role: string; joinedAt: Date }[];
  communities: { id: string; name: string; joinPolicy: string; createdAt: Date }[];
  communityMembers: { communityId: string; userId: string; role: string; joinedAt: Date }[];
  events: EventRow[];
  occurrences: OccurrenceRow[];
  registrations: RegistrationRow[];
  guests: { id: string; registrationId: string; displayName: string | null; createdAt: Date }[];
  conversations: { id: string; occurrenceId: string; createdAt: Date }[];
  messages: {
    id: string;
    target: { occurrenceConversationId: string } | { circleId: string } | { communityId: string };
    senderId: string;
    clientMessageId: string;
    body: string;
    createdAt: Date;
  }[];
  cheers: { id: string; occurrenceId: string; giverId: string; recipientId: string; cheerTypeCode: string; createdAt: Date }[];
  reports: {
    id: string;
    reporterId: string;
    reasonCode: string;
    targetUserId: string | null;
    targetEventId: string | null;
    status: string;
    createdAt: Date;
    closedAt: Date | null;
  }[];
  sanctions: {
    id: string;
    userId: string;
    kind: string;
    reason: string;
    reportId: string | null;
    startsAt: Date;
    endsAt: Date | null;
  }[];
  stats: Record<string, number>;
};

export type EventRow = {
  id: string;
  ownerId: string;
  sportId: string;
  title: string;
  levelMinId: string;
  levelMaxId: string;
  adultsOnly: boolean;
  minParticipants: number | null;
  maxParticipants: number;
  registrationMode: string;
  address: string;
  municipalityId: string;
  lat: number;
  lng: number;
  locationHidden: boolean;
  startDate: string;
  startTime: string;
  duration: number;
  rule: string | null;
  until: string | null;
  status: string;
  publishedAt: Date;
  createdAt: Date;
};

export type OccurrenceRow = {
  id: string;
  eventId: string;
  startsAt: Date;
  status: string;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelledById: string | null;
  createdAt: Date;
};

export type RegistrationRow = {
  id: string;
  occurrenceId: string;
  userId: string;
  status: string;
  isLate: boolean;
  attendance: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
};

const DAY = 86_400_000;
const FIRST_NAMES = [
  'Lucas', 'Emma', 'Hugo', 'Jade', 'Louis', 'Louise', 'Gabriel', 'Alice', 'Arthur', 'Chloe', 'Jules', 'Lina', 'Adam',
  'Mila', 'Raphael', 'Rose', 'Leo', 'Anna', 'Paul', 'Lea', 'Nathan', 'Manon', 'Ethan', 'Ines', 'Noah', 'Sarah', 'Tom',
  'Camille', 'Yanis', 'Julia', 'Sacha', 'Zoe', 'Mohamed', 'Lucie', 'Theo', 'Eva', 'Malo', 'Nina', 'Amir', 'Clara',
  'Karim', 'Yasmine', 'Mathis', 'Sofia', 'Enzo', 'Ambre', 'Maxime', 'Agathe', 'Samuel', 'Margaux',
];
const CHAT_LINES = [
  'Who brings the ball?', 'I am on my way!', 'Running 5 minutes late, sorry.', 'Great session today, thanks all!',
  'Same time next week?', 'Is the court booked?', 'Meet at the entrance.', 'Can someone lend me a racket?',
  'Weather looks fine for tonight.', 'I can bring a friend if we lack players.', 'Thanks for organizing!',
  'Parking is free after 7pm.', 'Do not forget water, it is hot.', 'We were 2 short, invite your friends!',
];
// Paris, Marseille and Lyon arrondissements carry the activity; their parent cities have no rows of their own here.
const EMPTY_CITY_INSEE = '42218'; // Saint-Étienne: residents but no session there ("empty city" scenario).
const ACTIVE_DEPARTMENT = '69'; // Rhône (Lyon): "very active city" scenario.
const SEASON: Record<Sport['environment'], number[]> = {
  // Activity multiplier per month (Jan..Dec).
  outdoor: [0.55, 0.6, 0.8, 1.0, 1.15, 1.3, 1.25, 1.0, 1.2, 1.0, 0.75, 0.6],
  indoor: [1.25, 1.2, 1.1, 1.0, 0.9, 0.8, 0.6, 0.6, 1.0, 1.1, 1.2, 1.15],
  both: [0.95, 0.95, 1.0, 1.0, 1.05, 1.05, 0.9, 0.85, 1.05, 1.05, 1.0, 0.95],
};

/** Offset of Europe/Paris from UTC at an instant, in ms. */
function parisOffset(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return wall - ms;
}

/** Instant of a local date and time in Europe/Paris (two passes for daylight saving switches). */
export function parisInstant(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  const first = wall - parisOffset(wall);
  return new Date(wall - parisOffset(first));
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function dateOf(instant: Date): string {
  return new Date(instant.getTime() + parisOffset(instant.getTime())).toISOString().slice(0, 10);
}

function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}

function jitter(random: Random, lat: number, lng: number, km: number): { lat: number; lng: number } {
  const dLat = (random.next() - 0.5) * 2 * (km / 111);
  const dLng = (random.next() - 0.5) * 2 * (km / (111 * Math.cos((lat * Math.PI) / 180)));
  return { lat: lat + dLat, lng: lng + dLng };
}

export function simulate(reference: Reference, options: Options): Dataset {
  const random = new Random(options.seed);
  const anchor = parisInstant(options.anchor, '00:00');
  const start = new Date(anchor.getTime() - Math.round(options.years * 365) * DAY);
  const id = (at: Date) => uuidv7At(at, random);
  const stats: Record<string, number> = {};
  const count = (key: string, n = 1) => {
    stats[key] = (stats[key] ?? 0) + n;
  };

  const levels = [...reference.skillLevels].sort((a, b) => a.rank - b.rank);
  // Popularity of the sports (weights), close to French participation.
  const SPORT_WEIGHT: Record<string, number> = {
    football: 20, running: 16, tennis: 10, padel: 8, basketball: 7, fitness_gym: 7, cycling: 6, volleyball: 5,
    badminton: 5, hiking: 5, swimming: 5, climbing: 4, table_tennis: 4, yoga: 4, handball: 3, rugby: 3,
    street_workout: 2, boxing: 2, golf: 2, chess: 2, skiing: 1, darts: 1, american_football: 1,
  };
  const sportPicker = new WeightedPicker(reference.sports, (s) => SPORT_WEIGHT[s.code] ?? 1);

  // ---------------------------------------------------------------------------------------------------------------
  // Users (BR-DATA-02: all of metropolitan France weighted by population; very active and empty cities)
  // ---------------------------------------------------------------------------------------------------------------
  const homes = new WeightedPicker(reference.municipalities, (m) =>
    m.department === ACTIVE_DEPARTMENT ? m.population * 3 : m.population,
  );
  const users: UserRow[] = [];
  const userSports: Dataset['userSports'] = [];
  const usernames = new Set<string>();
  for (let i = 0; i < options.users; i += 1) {
    // Growth: more sign-ups recently (quadratic towards the anchor).
    const t = Math.sqrt(random.next());
    const createdAt = new Date(start.getTime() + t * (anchor.getTime() - start.getTime() - DAY));
    const home = homes.pick(random);
    const first = random.pick(FIRST_NAMES);
    let username = `${first.toLowerCase()}${random.int(1, 9999)}`;
    while (usernames.has(username)) username = `${first.toLowerCase()}${random.int(1, 99999)}`;
    usernames.add(username);
    const roll = random.next();
    const profile: Profile =
      roll < 0.005 ? 'abusive_organizer' : roll < 0.025 ? 'serial_no_show' : roll < 0.2 ? 'regular' : roll < 0.6 ? 'casual' : 'rare';
    const age = Math.round(random.normal(31, 11, 15, 72));
    const birthYear = Number(options.anchor.slice(0, 4)) - age;
    const birthDate = `${birthYear}-${String(random.int(1, 12)).padStart(2, '0')}-${String(random.int(1, 28)).padStart(2, '0')}`;
    // 25% stop using the app at some point (dormant); new users are those created in the last 60 days.
    const dormant = random.chance(0.25);
    const activeUntil = dormant
      ? new Date(createdAt.getTime() + random.int(20, 400) * DAY)
      : new Date(anchor.getTime() + 365 * DAY);
    const nSports = random.chance(0.5) ? 1 : random.chance(0.6) ? 2 : 3;
    const sports = new Set<string>();
    while (sports.size < nSports) sports.add(sportPicker.pick(random).id);
    const user: UserRow = {
      id: id(createdAt),
      username,
      email: `${username}@dataset.teamdrop.test`,
      firstName: first,
      birthDate,
      gender: random.pick(['woman', 'man', 'man', 'woman', 'non_binary', 'prefer_not_to_say', null]),
      municipalityId: home.id,
      role: 'user',
      createdAt,
      lastActiveAt: null,
      inactivityWarnedAt: null,
      deletionRequestedAt: null,
      hideFromRankings: random.chance(0.03),
      isPrivate: random.chance(0.06),
      profile,
      department: home.department,
      sports: [...sports],
      activeUntil,
      erase: false,
      adultFrom: `${Number(birthDate.slice(0, 4)) + 18}${birthDate.slice(4)}`,
    };
    users.push(user);
    for (const sportId of user.sports) {
      userSports.push({ userId: user.id, sportId, levelId: levels[Math.min(3, Math.floor(random.normal(1.3, 0.9, 0, 3.4)))].id });
    }
  }
  // A few moderators and an admin.
  for (const u of random.sample(users, 6)) u.role = 'moderator';
  random.pick(users).role = 'admin';
  count('users', users.length);

  // Candidates per (department, sport), weighted by profile.
  const PROFILE_WEIGHT: Record<Profile, number> = { regular: 10, casual: 3, rare: 0.7, serial_no_show: 6, abusive_organizer: 4 };
  const pools = new Map<string, UserRow[]>();
  for (const u of users) {
    for (const sportId of u.sports) {
      const key = `${u.department}|${sportId}`;
      const list = pools.get(key) ?? [];
      list.push(u);
      pools.set(key, list);
    }
  }
  const municipalityById = new Map(reference.municipalities.map((m) => [m.id, m]));
  const userById = new Map(users.map((u) => [u.id, u]));

  // ---------------------------------------------------------------------------------------------------------------
  // Events: weekly series and one-off sessions of organizers (weekend peaks, seasons)
  // ---------------------------------------------------------------------------------------------------------------
  const events: EventRow[] = [];
  const occurrences: OccurrenceRow[] = [];
  const registrations: RegistrationRow[] = [];
  const guests: Dataset['guests'] = [];
  const attendedBy = new Map<string, string[]>(); // occurrence -> attended user ids
  const lastActivity = new Map<string, number>();
  const touch = (userId: string, at: Date) => {
    lastActivity.set(userId, Math.max(lastActivity.get(userId) ?? 0, at.getTime()));
  };

  const organizers = users.filter((u) => {
    if (municipalityById.get(u.municipalityId)?.insee === EMPTY_CITY_INSEE) return false;
    if (u.profile === 'abusive_organizer') return true;
    const p = u.profile === 'regular' ? 0.45 : u.profile === 'casual' ? 0.08 : 0.01;
    return random.chance(u.department === ACTIVE_DEPARTMENT ? Math.min(1, p * 2) : p);
  });

  const horizonEnd = new Date(anchor.getTime() + 28 * DAY);
  for (const organizer of organizers) {
    const nSeries = organizer.profile === 'regular' ? random.int(1, 3) : 1;
    for (let s = 0; s < nSeries; s += 1) {
      const sportId = random.pick(organizer.sports);
      const sport = reference.sports.find((x) => x.id === sportId)!;
      const home = municipalityById.get(organizer.municipalityId)!;
      const spot = jitter(random, home.lat, home.lng, 2);
      const recurring = random.chance(0.7);
      const firstDay = new Date(
        organizer.createdAt.getTime() + random.int(1, 60) * DAY,
      );
      if (firstDay > horizonEnd) continue;
      const weekend = random.chance(0.35);
      let startDate = dateOf(firstDay);
      while ((isoWeekday(startDate) >= 6) !== weekend) startDate = addDays(startDate, 1);
      const hour = weekend ? random.pick([9, 10, 10, 11, 14, 15, 16]) : random.pick([12, 18, 18, 19, 19, 20, 21]);
      const startTime = `${String(hour).padStart(2, '0')}:${random.pick(['00', '00', '30'])}`;
      const lifeWeeks = recurring ? random.int(4, 60) : 1;
      const lastDate = addDays(startDate, 7 * (lifeWeeks - 1));
      const endsBeforeAnchor = parisInstant(lastDate, startTime) < anchor;
      const max = Math.max(2, sport.max ?? random.int(6, 14));
      const createdAt = new Date(parisInstant(startDate, startTime).getTime() - random.int(2, 20) * DAY);
      const event: EventRow = {
        id: id(createdAt < firstDay ? createdAt : firstDay),
        ownerId: organizer.id,
        sportId: sport.id,
        title: `${sport.code.replace(/_/g, ' ')} ${weekend ? 'weekend' : 'evening'} session, ${home.name}`,
        levelMinId: levels[0].id,
        levelMaxId: levels[levels.length - 1].id,
        adultsOnly: random.chance(0.05),
        minParticipants: random.chance(0.4) ? Math.max(2, Math.floor(max / 2)) : null,
        maxParticipants: max,
        registrationMode: random.chance(0.15) ? 'approval' : 'automatic',
        address: `${random.int(1, 120)} rue du Stade, ${home.name}`,
        municipalityId: home.id,
        lat: spot.lat,
        lng: spot.lng,
        locationHidden: random.chance(0.1),
        startDate,
        startTime,
        duration: sport.duration,
        rule: recurring ? 'FREQ=WEEKLY' : null,
        until: recurring && (endsBeforeAnchor || random.chance(0.5)) ? lastDate : null,
        status: 'published',
        publishedAt: createdAt,
        createdAt,
      };
      events.push(event);

      // A stable core of regulars per series, completed by occasional players.
      const pool = pools.get(`${home.department}|${sport.id}`) ?? [];
      const poolPicker = new WeightedPicker(pool, (u) => PROFILE_WEIGHT[u.profile]);
      const core = pool.length === 0 ? [] : random.sample(pool.filter((u) => u.profile !== 'rare'), Math.floor(max * 0.6));

      for (let week = 0; week < lifeWeeks; week += 1) {
        const date = addDays(startDate, 7 * week);
        const startsAt = parisInstant(date, startTime);
        if (startsAt > horizonEnd) break;
        if (startsAt > organizer.activeUntil && startsAt < anchor) {
          // The organizer stopped: the series ends the week before (BR-EVT-02).
          if (event.rule !== null) event.until = addDays(date, -7) < startDate ? startDate : addDays(date, -7);
          break;
        }
        const past = startsAt < anchor;
        const month = Number(date.slice(5, 7)) - 1;
        let demand = SEASON[sport.environment][month] * (weekend ? 1.4 : 1) * (home.department === ACTIVE_DEPARTMENT ? 1.3 : 1);
        if (sport.code === 'skiing' && ![0, 1, 2, 11].includes(month)) continue;
        // Virtual occurrences without anybody are not materialized (BR-EVT-03); most weeks have players.
        if (!random.chance(Math.min(0.97, 0.75 * demand))) continue;
        const occurrenceId = id(new Date(startsAt.getTime() - 3 * DAY));
        // Outdoor sessions are cancelled more in winter; abusive organizers cancel at the last minute.
        let cancelled = random.chance(sport.environment === 'outdoor' ? 0.06 / SEASON.outdoor[month] : 0.03);
        if (organizer.profile === 'abusive_organizer' && random.chance(0.35)) cancelled = true;
        const status = past ? (cancelled ? 'cancelled' : 'completed') : cancelled && random.chance(0.3) ? 'cancelled' : 'scheduled';
        const endsAt = new Date(startsAt.getTime() + event.duration * 60_000);
        occurrences.push({
          id: occurrenceId,
          eventId: event.id,
          startsAt,
          status,
          completedAt: status === 'completed' ? endsAt : null,
          cancelledAt: status === 'cancelled' ? new Date(startsAt.getTime() - random.int(1, 20) * 3_600_000) : null,
          cancelledById: status === 'cancelled' ? organizer.id : null,
          createdAt: new Date(startsAt.getTime() - 3 * DAY),
        });
        count(`occurrences_${status}`);

        // Participants: the organizer plays (counts toward capacity), then the core and other players.
        const daysOut = past ? 0 : (startsAt.getTime() - anchor.getTime()) / DAY;
        const fill = Math.min(1, random.normal(0.75, 0.2, 0.2, 1) * demand * (past ? 1 : Math.max(0.2, 1 - daysOut / 28)));
        const target = Math.max(1, Math.round(max * fill));
        const chosen = new Set<string>([organizer.id]);
        for (const u of random.sample(core, target)) {
          if (chosen.size >= target) break;
          if (random.chance(0.75)) chosen.add(u.id);
        }
        let attempts = 0;
        while (chosen.size < target && pool.length > 0 && attempts < target * 4) {
          attempts += 1;
          chosen.add(poolPicker.pick(random).id);
        }
        const attended: string[] = [];
        let confirmedSpots = 0;
        for (const userId of chosen) {
          const user = userById.get(userId);
          if (user === undefined) continue;
          // BR-EVT-11: minors (15 to 17 on the session date) never join adults-only sessions.
          if (event.adultsOnly && date < user.adultFrom) continue;
          if (user.createdAt > startsAt || (startsAt > user.activeUntil && past)) continue;
          const registeredAt = new Date(Math.max(user.createdAt.getTime(), startsAt.getTime() - random.int(1, 240) * 3_600_000));
          const reg: RegistrationRow = {
            id: id(registeredAt),
            occurrenceId,
            userId,
            status: 'confirmed',
            isLate: false,
            attendance: null,
            createdAt: registeredAt,
            confirmedAt: registeredAt,
            cancelledAt: null,
          };
          const isOrganizer = userId === organizer.id;
          // Cancellations (BR-REG-06): 6% normal, 4% late (frozen flag).
          const cancelRoll = random.next();
          if (!isOrganizer && cancelRoll < 0.1) {
            const late = cancelRoll < 0.04 || (user.profile === 'serial_no_show' && cancelRoll < 0.08);
            reg.status = 'cancelled';
            reg.isLate = late;
            reg.cancelledAt = new Date(startsAt.getTime() - (late ? random.int(1, 23) : random.int(25, 96)) * 3_600_000);
            if (reg.cancelledAt < registeredAt) reg.cancelledAt = new Date(registeredAt.getTime() + 60_000);
            count(late ? 'late_cancellations' : 'cancellations');
          } else if (confirmedSpots >= max) {
            reg.status = 'waitlisted';
            reg.confirmedAt = null;
          } else {
            confirmedSpots += 1;
            if (status === 'completed') {
              // Attendance (BR-ATT-01): attended by default; serial no-shows miss often, abusive organizers sometimes.
              const noShowP = user.profile === 'serial_no_show' ? 0.45 : isOrganizer && user.profile === 'abusive_organizer' ? 0.5 : 0.03;
              const r = random.next();
              reg.attendance = r < noShowP ? 'no_show' : r < noShowP + 0.02 ? 'excused' : 'attended';
              if (reg.attendance === 'attended') {
                attended.push(userId);
                touch(userId, endsAt);
              }
              count(`attendance_${reg.attendance}`);
            }
            // Guests (BR-REG-05): names are erased once completed.
            if (!isOrganizer && random.chance(0.05) && confirmedSpots < max) {
              confirmedSpots += 1;
              guests.push({
                id: id(registeredAt),
                registrationId: reg.id,
                displayName: status === 'completed' ? null : `${random.pick(FIRST_NAMES)} (guest)`,
                createdAt: registeredAt,
              });
            }
          }
          if (reg.status === 'waitlisted' && past) continue; // past waitlists were resolved; keep only future ones
          if (event.registrationMode === 'approval' && !past && !isOrganizer && random.chance(0.2) && reg.status === 'confirmed') {
            reg.status = 'pending_approval';
            reg.confirmedAt = null;
          }
          registrations.push(reg);
          touch(userId, registeredAt);
        }
        attendedBy.set(occurrenceId, attended);
      }
    }
  }
  count('events', events.length);
  count('registrations', registrations.length);

  // ---------------------------------------------------------------------------------------------------------------
  // Social graph, circles, communities, chats, cheers
  // ---------------------------------------------------------------------------------------------------------------
  const follows: Dataset['follows'] = [];
  const followKeys = new Set<string>();
  const addFollow = (a: string, b: string, at: Date, status = 'accepted') => {
    if (a === b || followKeys.has(`${a}|${b}`)) return;
    followKeys.add(`${a}|${b}`);
    follows.push({ followerId: a, followedId: b, status, createdAt: at });
  };
  const cheers: Dataset['cheers'] = [];
  const cheerKeys = new Set<string>();
  const occurrenceById = new Map(occurrences.map((o) => [o.id, o]));
  for (const [occurrenceId, attended] of attendedBy) {
    if (attended.length < 2) continue;
    const occurrence = occurrenceById.get(occurrenceId)!;
    const after = new Date(occurrence.startsAt.getTime() + random.int(3, 48) * 3_600_000);
    for (const giver of attended) {
      // Cheers (BR-SOC-11): only between participants who attended, one per giver, recipient and occurrence.
      if (random.chance(0.12)) {
        const recipient = random.pick(attended.filter((u) => u !== giver));
        const key = `${giver}|${recipient}|${occurrenceId}`;
        if (!cheerKeys.has(key) && after < anchor) {
          cheerKeys.add(key);
          cheers.push({ id: id(after), occurrenceId, giverId: giver, recipientId: recipient, cheerTypeCode: random.pick(reference.cheerTypes), createdAt: after });
        }
      }
      if (random.chance(0.04) && after < anchor) {
        const other = random.pick(attended.filter((u) => u !== giver));
        addFollow(giver, other, after);
        if (random.chance(0.5)) addFollow(other, giver, after); // friends (BR-SOC-01)
      }
    }
  }
  count('cheers', cheers.length);
  count('follows', follows.length);

  // Circles of organizers with their regulars (BR-SOC-05), and their chats.
  const circles: Dataset['circles'] = [];
  const circleMembers: Dataset['circleMembers'] = [];
  const messages: Dataset['messages'] = [];
  const eventsByOwner = new Map<string, EventRow[]>();
  for (const e of events) eventsByOwner.set(e.ownerId, [...(eventsByOwner.get(e.ownerId) ?? []), e]);
  const regsByOccurrence = new Map<string, RegistrationRow[]>();
  for (const r of registrations) regsByOccurrence.set(r.occurrenceId, [...(regsByOccurrence.get(r.occurrenceId) ?? []), r]);
  const occByEvent = new Map<string, OccurrenceRow[]>();
  for (const o of occurrences) occByEvent.set(o.eventId, [...(occByEvent.get(o.eventId) ?? []), o]);

  for (const organizer of organizers) {
    if (!random.chance(0.3)) continue;
    const owned = eventsByOwner.get(organizer.id) ?? [];
    const regulars = new Map<string, number>();
    for (const e of owned) for (const o of occByEvent.get(e.id) ?? []) for (const r of regsByOccurrence.get(o.id) ?? []) {
      if (r.userId !== organizer.id) regulars.set(r.userId, (regulars.get(r.userId) ?? 0) + 1);
    }
    const members = [...regulars.entries()].filter(([, n]) => n >= 3).map(([u]) => u).slice(0, 25);
    if (members.length < 3) continue;
    const createdAt = new Date(Math.min(anchor.getTime() - DAY, organizer.createdAt.getTime() + 60 * DAY));
    const circleId = id(createdAt);
    circles.push({ id: circleId, name: `${organizer.firstName}'s crew`, createdAt });
    circleMembers.push({ circleId, userId: organizer.id, role: 'owner', joinedAt: createdAt });
    members.forEach((userId, index) => {
      circleMembers.push({ circleId, userId, role: index === 0 ? 'admin' : 'member', joinedAt: new Date(createdAt.getTime() + (index + 1) * 3_600_000) });
    });
    const nMessages = random.int(3, 30);
    for (let m = 0; m < nMessages; m += 1) {
      const at = new Date(createdAt.getTime() + random.next() * (anchor.getTime() - createdAt.getTime()));
      messages.push({ id: id(at), target: { circleId }, senderId: random.pick([organizer.id, ...members]), clientMessageId: id(at), body: random.pick(CHAT_LINES), createdAt: at });
    }
  }
  count('circles', circles.length);

  // Communities: clubs in the largest municipalities (BR-SOC-09).
  const communities: Dataset['communities'] = [];
  const communityMembers: Dataset['communityMembers'] = [];
  const bigCities = [...reference.municipalities].sort((a, b) => b.population - a.population).slice(0, 40);
  for (const city of bigCities) {
    const residents = users.filter((u) => u.municipalityId === city.id);
    if (residents.length < 10) continue;
    for (let c = 0; c < random.int(1, 3); c += 1) {
      const owner = random.pick(residents);
      const sportId = random.pick(owner.sports);
      const sport = reference.sports.find((s) => s.id === sportId)!;
      const createdAt = new Date(Math.max(owner.createdAt.getTime(), start.getTime()) + random.int(1, 30) * DAY);
      if (createdAt >= anchor) continue;
      const communityId = id(createdAt);
      communities.push({ id: communityId, name: `${city.name} ${sport.code.replace(/_/g, ' ')} club ${c + 1}`, joinPolicy: random.chance(0.7) ? 'open' : 'on_request', createdAt });
      communityMembers.push({ communityId, userId: owner.id, role: 'owner', joinedAt: createdAt });
      const members = random.sample(residents.filter((u) => u.id !== owner.id && u.createdAt < anchor), random.int(5, 80));
      members.forEach((u, index) => {
        const joinedAt = new Date(Math.max(createdAt.getTime(), u.createdAt.getTime()) + 3_600_000);
        if (joinedAt < anchor) communityMembers.push({ communityId, userId: u.id, role: index < 2 ? 'moderator' : 'member', joinedAt });
      });
      for (let m = 0; m < random.int(0, 15); m += 1) {
        const at = new Date(createdAt.getTime() + random.next() * (anchor.getTime() - createdAt.getTime()));
        messages.push({ id: id(at), target: { communityId }, senderId: owner.id, clientMessageId: id(at), body: random.pick(CHAT_LINES), createdAt: at });
      }
    }
  }
  count('communities', communities.length);

  // Occurrence chats (BR-MSG-01), created on first need.
  const conversations: Dataset['conversations'] = [];
  for (const o of occurrences) {
    if (!random.chance(0.08)) continue;
    const participants = (regsByOccurrence.get(o.id) ?? []).filter((r) => r.status === 'confirmed').map((r) => r.userId);
    if (participants.length < 2) continue;
    const createdAt = new Date(o.startsAt.getTime() - random.int(2, 48) * 3_600_000);
    if (createdAt >= anchor) continue;
    const conversationId = id(createdAt);
    conversations.push({ id: conversationId, occurrenceId: o.id, createdAt });
    for (let m = 0; m < random.int(2, 8); m += 1) {
      const at = new Date(Math.min(anchor.getTime() - 60_000, createdAt.getTime() + m * random.int(5, 120) * 60_000));
      messages.push({ id: id(at), target: { occurrenceConversationId: conversationId }, senderId: random.pick(participants), clientMessageId: id(at), body: random.pick(CHAT_LINES), createdAt: at });
    }
  }
  count('messages', messages.length);

  // ---------------------------------------------------------------------------------------------------------------
  // Blocking, reporting and sanctions (BR-SOC-02, BR-MOD-01 to BR-MOD-04)
  // ---------------------------------------------------------------------------------------------------------------
  const organizerIds = new Set(events.map((e) => e.ownerId));
  const blocks: Dataset['blocks'] = [];
  const blockKeys = new Set<string>();
  // Blocks between users who never organize for each other: picked among non-organizers of different departments.
  const plain = users.filter((u) => !organizerIds.has(u.id) && u.createdAt < anchor);
  for (let b = 0; b < Math.floor(users.length * 0.005); b += 1) {
    const [a, c] = random.sample(plain, 2);
    if (a === undefined || c === undefined || a.department === c.department) continue;
    const key = [a.id, c.id].sort().join('|');
    if (blockKeys.has(key)) continue;
    blockKeys.add(key);
    blocks.push({ blockerId: a.id, blockedId: c.id, createdAt: new Date(Math.max(a.createdAt.getTime(), c.createdAt.getTime()) + DAY) });
    // A block removes follows both ways (BR-SOC-02).
    followKeys.delete(`${a.id}|${c.id}`);
    followKeys.delete(`${c.id}|${a.id}`);
  }
  const keptFollows = follows.filter((f) => followKeys.has(`${f.followerId}|${f.followedId}`));
  count('blocks', blocks.length);

  const reports: Dataset['reports'] = [];
  const sanctions: Dataset['sanctions'] = [];
  const moderators = users.filter((u) => u.role !== 'user');
  for (const abusive of users.filter((u) => u.profile === 'abusive_organizer')) {
    const owned = eventsByOwner.get(abusive.id) ?? [];
    const victims = owned.flatMap((e) => (occByEvent.get(e.id) ?? []).flatMap((o) => (regsByOccurrence.get(o.id) ?? []).map((r) => r.userId))).filter((u) => u !== abusive.id);
    const reporters = random.sample([...new Set(victims)], random.int(1, 4));
    let firstReportId: string | null = null;
    for (const reporter of reporters) {
      const at = new Date(anchor.getTime() - random.int(5, 200) * DAY);
      const closed = random.chance(0.6);
      const reportId = id(at);
      firstReportId ??= reportId;
      reports.push({ id: reportId, reporterId: reporter, reasonCode: 'no_show_organizer_or_fake_event', targetUserId: null, targetEventId: owned[0]?.id ?? null, status: closed ? 'resolved' : random.pick(['open', 'assigned']), createdAt: at, closedAt: closed ? new Date(at.getTime() + random.int(1, 72) * 3_600_000) : null });
    }
    if (reporters.length >= 2) {
      const at = new Date(anchor.getTime() - random.int(1, 30) * DAY);
      sanctions.push({ id: id(at), userId: abusive.id, kind: random.chance(0.8) ? 'temporary_ban' : 'warning', reason: 'Repeated last-minute cancellations', reportId: firstReportId, startsAt: at, endsAt: null });
      const s = sanctions[sanctions.length - 1];
      if (s.kind === 'temporary_ban') s.endsAt = new Date(at.getTime() + random.int(7, 60) * DAY);
    }
  }
  // Harassment reports between random users, a third of them leading to a warning; one permanent ban.
  for (let r = 0; r < Math.floor(users.length * 0.003); r += 1) {
    const [reporter, target] = random.sample(plain, 2);
    if (reporter === undefined || target === undefined) continue;
    const at = new Date(Math.max(reporter.createdAt.getTime(), target.createdAt.getTime(), anchor.getTime() - 300 * DAY) + DAY);
    if (at >= anchor) continue;
    const status = random.pick(['open', 'assigned', 'resolved', 'dismissed']);
    const reportId = id(at);
    reports.push({ id: reportId, reporterId: reporter.id, reasonCode: random.pick(['harassment', 'spam', 'hate_speech', 'fake_profile']), targetUserId: target.id, targetEventId: null, status, createdAt: at, closedAt: status === 'resolved' || status === 'dismissed' ? new Date(at.getTime() + random.int(2, 120) * 3_600_000) : null });
    if (status === 'resolved' && random.chance(0.4)) {
      sanctions.push({ id: id(at), userId: target.id, kind: 'warning', reason: 'Inappropriate behaviour', reportId, startsAt: at, endsAt: null });
    }
  }
  const banned = random.pick(plain);
  sanctions.push({ id: id(anchor), userId: banned.id, kind: 'permanent_ban', reason: 'Scam attempts', reportId: null, startsAt: new Date(anchor.getTime() - 10 * DAY), endsAt: null });
  count('reports', reports.length);
  count('sanctions', sanctions.length);
  void moderators;

  // ---------------------------------------------------------------------------------------------------------------
  // Activity dates, inactivity and deleted accounts (BR-GDP-03, BR-GDP-08)
  // ---------------------------------------------------------------------------------------------------------------
  for (const u of users) {
    const last = lastActivity.get(u.id);
    const base = last ?? u.createdAt.getTime();
    u.lastActiveAt = new Date(Math.min(anchor.getTime() - 60_000, base + random.int(0, 3) * DAY));
    const idle = (anchor.getTime() - u.lastActiveAt.getTime()) / DAY;
    if (idle > 365) {
      u.inactivityWarnedAt = new Date(u.lastActiveAt.getTime() + 366 * DAY);
      count('inactivity_warned');
    }
  }
  // Deleted accounts: 1% asked for deletion (some still in the grace period); those past it are erased after loading,
  // when they have no upcoming registration.
  const upcomingUsers = new Set(registrations.filter((r) => occurrenceById.get(r.occurrenceId)!.startsAt >= anchor).map((r) => r.userId));
  // Organizers are left out: their events would need a hand-over (BR-GDP-04), which the data layer does with notifications.
  for (const u of random.sample(users.filter((x) => x.role === 'user' && x.id !== banned.id && !organizerIds.has(x.id)), Math.floor(users.length * 0.01))) {
    const daysAgo = random.int(1, 60);
    u.deletionRequestedAt = new Date(anchor.getTime() - daysAgo * DAY);
    u.erase = daysAgo > 30 && !upcomingUsers.has(u.id);
    count(u.erase ? 'erased' : 'deletion_requested');
  }

  return {
    users,
    userSports,
    follows: keptFollows,
    blocks,
    circles,
    circleMembers,
    communities,
    communityMembers,
    events,
    occurrences,
    registrations,
    guests,
    conversations,
    messages,
    cheers,
    reports,
    sanctions,
    stats,
  };
}
