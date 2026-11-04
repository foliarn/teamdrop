# TeamDrop data layer guide

> **Audience:** app developers and AI agents writing code that reads or writes data.
> **Master document:** `docs/database/business-rules.md`. Domain words: `docs/database/glossary.md`.

## 1. Purpose

- The only way to read or write data is the repositories exported by the data module, `apps/api/src/data/index.ts`.
- Import only from that index, never from the module's internal files. From `apps/api/src/<feature>/`, use `'../data'`, or the `@data` alias if it exists later.
- Never write SQL, Kysely or `pg` code. If a method you need does not exist, see section 7.

## 2. The split rule

**Who may *do* an action is your job. What a viewer may *see*, and keeping the data consistent, is the data layer's job.**

| Your code (developers) | The data layer |
|---|---|
| Permissions and role checks: who may do the action | Consistency under concurrency: capacity, waitlist, one active registration, ownership hand-over, block side effects |
| Controllers, guards, request validation | Filtering what a viewer may see: blocking, profile visibility, hidden location, circle-only and community-only events |
| JWT, Passport, Google OAuth (with Paul for the WebSocket side) | Eligibility that needs private data (adults-only) |
| Notifications, emails, push sending | Encryption and decryption of email and birth date |
| Scheduling periodic jobs (call repositories on a timer) | Per-user statistics, reliability and badge progress data |
| Badge awarding | Every SQL query |
| WebSocket gateway (with Paul), front ends | |

The data layer does not check who may act. Check permissions before every write call.

## 3. How to call

Inject the repository in a NestJS service constructor. Never create a repository with `new`.

```ts
@Injectable()
export class RegistrationService {
  constructor(private readonly registrations: RegistrationRepository) {}

  async register(userId: string, key: OccurrenceKey) {
    // Permission checks, if any, go here (your job).
    const result = await this.registrations.register(key, userId, { guestNames: [] });
    // Notify people from the outcome (your job).
    return result;
  }
}
```

## 4. Conventions

- IDs are strings (UUID v7).
- Instants are `Date` objects.
- Local dates are `'YYYY-MM-DD'` strings. Local times are `'HH:mm'` strings. Time zone for calendar logic: `Europe/Paris`.
- Points are `{ lat, lng }`.
- Reads that depend on who is looking take `viewerId` as their first argument. Always pass the authenticated user's id.
- Lists use cursor pagination: input `{ cursor?, limit? }`, output `{ items, nextCursor }`. Treat the cursor as opaque.
- Every method is atomic. Never try to combine several calls into a transaction.

## 5. Errors

- Every failure is a `DataError` subclass with a stable `code` string (for example `USERNAME_TAKEN`).
- Map codes to HTTP statuses in one exception filter.
- Never parse error messages. Switch on `error.code`.
- Unexpected errors have code `INTERNAL`. Do not try to show or log their details.

## 6. Outcomes

- Write methods return what changed, for example `promotedUserIds`.
- Use the outcome to send notifications. Notifications are your job.

## 7. Missing method?

Do not write SQL and do not work around the missing method. Ask by writing a data method request:

```md
### Data method request
- Feature:
- Method name you'd like:
- Inputs:
- Output:
- Business rules (IDs):
- Who may call it (permission you will check):
```

## 8. Available repositories

Filled in as each batch lands. The TSDoc on each method is the reference.

- `ReferenceRepository`: lists sports, skill levels and rating systems, searches municipalities, and manages sports from the back office.
- `AuthRepository`: creates accounts with a password or Google, finds logins by email, links Google, rotates refresh tokens and consumes account tokens. Sign-up and Google linking refuse a permanently banned email or Google identity (`IDENTITY_BANNED`). The login lookups return `activeBan`: refuse the login while it is set.
- `UserRepository`: reads own and public profiles, replaces sports, ratings and availability, updates settings, searches users and records deletion requests. Profiles, availability and search hide users blocked in either direction.
- `FollowRepository`: follows and unfollows, accepts or declines follow requests, lists followers, following and friends (visibility and blocking applied), and returns the relationship between two users.
- `BlockRepository`: blocks and unblocks users (removes follows and cancels pending circle invitations between them), lists my blocks and, for admins, the blocks of a user. A block returns the upcoming occurrences both users are registered for, for the BR-SOC-03 warning.
- `CircleRepository`: creates and edits circles, invites members, approves or rejects member invitations, answers invitations, leaves a circle with ownership hand-over, manages roles and lists members (members only).
- `CommunityRepository`: creates and edits communities, joins (open or on request), decides join requests, leaves with ownership hand-over, manages roles, searches communities and lists members (members only).
- `VenueRepository`: creates, edits and deletes saved venues, and searches the venues a viewer may see (public ones and the viewer's private ones), by distance or by name.
- `EventRepository`: creates and publishes events; edits a series, one occurrence, or "this and following" (which splits the series); cancels events and occurrences; manages co-organizers, ownership and target circles; searches occurrences of a date range (at most 31 days) and reads one occurrence with its viewer role; lists my upcoming, organized and past events. Occurrences are materialized on first need, and the hidden location and circle-priority rules are applied to every read.
- `RegistrationRepository`: registers for an occurrence (automatic or approval mode, waitlist, guests), cancels (late-cancellation flag and waitlist promotion), approves, declines, accepts from the waitlist, removes participants, replaces guests, and lists participants (blocked users left out, guest names for organizers), the waitlist and pending approvals.
- `AttendanceRepository`: starts and completes due occurrences (jobs you call on a timer), completes an occurrence early, sets attendance (`attended`, `no_show`, `excused`) until one hour after the end, lists attendance, opens a dispute of a `no_show` within 7 days, resolves disputes (upheld or rejected) and lists open disputes for moderators. Completion erases guest names.
- `MessageRepository`: finds the conversation of a circle, community or occurrence (an occurrence chat is created on first need), sends messages with deduplication on `clientMessageId`, replies, edits, hard-deletes, reacts (fixed list: `thumbs_up`, `thumbs_down`, `laugh`, `surprised`, `angry`, `smile`, `heart`), lists messages by pages, marks read, mutes, lists my conversations, counts unread messages and lists who has read a message. Access is checked for you: circle members, community members, the event's organizers and users with an active registration (`pending_approval`, `confirmed`, `waitlisted`). Messages and reactions of users blocked with the viewer are hidden. `sendMessage` returns `recipientUserIds` and `pushRecipientUserIds` (muted members left out): use them to send pushes. You check who may delete a message (author, circle owner or admins, community owner or moderators, moderators).
- `NotificationRepository`: creates in-app notifications and returns the push targets according to each user's preferences (`notify`, `listPushTargets`), lists, counts, marks read and deletes in-app notifications, reads and sets preferences per type and channel, saves and deletes push subscriptions (one per device), and manages notification types from the back office (a type in use cannot be deleted). You send the pushes.
- `ChatEventListener`: real-time chat events (`message_created`, `message_edited`, `message_deleted`, `reaction_changed`) received through PostgreSQL `LISTEN/NOTIFY` after each commit. Events carry ids only: reload with `MessageRepository.getMessage(viewerId, messageId)` for each connected viewer. Events are not stored: after a reconnection, reload with `listMessages`.

- `CheerRepository`: gives cheers (completed occurrence, both users `attended`, one per giver, recipient and occurrence, no deadline, not between blocked users), lists the participants the viewer may cheer, lists the cheers a user received with their givers (for that user only), returns the counts per type that others see (gated by the stats visibility), and manages cheer types from the back office. Notify the recipient with `cheer_received`.
- `ReportRepository`: files a report about exactly one user, event or message, lists the moderators' queue, returns a report with its content (moderators only), assigns, resolves and dismisses reports (each action is written to the audit log for you), lists a user's own reports, and manages report reasons from the back office.
- `SanctionRepository`: issues warnings, temporary bans (with an end) and permanent bans (which also ban the email and Google identity hashes), revokes sanctions, removes a message as a moderator (content removal: sanction, hard delete and audit in one call), lists a user's sanctions and returns the ban in force. Every action is written to the audit log for you.
- `AuditLogRepository`: records the moderator and admin actions that the data layer does not record itself (back-office CRUD, role changes…) and lists the log with filters. Already recorded for you: report, sanction and dispute decisions, content removal, circle invitation rejection and participant removal.

- `StatsRepository`: profile statistics computed on demand (completed sessions, planned hours, people met, main sport by sessions and by hours, specialist or all-rounder, current and longest streaks), the reliability rate (all time and last 90 days, hidden until 5 past occurrences), both gated by the profile section visibility, and the progress data your badge code uses (`getBadgeProgress`, never returned to clients as is).
- `BadgeRepository`: the badge catalog with optional tiers (back office; the badges themselves are not defined yet), awards and removes badges (your code decides, in real time), lists a user's badges (gated by the badges visibility), and the unseen unlocks for the animation.

- `AnalyticsRepository`: reads the anonymous aggregates the database refreshes (nightly; the current month's ranking hourly): heatmap hexagons (shown from 3 occurrences), the viewer's city rankings (shown from 100 active users, users hiding from rankings left out), popular sports and trends over a rolling month, season or year compared with the previous window, and the back-office statistics. Nothing is recomputed in NestJS; you schedule nothing for these.

Example: a "looking for players" broadcast (BR-SOC-08) is a circle message plus a push.

```ts
// BR-SOC-08: post in the circle chat, then push to the members.
const sent = await this.messages.sendMessage(userId, conversationId, { clientMessageId, body });
if (!sent.deduplicated) {
  const { pushTargets } = await this.notifications.notify(
    'looking_for_players', sent.pushRecipientUserIds, { conversationId, messageId: sent.message.id }, { actorId: userId },
  );
  await this.push.send(pushTargets); // your code
}
```

## 9. Business rules

- `docs/database/business-rules.md` is the master. If this guide and that file disagree, the business rules win.
- Put the rule ID in a comment above the code that implements it, and in the test name, for example `it('BR-REG-02: refuses a second active registration', ...)`.
