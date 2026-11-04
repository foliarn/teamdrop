import { resolve } from 'node:path';
import { AuthRepository } from '../repositories/auth.repository';
import { BlockRepository } from '../repositories/block.repository';
import { CheerRepository } from '../repositories/cheer.repository';
import { EventRepository } from '../repositories/event.repository';
import { RegistrationRepository } from '../repositories/registration.repository';
import { UserRepository } from '../repositories/user.repository';
import { appDb, ownerDb, runSqlFile, truncateAll } from './helpers/test-db';
import { type MinimalRefs, seedMinimal } from './helpers/seed-minimal';
import {
  codeOf,
  eventInput,
  firstOccurrenceId,
  localIn,
  newUser,
} from './helpers/event-helpers';
import type { OccurrenceKey } from '../types/event.types';

// __tests__ -> data -> src -> api -> apps -> repository root
const cheerTypeSeed = resolve(
  __dirname,
  '../../../../../db/seeds/reference/060_cheer_type.sql',
);

describe('Cheers (batch 3)', () => {
  const db = appDb();
  const owner = ownerDb();
  const auth = new AuthRepository(db);
  const blocks = new BlockRepository(db);
  const cheers = new CheerRepository(db);
  const events = new EventRepository(db);
  const registrations = new RegistrationRepository(db);
  const users = new UserRepository(db);
  const counter = { value: 0 };
  let refs: MinimalRefs;

  const user = (name: string): Promise<string> =>
    newUser(auth, refs, name, counter);

  /**
   * An occurrence with the organizer and `participants` confirmed, completed, everyone `attended` except `noShows`.
   * The clock is simulated with the owner connection.
   */
  async function completedWith(
    organizer: string,
    participants: string[],
    options: { noShows?: string[]; complete?: boolean } = {},
  ): Promise<OccurrenceKey> {
    const when = localIn(48);
    const { eventId } = await events.createEvent(
      organizer,
      eventInput(refs, {
        startDate: when.date,
        startTime: when.time,
        maxParticipants: 20,
        ownerCountsTowardCapacity: true,
      }),
    );
    await events.publishEvent(eventId);
    const key = { eventId, date: when.date };
    for (const participant of participants) {
      await registrations.register(key, participant);
    }
    const occurrenceId = await firstOccurrenceId(owner, eventId);
    if (options.complete !== false) {
      await owner
        .updateTable('event_occurrence')
        .set({ status: 'completed', completed_at: new Date() })
        .where('id', '=', occurrenceId)
        .execute();
      await owner
        .updateTable('registration')
        .set({ attendance: 'attended' })
        .where('occurrence_id', '=', occurrenceId)
        .where('status', '=', 'confirmed')
        .execute();
      for (const noShow of options.noShows ?? []) {
        await owner
          .updateTable('registration')
          .set({ attendance: 'no_show' })
          .where('occurrence_id', '=', occurrenceId)
          .where('user_id', '=', noShow)
          .execute();
      }
    }
    return key;
  }

  beforeAll(async () => {
    await truncateAll(owner);
    refs = await seedMinimal(owner);
    await runSqlFile(owner, cheerTypeSeed);
  });

  afterAll(async () => {
    await db.destroy();
    await owner.destroy();
  });

  describe('giving cheers', () => {
    it('BR-SOC-11: a participant who attended cheers another one, once per occurrence', async () => {
      const organizer = await user('giveorg');
      const a = await user('givea');
      const key = await completedWith(organizer, [a]);
      const { cheerId } = await cheers.giveCheer(
        a,
        organizer,
        key,
        'fair_play',
      );
      expect(cheerId).toEqual(expect.any(String));
      expect(
        await codeOf(() => cheers.giveCheer(a, organizer, key, 'punctual')),
      ).toBe('ALREADY_CHEERED');
      // The other direction is a different cheer.
      await cheers.giveCheer(organizer, a, key, 'good_vibes');
    });

    it('BR-SOC-11: no cheer to oneself', async () => {
      const organizer = await user('selforg');
      const key = await completedWith(organizer, []);
      expect(
        await codeOf(() =>
          cheers.giveCheer(organizer, organizer, key, 'fair_play'),
        ),
      ).toBe('SELF_ACTION');
    });

    it('BR-SOC-11: only after the occurrence is completed', async () => {
      const organizer = await user('notdoneorg');
      const a = await user('notdonea');
      const key = await completedWith(organizer, [a], { complete: false });
      expect(
        await codeOf(() => cheers.giveCheer(a, organizer, key, 'fair_play')),
      ).toBe('CHEER_NOT_ALLOWED');
    });

    it('BR-SOC-11: only between participants with a validated attendance', async () => {
      const organizer = await user('attorg');
      const a = await user('atta');
      const noShow = await user('attnoshow');
      const outsider = await user('attoutsider');
      const key = await completedWith(organizer, [a, noShow], {
        noShows: [noShow],
      });
      expect(
        await codeOf(() => cheers.giveCheer(noShow, a, key, 'fair_play')),
      ).toBe('CHEER_NOT_ALLOWED');
      expect(
        await codeOf(() => cheers.giveCheer(a, noShow, key, 'fair_play')),
      ).toBe('CHEER_NOT_ALLOWED');
      expect(
        await codeOf(() => cheers.giveCheer(outsider, a, key, 'fair_play')),
      ).toBe('CHEER_NOT_ALLOWED');
    });

    it('BR-SOC-11: there is no deadline', async () => {
      const organizer = await user('lateorg');
      const a = await user('latea');
      const key = await completedWith(organizer, [a]);
      await owner
        .updateTable('event_occurrence')
        .set({ completed_at: new Date('2020-01-01T00:00:00Z') })
        .where('event_id', '=', key.eventId)
        .execute();
      await expect(
        cheers.giveCheer(a, organizer, key, 'skilled'),
      ).resolves.toEqual({ cheerId: expect.any(String) as unknown });
    });

    it('BR-SOC-02: users blocked with each other cannot cheer each other', async () => {
      const organizer = await user('blockorg');
      const a = await user('blocka');
      const key = await completedWith(organizer, [a]);
      await blocks.block(organizer, a);
      expect(
        await codeOf(() => cheers.giveCheer(a, organizer, key, 'fair_play')),
      ).toBe('BLOCKED');
    });

    it('BR-TECH-12: unknown and inactive types are refused', async () => {
      const organizer = await user('typeorg');
      const a = await user('typea');
      const key = await completedWith(organizer, [a]);
      expect(
        await codeOf(() => cheers.giveCheer(a, organizer, key, 'nope')),
      ).toBe('INVALID_REFERENCE');
      const retired = await cheers.createCheerType({
        code: 'retired_type',
        name: 'Retired',
        sortOrder: 99,
        isActive: false,
      });
      expect(
        await codeOf(() => cheers.giveCheer(a, organizer, key, retired.code)),
      ).toBe('INVALID_REFERENCE');
    });

    it('BR-SOC-11: lists the participants the viewer may cheer, with the cheer already given', async () => {
      const organizer = await user('listorg');
      const a = await user('lista');
      const b = await user('listb');
      const noShow = await user('listnoshow');
      const key = await completedWith(organizer, [a, b, noShow], {
        noShows: [noShow],
      });
      await cheers.giveCheer(a, b, key, 'motivating');
      const list = await cheers.listCheerableParticipants(a, key);
      // Ordered by username: listb... before listorg...
      expect(list?.map((p) => [p.userId, p.givenCheerTypeCode])).toEqual([
        [b, 'motivating'],
        [organizer, null],
      ]);
      expect(await cheers.listCheerableParticipants(noShow, key)).toBeNull();
    });
  });

  describe('visibility (BR-SOC-12)', () => {
    it('BR-SOC-12: the recipient sees who gave each cheer; an erased giver is a deleted user', async () => {
      const organizer = await user('seeorg');
      const a = await user('seea');
      const b = await user('seeb');
      const key = await completedWith(organizer, [a, b]);
      await cheers.giveCheer(a, organizer, key, 'fair_play');
      await cheers.giveCheer(b, organizer, key, 'punctual');
      await owner.deleteFrom('user_account').where('id', '=', b).execute();

      const page = await cheers.listReceivedCheers(organizer);
      expect(
        page.items.map((c) => [c.type.code, c.giver?.userId ?? null]),
      ).toEqual([
        ['punctual', null],
        ['fair_play', a],
      ]);
      expect(page.items[0].occurrence).toMatchObject({
        key,
        title: 'Test event',
      });
    });

    it('BR-SOC-12: others see counts per type only; BR-SOC-04: a later block keeps the counts', async () => {
      const organizer = await user('countorg');
      const a = await user('counta');
      const b = await user('countb');
      const viewer = await user('countviewer');
      const key = await completedWith(organizer, [a, b]);
      await cheers.giveCheer(a, organizer, key, 'fair_play');
      await cheers.giveCheer(b, organizer, key, 'fair_play');
      await blocks.block(organizer, b);

      const counts = await cheers.getCheerCounts(viewer, organizer);
      expect(counts?.find((c) => c.code === 'fair_play')?.count).toBe(2);
      expect(counts?.find((c) => c.code === 'skilled')?.count).toBe(0);
      expect(counts?.map((c) => c.code).slice(0, 2)).toEqual([
        'fair_play',
        'punctual',
      ]);
      // The blocked giver's cheer is no longer listed to the recipient, but still counts.
      const received = await cheers.listReceivedCheers(organizer);
      expect(received.items.map((c) => c.giver?.userId)).toEqual([a]);
      expect(await cheers.getCheerCounts(b, organizer)).toBeNull();
    });

    it('BR-ACC-14: counts follow the stats visibility of the recipient', async () => {
      const a = await user('privatea');
      const viewer = await user('privateviewer');
      await users.updateSettings(a, { statsVisibility: 'only_me' });
      expect(await cheers.getCheerCounts(viewer, a)).toBeNull();
      expect(await cheers.getCheerCounts(a, a)).not.toBeNull();
    });
  });

  describe('cheer types (back office)', () => {
    it('BR-TECH-12: creates, updates and lists cheer types; codes are unique', async () => {
      const created = await cheers.createCheerType({
        code: 'clutch',
        name: 'Clutch',
        sortOrder: 7,
        icon: 'bolt',
      });
      expect(
        await codeOf(() =>
          cheers.createCheerType({
            code: 'clutch',
            name: 'Again',
            sortOrder: 8,
          }),
        ),
      ).toBe('INVALID_INPUT');
      const updated = await cheers.updateCheerType(created.id, {
        isActive: false,
      });
      expect(updated.isActive).toBe(false);
      expect((await cheers.listCheerTypes()).map((t) => t.code)).not.toContain(
        'clutch',
      );
      expect(
        (await cheers.listCheerTypes({ includeInactive: true })).map(
          (t) => t.code,
        ),
      ).toContain('clutch');
      expect(
        await codeOf(() =>
          cheers.updateCheerType('00000000-0000-7000-8000-00000000dead', {
            name: 'X',
          }),
        ),
      ).toBe('NOT_FOUND');
    });
  });
});
