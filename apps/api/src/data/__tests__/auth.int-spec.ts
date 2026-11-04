import { AuthRepository } from '../repositories/auth.repository';
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

/** A birth date for a person who is exactly 14 years old in the current calendar year (always under 15). */
function birthDateOfFourteenYearOld(): string {
  return `${new Date().getUTCFullYear() - 14}-01-01`;
}

describe('AuthRepository', () => {
  const db = appDb();
  const owner = ownerDb();
  const repo = new AuthRepository(db);
  let refs: MinimalRefs;

  beforeAll(async () => {
    await truncateAll(owner);
    refs = await seedMinimal(owner);
  });

  afterAll(async () => {
    // Leave the test database empty for the pgTAP suite, which expects no rows.
    await truncateAll(owner);
    await Promise.all([db.destroy(), owner.destroy()]);
  });

  const adultPassword = (username: string, email: string) => ({
    username,
    email,
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA',
    firstName: 'Test',
    birthDate: '1990-04-12',
    municipalityId: '',
  });

  it('BR-ACC-04: creates a password account and finds its login by email in any case', async () => {
    const { userId } = await repo.createUserWithPassword({
      ...adultPassword('alice', 'alice@example.test'),
      municipalityId: refs.municipalities.paris8,
    });

    const login = await repo.findLoginByEmail('  Alice@Example.TEST ');

    expect(login).toEqual({
      userId,
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA',
      emailVerified: false,
      role: 'user',
      deletionRequestedAt: null,
    });
  });

  it('BR-ACC-02: refuses a username already used in another letter case with USERNAME_TAKEN', async () => {
    const code = await codeOf(() =>
      repo.createUserWithPassword({
        ...adultPassword('ALICE', 'other@example.test'),
        municipalityId: refs.municipalities.paris8,
      }),
    );

    expect(code).toBe('USERNAME_TAKEN');
  });

  it('BR-ACC-04: refuses an email already used, whatever its case or spaces, with EMAIL_TAKEN', async () => {
    const code = await codeOf(() =>
      repo.createUserWithPassword({
        ...adultPassword('alice2', '  ALICE@example.test '),
        municipalityId: refs.municipalities.paris8,
      }),
    );

    expect(code).toBe('EMAIL_TAKEN');
  });

  it('BR-ACC-03: refuses a 14-year-old with UNDER_MINIMUM_AGE', async () => {
    const code = await codeOf(() =>
      repo.createUserWithPassword({
        ...adultPassword('young', 'young@example.test'),
        birthDate: birthDateOfFourteenYearOld(),
        municipalityId: refs.municipalities.paris8,
      }),
    );

    expect(code).toBe('UNDER_MINIMUM_AGE');
  });

  it('BR-ACC-06: a Google sign-up with an email that has a password account is refused, nothing is merged', async () => {
    const code = await codeOf(() =>
      repo.createUserWithGoogle({
        username: 'alice_google',
        email: 'alice@example.test',
        emailVerified: true,
        googleSubject: 'google-alice-merge-attempt',
        firstName: 'Alice',
        birthDate: '1990-04-12',
        municipalityId: refs.municipalities.paris8,
      }),
    );

    expect(code).toBe('EMAIL_BELONGS_TO_EXISTING_ACCOUNT');
  });

  it('BR-ACC-05: a Google sign-up creates a verified account that is found by its Google subject', async () => {
    const { userId } = await repo.createUserWithGoogle({
      username: 'bob',
      email: 'bob@example.test',
      emailVerified: true,
      googleSubject: 'google-bob',
      firstName: 'Bob',
      birthDate: '1988-09-30',
      municipalityId: refs.municipalities.lyon,
    });

    await expect(repo.findUserByGoogleSubject('google-bob')).resolves.toEqual({
      userId,
      role: 'user',
    });
    await expect(
      repo.findLoginByEmail('bob@example.test'),
    ).resolves.toMatchObject({
      userId,
      passwordHash: null,
      emailVerified: true,
    });
  });

  it('BR-ACC-07: a refresh token rotates once; reusing the rotated token revokes the whole family with REFRESH_TOKEN_REUSE', async () => {
    const { userId } = await repo.createUserWithPassword({
      ...adultPassword('rotator', 'rotator@example.test'),
      municipalityId: refs.municipalities.paris8,
    });
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const { familyId } = await repo.issueRefreshToken({
      userId,
      token: 'refresh-1',
      expiresAt,
    });

    const rotated = await repo.rotateRefreshToken({
      oldToken: 'refresh-1',
      newToken: 'refresh-2',
      expiresAt,
    });
    expect(rotated).toEqual({ userId, familyId });

    // The old token is presented again: reuse is detected.
    expect(
      await codeOf(() =>
        repo.rotateRefreshToken({
          oldToken: 'refresh-1',
          newToken: 'refresh-3',
          expiresAt,
        }),
      ),
    ).toBe('REFRESH_TOKEN_REUSE');
    // The new token was revoked with its family by the reuse detection.
    expect(
      await codeOf(() =>
        repo.rotateRefreshToken({
          oldToken: 'refresh-2',
          newToken: 'refresh-4',
          expiresAt,
        }),
      ),
    ).toBe('REFRESH_TOKEN_REUSE');
  });

  it('BR-ACC-07: an account token is consumed once; a second use is INVALID_TOKEN', async () => {
    const { userId } = await repo.createUserWithPassword({
      ...adultPassword('verifier', 'verifier@example.test'),
      municipalityId: refs.municipalities.paris8,
    });
    await repo.createAccountToken({
      userId,
      purpose: 'email_verification',
      token: 'verify-1',
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    });

    await expect(
      repo.consumeAccountToken('email_verification', 'verify-1'),
    ).resolves.toEqual({
      userId,
    });
    expect(
      await codeOf(() =>
        repo.consumeAccountToken('email_verification', 'verify-1'),
      ),
    ).toBe('INVALID_TOKEN');
  });

  it('BR-ACC-05: linking a Google subject already linked to another account is refused with GOOGLE_ALREADY_LINKED', async () => {
    const { userId } = await repo.createUserWithPassword({
      ...adultPassword('linker', 'linker@example.test'),
      municipalityId: refs.municipalities.paris8,
    });

    expect(await codeOf(() => repo.linkGoogle(userId, 'google-bob'))).toBe(
      'GOOGLE_ALREADY_LINKED',
    );
  });

  it('BR-ACC-05: unlinking Google from a Google-only account is refused with LAST_LOGIN_METHOD', async () => {
    const { userId } = await repo.createUserWithGoogle({
      username: 'googleonly',
      email: 'googleonly@example.test',
      emailVerified: true,
      googleSubject: 'google-only-user',
      firstName: 'Only',
      birthDate: '1995-03-03',
      municipalityId: refs.municipalities.paris8,
    });

    expect(await codeOf(() => repo.unlinkGoogle(userId))).toBe(
      'LAST_LOGIN_METHOD',
    );
  });
});
