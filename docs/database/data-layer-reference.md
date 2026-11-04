# TeamDrop data layer reference

> Generated from the TSDoc of `apps/api/src/data` by `npm run docs:data`. Do not edit by hand.
> How to use the data layer: `data-layer-guide.md`. Business rules: `business-rules.md` (the master).

## Contents

- [ReferenceRepository](#referencerepository)
- [AuthRepository](#authrepository)
- [UserRepository](#userrepository)
- [FollowRepository](#followrepository)
- [BlockRepository](#blockrepository)
- [CircleRepository](#circlerepository)
- [CommunityRepository](#communityrepository)
- [VenueRepository](#venuerepository)
- [EventRepository](#eventrepository)
- [RegistrationRepository](#registrationrepository)
- [AttendanceRepository](#attendancerepository)
- [MessageRepository](#messagerepository)
- [NotificationRepository](#notificationrepository)
- [CheerRepository](#cheerrepository)
- [ReportRepository](#reportrepository)
- [SanctionRepository](#sanctionrepository)
- [AuditLogRepository](#auditlogrepository)
- [StatsRepository](#statsrepository)
- [BadgeRepository](#badgerepository)
- [AnalyticsRepository](#analyticsrepository)
- [GdprRepository](#gdprrepository)
- [ChatEventListener](#chateventlistener)
- [Errors](#errors)

## ReferenceRepository

Source: `apps/api/src/data/repositories/reference.repository.ts`

Reference data: sports, skill levels, rating systems and municipalities.
Reads are not filtered by viewer. The admin methods are for the back office; the developers check the admin role.

### `ReferenceRepository.listSports`

```ts
listSports(options: { includeInactive?: boolean } = {}): Promise<Sport[]>
```

Lists the sports, ordered by name.

Rules: BR-ACC-17 (sports are managed from the back office; inactive sports are hidden from new choices).
Errors: none expected (unexpected database errors become `INTERNAL`).
Outcome: the sports; inactive sports only when `includeInactive` is true.

### `ReferenceRepository.getSport`

```ts
getSport(id: string): Promise<Sport>
```

Returns one sport by id, whether active or not.

Rules: BR-ACC-17.
Errors: `NotFoundError` when the sport does not exist.
Outcome: the sport.

### `ReferenceRepository.listSkillLevels`

```ts
listSkillLevels(): Promise<SkillLevel[]>
```

Lists the shared skill levels, lowest first.

Rules: BR-ACC-10 (Beginner, Intermediate, Advanced, Expert).
Errors: none expected.
Outcome: the levels ordered by rank.

### `ReferenceRepository.listRatingSystems`

```ts
listRatingSystems(sportId?: string): Promise<RatingSystem[]>
```

Lists the official rating systems, optionally for one sport. Each system carries its grades, lowest first.

Rules: BR-ACC-11.
Errors: none expected.
Outcome: the systems ordered by code; grades ordered by rank within each system.

### `ReferenceRepository.searchMunicipalities`

```ts
searchMunicipalities(query: string, limit = 10): Promise<Municipality[]>
```

Searches municipalities and arrondissements by name. Accent- and case-insensitive (unaccent + pg_trgm).
Names starting with the query come first, then the best trigram matches. The parent city is included.

Rules: BR-ACC-13, BR-ACC-19, BR-TECH-10.
Errors: none expected. A query shorter than 2 characters (after trimming) returns an empty list without querying.
Outcome: at most `limit` municipalities (default 10, max 100).

### `ReferenceRepository.getMunicipality`

```ts
getMunicipality(id: string): Promise<Municipality>
```

Returns one municipality or arrondissement by id, with its parent city.

Rules: BR-ACC-13, BR-ACC-19.
Errors: `NotFoundError` when it does not exist.
Outcome: the municipality.

### `ReferenceRepository.createSport`

```ts
createSport(input: CreateSportInput): Promise<Sport>
```

Creates a sport (back office). The caller checks the admin role.

Rules: BR-ACC-17.
Errors: `InvalidInputError` when the code is already used or a default is invalid (duration, participants).
Outcome: the created sport, active unless `isActive` is false.

### `ReferenceRepository.updateSport`

```ts
updateSport(id: string, patch: UpdateSportPatch): Promise<Sport>
```

Updates the given fields of a sport (back office). The caller checks the admin role.

Rules: BR-ACC-17.
Errors: `NotFoundError` when the sport does not exist; `InvalidInputError` on a duplicate code or an invalid default.
Outcome: the updated sport.

### `ReferenceRepository.setSportActive`

```ts
setSportActive(id: string, active: boolean): Promise<void>
```

Activates or deactivates a sport (back office). Inactive sports are hidden from new choices (BR-ACC-17).
The caller checks the admin role.

Errors: `NotFoundError` when the sport does not exist.
Outcome: nothing.

## AuthRepository

Source: `apps/api/src/data/repositories/auth.repository.ts`

Authentication data: accounts created with a password or Google, login lookup, Google identities,
refresh tokens (hashed, rotated, grouped by family) and single-use account tokens (BR-ACC-03 to BR-ACC-07, BR-TECH-11).
Methods take raw tokens: the data layer hashes them with SHA-256. Passwords arrive already hashed with argon2id.
Who may call these methods is decided by the developers' authentication code (Passport, JWT, Google OAuth).

### `AuthRepository.createUserWithPassword`

```ts
createUserWithPassword(input: CreateUserWithPasswordInput): Promise<{ userId: string }>
```

Creates an account with an email and password, its password identity and default settings, in one transaction.

Rules: BR-ACC-01 (required fields), BR-ACC-02 (username unique, case-insensitive), BR-ACC-03 (minimum age 15 in
Europe/Paris), BR-ACC-04 (email and birth date encrypted, email blind index), BR-ACC-05 (password identity),
BR-ACC-13 (municipality), BR-ACC-15 (default settings).
Errors: `UnderMinimumAgeError`; `UsernameTakenError`; `EmailTakenError`; `InvalidReferenceError` (unknown
municipality); `InvalidInputError` (malformed birth date); `IdentityBannedError` (banned email, BR-MOD-04).
Outcome: the new user id.

### `AuthRepository.createUserWithGoogle`

```ts
createUserWithGoogle(input: CreateUserWithGoogleInput): Promise<{ userId: string }>
```

Creates an account from a Google identity, with its settings, in one transaction.
The email is not merged with an existing account (BR-ACC-06).

Rules: BR-ACC-01, BR-ACC-02, BR-ACC-03, BR-ACC-04, BR-ACC-05 (one identity per Google subject), BR-ACC-06.
Errors: `UnderMinimumAgeError`; `EmailBelongsToExistingAccountError` (the email already has an account);
`UsernameTakenError`; `GoogleAlreadyLinkedError`; `InvalidReferenceError` (unknown municipality);
`IdentityBannedError` (banned email or Google identity, BR-MOD-04).
Outcome: the new user id. `email_verified_at` is set to now() when `emailVerified` is true.

### `AuthRepository.findLoginByEmail`

```ts
findLoginByEmail(email: string): Promise<LoginInfo | null>
```

Finds the login data of the account that uses this email (case-insensitive lookup on the blind index).

Rules: BR-ACC-04, BR-ACC-07.
Errors: none expected.
Outcome: the login data (with the password hash, or `null` for a Google-only account, and the ban in force or
`null`), or `null` when no account matches. Refuse the login when `activeBan` is set (BR-MOD-03).
Note: returns `passwordHash`, which is allowed here only for authentication.

### `AuthRepository.findUserByGoogleSubject`

```ts
findUserByGoogleSubject(subject: string): Promise<{ userId: string; role: LoginInfo['role']; activeBan: LoginInfo['activeBan']; } | null>
```

Finds the account linked to a Google subject.

Rules: BR-ACC-05, BR-MOD-03.
Errors: none expected.
Outcome: the user id, role and ban in force (refuse the login when set), or `null` when no account is linked to
this subject.

### `AuthRepository.linkGoogle`

```ts
linkGoogle(userId: string, googleSubject: string): Promise<void>
```

Links a Google identity to an existing account.

Rules: BR-ACC-05 (a Google subject is unique; one Google identity per account), BR-ACC-06 (no merging).
Errors: `GoogleAlreadyLinkedError` when the subject or the account already has a Google identity; `NotFoundError`;
`IdentityBannedError` (BR-MOD-04).
Outcome: nothing.

### `AuthRepository.unlinkGoogle`

```ts
unlinkGoogle(userId: string): Promise<void>
```

Removes the Google identity of an account. The account row is locked so that two concurrent
removals cannot both pass the check.

Rules: BR-ACC-05 (an account keeps at least one login method).
Errors: `LastLoginMethodError` when the Google identity is the only login method; `NotFoundError`.
Outcome: nothing. When the account has no Google identity, nothing changes.

### `AuthRepository.setPasswordHash`

```ts
setPasswordHash(userId: string, passwordHash: string): Promise<void>
```

Sets the password hash of an account, creating the password identity when it does not exist.

Rules: BR-ACC-05, BR-TECH-11 (argon2id, computed by the developers).
Errors: `NotFoundError` when the account does not exist.
Outcome: nothing.

### `AuthRepository.issueRefreshToken`

```ts
issueRefreshToken(input: IssueRefreshTokenInput): Promise<{ familyId: string }>
```

Stores a new refresh token (hashed). A new rotation family is created unless `familyId` is given.

Rules: BR-ACC-07, BR-TECH-11.
Errors: `NotFoundError` when the account does not exist.
Outcome: the family id of the token.

### `AuthRepository.rotateRefreshToken`

```ts
rotateRefreshToken(input: RotateRefreshTokenInput): Promise<{ userId: string; familyId: string }>
```

Rotates a refresh token: the old token is replaced by a new one of the same family.
If the old token was already rotated or revoked, the whole family is revoked (the revocation is committed),
then `RefreshTokenReuseError` is thrown. Unknown or expired tokens are refused without revoking anything.

Rules: BR-ACC-07 (rotated on use, revocable), BR-TECH-11 (reuse detection by family).
Errors: `InvalidTokenError` (unknown or expired); `RefreshTokenReuseError` (reuse, family revoked).
Outcome: the user id and family id of the new token.

### `AuthRepository.revokeRefreshToken`

```ts
revokeRefreshToken(token: string): Promise<void>
```

Revokes one refresh token. Revoking an unknown or already revoked token does nothing.

Rules: BR-ACC-07 (revocation one by one).
Errors: none expected.
Outcome: nothing.

### `AuthRepository.revokeAllRefreshTokens`

```ts
revokeAllRefreshTokens(userId: string): Promise<void>
```

Revokes every refresh token of an account (all devices).

Rules: BR-ACC-07 (revocation for all devices).
Errors: none expected.
Outcome: nothing.

### `AuthRepository.createAccountToken`

```ts
createAccountToken(input: CreateAccountTokenInput): Promise<void>
```

Stores a single-use account token (email verification or password reset), hashed.

Rules: BR-ACC-07.
Errors: `NotFoundError` when the account does not exist.
Outcome: nothing.

### `AuthRepository.consumeAccountToken`

```ts
consumeAccountToken(purpose: AccountTokenPurpose, token: string): Promise<{ userId: string }>
```

Consumes an account token: it must match the purpose, be unused and unexpired. The use is recorded in the
same statement, so a token can be consumed only once.

Rules: BR-ACC-07.
Errors: `InvalidTokenError` (unknown, wrong purpose, expired or already used).
Outcome: the user id the token belongs to.

### `AuthRepository.markEmailVerified`

```ts
markEmailVerified(userId: string): Promise<void>
```

Marks the email of an account as verified. An existing verification date is kept.

Rules: BR-ACC-07.
Errors: `NotFoundError` when the account does not exist.
Outcome: nothing.

## UserRepository

Source: `apps/api/src/data/repositories/user.repository.ts`

Own and public profile, sports, ratings, availability, settings, username search, and account deletion request.
Every read that depends on who is looking takes `viewerId` first and applies profile visibility (BR-ACC-14).
Lists that a user replaces (sports, ratings, availability) are replaced in one transaction.

### `UserRepository.getMe`

```ts
getMe(userId: string): Promise<MeProfile>
```

Returns the full profile of the account, including the decrypted email and birth date. Only the account owner
may call this; the caller passes the authenticated user's id.

Rules: BR-ACC-01, BR-ACC-04 (decryption), BR-ACC-09 to BR-ACC-15 (own data is never filtered), BR-GDP-03
(deletion request date).
Errors: `NotFoundError` when the account does not exist.
Outcome: the own profile, read in one transaction.

### `UserRepository.getProfile`

```ts
getProfile(viewerId: string, userId: string): Promise<PublicProfile | null>
```

Returns the profile of `userId` as seen by `viewerId`. The profile section visibility decides what is returned:
a hidden profile gives only the identity fields and `isHidden: true`. Email, birth date and role are never returned.

Rules: BR-ACC-14 (profile visibility: `public` and `members` for any viewer, `friends` for friends, `only_me`
for the owner only), BR-SOC-01 (friends), BR-SOC-02 (blocked in either direction).
Errors: none expected.
Outcome: `null` when the account does not exist or when either user blocked the other; otherwise the public profile.

### `UserRepository.updateProfile`

```ts
updateProfile(userId: string, patch: UpdateProfilePatch): Promise<void>
```

Updates the given fields of the own profile. Only the fields present in `patch` change.

Rules: BR-ACC-01, BR-ACC-09 (gender, optional), BR-ACC-13 and BR-ACC-19 (municipality), BR-ACC-16 (avatar path).
Errors: `NotFoundError`; `InvalidReferenceError` (unknown municipality).
Outcome: nothing.

### `UserRepository.setUsername`

```ts
setUsername(userId: string, username: string): Promise<void>
```

Changes the username. Usernames are unique and case-insensitive.

Rules: BR-ACC-02.
Errors: `UsernameTakenError`; `NotFoundError`.
Outcome: nothing.

### `UserRepository.setSports`

```ts
setSports(userId: string, items: UserSportLevel[]): Promise<void>
```

Replaces all sports of the user with the given levels, in one transaction.

Rules: BR-ACC-10 (one self-declared level per sport on the shared scale).
Errors: `InvalidInputError` (a sport given twice); `InvalidReferenceError` (unknown sport or level); `NotFoundError`.
Outcome: nothing. An empty list removes all sports.

### `UserRepository.setRatings`

```ts
setRatings(userId: string, items: UserRatingInput[]): Promise<void>
```

Replaces all official ratings of the user, in one transaction. Each rating is checked against its system:
a numeric system takes a number within its bounds and no grade; a graded system takes a grade of that system and no number.

Rules: BR-ACC-11.
Errors: `InvalidRatingError` (value does not match its system); `InvalidReferenceError` (unknown system or grade);
`InvalidInputError` (a system given twice); `NotFoundError`.
Outcome: nothing. An empty list removes all ratings.

### `UserRepository.getAvailability`

```ts
getAvailability(viewerId: string, userId: string): Promise<AvailabilitySlot[] | null>
```

Returns the availability slots of a user, if the viewer may see the profile.

Rules: BR-ACC-12, BR-ACC-14 (the availability follows the profile visibility).
Errors: none expected.
Outcome: `null` when the account does not exist or the viewer may not see it; otherwise the slots by day then start time.

### `UserRepository.setAvailability`

```ts
setAvailability(userId: string, slots: AvailabilitySlot[]): Promise<void>
```

Replaces all availability slots of the user, in one transaction. Times are 'HH:mm' in local time.

Rules: BR-ACC-12 (slots of one user never overlap; day 1 to 7, ISO; end after start).
Errors: `OverlappingSlotsError`; `InvalidSlotError` (day out of range, end not after start, bad time format); `NotFoundError`.
Outcome: nothing. An empty list removes all slots.

### `UserRepository.getSettings`

```ts
getSettings(userId: string): Promise<UserSettings>
```

Returns the privacy and interaction settings of the account.

Rules: BR-ACC-14, BR-ACC-15.
Errors: `NotFoundError` when the account does not exist.
Outcome: the settings.

### `UserRepository.updateSettings`

```ts
updateSettings(userId: string, patch: Partial<UserSettings>): Promise<UserSettings>
```

Updates the given settings. Only the fields present in `patch` change.

Rules: BR-ACC-14 (section visibility), BR-ACC-15 (hide from rankings, invite policy).
Errors: `NotFoundError`.
Outcome: the settings after the update.

### `UserRepository.touchLastActive`

```ts
touchLastActive(userId: string): Promise<void>
```

Records that the user was active now. Used for the inactivity rules.

Rules: BR-GDP-08 (inactive accounts).
Errors: none expected. An unknown account is ignored.
Outcome: nothing.

### `UserRepository.searchUsers`

```ts
searchUsers(viewerId: string, query: string, page: PageRequest = {}): Promise<Page<UserSearchResult>>
```

Searches users by username: accent- and case-insensitive trigram match (BR-TECH-10). The viewer is excluded.
Results are ordered by username then id (keyset pagination, the cursor holds the last username and id).
Ordering by similarity was not chosen to keep the cursor stable.

Rules: BR-TECH-10.
Errors: `INVALID_CURSOR` (malformed cursor).
Outcome: a page of at most `limit` users (default 20, max 100). A query shorter than 2 characters returns an empty page.

### `UserRepository.requestDeletion`

```ts
requestDeletion(userId: string): Promise<{ deletionRequestedAt: Date }>
```

Records a request to delete the account. The erasure itself runs after a 30-day grace period (batch 6).
A second request keeps the first date.

Rules: BR-GDP-03.
Errors: `NotFoundError`.
Outcome: the instant of the request.

### `UserRepository.cancelDeletion`

```ts
cancelDeletion(userId: string): Promise<void>
```

Cancels a pending account deletion request.

Rules: BR-GDP-03.
Errors: `NotFoundError`.
Outcome: nothing.

## FollowRepository

Source: `apps/api/src/data/repositories/follow.repository.ts`

Follows, follow requests, friends and relationship reads (BR-SOC-01, BR-ACC-14).
Lists are gated by the owner's `follows_visibility` and hide users blocked with the viewer (BR-SOC-02).

### `FollowRepository.follow`

```ts
follow(followerId: string, followedId: string): Promise<{ status: FollowStatus }>
```

Makes `followerId` follow `followedId`. A private account receives a pending request, a public one an accepted
follow. Following again returns the current status (idempotent).

Rules: BR-SOC-01 (no self follow, friends are mutual accepted follows), BR-SOC-02 (refused while blocked in
either direction), BR-ACC-14 (private accounts approve requests).
Errors: `SelfActionError`, `BlockedError`, `NotFoundError` (unknown user).
Outcome: `{ status }`, the status of the follow after the call.

### `FollowRepository.acceptFollowRequest`

```ts
acceptFollowRequest(userId: string, followerId: string): Promise<void>
```

Accepts the pending follow request of `followerId` towards `userId`.
Rules: BR-ACC-14. The developers check that `userId` is the account owner.
Errors: `NotFoundError` when no pending request exists.
Outcome: none.

### `FollowRepository.declineFollowRequest`

```ts
declineFollowRequest(userId: string, followerId: string): Promise<void>
```

Declines (deletes) the pending follow request of `followerId` towards `userId`.
Rules: BR-ACC-14.
Errors: `NotFoundError` when no pending request exists.
Outcome: none.

### `FollowRepository.unfollow`

```ts
unfollow(followerId: string, followedId: string): Promise<void>
```

Removes the follow from `followerId` to `followedId`, whatever its status. No error when absent.
Rules: BR-SOC-01.
Outcome: none.

### `FollowRepository.removeFollower`

```ts
removeFollower(userId: string, followerId: string): Promise<void>
```

Removes a follower of `userId` (the follow from `followerId` to `userId`). No error when absent.
Rules: BR-SOC-01. The developers check that `userId` is the account owner.
Outcome: none.

### `FollowRepository.listFollowers`

```ts
listFollowers(viewerId: string, userId: string, page: PageRequest = {}): Promise<Page<FollowListItem> | null>
```

Lists the accepted followers of `userId`, ordered by username.
Rules: BR-ACC-14 (`follows_visibility`), BR-SOC-02 (users blocked with the viewer are hidden).
Errors: `INVALID_CURSOR`.
Outcome: `null` when the list is not visible to the viewer (or the account does not exist); otherwise a page.

### `FollowRepository.listFollowing`

```ts
listFollowing(viewerId: string, userId: string, page: PageRequest = {}): Promise<Page<FollowListItem> | null>
```

Lists the users `userId` follows (accepted follows only), ordered by username.
Rules: BR-ACC-14 (`follows_visibility`), BR-SOC-02.
Errors: `INVALID_CURSOR`.
Outcome: `null` when not visible to the viewer; otherwise a page.

### `FollowRepository.listFriends`

```ts
listFriends(viewerId: string, userId: string, page: PageRequest = {}): Promise<Page<FollowListItem> | null>
```

Lists the friends of `userId` (mutual accepted follows), ordered by username.
Rules: BR-SOC-01, BR-ACC-14 (`follows_visibility`), BR-SOC-02.
Errors: `INVALID_CURSOR`.
Outcome: `null` when not visible to the viewer; otherwise a page.

### `FollowRepository.listPendingFollowRequests`

```ts
listPendingFollowRequests(userId: string): Promise<PendingFollowRequest[]>
```

Lists the pending follow requests received by `userId`, oldest first. Only the account owner should call it.
Rules: BR-ACC-14.
Outcome: the requests, not paginated.

### `FollowRepository.getRelationship`

```ts
getRelationship(viewerId: string, otherId: string): Promise<Relationship>
```

Describes the relationship between the viewer and another user, in both directions.
Rules: BR-SOC-01 (friends), BR-SOC-02 (blocks in both directions).
Outcome: the relationship; `none` everywhere for two unrelated users.

## BlockRepository

Source: `apps/api/src/data/repositories/block.repository.ts`

Blocks and unblocks users, and lists blocks (BR-SOC-02 to BR-SOC-04).
A block is total and mutual; it never removes circle or community memberships (BR-SOC-04).

### `BlockRepository.block`

```ts
block(blockerId: string, blockedId: string): Promise<BlockOutcome>
```

Blocks `blockedId` on behalf of `blockerId`, in one transaction:
- inserts the block (idempotent);
- removes the follows in both directions, including pending requests;
- cancels the pending circle invitations between the two users, whoever invited whom.
Memberships and chats are kept (BR-SOC-04).

Rules: BR-SOC-02, BR-SOC-03 (shared upcoming occurrences), BR-SOC-04.
Errors: `SelfActionError`, `NotFoundError` (unknown user).
Outcome: `sharedUpcomingOccurrenceIds`, for the BR-SOC-03 warning: scheduled occurrences that start later and where
both users hold an active registration.

### `BlockRepository.unblock`

```ts
unblock(blockerId: string, blockedId: string): Promise<void>
```

Removes the block set by `blockerId` on `blockedId`. Unblocking does not restore the follows that the block removed.
Rules: BR-SOC-02.
Errors: none when the block does not exist.
Outcome: none.

### `BlockRepository.listMyBlocks`

```ts
listMyBlocks(userId: string): Promise<BlockedUser[]>
```

Lists the users blocked by `userId`, most recent block first.
Rules: BR-SOC-02.
Outcome: the blocked users, not paginated.

### `BlockRepository.listBlocksOfUser`

```ts
listBlocksOfUser(userId: string): Promise<BlockRecord[]>
```

Lists every block in which `userId` is the blocker or the blocked user.
Rules: BR-SOC-04 (admins can see blocks). The developers check the admin role.
Outcome: the block rows, oldest first, not paginated.

## CircleRepository

Source: `apps/api/src/data/repositories/circle.repository.ts`

Circle membership, roles, invitations and ownership hand-over (BR-SOC-05 to BR-SOC-08).

### `CircleRepository.createCircle`

```ts
createCircle(ownerId: string, input: CreateCircleInput): Promise<Circle>
```

Creates a circle. The creator becomes its `owner` member, in the same transaction.
Rules: BR-SOC-05 (exactly one owner).
Errors: `NotFoundError` (unknown user).
Outcome: the new circle.

### `CircleRepository.updateCircle`

```ts
updateCircle(circleId: string, patch: UpdateCirclePatch): Promise<void>
```

Updates the name and/or description of a circle. Only the given fields change.
Rules: BR-SOC-05. The developers check that the caller is an owner or admin.
Errors: `NotFoundError`.
Outcome: none.

### `CircleRepository.deleteCircle`

```ts
deleteCircle(circleId: string): Promise<void>
```

Deletes a circle. Its memberships, invitations and (in batch 2) chat are deleted with it.
Rules: BR-SOC-07 (a circle can be deleted), BR-MSG-06. The developers check that the caller is the owner.
Errors: `NotFoundError`.
Outcome: none.

### `CircleRepository.invite`

```ts
invite(circleId: string, inviterId: string, inviteeId: string): Promise<InviteOutcome>
```

Invites `inviteeId` to a circle on behalf of `inviterId`. Checks, in this order:
the inviter is a member; not self; the invitee is not already a member; not blocked in either direction;
the invitee's circle invitation setting accepts this inviter; no pending invitation exists.
A member's invitation waits for an admin (`awaiting_admin`). An owner's or admin's goes straight to the
invitee (`awaiting_invitee`).

Rules: BR-SOC-02 (blocking), BR-SOC-06 (invitation flow), BR-ACC-15 (who may invite me).
Errors: `NotMemberError`, `SelfActionError`, `AlreadyMemberError`, `BlockedError`, `InvitePolicyError`,
`InvitationAlreadyPendingError`, `NotFoundError`.
Outcome: the invitation id and its first status.

### `CircleRepository.approveInvitation`

```ts
approveInvitation(invitationId: string, adminId: string): Promise<ApproveInvitationOutcome>
```

Approves a member's invitation: `awaiting_admin` becomes `awaiting_invitee`, and `adminId` is recorded.
Rules: BR-SOC-06. The developers check that `adminId` is an owner or admin of the circle.
Errors: `NotFoundError`, `InvalidStateError` (not awaiting an admin).
Outcome: the invitee's id, so that the developers can notify them.

### `CircleRepository.rejectInvitation`

```ts
rejectInvitation(invitationId: string, adminId: string): Promise<void>
```

Rejects a member's invitation: `awaiting_admin` becomes `rejected_by_admin`.
Rules: BR-SOC-06. The developers check that `adminId` is an owner or admin of the circle.
The rejecting admin is recorded in the audit log (`circle.invitation_rejected`, BR-MOD-05).
Errors: `NotFoundError`, `InvalidStateError`.
Outcome: none.

### `CircleRepository.respondToInvitation`

```ts
respondToInvitation(invitationId: string, inviteeId: string, accept: boolean): Promise<void>
```

The invitee answers an invitation that awaits their answer. Accepting adds them as a `member`.
Accepting stays allowed when the users were blocked after the invitation was sent: the rule only stops new
invitations (BR-SOC-02, BR-SOC-06).
Rules: BR-SOC-06.
Errors: `NotFoundError` (not this invitee's invitation), `InvalidStateError` (not awaiting the invitee),
`AlreadyMemberError`.
Outcome: none.

### `CircleRepository.cancelInvitation`

```ts
cancelInvitation(invitationId: string): Promise<void>
```

Cancels a pending invitation (`awaiting_admin` or `awaiting_invitee`).
Rules: BR-SOC-06. The developers check that the caller is the inviter, an admin or the owner.
Errors: `NotFoundError`, `InvalidStateError` (not pending).
Outcome: none.

### `CircleRepository.leaveCircle`

```ts
leaveCircle(circleId: string, userId: string): Promise<LeaveCircleOutcome>
```

The user leaves a circle. When the owner leaves, ownership passes to the oldest admin, or to the oldest member
when there is no admin. When nobody is left, the circle is deleted. The circle row is locked first, so
concurrent departures are serialized.

Rules: BR-SOC-05 (exactly one owner), BR-SOC-07 (hand-over order).
Errors: `NotFoundError` (circle), `NotMemberError`.
Outcome: the new owner (or null) and whether the circle was deleted.

### `CircleRepository.removeMember`

```ts
removeMember(circleId: string, userId: string): Promise<void>
```

Removes a member from a circle. The owner cannot be removed: transfer ownership first.
Rules: BR-SOC-05, BR-SOC-07. The developers check the caller's role.
Errors: `NotMemberError`, `OwnerCannotBeRemovedError`, `NotFoundError`.
Outcome: none.

### `CircleRepository.setMemberRole`

```ts
setMemberRole(circleId: string, userId: string, role: 'admin' | 'member'): Promise<void>
```

Sets the role of a member to `admin` or `member`. The owner's role cannot change here: use `transferOwnership`.
Rules: BR-SOC-05. The developers check the caller's role.
Errors: `NotMemberError`, `OwnerCannotBeRemovedError`, `NotFoundError`.
Outcome: none.

### `CircleRepository.transferOwnership`

```ts
transferOwnership(circleId: string, newOwnerId: string): Promise<void>
```

Transfers ownership to a member. The former owner becomes an `admin`. Transferring to the current owner does nothing.
Rules: BR-SOC-05 (exactly one owner), BR-SOC-07. The developers check that the caller is the owner.
Errors: `NotMemberError` (new owner is not a member), `NotFoundError`.
Outcome: none.

### `CircleRepository.getMemberRole`

```ts
getMemberRole(circleId: string, userId: string): Promise<CircleRole | null>
```

Returns the role of a user in a circle, or null when the user is not a member.
Used by the developers' permission checks.
Outcome: `'owner' | 'admin' | 'member' | null`.

### `CircleRepository.listMyCircles`

```ts
listMyCircles(userId: string): Promise<MyCircle[]>
```

Lists the circles of a user with the user's role and the member count.
Rules: BR-SOC-05 (circles are private to their members).
Outcome: the circles, sorted by name, not paginated.

### `CircleRepository.getCircle`

```ts
getCircle(viewerId: string, circleId: string): Promise<CircleDetails | null>
```

Returns a circle to one of its members. Circles are private (BR-SOC-05).
Errors: none.
Outcome: `null` when the viewer is not a member (or the circle does not exist); otherwise the details.

### `CircleRepository.listMembers`

```ts
listMembers(viewerId: string, circleId: string): Promise<CircleMember[] | null>
```

Lists the members of a circle, oldest member first. Members only (BR-SOC-05). A member blocked with the viewer
stays in the circle but is hidden from the viewer, and the viewer is hidden from them (BR-SOC-04).
Outcome: `null` when the viewer is not a member; otherwise the members, not paginated.

### `CircleRepository.listMyInvitations`

```ts
listMyInvitations(userId: string): Promise<MyCircleInvitation[]>
```

Lists the invitations waiting for the user's answer (`awaiting_invitee`), oldest first.
Outcome: the invitations, with the circle name and the inviter's username.

### `CircleRepository.listPendingApprovals`

```ts
listPendingApprovals(circleId: string): Promise<PendingCircleApproval[]>
```

Lists the member invitations waiting for an admin's approval (`awaiting_admin`), oldest first.
Rules: BR-SOC-06. The developers check that the caller is an owner or admin of the circle.
Outcome: the invitations, with the invitee's and inviter's usernames.

## CommunityRepository

Source: `apps/api/src/data/repositories/community.repository.ts`

Communities: creation, join policy, join requests, membership, roles and ownership hand-over, search
and member lists (BR-SOC-09). Communities are public; their member lists are visible to members only.

### `CommunityRepository.createCommunity`

```ts
createCommunity(ownerId: string, input: CreateCommunityInput): Promise<Community>
```

Creates a community. The creator becomes its `owner` member, in the same transaction.
Rules: BR-SOC-09.
Errors: `NotFoundError` (unknown user).
Outcome: the new community.

### `CommunityRepository.updateCommunity`

```ts
updateCommunity(id: string, patch: UpdateCommunityPatch): Promise<void>
```

Updates the given fields of a community. Only the fields present in `patch` change.
Rules: BR-SOC-09. The developers check that the caller is the owner or a moderator.
Errors: `NotFoundError`.
Outcome: none.

### `CommunityRepository.deleteCommunity`

```ts
deleteCommunity(id: string): Promise<void>
```

Deletes a community with its memberships, requests and (in batch 2) chat.
Rules: BR-SOC-09, BR-MSG-06. The developers check that the caller is the owner.
Errors: `NotFoundError`.
Outcome: none.

### `CommunityRepository.join`

```ts
join(communityId: string, userId: string): Promise<JoinCommunityOutcome>
```

Joins a community. With the `open` policy the user becomes a member at once. With `on_request` a pending
join request is created for an owner or moderator to decide.
Rules: BR-SOC-09.
Errors: `AlreadyMemberError`, `JoinRequestAlreadyPendingError`, `NotFoundError`.
Outcome: `'member'` or `'requested'`.

### `CommunityRepository.cancelJoinRequest`

```ts
cancelJoinRequest(requestId: string, userId: string): Promise<void>
```

Cancels a pending join request made by `userId`.
Rules: BR-SOC-09.
Errors: `NotFoundError` (no request of this user), `InvalidStateError` (not pending).
Outcome: none.

### `CommunityRepository.decideJoinRequest`

```ts
decideJoinRequest(requestId: string, deciderId: string, accept: boolean): Promise<DecideJoinRequestOutcome>
```

Accepts or declines a pending join request. Accepting adds the user as a `member`. Both outcomes record the decider.
Rules: BR-SOC-09. The developers check that the decider is the owner or a moderator.
Errors: `NotFoundError`, `InvalidStateError` (not pending), `AlreadyMemberError`.
Outcome: the id of the user who asked to join, so that the developers can notify them.

### `CommunityRepository.leave`

```ts
leave(communityId: string, userId: string): Promise<LeaveCommunityOutcome>
```

The user leaves a community. When the owner leaves, ownership passes to the oldest moderator, or to the oldest
member when there is no moderator. When nobody is left, the community is deleted.
Rules: BR-SOC-09 (exactly one owner, hand-over order).
Errors: `NotFoundError` (community), `NotMemberError`.
Outcome: the new owner (or null) and whether the community was deleted.

### `CommunityRepository.removeMember`

```ts
removeMember(communityId: string, userId: string): Promise<void>
```

Removes a member from a community. The owner cannot be removed: transfer ownership first.
Rules: BR-SOC-09. The developers check the caller's role.
Errors: `NotMemberError`, `OwnerCannotBeRemovedError`, `NotFoundError`.
Outcome: none.

### `CommunityRepository.setMemberRole`

```ts
setMemberRole(communityId: string, userId: string, role: 'moderator' | 'member'): Promise<void>
```

Sets the role of a member to `moderator` or `member`. The owner's role changes only through `transferOwnership`.
Rules: BR-SOC-09. The developers check the caller's role.
Errors: `NotMemberError`, `OwnerCannotBeRemovedError`, `NotFoundError`.
Outcome: none.

### `CommunityRepository.transferOwnership`

```ts
transferOwnership(communityId: string, newOwnerId: string): Promise<void>
```

Transfers ownership to a member. The former owner becomes a `moderator`. Transferring to the current owner does nothing.
Rules: BR-SOC-09. The developers check that the caller is the owner.
Errors: `NotMemberError` (new owner is not a member), `NotFoundError`.
Outcome: none.

### `CommunityRepository.getMemberRole`

```ts
getMemberRole(communityId: string, userId: string): Promise<CommunityRole | null>
```

Returns the role of a user in a community, or null when the user is not a member.
Used by the developers' permission checks.
Outcome: `'owner' | 'moderator' | 'member' | null`.

### `CommunityRepository.searchCommunities`

```ts
searchCommunities(viewerId: string, input: { query?: string } & PageRequest): Promise<Page<CommunitySearchResult>>
```

Searches communities. With a query of at least 2 characters, matches the name with pg_trgm and unaccent
(typo-tolerant, accent-insensitive) and sorts by name. Otherwise lists the newest communities first.
Communities are public, so no visibility rule applies. `viewerId` is accepted for consistency with the other reads.
Rules: BR-TECH-10 (text search), BR-SOC-09.
Errors: `INVALID_CURSOR`.
Outcome: a cursor page.

### `CommunityRepository.getCommunity`

```ts
getCommunity(viewerId: string, id: string): Promise<CommunityDetails | null>
```

Returns a community as seen by a viewer: its details, the viewer's role and whether the viewer has a pending request.
Communities are public.
Errors: none.
Outcome: `null` when the community does not exist.

### `CommunityRepository.listMembers`

```ts
listMembers(viewerId: string, id: string, page: PageRequest = {}): Promise<Page<CommunityMember> | null>
```

Lists the members of a community by username. Members only. Members blocked with the viewer are hidden (BR-SOC-04).
Rules: BR-SOC-09, BR-SOC-02.
Errors: `INVALID_CURSOR`.
Outcome: `null` when the viewer is not a member; otherwise a cursor page.

### `CommunityRepository.listMyCommunities`

```ts
listMyCommunities(userId: string): Promise<MyCommunity[]>
```

Lists the communities of a user with the user's role and the member count, sorted by name.
Outcome: the communities, not paginated.

### `CommunityRepository.listPendingJoinRequests`

```ts
listPendingJoinRequests(communityId: string): Promise<PendingJoinRequest[]>
```

Lists the pending join requests of a community, oldest first.
Rules: BR-SOC-09. The developers check that the caller is the owner or a moderator.
Outcome: the requests, not paginated.

## VenueRepository

Source: `apps/api/src/data/repositories/venue.repository.ts`

Saved venues (BR-EVT-08). Venues are public by default and can be made private by their creator.
Who may edit or delete a venue is checked by the developers (the creator).

### `VenueRepository.createVenue`

```ts
createVenue(userId: string, input: CreateVenueInput): Promise<Venue>
```

Creates a venue, public unless `isPrivate` is set (BR-EVT-08).
Errors: `InvalidReferenceError` (unknown municipality), `NotFoundError` (unknown creator).
Outcome: the new venue.

### `VenueRepository.updateVenue`

```ts
updateVenue(venueId: string, patch: UpdateVenuePatch): Promise<void>
```

Updates the given fields of a venue. Events keep the address and point they copied (BR-EVT-08).
Errors: `NotFoundError`, `InvalidReferenceError`.
Outcome: none.

### `VenueRepository.deleteVenue`

```ts
deleteVenue(venueId: string): Promise<void>
```

Deletes a venue. Events and occurrences that used it keep their copied address and point (BR-EVT-08, FK SET NULL).
Errors: `NotFoundError`.
Outcome: none.

### `VenueRepository.searchVenues`

```ts
searchVenues(viewerId: string, input: SearchVenuesInput): Promise<Venue[]>
```

Searches venues visible to the viewer: public venues and the viewer's own private ones (BR-EVT-08).
`near` keeps venues within the radius; `query` matches names with trigram similarity (BR-TECH-10).
Errors: `InvalidInputError` (query shorter than 2 characters, radius not positive).
Outcome: up to `limit` venues (default 20, max 100), closest first when `near` is given, else best match first.

## EventRepository

Source: `apps/api/src/data/repositories/event.repository.ts`

Events: templates, occurrences, organizers, venues-free scheduling, and the read side for viewers
(search, details, my lists). Rules: BR-EVT-01 to BR-EVT-27, BR-REG-06 for the occurrence rows.
Permissions (who may create, edit or cancel) are checked by the developers; this class checks the data rules.

### `EventRepository.createEvent`

```ts
createEvent(ownerId: string, input: CreateEventInput): Promise<{ eventId: string }>
```

Creates an event as a draft (BR-EVT-01, BR-EVT-02, BR-EVT-08, BR-EVT-23).
Checks: level range (min rank <= max rank); recurrence subset; `circle_priority` and `circle_only` need at least one
circle that the owner is a member of; `community_only` needs a community; a venue fills the missing address,
point and municipality, otherwise they are required (BR-EVT-08). The community creator check (BR-SOC-10) is the
developers' job.
Errors: `InvalidInputError`, `InvalidRecurrenceError`, `InvalidReferenceError`, `NotMemberError`, `NotFoundError`.
Outcome: the new event id.

### `EventRepository.publishEvent`

```ts
publishEvent(eventId: string): Promise<void>
```

Publishes a draft (BR-EVT-24). A one-off event gets its single occurrence now (BR-EVT-03); a series does not.
Errors: `NotFoundError`, `InvalidStateError` (not a draft).
Outcome: none.

### `EventRepository.updateEvent`

```ts
updateEvent(eventId: string, actorId: string, patch: UpdateEventPatch, scope: UpdateEventScope): Promise<UpdateEventOutcome>
```

Edits an event (BR-EVT-04, BR-EVT-05, BR-EVT-06, BR-EVT-07), in one of three scopes:
- `'series'`: the event row; schedule changes apply to upcoming scheduled occurrences;
- `{ occurrenceDate }`: only start, duration, place and capacity of that date;
- `{ fromDate }`: "this and following", which splits the series (not for a one-off event).
Capacity below the confirmed spots is refused (BR-EVT-06). A cancelled event cannot be edited.
Errors: `NotFoundError`, `InvalidStateError`, `InvalidInputError`, `InvalidRecurrenceError`, `InvalidReferenceError`,
`CapacityBelowConfirmedError`.
Outcome: the active registrants to notify (without `actorId`) and whether the change is significant.

### `EventRepository.cancelEvent`

```ts
cancelEvent(eventId: string, actorId: string, reason?: string): Promise<CancelOutcome>
```

Cancels an event: the event becomes `cancelled` and every upcoming scheduled occurrence is cancelled (BR-EVT-24).
Permission: organizers, moderators and admins (BR-EVT-25), checked by the developers.
Errors: `NotFoundError`, `InvalidStateError` (already cancelled).
Outcome: the active registrants of the cancelled occurrences, without `actorId`.

### `EventRepository.cancelOccurrence`

```ts
cancelOccurrence(key: OccurrenceKey, actorId: string, reason?: string): Promise<CancelOutcome>
```

Cancels one occurrence, materializing it first (BR-EVT-03). Only a published event has occurrences to cancel.
Permission: organizers, moderators and admins (BR-EVT-25), checked by the developers.
Errors: `NotFoundError` (unknown event or date), `InvalidStateError` (not published, or not scheduled).
Outcome: the active registrants of the occurrence, without `actorId`.

### `EventRepository.transferOwnership`

```ts
transferOwnership(eventId: string, newOwnerId: string): Promise<void>
```

Transfers ownership to a co-organizer (BR-EVT-20, BR-EVT-21). The new owner leaves the co-organizers; the old owner
joins them with the old owner's capacity flag; the event takes the new owner's flag. Registrations are unchanged.
Permission: the current owner, checked by the developers.
Errors: `NotCoOrganizerError` (the new owner is not a co-organizer), `NotFoundError`.
Outcome: none.

### `EventRepository.addCoOrganizer`

```ts
addCoOrganizer(eventId: string, userId: string, countsTowardCapacity: boolean): Promise<void>
```

Adds a co-organizer (BR-EVT-20). If the co-organizer counts toward capacity, a confirmed registration is added on
every upcoming scheduled materialized occurrence, when the capacity allows; otherwise nothing changes (BR-EVT-21, BR-EVT-22).
Permission: the owner, checked by the developers.
Errors: `BlockedError` (blocked with the owner, BR-SOC-02), `InvalidInputError` (owner or already a co-organizer),
`OccurrenceFullError`, `NotFoundError`.
Outcome: none.

### `EventRepository.removeCoOrganizer`

```ts
removeCoOrganizer(eventId: string, userId: string): Promise<PromotionOutcome>
```

Removes a co-organizer (BR-EVT-20). Their organizer registrations on upcoming occurrences are cancelled, not as late
cancellations (BR-REG-06), and the waitlist is promoted where spots were freed (BR-REG-04).
Permission: the owner, checked by the developers.
Errors: `NotCoOrganizerError`, `NotFoundError`.
Outcome: the promoted users, to notify.

### `EventRepository.getOrganizerRole`

```ts
getOrganizerRole(eventId: string, userId: string): Promise<'owner' | 'co_organizer' | null>
```

Organizer role of a user on an event, used by the developers for permission checks.
Outcome: 'owner', 'co_organizer', or null (also when the event does not exist).

### `EventRepository.setTargetCircles`

```ts
setTargetCircles(eventId: string, ownerId: string, circleIds: string[]): Promise<void>
```

Replaces the circles targeted by an event (BR-EVT-23). The owner must be a member of each circle.
`circle_priority` and `circle_only` events keep at least one circle.
Permission: the owner, checked by the developers. `ownerId` must be the event owner.
Errors: `InvalidInputError`, `InvalidReferenceError`, `NotMemberError`, `NotFoundError`.
Outcome: none.

### `EventRepository.searchOccurrences`

```ts
searchOccurrences(viewerId: string, input: SearchOccurrencesFilters & PageRequest): Promise<Page<OccurrenceSummary>>
```

Searches upcoming occurrences of published events visible to the viewer (BR-EVT-03, BR-EVT-09, BR-EVT-23, BR-SOC-02).
Algorithm: (1) SQL selects the candidate events (visibility, sport, level, text, date window, radius prefilter);
(2) SQL reads the materialized occurrences in the window with their effective values and counts; (3) TypeScript
expands the dates, merges the two, drops cancelled and out-of-radius occurrences, applies `hasFreeSpots`, sorts by
(startsAt, eventId, date) and paginates.
The range `from..to` is on the original local date of each occurrence (its key), inclusive, at most 31 days.
Errors: `InvalidInputError` (range, text shorter than 2 characters, invalid cursor), `InvalidReferenceError`.
Outcome: a cursor page of occurrence summaries.

### `EventRepository.getOccurrence`

```ts
getOccurrence(viewerId: string, key: OccurrenceKey): Promise<OccurrenceDetails | null>
```

Details of one occurrence for a viewer (BR-EVT-03, BR-EVT-09, BR-EVT-23). Returns null when the event is not
visible, or when the date is neither produced by the schedule nor materialized (BR-EVT-03).
The address and the exact point are hidden from viewers who are neither organizers nor registered (BR-EVT-09).
`pendingCount` is set for organizers only.
Outcome: the details, or null.

### `EventRepository.listMyUpcoming`

```ts
listMyUpcoming(userId: string): Promise<MyUpcomingRegistration[]>
```

The viewer's active registrations on upcoming scheduled occurrences (BR-REG-02). Not paginated.
Outcome: the list, earliest first.

### `EventRepository.listMyOrganized`

```ts
listMyOrganized(userId: string): Promise<MyOrganizedEvent[]>
```

Events the user owns or co-organizes, drafts included (BR-EVT-20). `next` is the first occurrence that starts
after now and is not cancelled, looked up over the next 400 days.
Outcome: the list, by title.

### `EventRepository.listMyPast`

```ts
listMyPast(userId: string, page: PageRequest = {}): Promise<Page<MyPastRegistration>>
```

The viewer's registrations on past occurrences (BR-REG-02), newest first, keyset paginated on (startsAt, id).
Outcome: a cursor page.

## RegistrationRepository

Source: `apps/api/src/data/repositories/registration.repository.ts`

Registrations to occurrences: register, cancel, approval, waitlist, removal and guests (BR-REG-01 to BR-REG-06).
Every method that counts spots or changes a registration locks the occurrence row `FOR UPDATE` first, inside one
transaction (business-rules section 1.4). Permissions (who may approve, remove or read the lists) are checked by
the developers.

### `RegistrationRepository.register`

```ts
register(key: OccurrenceKey, userId: string, input: { guestNames?: string[] } = {}): Promise<RegistrationOutcome>
```

Registers a user for one occurrence (BR-REG-01, BR-REG-02, BR-REG-03, BR-REG-04, BR-REG-05, BR-EVT-11, BR-SOC-02).
Steps, in one transaction: materialize the occurrence if needed (BR-EVT-03); lock it; check the event is visible
(BR-EVT-23, BR-SOC-02); check it is open (published, scheduled, starting later); for adults-only events, check the
age from the decrypted birth date (BR-EVT-11); refuse a second active registration; then the status:
- `approval` mode: `pending_approval`;
- `automatic` mode: `confirmed` if (1 + guests) fits and nobody is waiting, otherwise `waitlisted` (BR-REG-04).
A newcomer never jumps a non-empty waitlist: the queue is strictly first come, first served.
Errors: `NotFoundError`, `NotVisibleError`, `OccurrenceNotOpenError`, `AdultsOnlyError`, `AlreadyRegisteredError`,
`InvalidInputError` (empty guest name).
Outcome: the registration id and its status.

### `RegistrationRepository.cancelRegistration`

```ts
cancelRegistration(key: OccurrenceKey, userId: string): Promise<CancelRegistrationOutcome>
```

Cancels the user's active registration for an occurrence (BR-REG-06, BR-REG-04, BR-EVT-07).
The late flag is computed by the database clock and frozen: only for a confirmed registration, less than 24 hours
before the start, and not within 24 hours after a significant change. A cancellation that frees a confirmed spot
promotes the waitlist in automatic mode.
Errors: `NotFoundError` (no active registration).
Outcome: `wasLate` and the promoted users, to notify.

### `RegistrationRepository.approveRegistration`

```ts
approveRegistration(registrationId: string): Promise<void>
```

Approves a pending registration in approval mode (BR-REG-03). The spots, guests included, must fit.
Permission: organizers, checked by the developers.
Errors: `NotFoundError`, `InvalidStateError` (not pending), `OccurrenceFullError`.
Outcome: none.

### `RegistrationRepository.declineRegistration`

```ts
declineRegistration(registrationId: string): Promise<void>
```

Declines a pending or waitlisted registration (BR-REG-03, BR-REG-04). Neither holds a spot, so nobody is promoted.
Permission: organizers, checked by the developers.
Errors: `NotFoundError`, `InvalidStateError`.
Outcome: none.

### `RegistrationRepository.acceptFromWaitlist`

```ts
acceptFromWaitlist(registrationId: string): Promise<void>
```

Accepts a waitlisted registration as the organizer chooses, in any order (BR-REG-04, approval mode).
The spots must fit, guests included.
Permission: organizers, checked by the developers.
Errors: `NotFoundError`, `InvalidStateError` (not waitlisted), `OccurrenceFullError`.
Outcome: none.

### `RegistrationRepository.removeParticipant`

```ts
removeParticipant(registrationId: string, byUserId: string): Promise<PromotionOutcome>
```

Removes an active participant (BR-REG-02). A confirmed place is freed, so the waitlist is promoted in automatic mode.
The organizer who removed the participant is recorded in the audit log (`registration.removed`, BR-MOD-05).
Permission: organizers, checked by the developers.
Errors: `NotFoundError`, `InvalidStateError` (not active).
Outcome: the promoted users, to notify.

### `RegistrationRepository.setGuests`

```ts
setGuests(registrationId: string, guestNames: string[]): Promise<PromotionOutcome>
```

Replaces the guests of an active registration (BR-REG-05). For a confirmed registration, the new total must fit.
A reduction may free spots, so the waitlist is promoted in automatic mode (BR-REG-04).
Errors: `NotFoundError`, `InvalidStateError` (not active), `OccurrenceFullError`, `InvalidInputError`.
Outcome: the promoted users, to notify. (Declared as an outcome object: the change can free spots.)

### `RegistrationRepository.listParticipants`

```ts
listParticipants(viewerId: string, key: OccurrenceKey): Promise<Participant[] | null>
```

Confirmed participants of an occurrence, as seen by the viewer (BR-SOC-02, BR-REG-05).
- Null when the event is not visible to the viewer, or the date is neither produced nor materialized.
- Users blocked with the viewer are left out.
- Guest names are returned for organizers only.
- A virtual occurrence lists its playing organizers only (BR-EVT-22).
Outcome: the list, or null.

### `RegistrationRepository.listWaitlist`

```ts
listWaitlist(key: OccurrenceKey): Promise<RegistrationQueueEntry[]>
```

Waitlisted registrations of an occurrence, oldest first (BR-REG-04). Developers check the organizer role.
Outcome: the queue, or an empty list when the occurrence does not exist.

### `RegistrationRepository.listPendingApprovals`

```ts
listPendingApprovals(key: OccurrenceKey): Promise<RegistrationQueueEntry[]>
```

Pending approvals of an occurrence, oldest first (BR-REG-03). Developers check the organizer role.
Outcome: the queue, or an empty list when the occurrence does not exist.

## AttendanceRepository

Source: `apps/api/src/data/repositories/attendance.repository.ts`

Attendance after an occurrence: start and completion jobs, early completion, attendance declaration, disputes
of no-shows and their resolution (BR-EVT-26, BR-ATT-01 to BR-ATT-02, BR-REG-05).
Every method is atomic. Permissions are checked by the developers: organizers for attendance and early completion,
moderators for dispute resolution and the dispute list. The jobs are called by the developers on a timer.

### `AttendanceRepository.startDueOccurrences`

```ts
startDueOccurrences(limit = DEFAULT_JOB_LIMIT): Promise<StartDueOutcome>
```

Starts the due occurrences (BR-EVT-26): a `scheduled` materialized occurrence of a `published` event whose effective
start is at or before now becomes `ongoing`. Virtual occurrences are never started (BR-EVT-03). Rows are selected
with `FOR UPDATE SKIP LOCKED` in one statement, so two runs never update the same row.
Errors: `InvalidInputError` (a batch limit that is not a positive integer).
Outcome: the ids of the occurrences started by this run. Occurrences beyond `limit` wait for the next run.

### `AttendanceRepository.completeDueOccurrences`

```ts
completeDueOccurrences(limit = DEFAULT_JOB_LIMIT): Promise<CompleteDueOutcome>
```

Completes the due occurrences (BR-EVT-26, BR-ATT-01, BR-REG-05): a `scheduled` or `ongoing` materialized occurrence
whose effective end (start + duration) is at or before now becomes `completed`. Each occurrence is completed in its
own transaction, with its row locked `FOR UPDATE SKIP LOCKED` and the due condition checked again under the lock,
so two runs never complete the same occurrence. Confirmed registrations without attendance become `attended`
(explicit attendance is kept), and guest names are erased (see `completeLockedOccurrence`).
Errors: `InvalidInputError` (a batch limit that is not a positive integer).
Outcome: the completed occurrences with their confirmed participants (users with an account). Occurrences beyond
`limit` wait for the next run.

### `AttendanceRepository.completeOccurrence`

```ts
completeOccurrence(key: OccurrenceKey, actorId: string): Promise<CompleteOccurrenceOutcome>
```

Completes one started occurrence before its end, at the organizer's request (BR-EVT-26). The occurrence must be
materialized and started (effective start at or before now), and neither cancelled nor completed. Completion
has the same effects as the automatic one (BR-ATT-01, BR-REG-05).
Permission: organizers, checked by the developers. The schema keeps no completed-by column, so `actorId` is not
stored.
Errors: `NotFoundError` (unknown event or date), `InvalidStateError` (not materialized, not started, cancelled or
already completed).
Outcome: the confirmed participants with a user id, to notify.

### `AttendanceRepository.setAttendance`

```ts
setAttendance(registrationId: string, attendance: AttendanceStatus, byUserId: string): Promise<void>
```

Declares the attendance of a confirmed registration (BR-ATT-01, BR-ATT-03). Organizers declare `no_show` or
`excused` (or `attended`) from the effective start until one hour after the effective end. The occurrence can be
`ongoing` or already `completed`.
Permission: organizers, checked by the developers.
Errors: `NotFoundError`, `InvalidStateError` (the registration is not confirmed), `AttendanceWindowClosedError`
(outside the window).
Outcome: none.

### `AttendanceRepository.listAttendance`

```ts
listAttendance(key: OccurrenceKey): Promise<AttendanceEntry[]>
```

Confirmed registrations of an occurrence with their attendance and dispute status, oldest first (BR-ATT-01,
BR-ATT-02). Returns an empty list when the event or the occurrence does not exist (BR-EVT-03).
Permission: organizers, checked by the developers.
Outcome: the list.

### `AttendanceRepository.openDispute`

```ts
openDispute(registrationId: string, userId: string, reason: string): Promise<OpenDisputeOutcome>
```

Disputes a no-show (BR-ATT-02). The registration must belong to the user and carry `no_show`, and the dispute must
be opened until seven days after the effective end of the occurrence. One dispute per registration.
Errors: `NotFoundError` (no registration of this user), `InvalidInputError` (empty reason),
`InvalidStateError` (attendance is not `no_show`), `DisputeWindowClosedError`, `DisputeAlreadyExistsError`.
Outcome: the dispute id. Notify a moderator.

### `AttendanceRepository.resolveDispute`

```ts
resolveDispute(disputeId: string, moderatorId: string, uphold: boolean): Promise<ResolveDisputeOutcome>
```

Decides an open dispute (BR-ATT-02). Upheld: the participant was right, so the attendance becomes `attended`
(declared by the moderator, at this instant) whatever the attendance window. Rejected: the attendance stays
`no_show`. Both record the moderator and the resolution instant.
Permission: moderators, checked by the developers.
Errors: `NotFoundError` (unknown dispute or moderator), `InvalidStateError` (already resolved).
Outcome: the participant's user id, to notify (NULL after erasure).

### `AttendanceRepository.listOpenDisputes`

```ts
listOpenDisputes(page: PageRequest = {}): Promise<Page<OpenDisputeEntry>>
```

Open disputes, oldest first, by keyset on (created_at, id) (BR-ATT-02).
Permission: moderators, checked by the developers.
Errors: `INVALID_CURSOR` (through `DataError`) on a bad cursor.
Outcome: one page of open disputes with the occurrence and the organizer who declared the no-show.

## MessageRepository

Source: `apps/api/src/data/repositories/message.repository.ts`

Messaging: conversations of occurrences, circles and communities, messages with replies, edits, hard deletion,
reactions and read state (BR-MSG-01 to BR-MSG-03, BR-MSG-06, BR-TECH-08, BR-TECH-09).

Access to a conversation is a visibility rule and is checked here: members of the circle or community, organizers of
the event, and users with an active registration (`pending_approval`, `confirmed`, `waitlisted`) for the occurrence.
Messages and reactions of users blocked with the viewer, in either direction, are hidden (BR-SOC-02, BR-SOC-04).
Who may delete a message (author, circle owner or admins, community owner or moderators, moderators) is checked by
the developers. Pushes are sent by the developers from the recipients returned by `sendMessage`.
Every write sends a real-time event (NOTIFY, see `ChatEventListener`) delivered at commit.

### `MessageRepository.getConversationId`

```ts
getConversationId(target: ConversationTarget): Promise<string | null>
```

Returns the id of the conversation of a circle, a community or an occurrence (BR-MSG-01). Circle and community
conversations always exist; an occurrence conversation exists only once created by
`getOrCreateOccurrenceConversation`.
Errors: `NotFoundError` (event of an occurrence key not found).
Outcome: the conversation id, or `null` when there is none (yet).

### `MessageRepository.getOrCreateOccurrenceConversation`

```ts
getOrCreateOccurrenceConversation(viewerId: string, key: OccurrenceKey): Promise<string>
```

Returns the conversation of an occurrence, creating it on first need (BR-EVT-03 "a chat", BR-MSG-01). The occurrence
is materialized if it has no row yet. Idempotent, safe under concurrency. The viewer must have access: organizer of
the event or active registration (a new occurrence row is rolled back otherwise).
Errors: `NotFoundError` (event, or a date not produced by the schedule), `InvalidStateError` (draft event),
`NotConversationMemberError` (no access).
Outcome: the conversation id.

### `MessageRepository.hasAccess`

```ts
hasAccess(userId: string, conversationId: string): Promise<boolean>
```

True when the user may read and post in the conversation (BR-MSG-01). For the WebSocket gateway, before joining a
room. A missing conversation gives `false`.

### `MessageRepository.sendMessage`

```ts
sendMessage(senderId: string, conversationId: string, input: SendMessageInput): Promise<SendMessageOutcome>
```

Sends a message (BR-MSG-02, BR-TECH-08). If the sender already sent a message with this `clientMessageId` (re-send
after a reconnection), nothing is stored and the existing message is returned with `deduplicated: true`. A reply
must target a message of the same conversation that the sender can see. The sender's read pointer moves to the new
message.
Errors: `InvalidInputError` (blank body, more than 4000 characters, `clientMessageId` not a UUID or already used in
another conversation), `NotFoundError` (conversation, reply target), `NotConversationMemberError` (no access).
Outcome: the message, and the users to notify: `recipientUserIds` (everyone with access, minus the sender and users
blocked with the sender, BR-SOC-02, BR-SOC-04) and `pushRecipientUserIds` (minus those who muted the conversation).
Both are empty when deduplicated. A "looking for players" broadcast (BR-SOC-08) is a circle message: push it to
`pushRecipientUserIds` with the `looking_for_players` notification type.

### `MessageRepository.editMessage`

```ts
editMessage(senderId: string, messageId: string, body: string): Promise<ChatMessage>
```

Edits the body of the sender's own message and sets `edited_at` (BR-MSG-02). The sender must still have access to
the conversation.
Errors: `InvalidInputError` (blank or too long body), `NotFoundError` (no such message of this sender),
`NotConversationMemberError` (no access any more).
Outcome: the edited message.

### `MessageRepository.deleteMessage`

```ts
deleteMessage(messageId: string): Promise<DeleteMessageOutcome>
```

Deletes a message for good (BR-MSG-03). The developers check who may delete it: its author, the circle owner and
admins, the community owner and moderators, or a moderator. Its reactions are deleted, replies to it stay with no
reply target, and read pointers on it move back to the previous message so unread counts do not change.
Errors: `NotFoundError`.
Outcome: the conversation id, for the real-time update.

### `MessageRepository.react`

```ts
react(userId: string, messageId: string, code: string): Promise<ReactionOutcome>
```

Adds a reaction from the fixed list (BR-MSG-02). Idempotent. The user must have access to the conversation and
must not be blocked with the author (BR-SOC-02).
Errors: `InvalidInputError` (unknown code), `NotFoundError` (message), `NotConversationMemberError`, `BlockedError`.
Outcome: `changed` is false when the reaction already existed.

### `MessageRepository.unreact`

```ts
unreact(userId: string, messageId: string, code: string): Promise<ReactionOutcome>
```

Removes the user's reaction (BR-MSG-02). Idempotent.
Errors: `InvalidInputError` (unknown code), `NotFoundError` (message).
Outcome: `changed` is false when there was no such reaction.

### `MessageRepository.listMessages`

```ts
listMessages(viewerId: string, conversationId: string, page: PageRequest = {}): Promise<Page<ChatMessage> | null>
```

Lists the messages of a conversation, newest first, by pages (BR-MSG-02). Messages and reactions of users blocked
with the viewer are left out (BR-SOC-02, BR-SOC-04). A message of an erased account has `sender: null`
("deleted user", BR-GDP-04).
Errors: `INVALID_CURSOR`.
Outcome: `null` when the viewer has no access (or the conversation does not exist); otherwise a page.

### `MessageRepository.getMessage`

```ts
getMessage(viewerId: string, messageId: string): Promise<ChatMessage | null>
```

Returns one message as the viewer sees it. For the WebSocket gateway after a real-time event.
Outcome: `null` when the message does not exist, the viewer has no access, or its author is blocked with the viewer.

### `MessageRepository.markRead`

```ts
markRead(viewerId: string, conversationId: string, messageId: string): Promise<MarkReadOutcome>
```

Marks the conversation as read up to a message (BR-MSG-02). The pointer only moves forward: marking an older
message keeps the newer pointer.
Errors: `NotFoundError` (conversation, or a message not in it), `NotConversationMemberError`.
Outcome: the read pointer after the call.

### `MessageRepository.setMuted`

```ts
setMuted(viewerId: string, conversationId: string, muted: boolean): Promise<void>
```

Mutes or unmutes a conversation for the viewer. A muted conversation gives no push but keeps its unread count
(BR-NOT-01).
Errors: `NotFoundError` (conversation), `NotConversationMemberError`.
Outcome: nothing.

### `MessageRepository.listMyConversations`

```ts
listMyConversations(viewerId: string, page: PageRequest = {}): Promise<Page<MyConversation>>
```

Lists the conversations the viewer has access to, most recent activity first (last visible message, or creation
when empty), with the target, the last visible message, the unread count and the mute flag (BR-MSG-01, BR-MSG-02).
Errors: `INVALID_CURSOR`.
Outcome: a page.

### `MessageRepository.getUnreadCounts`

```ts
getUnreadCounts(viewerId: string): Promise<UnreadCounts>
```

Unread messages per conversation and in total (BR-MSG-02): messages after the viewer's read pointer, own messages
and messages of users blocked with the viewer left out. Muted conversations are counted.
Outcome: the total, and the conversations with at least one unread message.

### `MessageRepository.listReaders`

```ts
listReaders(viewerId: string, messageId: string): Promise<MessageReader[] | null>
```

"Seen by" (BR-MSG-02): users with access whose read pointer is at or after the message. The author, the viewer and
users blocked with the viewer are left out. Ordered by username.
Outcome: `null` when the message does not exist, the viewer has no access, or its author is blocked with the viewer.

## NotificationRepository

Source: `apps/api/src/data/repositories/notification.repository.ts`

Notifications (BR-NOT-01, BR-ACC-15): notification types (back office), per-type and per-channel preferences,
in-app notifications and Web Push subscriptions (one per device).

The data layer applies the preferences and returns the push targets; the developers decide when to notify, check
permissions, and send the pushes. A missing preference row means the type defaults. In-app notifications are kept
90 days (purged by the database, BR-GDP-09).

### `NotificationRepository.notify`

```ts
notify(typeCode: string, userIds: string[], payload: NotificationPayload = {}, options: { actorId?: string } = {}): Promise<NotifyOutcome>
```

Notifies users of one type (BR-NOT-01). Creates an in-app notification for each recipient whose in-app channel is
enabled, and returns the devices of the recipients whose push channel is enabled. Duplicate ids are merged, unknown
users are skipped. With `actorId` (the user who caused it), the actor and the users blocked with the actor, in either
direction, are left out (BR-SOC-02).
Errors: `InvalidReferenceError` (unknown type code), `InvalidInputError` (payload not a JSON object).
Outcome: the created notifications, the users who got one, and the push targets.

### `NotificationRepository.listPushTargets`

```ts
listPushTargets(typeCode: string, userIds: string[], options: { actorId?: string } = {}): Promise<PushTarget[]>
```

Returns the devices to push to for a notification type, without creating in-app notifications (for example
`new_message`, BR-MSG-02). Applies the same preferences and the same `actorId` filtering as `notify`.
Errors: `InvalidReferenceError` (unknown type code).
Outcome: the push targets.

### `NotificationRepository.listNotifications`

```ts
listNotifications(userId: string, page: PageRequest & { unreadOnly?: boolean } = {}): Promise<Page<AppNotification>>
```

Lists the user's in-app notifications, newest first, by pages (BR-NOT-01).
Errors: `INVALID_CURSOR`.
Outcome: a page; only unread notifications when `unreadOnly` is true.

### `NotificationRepository.countUnread`

```ts
countUnread(userId: string): Promise<number>
```

Number of unread in-app notifications of the user (BR-NOT-01).

### `NotificationRepository.markRead`

```ts
markRead(userId: string, notificationIds: string[]): Promise<{ updated: number }>
```

Marks some of the user's notifications as read. Ids of other users' notifications and already read ones are ignored.
Outcome: the number of notifications marked.

### `NotificationRepository.markAllRead`

```ts
markAllRead(userId: string): Promise<{ updated: number }>
```

Marks every unread notification of the user as read. Outcome: the number of notifications marked.

### `NotificationRepository.deleteNotification`

```ts
deleteNotification(userId: string, notificationId: string): Promise<void>
```

Deletes one of the user's notifications (hard delete, BR-TECH-06).
Errors: `NotFoundError` (no such notification of this user).

### `NotificationRepository.listPreferences`

```ts
listPreferences(userId: string): Promise<NotificationPreference[]>
```

Lists the user's effective preference for every notification type, ordered by code (BR-NOT-01, BR-ACC-15).
Outcome: the preferences; `isDefault` is true when the user has no override.

### `NotificationRepository.setPreference`

```ts
setPreference(userId: string, typeCode: string, patch: NotificationPreferencePatch): Promise<NotificationPreference>
```

Sets the user's preference for one notification type (BR-NOT-01, BR-ACC-15). A missing field keeps its current
effective value.
Errors: `InvalidReferenceError` (unknown type code), `NotFoundError` (user).
Outcome: the effective preference after the change.

### `NotificationRepository.savePushSubscription`

```ts
savePushSubscription(userId: string, input: SavePushSubscriptionInput): Promise<{ id: string }>
```

Saves the Web Push subscription of a device (BR-NOT-01: one per device). The endpoint is unique: if it is already
stored, for this user or another one (a shared device), it is moved to this user and its keys are replaced.
Errors: `InvalidInputError` (missing endpoint or keys), `NotFoundError` (user).
Outcome: the subscription id.

### `NotificationRepository.listMyPushSubscriptions`

```ts
listMyPushSubscriptions(userId: string): Promise<MyPushSubscription[]>
```

Lists the user's devices for the settings screen, newest first. Keys are never returned here.

### `NotificationRepository.deletePushSubscription`

```ts
deletePushSubscription(userId: string, endpoint: string): Promise<void>
```

Deletes the user's subscription of a device (logout, push disabled on the device).
Errors: `NotFoundError` (no such endpoint for this user).

### `NotificationRepository.removeExpiredPushSubscription`

```ts
removeExpiredPushSubscription(endpoint: string): Promise<{ removed: boolean }>
```

Deletes a subscription the push service reported as gone (HTTP 404 or 410). For the push sender, no user check.
Outcome: `removed` is false when it was already gone.

### `NotificationRepository.markPushSubscriptionsUsed`

```ts
markPushSubscriptionsUsed(subscriptionIds: string[]): Promise<void>
```

Records that pushes were sent to these subscriptions (`last_used_at = now()`). Unknown ids are ignored.

### `NotificationRepository.listNotificationTypes`

```ts
listNotificationTypes(): Promise<NotificationType[]>
```

Lists the notification types, ordered by code (reference data, BR-TECH-12).

### `NotificationRepository.createNotificationType`

```ts
createNotificationType(input: CreateNotificationTypeInput): Promise<NotificationType>
```

Creates a notification type (back office). The caller checks the admin role. The front end shows the English
`name` until it has a translation for the code (BR-TECH-12).
Errors: `InvalidInputError` (code already used, blank code or name).
Outcome: the created type.

### `NotificationRepository.updateNotificationType`

```ts
updateNotificationType(id: string, patch: UpdateNotificationTypePatch): Promise<NotificationType>
```

Updates the given fields of a notification type (back office). The caller checks the admin role. Changing the
defaults affects users without an override.
Errors: `NotFoundError`, `InvalidInputError` (duplicate or blank code, blank name).
Outcome: the updated type.

### `NotificationRepository.deleteNotificationType`

```ts
deleteNotificationType(id: string): Promise<void>
```

Deletes a notification type that was never used (back office). A type with notifications or preferences cannot be
deleted. The caller checks the admin role.
Errors: `NotFoundError`, `InvalidStateError` (the type is in use).

## CheerRepository

Source: `apps/api/src/data/repositories/cheer.repository.ts`

Cheers (BR-SOC-11, BR-SOC-12): typed positive feedback between participants who attended the same completed
occurrence, at most one per giver, recipient and occurrence, with no deadline. The recipient sees who gave each cheer;
everyone else sees only the counts per type. Users blocked with each other cannot cheer each other (BR-SOC-02).
The back office manages the cheer types (the developers check the admin role).

### `CheerRepository.giveCheer`

```ts
giveCheer(giverId: string, recipientId: string, key: OccurrenceKey, cheerTypeCode: string): Promise<{ cheerId: string }>
```

Gives a cheer (BR-SOC-11). The occurrence must be `completed`, and both users must hold a confirmed registration with
attendance `attended` (a validated attendance). There is no deadline. One cheer per giver, recipient and occurrence.
Errors: `SelfActionError`; `NotFoundError` (event or occurrence); `CheerNotAllowedError` (not completed, or one of
them did not attend); `BlockedError` (BR-SOC-02); `InvalidReferenceError` (unknown or inactive type);
`AlreadyCheeredError`.
Outcome: the cheer id. Notify the recipient with the `cheer_received` notification type.

### `CheerRepository.listCheerableParticipants`

```ts
listCheerableParticipants(viewerId: string, key: OccurrenceKey): Promise<CheerableParticipant[] | null>
```

Lists the other participants who attended the completed occurrence, with the cheer the viewer already gave each one
(BR-SOC-11). Users blocked with the viewer and erased accounts are left out (BR-SOC-02).
Errors: `NotFoundError` (event or occurrence).
Outcome: `null` when the viewer cannot give cheers there (occurrence not completed, or the viewer did not attend).

### `CheerRepository.listReceivedCheers`

```ts
listReceivedCheers(userId: string, page: PageRequest = {}): Promise<Page<ReceivedCheer>>
```

Lists the cheers the user received, newest first, with who gave each one (BR-SOC-12: only the recipient calls this
for themself). Cheers of givers blocked with the user are left out of the list (BR-SOC-02), but still count
(BR-SOC-04). An erased giver shows as `giver: null` (BR-GDP-05).
Errors: `INVALID_CURSOR`.
Outcome: a page.

### `CheerRepository.getCheerCounts`

```ts
getCheerCounts(viewerId: string, userId: string): Promise<CheerCount[] | null>
```

Counts the cheers a user received, per type (BR-SOC-12: others see only the counts). Every active type is listed,
with 0 when none was received, plus inactive types the user received. Gated by the user's `stats_visibility`
(BR-ACC-14) and hidden when blocked either way (BR-SOC-02). Counts include every cheer, also from users blocked later
(BR-SOC-04).
Outcome: the counts ordered by `sort_order`, or `null` when the viewer may not see them (or the user does not exist).

### `CheerRepository.listCheerTypes`

```ts
listCheerTypes(options: { includeInactive?: boolean } = {}): Promise<CheerType[]>
```

Lists the cheer types by `sort_order`; inactive ones only with `includeInactive` (BR-TECH-12).

### `CheerRepository.createCheerType`

```ts
createCheerType(input: CreateCheerTypeInput): Promise<CheerType>
```

Creates a cheer type (back office; the caller checks the admin role and writes the audit entry).
Errors: `InvalidInputError` (code already used, blank code or name).

### `CheerRepository.updateCheerType`

```ts
updateCheerType(id: string, patch: UpdateCheerTypePatch): Promise<CheerType>
```

Updates the given fields of a cheer type (back office). Deactivate a type instead of deleting it: given cheers keep it.
Errors: `NotFoundError`, `InvalidInputError`.

## ReportRepository

Source: `apps/api/src/data/repositories/report.repository.ts`

Reports (BR-MOD-01, BR-MOD-02): a user reports exactly one user, event or message with a reason; moderators assign,
resolve or dismiss them. Moderator actions write their audit entry in the same transaction (BR-MOD-05). A report is kept
when its reporter or target is erased or deleted, without that identity (BR-GDP-04). The developers check the
moderator role before calling the moderator methods, and the admin role for the report reasons.

### `ReportRepository.createReport`

```ts
createReport(reporterId: string, input: CreateReportInput): Promise<{ reportId: string }>
```

Files a report about exactly one target (BR-MOD-01) with an active reason. The target must exist; a message must be
in a conversation the reporter has access to. A user cannot report themself.
Errors: `InvalidInputError` (not exactly one target), `InvalidReferenceError` (unknown or inactive reason),
`NotFoundError` (target, or a message the reporter cannot see), `SelfActionError`.
Outcome: the report id.

### `ReportRepository.assignReport`

```ts
assignReport(reportId: string, moderatorId: string): Promise<void>
```

Assigns an open or assigned report to a moderator (BR-MOD-02), or reassigns it. Writes `report.assigned`.
Errors: `NotFoundError`, `InvalidStateError` (already resolved or dismissed).

### `ReportRepository.resolveReport`

```ts
resolveReport(reportId: string, moderatorId: string, note: string): Promise<void>
```

Resolves a report (BR-MOD-02) with a note of what was decided; sanctions are issued separately with
`SanctionRepository` (pass the report id). An open report is assigned to the moderator at the same time.
Writes `report.resolved`.
Errors: `NotFoundError`, `InvalidStateError` (already closed), `InvalidInputError` (blank note).

### `ReportRepository.dismissReport`

```ts
dismissReport(reportId: string, moderatorId: string, note: string): Promise<void>
```

Dismisses a report (BR-MOD-02) with a note. Writes `report.dismissed`.
Errors: `NotFoundError`, `InvalidStateError` (already closed), `InvalidInputError` (blank note).

### `ReportRepository.listReports`

```ts
listReports(filter: ListReportsFilter = {}, page: PageRequest = {}): Promise<Page<ReportSummary>>
```

Lists reports for moderators, oldest first (a queue), optionally by status and assigned moderator (BR-MOD-02).
Errors: `INVALID_CURSOR`.

### `ReportRepository.getReport`

```ts
getReport(reportId: string): Promise<ReportDetails>
```

Returns a report with its content, for moderators only (BR-MOD-02). A reported message body is included: never log it.
Errors: `NotFoundError`.

### `ReportRepository.listMyReports`

```ts
listMyReports(reporterId: string): Promise<MyReport[]>
```

Lists the reports the user filed, newest first, with their status only.

### `ReportRepository.listReportReasons`

```ts
listReportReasons(options: { includeInactive?: boolean } = {}): Promise<ReportReason[]>
```

Lists the report reasons by `sort_order`; inactive ones only with `includeInactive` (BR-MOD-01, BR-TECH-12).

### `ReportRepository.createReportReason`

```ts
createReportReason(input: CreateReportReasonInput): Promise<ReportReason>
```

Creates a report reason (back office; the caller checks the admin role and writes the audit entry).
Errors: `InvalidInputError` (code already used, blank code or name).

### `ReportRepository.updateReportReason`

```ts
updateReportReason(id: string, patch: UpdateReportReasonPatch): Promise<ReportReason>
```

Updates the given fields of a report reason (back office). Deactivate a reason instead of deleting it.
Errors: `NotFoundError`, `InvalidInputError`.

## SanctionRepository

Source: `apps/api/src/data/repositories/sanction.repository.ts`

Sanctions (BR-MOD-03, BR-MOD-04): warnings, temporary bans (end chosen by the moderator), permanent bans and content
removals. A permanent ban also stores the hashes of the user's email and Google subjects, so that the person cannot
sign up again, even after erasure (BR-MOD-04). Every method writes its audit entry in the same transaction (BR-MOD-05).
The developers check the moderator role, and refuse the login of a banned user (see `AuthRepository.findLoginByEmail`).

### `SanctionRepository.issueSanction`

```ts
issueSanction(moderatorId: string, input: IssueSanctionInput): Promise<{ sanctionId: string }>
```

Issues a warning, a temporary ban or a permanent ban (BR-MOD-03). A temporary ban needs `endsAt` in the future; the
other kinds refuse it. A permanent ban stores the banned identities (BR-MOD-04). Writes `sanction.issued`.
Content removal is `removeMessage`.
Errors: `SelfActionError`, `InvalidInputError` (blank reason, bad `endsAt`), `NotFoundError` (user, report).
Outcome: the sanction id. Notify the user and revoke their refresh tokens for a ban (developers).

### `SanctionRepository.revokeSanction`

```ts
revokeSanction(sanctionId: string, moderatorId: string): Promise<void>
```

Lifts a sanction early (sets `revoked_at`). Revoking a permanent ban deletes the user's banned identities, so the
person can sign up again, unless another permanent ban of the user is still in force (BR-MOD-04).
Writes `sanction.revoked`.
Errors: `NotFoundError`, `InvalidStateError` (already revoked).

### `SanctionRepository.removeMessage`

```ts
removeMessage(moderatorId: string, messageId: string, input: { reason: string; reportId?: string }): Promise<RemoveMessageOutcome>
```

Removes a message as a moderator (BR-MOD-03 content removal): records a `content_removal` sanction on its author
(none when the author was erased), hard-deletes the message (BR-MSG-03) and writes `message.removed`, in one
transaction. A report on the message keeps its decision in `resolution_note`; its target becomes `removed`.
Errors: `NotFoundError` (message, report), `InvalidInputError` (blank reason).
Outcome: the conversation id (for the real-time update) and the sanction id.

### `SanctionRepository.listSanctions`

```ts
listSanctions(userId: string): Promise<Sanction[]>
```

Lists the sanctions of a user, newest first (moderators).

### `SanctionRepository.getActiveBan`

```ts
getActiveBan(userId: string): Promise<ActiveBan | null>
```

The ban in force on the user, or `null` (BR-MOD-03). A permanent ban outranks a temporary one.

## AuditLogRepository

Source: `apps/api/src/data/repositories/audit-log.repository.ts`

Audit log (BR-MOD-05): every moderator and admin action, kept 3 years (purged by the database, BR-GDP-09).
Report, sanction, dispute, circle invitation rejection and participant removal methods already write their entry in
their own transaction. Call `record` for the other actions (back-office CRUD, role changes...). The developers check
the admin role before listing.

### `AuditLogRepository.record`

```ts
record(actorId: string, entry: AuditEntryInput): Promise<{ id: string }>
```

Records an action (BR-MOD-05). `details` holds ids and codes only: never emails, birth dates, tokens or message bodies.
Errors: `NotFoundError` (actor or report), `InvalidInputError` (details not an object).
Outcome: the entry id.

### `AuditLogRepository.list`

```ts
list(filter: ListAuditFilter = {}, page: PageRequest = {}): Promise<AuditPage>
```

Lists audit entries, newest first, with optional filters (admins).
Errors: `INVALID_CURSOR`.

## StatsRepository

Source: `apps/api/src/data/repositories/stats.repository.ts`

Per-user statistics, computed on demand by the data layer (BR-STA-01 to BR-STA-05, BR-STA-09, BR-ATT-04), and the
progress data the developers use to award badges (BR-GAM-02). Global statistics are in `AnalyticsRepository`.
Reads that show a profile are gated by the user's section visibility and by blocking (BR-ACC-14, BR-SOC-02).

### `StatsRepository.getProfileStats`

```ts
getProfileStats(viewerId: string, userId: string): Promise<ProfileStats | null>
```

Profile statistics (BR-STA-01 to BR-STA-05): completed sessions, planned hours, people met, main sport by sessions
and by hours, specialist or all-rounder (70% of the sessions), current and longest streaks in days (Europe/Paris).
Outcome: `null` when the viewer may not see the stats section of this user, or the user does not exist.

### `StatsRepository.getReliability`

```ts
getReliability(viewerId: string, userId: string): Promise<Reliability | null>
```

Reliability rate (BR-ATT-04, BR-GDP-10): attended / (attended + no_show + 0.5 × late cancellations), all time and
the last 90 days. `hidden` is true, and the rates `null`, until the user has 5 past occurrences.
Outcome: `null` when the viewer may not see the reliability section of this user, or the user does not exist.

### `StatsRepository.getBadgeProgress`

```ts
getBadgeProgress(userId: string): Promise<BadgeProgress>
```

Everything the developers' badge code needs to award or remove badges (BR-GAM-02): profile stats, reliability (with
its counts even when hidden), cheers received per type and completed occurrences of owned events. Not filtered by
visibility: never return it to a client as is.

## BadgeRepository

Source: `apps/api/src/data/repositories/badge.repository.ts`

Badges (BR-GAM-01, BR-GAM-02): the catalog with optional tiers (back office), and the badges users hold. The badge
definitions are not decided yet (DEFERRED): the catalog starts empty. The developers' code evaluates badges in real
time with `StatsRepository.getBadgeProgress`, then awards or removes them here; badges can be lost.

### `BadgeRepository.listBadges`

```ts
listBadges(options: { includeInactive?: boolean } = {}): Promise<Badge[]>
```

Lists the catalog by `sort_order`, with tiers lowest first; inactive badges only with `includeInactive`.

### `BadgeRepository.createBadge`

```ts
createBadge(input: CreateBadgeInput): Promise<{ id: string }>
```

Creates a badge (back office; the caller checks the admin role and writes the audit entry).
Errors: `InvalidInputError` (code already used, blank fields).
Outcome: the badge id.

### `BadgeRepository.updateBadge`

```ts
updateBadge(id: string, patch: UpdateBadgePatch): Promise<void>
```

Updates the given fields of a badge (back office).
Errors: `NotFoundError`, `InvalidInputError`.

### `BadgeRepository.setBadgeTiers`

```ts
setBadgeTiers(badgeId: string, tiers: BadgeTierInput[]): Promise<void>
```

Replaces the tiers of a badge (back office). Tiers whose rank is kept are updated in place, so holders keep their
level; removed ranks are deleted and their holders keep the badge without a level.
Errors: `NotFoundError` (badge), `InvalidInputError` (duplicate rank, rank below 1, negative threshold, blank name).

### `BadgeRepository.deleteBadge`

```ts
deleteBadge(id: string): Promise<void>
```

Deletes a badge and every user's copy of it (back office).
Errors: `NotFoundError`.

### `BadgeRepository.awardBadge`

```ts
awardBadge(userId: string, badgeId: string, tierId: string | null = null): Promise<AwardBadgeOutcome>
```

Awards a badge, or changes its level (BR-GAM-02, retroactive awarding allowed). A new badge or a new level resets
`unlocked_at` to now and `seen_at` to NULL, so the unlock animation plays once (BR-GAM-01).
Errors: `NotFoundError` (user or badge), `InvalidReferenceError` (tier of another badge).
Outcome: whether something changed, and whether the badge is new for the user.

### `BadgeRepository.removeBadge`

```ts
removeBadge(userId: string, badgeId: string): Promise<{ removed: boolean }>
```

Removes a badge the user no longer deserves (BR-GAM-02: badges can be lost, the row is deleted).
Outcome: `removed` is false when the user did not hold it.

### `BadgeRepository.listUserBadges`

```ts
listUserBadges(viewerId: string, userId: string): Promise<UserBadge[] | null>
```

Lists the badges a user holds, by catalog order (BR-GAM-01). Gated by `badges_visibility` and blocking
(BR-ACC-14, BR-SOC-02). `seenAt` is only returned to the holder.
Outcome: `null` when the viewer may not see the badges section, or the user does not exist.

### `BadgeRepository.listUnseenBadges`

```ts
listUnseenBadges(userId: string): Promise<UserBadge[]>
```

The user's own badges whose unlock animation was not played yet (BR-GAM-01).

### `BadgeRepository.markBadgesSeen`

```ts
markBadgesSeen(userId: string, badgeIds: string[]): Promise<void>
```

Marks the user's badges as seen (the animation played). Unknown ids are ignored.

## AnalyticsRepository

Source: `apps/api/src/data/repositories/analytics.repository.ts`

Global statistics, read from the anonymous aggregates refreshed by the database (BR-STA-06 to BR-STA-10, DB-JOB):
heatmap, city rankings, popular sports and trends, back-office statistics. Never recomputed here
(data-layer notes §11). The refresh runs nightly, the current month ranking hourly (BR-STA-09), so reads lag behind.
Back-office reads (`getPlatformStats`) are for admins: the developers check the role.

### `AnalyticsRepository.getHeatmap`

```ts
getHeatmap(filters: HeatmapFilters): Promise<HeatmapCell[]>
```

Heatmap hexagons (BR-STA-07): held occurrences per H3 cell, summed over the filters. All event visibilities are
included. A cell is returned only with at least 3 occurrences. At most 5000 cells, the busiest first.
Errors: `InvalidInputError` (bad resolution, month, weekday or hour).

### `AnalyticsRepository.getCityRanking`

```ts
getCityRanking(viewerId: string, cityId: string, period: RankingPeriod, metric: RankingMetric): Promise<CityRanking>
```

The viewer's place in the ranking of a city (BR-STA-06): by the events' municipalities, arrondissements grouped under
their city, for the current month or all time, by hours or sessions. Shown only with at least 100 active users;
users who hide from rankings are left out (BR-ACC-15).
Errors: `NotFoundError` (unknown municipality).
Outcome: the ranking; `viewer` is `null` when the viewer is not ranked there.

### `AnalyticsRepository.listMyCityRankings`

```ts
listMyCityRankings(viewerId: string, period: RankingPeriod, metric: RankingMetric): Promise<CityRanking[]>
```

The viewer's rankings in every city where the viewer was active over the period (BR-STA-06: a user can rank in
several cities), most active city first. Cities under 100 active users are returned with `shown: false`.

### `AnalyticsRepository.getPopularSports`

```ts
getPopularSports(area: AreaFilter, window: TrendWindow): Promise<PopularSport[]>
```

Popular sports of an area over a rolling window ending yesterday, compared with the previous window of the same
length (BR-STA-08). Most participants first.

### `AnalyticsRepository.getTrends`

```ts
getTrends(area: AreaFilter, window: TrendWindow, sportId?: string): Promise<Trend>
```

Trend of an area, optionally for one sport (BR-STA-08): totals of the rolling window ending yesterday and of the
previous window of the same length, and the daily series of the current window.

### `AnalyticsRepository.getPlatformStats`

```ts
getPlatformStats(from: LocalDate, to: LocalDate): Promise<PlatformStats>
```

Back-office statistics over a range of local days, inclusive (BR-STA-10): the daily rows, users, monthly active
users, 30-day retention, no-show rate, reports by status and handling time, top sports and cities.
Errors: `InvalidInputError` (bad dates).

## GdprRepository

Source: `apps/api/src/data/repositories/gdpr.repository.ts`

GDPR (BR-GDP-01 to BR-GDP-10): policies and consents, data export, account erasure and inactivity.
- Consents are append-only: every grant or withdrawal is a new row.
- Export: the user requests it; the developers' worker claims a request, builds the JSON with `buildExportData`, writes
  the file, and completes it. Links last 7 days; the database marks them expired and the developers delete the files
  listed by `listExpiredExportFiles`.
- Erasure: 30 days after the deletion request, the developers' nightly job calls `eraseDueAccounts` and notifies the
  users in the outcomes. Retention purges run in the database (pg_cron, `run_gdpr_jobs`).
- Inactivity: warn by email with `listInactiveAccountsToWarn` / `markInactivityWarned`; the database schedules the
  deletion of warned accounts at 24 months.

### `GdprRepository.listConsentPurposes`

```ts
listConsentPurposes(): Promise<ConsentPurpose[]>
```

Lists the consent purposes (BR-GDP-01), required ones first.

### `GdprRepository.publishPolicyVersion`

```ts
publishPolicyVersion(document: PolicyDocument, version: string, url: string): Promise<PolicyVersion>
```

Publishes a new version of a policy (back office; the caller checks the admin role and writes the audit entry). The
latest published version is the current one: users must accept it again (BR-GDP-01).
Errors: `InvalidInputError` (version already published, blank version or url).

### `GdprRepository.getCurrentPolicies`

```ts
getCurrentPolicies(): Promise< Record<PolicyDocument, PolicyVersion | null> >
```

The current version of each policy document, or `null` when none is published.

### `GdprRepository.recordConsent`

```ts
recordConsent(userId: string, purposeCode: string, granted: boolean): Promise<void>
```

Records a grant or a withdrawal (BR-GDP-01, append-only). For the terms of service and the privacy policy, a grant
accepts the current version of the document.
Errors: `InvalidReferenceError` (unknown purpose), `InvalidStateError` (granting a policy with no published version),
`NotFoundError` (user).

### `GdprRepository.getMyConsents`

```ts
getMyConsents(userId: string): Promise<ConsentState[]>
```

The current state of every purpose for the user (latest row of the history), and whether a required purpose covers
the current version of its document (BR-GDP-01). Ask the user again for every required purpose not `upToDate`.

### `GdprRepository.listConsentHistory`

```ts
listConsentHistory(userId: string): Promise<ConsentRecord[]>
```

The user's full consent history, oldest first (BR-GDP-01).

### `GdprRepository.requestExport`

```ts
requestExport(userId: string): Promise<DataExportRequest>
```

Requests a data export (BR-GDP-07). One request at a time: while one is pending or processing, it is returned
instead of creating another.
Errors: `NotFoundError` (user).

### `GdprRepository.listMyExports`

```ts
listMyExports(userId: string): Promise<DataExportRequest[]>
```

The user's export requests, newest first (BR-GDP-07).

### `GdprRepository.claimNextExport`

```ts
claimNextExport(): Promise<ClaimedExport | null>
```

Claims the oldest pending export for the developers' worker: it becomes `processing`. Safe with several workers
(`FOR UPDATE SKIP LOCKED`).
Outcome: the request to build, or `null` when the queue is empty.

### `GdprRepository.buildExportData`

```ts
buildExportData(userId: string): Promise<Record<string, unknown>>
```

Every piece of data of the user as one JSON object, built by the database (BR-GDP-07): account (email and birth date
decrypted), settings, sports, social graph, events, registrations, messages, notifications, cheers, reports filed,
sanctions, badges, consents. Write it to the export file; never log it.
Errors: `NotFoundError` (user).

### `GdprRepository.completeExport`

```ts
completeExport(requestId: string, filePath: string): Promise<void>
```

Marks a claimed export as ready with its file; the download link lasts 7 days (BR-GDP-07).
Errors: `NotFoundError`, `InvalidStateError` (not processing), `InvalidInputError` (blank path).

### `GdprRepository.failExport`

```ts
failExport(requestId: string): Promise<void>
```

Marks a claimed export as failed; the user may request a new one.
Errors: `NotFoundError`, `InvalidStateError` (not processing).

### `GdprRepository.listExpiredExportFiles`

```ts
listExpiredExportFiles(): Promise< { requestId: string; filePath: string }[] >
```

Expired exports whose file is still on the disk: delete each file, then call `markExportFileDeleted` (BR-GDP-09).

### `GdprRepository.markExportFileDeleted`

```ts
markExportFileDeleted(requestId: string): Promise<void>
```

Records that the file of an export was deleted from the disk.

### `GdprRepository.listDueErasures`

```ts
listDueErasures(limit = 100): Promise<string[]>
```

Ids of the accounts whose deletion request is older than the 30-day grace period (BR-GDP-03), oldest first.

### `GdprRepository.eraseDueAccounts`

```ts
eraseDueAccounts(limit = 100): Promise<ErasureOutcome[]>
```

Erases every due account (BR-GDP-03), one transaction per account, and returns who to notify. Call it nightly.
Outcome: one erasure outcome per erased account.

### `GdprRepository.eraseAccount`

```ts
eraseAccount(userId: string): Promise<ErasureOutcome>
```

Erases one account whose 30-day grace period is over (BR-GDP-03, BR-GDP-04, BR-GDP-05), in one transaction:
1. its upcoming active registrations are cancelled (not late), and the waitlists promoted (BR-REG-04);
2. owned events go to the oldest co-organizer; without one, their upcoming sessions are cancelled and the event
   keeps no owner;
3. every consent is withdrawn, then the account is deleted: personal data goes, messages, cheers given, past
   registrations, reports and audit entries stay without the identity; banned identities and anonymous aggregates stay.
Errors: `NotFoundError`, `InvalidStateError` (no deletion request, or still in the grace period).
Outcome: the promoted users, the cancelled sessions with their participants, and the transferred events, to notify.

### `GdprRepository.listInactiveAccountsToWarn`

```ts
listInactiveAccountsToWarn(limit = 100): Promise<InactiveAccount[]>
```

Accounts inactive for 12 months that were not warned yet, and have no deletion request (BR-GDP-08), with the email
to warn (decrypted; never log it). After sending, call `markInactivityWarned`. Warned accounts still inactive at
24 months are scheduled for deletion by the database.

### `GdprRepository.markInactivityWarned`

```ts
markInactivityWarned(userIds: string[]): Promise<void>
```

Records that the inactivity warning was sent (BR-GDP-08).

## ChatEventListener

Source: `apps/api/src/data/chat-event-listener.ts`

Real-time chat events (BR-TECH-09: no Redis, PostgreSQL LISTEN/NOTIFY). `MessageRepository` sends an event at the
commit of every write: `message_created`, `message_edited`, `message_deleted`, `reaction_changed`. Events carry ids
only. For each connected viewer, reload with `MessageRepository.getMessage(viewerId, messageId)`, which applies
access and blocking. Events are not persisted: after a reconnection, clients reload missed messages with
`listMessages`.

One dedicated connection is opened on the first `onEvent` call, and reopened automatically if it is lost.

### `ChatEventListener.onEvent`

```ts
onEvent(handler: (event: ChatEvent) => void): () => void
```

Registers a handler for every chat event. The first call opens the connection.
Outcome: a function that unregisters the handler.

### `ChatEventListener.ready`

```ts
ready(): Promise<void>
```

Resolves when the LISTEN connection is open. Useful in tests and at startup.

### `ChatEventListener.onModuleDestroy`

```ts
onModuleDestroy(): Promise<void>
```

Closes the connection when the application shuts down.

### `ChatEventListener.close`

```ts
close(): Promise<void>
```

Closes the connection and stops reconnecting.

## Errors

Switch on `error.code`, never on the message (data-layer-guide.md §5).

| Class | Code | When |
|---|---|---|
| `DataError` | `(any)` | Base class of every error thrown by the data layer. `code` is a stable string that developers switch on. Never parse `message`. |
| `NotFoundError` | `NOT_FOUND` | The requested row does not exist, or is not visible to the viewer. |
| `InternalDataError` | `INTERNAL` | Unexpected database failure. Its details (SQL, parameters) are never exposed. |
| `UsernameTakenError` | `USERNAME_TAKEN` | The username is already used by another account (case-insensitive, BR-ACC-02). |
| `EmailTakenError` | `EMAIL_TAKEN` | The email is already used by another account (BR-ACC-04). |
| `EmailBelongsToExistingAccountError` | `EMAIL_BELONGS_TO_EXISTING_ACCOUNT` | A Google sign-up uses an email that already belongs to an account; no merge is done (BR-ACC-06). |
| `UnderMinimumAgeError` | `UNDER_MINIMUM_AGE` | The user is younger than the minimum age on the creation date, Europe/Paris (BR-ACC-03). |
| `InvalidReferenceError` | `INVALID_REFERENCE` | A reference id (municipality, sport, skill level, rating system or rating grade) does not exist. |
| `GoogleAlreadyLinkedError` | `GOOGLE_ALREADY_LINKED` | The Google subject, or the Google identity of the user, is already linked (BR-ACC-05). |
| `LastLoginMethodError` | `LAST_LOGIN_METHOD` | The change would remove the user's only login method (BR-ACC-05). |
| `InvalidTokenError` | `INVALID_TOKEN` | The token is unknown, expired or already used. |
| `RefreshTokenReuseError` | `REFRESH_TOKEN_REUSE` | A revoked or already rotated refresh token was presented: the whole family was revoked (BR-ACC-07, BR-TECH-11). |
| `OverlappingSlotsError` | `OVERLAPPING_SLOTS` | The slots of one user overlap (BR-ACC-12). |
| `InvalidSlotError` | `INVALID_SLOT` | An availability slot is invalid: day outside 1..7 or end not after start (BR-ACC-12). |
| `InvalidRatingError` | `INVALID_RATING` | A rating does not match its rating system (BR-ACC-11). |
| `InvalidInputError` | `INVALID_INPUT` | An input value is invalid, or it violates a uniqueness or check constraint of a reference table. |
| `SelfActionError` | `SELF_ACTION` | The action targets the acting user themself (follow, block, invite). Rules: BR-SOC-01, BR-SOC-02, BR-SOC-06. |
| `BlockedError` | `BLOCKED` | The two users are blocked in one direction or the other (BR-SOC-02). |
| `AlreadyMemberError` | `ALREADY_MEMBER` | The user is already a member of the circle or community. |
| `NotMemberError` | `NOT_MEMBER` | The user is not a member of the circle or community. |
| `InvitePolicyError` | `INVITE_POLICY` | The invitee's circle invitation setting refuses this inviter (BR-ACC-15, BR-SOC-06). |
| `InvitationAlreadyPendingError` | `INVITATION_ALREADY_PENDING` | A pending invitation already exists for this circle and invitee (BR-SOC-06). |
| `JoinRequestAlreadyPendingError` | `JOIN_REQUEST_ALREADY_PENDING` | A pending join request already exists for this user and community (BR-SOC-09). |
| `InvalidStateError` | `INVALID_STATE` | The row is not in a state that allows the transition (e.g. an invitation already answered). |
| `OwnerCannotBeRemovedError` | `OWNER_CANNOT_BE_REMOVED` | The owner cannot be removed or demoted; ownership must be transferred first (BR-SOC-05, BR-SOC-09). |
| `InvalidRecurrenceError` | `INVALID_RECURRENCE` | The recurrence rule is outside the supported subset (BR-EVT-02). |
| `OccurrenceNotOpenError` | `OCCURRENCE_NOT_OPEN` | The event is not published, or the occurrence is cancelled, ongoing, completed, or starts in the past (BR-EVT-24, BR-REG-01). |
| `AdultsOnlyError` | `ADULTS_ONLY` | The event is adults only and the user is a minor (BR-EVT-11). |
| `NotVisibleError` | `NOT_VISIBLE` | The event is not visible to the viewer: visibility rules or blocking apply (BR-EVT-23, BR-SOC-02). |
| `AlreadyRegisteredError` | `ALREADY_REGISTERED` | The user already holds an active registration for this occurrence (BR-REG-02). |
| `OccurrenceFullError` | `OCCURRENCE_FULL` | Not enough free spots for the registration, including its guests (BR-REG-04, BR-REG-05). |
| `CapacityBelowConfirmedError` | `CAPACITY_BELOW_CONFIRMED` | The new capacity is below the confirmed spots already taken (BR-EVT-06). |
| `NotCoOrganizerError` | `NOT_CO_ORGANIZER` | The user is not a co-organizer of the event (BR-EVT-20). |
| `AttendanceWindowClosedError` | `ATTENDANCE_WINDOW_CLOSED` | Attendance can only be set from the start until one hour after the end of the occurrence (BR-ATT-01). |
| `DisputeWindowClosedError` | `DISPUTE_WINDOW_CLOSED` | A no-show can be disputed only until seven days after the end of the occurrence (BR-ATT-02). |
| `DisputeAlreadyExistsError` | `DISPUTE_ALREADY_EXISTS` | The registration already has a dispute: one dispute per registration (BR-ATT-02). |
| `NotConversationMemberError` | `NOT_CONVERSATION_MEMBER` | The user has no access to the conversation: not a member of its circle or community, not an organizer, and no active registration for its occurrence (BR-MSG-01). |
| `CheerNotAllowedError` | `CHEER_NOT_ALLOWED` | A cheer needs a completed occurrence that both users attended (BR-SOC-11). |
| `AlreadyCheeredError` | `ALREADY_CHEERED` | The giver already cheered this recipient for this occurrence: one cheer per giver, recipient and occurrence (BR-SOC-11). |
| `IdentityBannedError` | `IDENTITY_BANNED` | The email or the Google identity belongs to a permanently banned user (BR-MOD-04). |
| (none) | `INVALID_CURSOR` | A pagination cursor that was not returned by the data layer. |
