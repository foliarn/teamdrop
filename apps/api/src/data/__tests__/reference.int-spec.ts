import { ReferenceRepository } from '../repositories/reference.repository';
import { appDb, ownerDb, truncateAll } from './helpers/test-db';
import { type MinimalRefs, seedMinimal } from './helpers/seed-minimal';

describe('ReferenceRepository', () => {
  const db = appDb();
  const owner = ownerDb();
  const repo = new ReferenceRepository(db);
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

  it('BR-ACC-19: searchMunicipalities("paris 8") finds Paris 8e with its parent city', async () => {
    const results = await repo.searchMunicipalities('paris 8');

    expect(results[0]).toMatchObject({
      id: refs.municipalities.paris8,
      name: 'Paris 8e',
      parent: { id: refs.municipalities.paris, name: 'Paris' },
    });
  });

  it('BR-TECH-10: searchMunicipalities is accent- and case-insensitive ("lyón" finds Lyon)', async () => {
    const results = await repo.searchMunicipalities('lyón');

    expect(results.map((municipality) => municipality.id)).toContain(
      refs.municipalities.lyon,
    );
  });

  it('BR-TECH-10: searchMunicipalities returns nothing for a query shorter than 2 characters', async () => {
    await expect(repo.searchMunicipalities(' p ')).resolves.toEqual([]);
  });

  it('BR-ACC-11: listRatingSystems returns the grades of the graded system ordered by rank', async () => {
    const systems = await repo.listRatingSystems();
    const fft = systems.find((system) => system.code === 'fft_ranking');

    expect(fft?.valueKind).toBe('graded');
    expect(fft?.grades.map((grade) => grade.code)).toEqual(['NC', '15/2', '0']);
    expect(fft?.grades.map((grade) => grade.rank)).toEqual([1, 12, 20]);
  });

  it('BR-ACC-17: createSport refuses a code already used with INVALID_INPUT', async () => {
    const error = await repo
      .createSport({
        code: 'football',
        name: 'Football bis',
        isTeamSport: true,
        environment: 'outdoor',
        defaultDurationMinutes: 90,
      })
      .catch((err: unknown) => err);

    expect(error).toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('BR-ACC-17: listSports hides inactive sports unless asked to include them', async () => {
    await repo.setSportActive(refs.sports.chess, false);

    const active = await repo.listSports();
    const all = await repo.listSports({ includeInactive: true });

    expect(active.map((sport) => sport.code)).not.toContain('chess');
    expect(all.map((sport) => sport.code)).toContain('chess');
    await repo.setSportActive(refs.sports.chess, true);
  });
});
