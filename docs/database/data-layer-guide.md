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
- `AuthRepository`: creates accounts with a password or Google, finds logins by email, links Google, rotates refresh tokens and consumes account tokens.
- `UserRepository`: reads own and public profiles, replaces sports, ratings and availability, updates settings, searches users and records deletion requests. Profiles, availability and search hide users blocked in either direction.
- `FollowRepository`: follows and unfollows, accepts or declines follow requests, lists followers, following and friends (visibility and blocking applied), and returns the relationship between two users.
- `BlockRepository`: blocks and unblocks users (removes follows and cancels pending circle invitations between them), lists my blocks and, for admins, the blocks of a user. A block returns the upcoming occurrences both users are registered for, for the BR-SOC-03 warning.
- `CircleRepository`: creates and edits circles, invites members, approves or rejects member invitations, answers invitations, leaves a circle with ownership hand-over, manages roles and lists members (members only).
- `CommunityRepository`: creates and edits communities, joins (open or on request), decides join requests, leaves with ownership hand-over, manages roles, searches communities and lists members (members only).
- `VenueRepository`: creates, edits and deletes saved venues, and searches the venues a viewer may see (public ones and the viewer's private ones), by distance or by name.
- `EventRepository`: creates and publishes events; edits a series, one occurrence, or "this and following" (which splits the series); cancels events and occurrences; manages co-organizers, ownership and target circles; searches occurrences of a date range (at most 31 days) and reads one occurrence with its viewer role; lists my upcoming, organized and past events. Occurrences are materialized on first need, and the hidden location and circle-priority rules are applied to every read.
- `RegistrationRepository`: registers for an occurrence (automatic or approval mode, waitlist, guests), cancels (late-cancellation flag and waitlist promotion), approves, declines, accepts from the waitlist, removes participants, replaces guests, and lists participants (blocked users left out, guest names for organizers), the waitlist and pending approvals.

## 9. Business rules

- `docs/database/business-rules.md` is the master. If this guide and that file disagree, the business rules win.
- Put the rule ID in a comment above the code that implements it, and in the test name, for example `it('BR-REG-02: refuses a second active registration', ...)`.
