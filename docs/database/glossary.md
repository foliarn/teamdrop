# TeamDrop glossary

> **Audience:** developers and AI agents. Use these words exactly, in code and in conversation. When a word here and a word in a ticket differ, this glossary wins.
> **Master document:** `docs/database/business-rules.md`. Rule IDs are given in brackets.

## Accounts

| Term | Table | Meaning |
|---|---|---|
| **User** | `user_account` | A person with an account. Never "member" (that word belongs to circles and communities). |
| **Role** | `user_account.role` | `user`, `moderator` or `admin`. Exactly one per account. An admin can do everything a moderator can. [BR-ACC-08] |
| **Auth identity** | `auth_identity` | One way to log in: `password` or `google`. A user can have both, but accounts are never merged automatically. [BR-ACC-05, BR-ACC-06] |
| **Minor** | (computed) | A user aged 15 to 17. Under 15 can't sign up. [BR-ACC-03] |
| **Municipality** | `municipality` | A French commune, or an arrondissement of Paris, Marseille or Lyon (which has a `parent_municipality_id`). [BR-ACC-13, BR-ACC-19] |
| **Skill level** | `skill_level` | The shared self-declared scale: Beginner, Intermediate, Advanced, Expert. [BR-ACC-10] |
| **Rating** | `user_rating` | An optional official rating for a sport: a number (chess Elo) or a **grade** (French tennis ranking such as `15/2`). [BR-ACC-11] |
| **Availability** | `user_availability` | Recurring weekly time slots. Used to display availability and to choose whom to invite. [BR-ACC-12] |
| **Visibility level** | `user_setting.*_visibility` | Who can see a profile section: `public`, `members` (logged-in users), `friends`, `only_me`. [BR-ACC-14] |

## Social

| Term | Table | Meaning |
|---|---|---|
| **Follow** | `follow` | A one-way link. Needs approval if the followed account is private. [BR-SOC-01] |
| **Friend** | (computed) | Two users who follow each other (both accepted). Never stored. [BR-SOC-01] |
| **Block** | `user_block` | Total and mutual: the two users disappear for each other. [BR-SOC-02 to BR-SOC-04] |
| **Circle** | `circle` | A **private** group of people you like to play with. Invitation only. Roles: owner, admin, member. [BR-SOC-05 to BR-SOC-08] |
| **Community** | `community` | A **public** group (club, sport, streamer…) that people join freely or on request. Roles: owner, moderator, member. [BR-SOC-09, BR-SOC-10] |
| **Cheer** | `cheer` | A typed positive feedback given to another participant after an occurrence. Formerly "kudos": never use that word. [BR-SOC-11, BR-SOC-12] |

Circle and community are **different things**. Never mix them.

## Events

| Term | Table | Meaning |
|---|---|---|
| **Event** | `event` | The **template**: sport, title, place, time, capacity, rules, and optional recurrence. Users never register for an event directly. [BR-EVT-01] |
| **Series** | `event` with a `recurrence_rule` | A recurring event. "This and following" edits split it into a new event linked by `split_from_event_id`. [BR-EVT-02, BR-EVT-05] |
| **Occurrence** | `event_occurrence` | **One dated session** of an event. Registrations, chats, attendance and cheers belong to occurrences. [BR-EVT-03, BR-EVT-04] |
| **Virtual occurrence** | (none) | A date computed from a recurrence rule that has no row yet. The row is created on first need (registration, edit, cancellation, chat). [BR-EVT-03] |
| **Owner** | `event.owner_id` | The single person responsible for an event. Can transfer ownership. [BR-EVT-20] |
| **Co-organizer** | `event_co_organizer` | Added by the owner. Same rights as the owner except removing the owner or transferring ownership. [BR-EVT-20] |
| **Organizers** | (owner + co-organizers) | Used in rules that apply to both. |
| **Venue** | `venue` | A saved, reusable place. Public by default, can be private. [BR-EVT-08] |
| **Hidden location** | `event.location_hidden` | Chosen per event: non-registered users see only the municipality. [BR-EVT-09] |
| **Event visibility** | `event.visibility` | `public`, `circle_priority`, `circle_only`, `community_only`. [BR-EVT-23] |
| **Adults only** | `event.adults_only` | Minors can't register. [BR-EVT-11] |

## Registrations and attendance

| Term | Table | Meaning |
|---|---|---|
| **Registration** | `registration` | A user's place on one occurrence. [BR-REG-01] |
| **Active registration** | `registration.status` | `pending_approval`, `confirmed` or `waitlisted`. At most one per user and occurrence. [BR-REG-02] |
| **Registration mode** | `event.registration_mode` | `automatic`, or `approval` by an organizer. [BR-REG-03] |
| **Waitlist** | `registration` with `status = waitlisted` | Automatic promotion in `automatic` mode; organizer's choice in `approval` mode. [BR-REG-04] |
| **Guest** | `registration_guest` | A "+1" without an account. Counts toward capacity and global statistics only. [BR-REG-05] |
| **Late cancellation** | `registration.is_late_cancellation` | Cancelled less than 24 hours before the start. Frozen when the cancellation happens. [BR-REG-06] |
| **Attendance** | `registration.attendance` | `attended` (default), `no_show` or `excused`, set by organizers until 1 hour after the end. [BR-ATT-01, BR-ATT-03] |
| **Dispute** | `attendance_dispute` | A participant contests a `no_show` within 7 days. A moderator decides. [BR-ATT-02] |
| **Reliability rate** | (computed) | `attended / (attended + no_show + 0.5 × late cancellations)`. Hidden before 5 past occurrences. [BR-ATT-04] |

## Statistics and gamification

| Term | Meaning |
|---|---|
| **Completed session** | A registration with `attended` on a `completed` occurrence. [BR-STA-01] |
| **Hours** | Sum of the planned durations of completed sessions. [BR-STA-02] |
| **People met** | Distinct other users with `attended` on the same occurrences. Guests don't count. [BR-STA-03] |
| **Specialist / all-rounder** | Specialist if the main sport is ≥ 70% of sessions. [BR-STA-04] |
| **Streak** | Consecutive days with at least one completed session. [BR-STA-05] |
| **City ranking** | Activity percentile per city, based on where events take place. [BR-STA-06] |
| **Heatmap cell** | An H3 hexagon with aggregated activity. [BR-STA-07] |
| **Badge / tier** | An achievement and its optional levels. Can be won and lost. [BR-GAM-01, BR-GAM-02] |

## Messaging, moderation, GDPR

| Term | Table | Meaning |
|---|---|---|
| **Conversation** | `conversation` | A chat attached to exactly one occurrence, circle or community (direct messages are PENDING-TEAM). [BR-MSG-01] |
| **Deleted user** | `sender_id = NULL`, `user_id = NULL` | What remains of an erased account in other people's data. Display it as "deleted user". [BR-GDP-04, BR-GDP-05] |
| **Report** | `report` | A complaint about exactly one user, event or message. [BR-MOD-01, BR-MOD-02] |
| **Sanction** | `user_sanction` | Warning, temporary ban or permanent ban. [BR-MOD-03] |
| **Erasure** | (database function) | Final deletion of an account, 30 days after the request. Never done with a plain `DELETE`. [BR-GDP-03 to BR-GDP-05] |
| **Export** | `data_export_request` | A JSON file of all of a user's data, built asynchronously. [BR-GDP-07] |
