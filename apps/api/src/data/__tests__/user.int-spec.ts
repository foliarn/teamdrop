import { AuthRepository } from '../repositories/auth.repository';
import { BlockRepository } from '../repositories/block.repository';
import { UserRepository } from '../repositories/user.repository';
import { DataError } from '../errors';
import { appDb, ownerDb, truncateAll } from './helpers/test-db';
import { type MinimalRefs, seedMinimal } from './helpers/seed-minimal';

/** Resolves with the DataError code thrown by `fn`, or fails when nothing (or another error) is thrown. */
async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof DataError) {
      return err.code;
    }
    throw err;
  }
  throw new Error('Expected a DataError, but the call succeeded');
}

describe('UserRepository', () => {
  const db = appDb();
  const owner = ownerDb();
  const auth = new AuthRepository(db);
  const users = new UserRepository(db);
  const blocks = new BlockRepository(db);
  let refs: MinimalRefs;
  let aliceId: string;
  let bobId: string;
  let zoeId: string;
  let zoelieId: string;

  beforeAll(async () => {
    await truncateAll(owner);
    refs = await seedMinimal(owner);

    aliceId = (
      await auth.createUserWithPassword({
        username: 'alice',
        email: 'Alice@Example.test',
        passwordHash: '$argon2id$placeholder',
        firstName: 'Alice',
        birthDate: '1990-04-12',
        municipalityId: refs.municipalities.paris8,
        gender: 'woman',
      })
    ).userId;
    bobId = (
      await auth.createUserWithPassword({
        username: 'bob',
        email: 'bob@example.test',
        passwordHash: '$argon2id$placeholder',
        firstName: 'Bob',
        birthDate: '1988-09-30',
        municipalityId: refs.municipalities.lyon,
      })
    ).userId;
    zoeId = (
      await auth.createUserWithPassword({
        username: 'zoe',
        email: 'zoe@example.test',
        passwordHash: '$argon2id$placeholder',
        firstName: 'Zoe',
        birthDate: '1992-06-01',
        municipalityId: refs.municipalities.paris8,
      })
    ).userId;
    zoelieId = (
      await auth.createUserWithPassword({
        username: 'Zoélie',
        email: 'zoelie@example.test',
        passwordHash: '$argon2id$placeholder',
        firstName: 'Zoélie',
        birthDate: '1994-02-14',
        municipalityId: refs.municipalities.paris8,
      })
    ).userId;
  });

  afterAll(async () => {
    // Leave the test database empty for the pgTAP suite, which expects no rows.
    await truncateAll(owner);
    await Promise.all([db.destroy(), owner.destroy()]);
  });

  it('BR-ACC-04: getMe returns the decrypted email and birth date of the owner', async () => {
    const me = await users.getMe(aliceId);

    expect(me.email).toBe('alice@example.test');
    expect(me.birthDate).toBe('1990-04-12');
    expect(me.municipality).toMatchObject({
      name: 'Paris 8e',
      parent: { id: refs.municipalities.paris, name: 'Paris' },
    });
  });

  it('BR-ACC-14: getProfile of another user never returns email, birth date or role', async () => {
    const profile = await users.getProfile(bobId, aliceId);

    expect(profile).toMatchObject({
      id: aliceId,
      username: 'alice',
      isHidden: false,
    });
    expect(profile).not.toHaveProperty('email');
    expect(profile).not.toHaveProperty('birthDate');
    expect(profile).not.toHaveProperty('role');
  });

  it('BR-ACC-14: a profile set to only_me is hidden from other viewers, but visible to its owner', async () => {
    await users.updateSettings(bobId, { profileVisibility: 'only_me' });

    const asOther = await users.getProfile(aliceId, bobId);
    const asOwner = await users.getProfile(bobId, bobId);

    expect(asOther).toEqual({
      id: bobId,
      username: 'bob',
      avatarPath: null,
      isHidden: true,
    });
    expect(asOwner).toMatchObject({ isHidden: false, firstName: 'Bob' });
    await users.updateSettings(bobId, { profileVisibility: 'members' });
  });

  it('BR-ACC-12: setAvailability refuses overlapping slots with OVERLAPPING_SLOTS', async () => {
    const code = await codeOf(() =>
      users.setAvailability(aliceId, [
        { dayOfWeek: 1, startTime: '18:00', endTime: '20:00' },
        { dayOfWeek: 1, startTime: '19:00', endTime: '21:00' },
      ]),
    );

    expect(code).toBe('OVERLAPPING_SLOTS');
  });

  it('BR-ACC-12: setAvailability refuses a slot that ends before it starts with INVALID_SLOT, and keeps adjacent slots', async () => {
    expect(
      await codeOf(() =>
        users.setAvailability(aliceId, [
          { dayOfWeek: 2, startTime: '10:00', endTime: '09:00' },
        ]),
      ),
    ).toBe('INVALID_SLOT');

    await users.setAvailability(aliceId, [
      { dayOfWeek: 1, startTime: '18:00', endTime: '19:00' },
      { dayOfWeek: 1, startTime: '19:00', endTime: '20:00' },
    ]);
    await expect(users.getAvailability(aliceId, aliceId)).resolves.toEqual([
      { dayOfWeek: 1, startTime: '18:00', endTime: '19:00' },
      { dayOfWeek: 1, startTime: '19:00', endTime: '20:00' },
    ]);
  });

  it('BR-ACC-11: setRatings refuses a number on a graded system and accepts a valid grade', async () => {
    expect(
      await codeOf(() =>
        users.setRatings(aliceId, [
          { ratingSystemId: refs.ratingSystems.fftRanking, numericValue: 1500 },
        ]),
      ),
    ).toBe('INVALID_RATING');

    await users.setRatings(aliceId, [
      {
        ratingSystemId: refs.ratingSystems.fftRanking,
        ratingGradeId: refs.grades.fifteenTwo,
      },
    ]);
    const me = await users.getMe(aliceId);
    expect(me.ratings).toEqual([
      {
        ratingSystemId: refs.ratingSystems.fftRanking,
        systemCode: 'fft_ranking',
        numericValue: null,
        gradeCode: '15/2',
      },
    ]);
  });

  it('BR-ACC-10: setSports refuses an unknown sport with INVALID_REFERENCE', async () => {
    const code = await codeOf(() =>
      users.setSports(aliceId, [
        {
          sportId: '00000000-0000-7000-8000-0000000000ff',
          skillLevelId: refs.skillLevels.beginner,
        },
      ]),
    );

    expect(code).toBe('INVALID_REFERENCE');
  });

  it('BR-TECH-10: searchUsers is accent- and case-insensitive and excludes the viewer', async () => {
    const page = await users.searchUsers(zoeId, 'ZOÉ');

    expect(page.items.map((item) => item.id)).toEqual([zoelieId]);
    expect(page.nextCursor).toBeNull();
  });

  it('BR-ACC-02: setUsername refuses a username taken in another letter case with USERNAME_TAKEN', async () => {
    expect(await codeOf(() => users.setUsername(bobId, 'ALICE'))).toBe(
      'USERNAME_TAKEN',
    );
  });

  it('BR-GDP-03: requestDeletion keeps the first request date, cancelDeletion clears it', async () => {
    const first = await users.requestDeletion(bobId);
    const second = await users.requestDeletion(bobId);
    expect(second.deletionRequestedAt).toEqual(first.deletionRequestedAt);
    expect((await users.getMe(bobId)).deletionRequestedAt).toEqual(
      first.deletionRequestedAt,
    );

    await users.cancelDeletion(bobId);
    expect((await users.getMe(bobId)).deletionRequestedAt).toBeNull();
  });

  it('updateSettings applies the patch and getSettings returns it back', async () => {
    const updated = await users.updateSettings(bobId, {
      hideFromRankings: true,
      circleInvitePolicy: 'nobody',
    });

    expect(updated).toMatchObject({
      hideFromRankings: true,
      circleInvitePolicy: 'nobody',
    });
    await expect(users.getSettings(bobId)).resolves.toEqual(updated);
  });

  it('BR-SOC-02: getAvailability is null while the users are blocked in either direction, and back once unblocked', async () => {
    await users.setAvailability(aliceId, [
      { dayOfWeek: 1, startTime: '18:00', endTime: '20:00' },
    ]);
    expect(await users.getAvailability(zoeId, aliceId)).not.toBeNull();

    await blocks.block(zoeId, aliceId);
    expect(await users.getAvailability(zoeId, aliceId)).toBeNull();
    expect(await users.getAvailability(aliceId, zoeId)).toBeNull();

    await blocks.unblock(zoeId, aliceId);
    expect(await users.getAvailability(zoeId, aliceId)).not.toBeNull();
  });
});
