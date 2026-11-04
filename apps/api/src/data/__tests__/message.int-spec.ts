import { randomUUID } from 'node:crypto';
import { requiredEnv } from '../internal/env';
import { ChatEventListener } from '../chat-event-listener';
import { AuthRepository } from '../repositories/auth.repository';
import { BlockRepository } from '../repositories/block.repository';
import { CircleRepository } from '../repositories/circle.repository';
import { CommunityRepository } from '../repositories/community.repository';
import { EventRepository } from '../repositories/event.repository';
import { MessageRepository } from '../repositories/message.repository';
import { RegistrationRepository } from '../repositories/registration.repository';
import { appDb, ownerDb, truncateAll } from './helpers/test-db';
import { type MinimalRefs, seedMinimal } from './helpers/seed-minimal';
import {
  codeOf,
  eventInput,
  firstOccurrenceId,
  localIn,
  newUser,
} from './helpers/event-helpers';
import type { OccurrenceKey } from '../types/event.types';
import type { ChatEvent } from '../types/messaging.types';

describe('Messaging (batch 2)', () => {
  const db = appDb();
  const owner = ownerDb();
  const auth = new AuthRepository(db);
  const blocks = new BlockRepository(db);
  const circles = new CircleRepository(db);
  const communities = new CommunityRepository(db);
  const events = new EventRepository(db);
  const registrations = new RegistrationRepository(db);
  const messages = new MessageRepository(db);
  const counter = { value: 0 };
  let refs: MinimalRefs;

  const user = (name: string): Promise<string> =>
    newUser(auth, refs, name, counter);

  /** Sends a message with a fresh client id. */
  const send = (
    senderId: string,
    conversationId: string,
    body: string,
    replyToMessageId?: string,
  ) =>
    messages.sendMessage(senderId, conversationId, {
      clientMessageId: randomUUID(),
      body,
      replyToMessageId,
    });

  /** A circle owned by `ownerId` whose other members accepted an invitation from the owner. Returns its conversation id. */
  async function circleWith(
    ownerId: string,
    memberIds: string[],
  ): Promise<{ circleId: string; conversationId: string }> {
    const circle = await circles.createCircle(ownerId, { name: 'Chat circle' });
    for (const memberId of memberIds) {
      const invitation = await circles.invite(circle.id, ownerId, memberId);
      await circles.respondToInvitation(
        invitation.invitationId,
        memberId,
        true,
      );
    }
    const conversationId = await messages.getConversationId({
      circleId: circle.id,
    });
    if (conversationId === null) {
      throw new Error('The circle has no conversation');
    }
    return { circleId: circle.id, conversationId };
  }

  /** A published one-off event starting `hours` from now, owned by `organizer`. */
  async function occurrenceIn(
    organizer: string,
    hours: number,
    maxParticipants = 10,
  ): Promise<OccurrenceKey> {
    const when = localIn(hours);
    const { eventId } = await events.createEvent(
      organizer,
      eventInput(refs, {
        startDate: when.date,
        startTime: when.time,
        maxParticipants,
      }),
    );
    await events.publishEvent(eventId);
    return { eventId, date: when.date };
  }

  async function messageCount(conversationId: string): Promise<number> {
    const row = await owner
      .selectFrom('message')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('conversation_id', '=', conversationId)
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  beforeAll(async () => {
    await truncateAll(owner);
    refs = await seedMinimal(owner);
  });

  afterAll(async () => {
    await db.destroy();
    await owner.destroy();
  });

  describe('conversations and access', () => {
    it('BR-SOC-08: a new circle has its own conversation', async () => {
      const a = await user('circleowner');
      const circle = await circles.createCircle(a, { name: 'New circle' });
      const id = await messages.getConversationId({ circleId: circle.id });
      expect(id).not.toBeNull();
      expect(await messages.hasAccess(a, id ?? '')).toBe(true);
    });

    it('BR-SOC-09: a new community has its own conversation, open to its members', async () => {
      const a = await user('communityowner');
      const b = await user('communityjoiner');
      const community = await communities.createCommunity(a, {
        name: 'Chat community',
        joinPolicy: 'open',
      });
      const id = await messages.getConversationId({
        communityId: community.id,
      });
      expect(id).not.toBeNull();
      expect(await messages.hasAccess(b, id ?? '')).toBe(false);
      await communities.join(community.id, b);
      expect(await messages.hasAccess(b, id ?? '')).toBe(true);
    });

    it('BR-MSG-01: only circle members read and post; leaving the circle removes access', async () => {
      const a = await user('cowner');
      const b = await user('cmember');
      const outsider = await user('coutsider');
      const { circleId, conversationId } = await circleWith(a, [b]);

      await send(b, conversationId, 'Hello');
      expect(
        await codeOf(() => send(outsider, conversationId, 'Intruder')),
      ).toBe('NOT_CONVERSATION_MEMBER');
      expect(await messages.listMessages(outsider, conversationId)).toBeNull();

      await circles.leaveCircle(circleId, b);
      expect(await messages.listMessages(b, conversationId)).toBeNull();
      expect(await codeOf(() => send(b, conversationId, 'Back?'))).toBe(
        'NOT_CONVERSATION_MEMBER',
      );
    });

    it('BR-MSG-01: an unknown conversation is NOT_FOUND', async () => {
      const a = await user('unknownconv');
      expect(await codeOf(() => send(a, randomUUID(), 'Hello'))).toBe(
        'NOT_FOUND',
      );
    });

    it('BR-EVT-03, BR-MSG-01: an occurrence conversation is created on first need, once', async () => {
      const organizer = await user('occorganizer');
      const participant = await user('occparticipant');
      const key = await occurrenceIn(organizer, 48);
      expect(await messages.getConversationId({ occurrence: key })).toBeNull();
      await registrations.register(key, participant);

      const [first, second] = await Promise.all([
        messages.getOrCreateOccurrenceConversation(participant, key),
        messages.getOrCreateOccurrenceConversation(organizer, key),
      ]);
      expect(first).toBe(second);
      expect(await messages.getConversationId({ occurrence: key })).toBe(first);
    });

    it('BR-MSG-01: an outsider cannot open an occurrence conversation, and nothing is created', async () => {
      const organizer = await user('occorg2');
      const outsider = await user('occoutsider');
      const when = localIn(72);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, {
          startDate: when.date,
          startTime: when.time,
          recurrence: { rule: 'FREQ=WEEKLY' },
        }),
      );
      await events.publishEvent(eventId);
      const key = { eventId, date: when.date };
      expect(
        await codeOf(() =>
          messages.getOrCreateOccurrenceConversation(outsider, key),
        ),
      ).toBe('NOT_CONVERSATION_MEMBER');
      const rows = await owner
        .selectFrom('event_occurrence')
        .select('id')
        .where('event_id', '=', eventId)
        .execute();
      expect(rows).toHaveLength(0);
    });

    it('BR-MSG-01: organizers, co-organizers, confirmed, pending and waitlisted users have access; a cancelled registration loses it', async () => {
      const organizer = await user('accessorg');
      const coOrganizer = await user('accesscoorg');
      const confirmed = await user('accessconfirmed');
      const waitlisted = await user('accesswaitlisted');
      const outsider = await user('accessoutsider');
      const key = await occurrenceIn(organizer, 48, 1);
      await events.addCoOrganizer(key.eventId, coOrganizer, false);
      expect((await registrations.register(key, confirmed)).status).toBe(
        'confirmed',
      );
      expect((await registrations.register(key, waitlisted)).status).toBe(
        'waitlisted',
      );
      const conversationId = await messages.getOrCreateOccurrenceConversation(
        organizer,
        key,
      );

      for (const userId of [organizer, coOrganizer, confirmed, waitlisted]) {
        expect(await messages.hasAccess(userId, conversationId)).toBe(true);
      }
      expect(await messages.hasAccess(outsider, conversationId)).toBe(false);

      await registrations.cancelRegistration(key, confirmed);
      expect(await messages.hasAccess(confirmed, conversationId)).toBe(false);
      // The waitlisted user was promoted and keeps access.
      expect(await messages.hasAccess(waitlisted, conversationId)).toBe(true);
    });

    it('BR-MSG-01: pending approval registrations have access', async () => {
      const organizer = await user('approvalorg');
      const pending = await user('approvalpending');
      const when = localIn(48);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, {
          startDate: when.date,
          startTime: when.time,
          registrationMode: 'approval',
        }),
      );
      await events.publishEvent(eventId);
      const key = { eventId, date: when.date };
      expect((await registrations.register(key, pending)).status).toBe(
        'pending_approval',
      );
      const conversationId = await messages.getOrCreateOccurrenceConversation(
        pending,
        key,
      );
      expect(await messages.hasAccess(pending, conversationId)).toBe(true);
    });

    it('BR-MSG-01: people can still post after the occurrence is completed', async () => {
      const organizer = await user('afterorg');
      const participant = await user('afterparticipant');
      const key = await occurrenceIn(organizer, 48);
      await registrations.register(key, participant);
      const conversationId = await messages.getOrCreateOccurrenceConversation(
        participant,
        key,
      );
      await owner
        .updateTable('event_occurrence')
        .set({ status: 'completed', completed_at: new Date() })
        .where('id', '=', await firstOccurrenceId(owner, key.eventId))
        .execute();
      const outcome = await send(participant, conversationId, 'Good game!');
      expect(outcome.recipientUserIds).toEqual([organizer]);
    });

    it('a draft event has no conversation (INVALID_STATE)', async () => {
      const organizer = await user('draftorg');
      const when = localIn(48);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, { startDate: when.date, startTime: when.time }),
      );
      expect(
        await codeOf(() =>
          messages.getOrCreateOccurrenceConversation(organizer, {
            eventId,
            date: when.date,
          }),
        ),
      ).toBe('INVALID_STATE');
    });
  });

  describe('sending, editing, deleting', () => {
    it('BR-TECH-08: a re-sent message is deduplicated and notifies nobody', async () => {
      const a = await user('dedupa');
      const b = await user('dedupb');
      const { conversationId } = await circleWith(a, [b]);
      const clientMessageId = randomUUID();
      const first = await messages.sendMessage(a, conversationId, {
        clientMessageId,
        body: 'Once',
      });
      const again = await messages.sendMessage(a, conversationId, {
        clientMessageId,
        body: 'Once',
      });
      expect(first.deduplicated).toBe(false);
      expect(first.recipientUserIds).toEqual([b]);
      expect(again.deduplicated).toBe(true);
      expect(again.message.id).toBe(first.message.id);
      expect(again.recipientUserIds).toEqual([]);
      expect(again.pushRecipientUserIds).toEqual([]);
      expect(await messageCount(conversationId)).toBe(1);
    });

    it('BR-TECH-08: two concurrent sends with the same client id store one message', async () => {
      const a = await user('concurrenta');
      const { conversationId } = await circleWith(a, []);
      const clientMessageId = randomUUID();
      const results = await Promise.all(
        [1, 2, 3].map(() =>
          messages.sendMessage(a, conversationId, {
            clientMessageId,
            body: 'Race',
          }),
        ),
      );
      expect(new Set(results.map((r) => r.message.id)).size).toBe(1);
      expect(results.filter((r) => !r.deduplicated)).toHaveLength(1);
      expect(await messageCount(conversationId)).toBe(1);
    });

    it('BR-TECH-08: a client id reused in another conversation is INVALID_INPUT', async () => {
      const a = await user('reusea');
      const one = await circleWith(a, []);
      const two = await circleWith(a, []);
      const clientMessageId = randomUUID();
      await messages.sendMessage(a, one.conversationId, {
        clientMessageId,
        body: 'First',
      });
      expect(
        await codeOf(() =>
          messages.sendMessage(a, two.conversationId, {
            clientMessageId,
            body: 'Second',
          }),
        ),
      ).toBe('INVALID_INPUT');
      expect(
        await codeOf(() =>
          messages.sendMessage(a, two.conversationId, {
            clientMessageId: 'not-a-uuid',
            body: 'Third',
          }),
        ),
      ).toBe('INVALID_INPUT');
    });

    it('BR-MSG-02: blank bodies and bodies over 4000 characters are refused', async () => {
      const a = await user('bodya');
      const { conversationId } = await circleWith(a, []);
      expect(await codeOf(() => send(a, conversationId, ' \n\t '))).toBe(
        'INVALID_INPUT',
      );
      expect(
        await codeOf(() => send(a, conversationId, 'x'.repeat(4001))),
      ).toBe('INVALID_INPUT');
      const ok = await send(a, conversationId, 'é'.repeat(4000));
      expect(ok.message.body).toHaveLength(4000);
    });

    it('BR-MSG-02: a reply targets a message of the same conversation', async () => {
      const a = await user('replya');
      const b = await user('replyb');
      const { conversationId } = await circleWith(a, [b]);
      const other = await circleWith(a, []);
      const original = await send(a, conversationId, 'Who plays tonight?');
      const reply = await send(b, conversationId, 'Me!', original.message.id);
      expect(reply.message.replyTo).toEqual({
        messageId: original.message.id,
        hidden: false,
        sender: expect.objectContaining({ userId: a }) as unknown,
        bodyPreview: 'Who plays tonight?',
      });
      expect(
        await codeOf(() =>
          send(a, other.conversationId, 'Wrong chat', original.message.id),
        ),
      ).toBe('NOT_FOUND');
    });

    it('BR-MSG-02: the author edits their own message and edited_at is set', async () => {
      const a = await user('edita');
      const b = await user('editb');
      const { conversationId } = await circleWith(a, [b]);
      const sent = await send(a, conversationId, 'Typo');
      expect(sent.message.editedAt).toBeNull();
      const edited = await messages.editMessage(a, sent.message.id, 'Fixed');
      expect(edited.body).toBe('Fixed');
      expect(edited.editedAt).toBeInstanceOf(Date);
      expect(
        await codeOf(() => messages.editMessage(b, sent.message.id, 'Hijack')),
      ).toBe('NOT_FOUND');
      expect(
        await codeOf(() => messages.editMessage(a, sent.message.id, '   ')),
      ).toBe('INVALID_INPUT');
    });

    it('BR-MSG-03: deleting a message is a hard delete; replies stay; read pointers move back', async () => {
      const a = await user('deletea');
      const b = await user('deleteb');
      const { conversationId } = await circleWith(a, [b]);
      const first = await send(a, conversationId, 'First');
      const second = await send(a, conversationId, 'Second');
      const reply = await send(b, conversationId, 'Reply', second.message.id);
      await messages.markRead(b, conversationId, reply.message.id);
      // a read up to `second` (their own last message).
      const outcome = await messages.deleteMessage(second.message.id);
      expect(outcome).toEqual({ conversationId });

      const page = await messages.listMessages(a, conversationId);
      expect(page?.items.map((m) => m.id)).toEqual([
        reply.message.id,
        first.message.id,
      ]);
      expect(page?.items[0].replyTo).toBeNull();
      const pointer = await owner
        .selectFrom('conversation_member')
        .select('last_read_message_id')
        .where('conversation_id', '=', conversationId)
        .where('user_id', '=', a)
        .executeTakeFirstOrThrow();
      expect(pointer.last_read_message_id).toBe(first.message.id);
      expect(
        await codeOf(() => messages.deleteMessage(second.message.id)),
      ).toBe('NOT_FOUND');
    });

    it('BR-GDP-04: a message of an erased account shows a deleted user', async () => {
      const a = await user('erasea');
      const b = await user('eraseb');
      const { conversationId } = await circleWith(a, [b]);
      await send(b, conversationId, 'Bye');
      await owner.deleteFrom('user_account').where('id', '=', b).execute();
      const page = await messages.listMessages(a, conversationId);
      expect(page?.items[0].sender).toBeNull();
      expect(page?.items[0].body).toBe('Bye');
    });
  });

  describe('recipients, blocking and mute', () => {
    it('BR-SOC-02, BR-SOC-04: recipients leave out the sender and users blocked with the sender; push leaves out muted members', async () => {
      const a = await user('recipa');
      const b = await user('recipb');
      const c = await user('recipc');
      const d = await user('recipd');
      const { conversationId } = await circleWith(a, [b, c, d]);
      await blocks.block(c, a);
      await messages.setMuted(d, conversationId, true);
      const outcome = await send(a, conversationId, 'Looking for players');
      expect([...outcome.recipientUserIds].sort()).toEqual([b, d].sort());
      expect(outcome.pushRecipientUserIds).toEqual([b]);
    });

    it('BR-SOC-04: messages, reactions and reply previews of a blocked user are hidden both ways', async () => {
      const a = await user('blocka');
      const b = await user('blockb');
      const c = await user('blockc');
      const { conversationId } = await circleWith(a, [b, c]);
      const fromA = await send(a, conversationId, 'From A');
      const fromB = await send(b, conversationId, 'From B');
      await messages.react(b, fromA.message.id, 'heart');
      await messages.react(c, fromA.message.id, 'heart');
      await send(c, conversationId, 'Quoting B', fromB.message.id);
      await blocks.block(a, b);

      const seenByA = await messages.listMessages(a, conversationId);
      expect(seenByA?.items.map((m) => m.body)).toEqual([
        'Quoting B',
        'From A',
      ]);
      expect(seenByA?.items[0].replyTo).toEqual({
        messageId: fromB.message.id,
        hidden: true,
      });
      expect(seenByA?.items[1].reactions).toEqual([
        { code: 'heart', count: 1, reactedByMe: false },
      ]);
      const seenByB = await messages.listMessages(b, conversationId);
      expect(seenByB?.items.map((m) => m.body)).toEqual([
        'Quoting B',
        'From B',
      ]);
      expect(await messages.getMessage(b, fromA.message.id)).toBeNull();
      // C sees everything.
      const seenByC = await messages.listMessages(c, conversationId);
      expect(seenByC?.items).toHaveLength(3);
    });

    it('BR-SOC-02: a blocked user cannot react to or reply to the other', async () => {
      const a = await user('noreacta');
      const b = await user('noreactb');
      const { conversationId } = await circleWith(a, [b]);
      const fromA = await send(a, conversationId, 'Hello');
      await blocks.block(a, b);
      expect(
        await codeOf(() => messages.react(b, fromA.message.id, 'thumbs_up')),
      ).toBe('BLOCKED');
      expect(
        await codeOf(() => send(b, conversationId, 'Reply', fromA.message.id)),
      ).toBe('NOT_FOUND');
    });
  });

  describe('reactions', () => {
    it('BR-MSG-02: reactions use the fixed list, are idempotent and grouped by code', async () => {
      const a = await user('reacta');
      const b = await user('reactb');
      const { conversationId } = await circleWith(a, [b]);
      const sent = await send(a, conversationId, 'Nice');
      expect(await messages.react(b, sent.message.id, 'laugh')).toEqual({
        changed: true,
      });
      expect(await messages.react(b, sent.message.id, 'laugh')).toEqual({
        changed: false,
      });
      await messages.react(a, sent.message.id, 'laugh');
      await messages.react(a, sent.message.id, 'thumbs_up');
      expect(
        await codeOf(() => messages.react(a, sent.message.id, 'fire')),
      ).toBe('INVALID_INPUT');
      const seen = await messages.getMessage(a, sent.message.id);
      expect(seen?.reactions).toEqual([
        { code: 'thumbs_up', count: 1, reactedByMe: true },
        { code: 'laugh', count: 2, reactedByMe: true },
      ]);
      expect(await messages.unreact(b, sent.message.id, 'laugh')).toEqual({
        changed: true,
      });
      expect(await messages.unreact(b, sent.message.id, 'laugh')).toEqual({
        changed: false,
      });
    });

    it('BR-MSG-01: an outsider cannot react', async () => {
      const a = await user('reactowner');
      const outsider = await user('reactoutsider');
      const { conversationId } = await circleWith(a, []);
      const sent = await send(a, conversationId, 'Members only');
      expect(
        await codeOf(() => messages.react(outsider, sent.message.id, 'heart')),
      ).toBe('NOT_CONVERSATION_MEMBER');
    });
  });

  describe('read state, unread counts and lists', () => {
    it('BR-MSG-02: the read pointer only moves forward and drives unread counts and "seen by"', async () => {
      const a = await user('reada');
      const b = await user('readb');
      const c = await user('readc');
      const { conversationId } = await circleWith(a, [b, c]);
      const m1 = await send(a, conversationId, 'One');
      const m2 = await send(a, conversationId, 'Two');
      await send(a, conversationId, 'Three');

      expect((await messages.getUnreadCounts(b)).total).toBe(3);
      expect(
        (await messages.markRead(b, conversationId, m2.message.id))
          .lastReadMessageId,
      ).toBe(m2.message.id);
      expect(
        (await messages.markRead(b, conversationId, m1.message.id))
          .lastReadMessageId,
      ).toBe(m2.message.id);
      expect(await messages.getUnreadCounts(b)).toEqual({
        total: 1,
        byConversation: [{ conversationId, unread: 1 }],
      });
      // Own messages are never unread.
      expect((await messages.getUnreadCounts(a)).total).toBe(0);

      const readers = await messages.listReaders(a, m1.message.id);
      expect(readers?.map((r) => r.userId)).toEqual([b]);
      expect(
        await messages.listReaders(await user('readout'), m1.message.id),
      ).toBeNull();
    });

    it('BR-SOC-04: messages of blocked users are not counted as unread', async () => {
      const a = await user('unreadblocka');
      const b = await user('unreadblockb');
      const { conversationId } = await circleWith(a, [b]);
      await send(b, conversationId, 'Hidden soon');
      await blocks.block(a, b);
      expect((await messages.getUnreadCounts(a)).total).toBe(0);
    });

    it('BR-MSG-02: a message must belong to the conversation to be marked read', async () => {
      const a = await user('markother');
      const one = await circleWith(a, []);
      const two = await circleWith(a, []);
      const sent = await send(a, one.conversationId, 'Here');
      expect(
        await codeOf(() =>
          messages.markRead(a, two.conversationId, sent.message.id),
        ),
      ).toBe('NOT_FOUND');
    });

    it('lists messages newest first, by pages, with no gaps or duplicates', async () => {
      const a = await user('pagea');
      const { conversationId } = await circleWith(a, []);
      const sent: string[] = [];
      for (let i = 0; i < 7; i += 1) {
        sent.push((await send(a, conversationId, `Message ${i}`)).message.id);
      }
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await messages.listMessages(a, conversationId, {
          cursor,
          limit: 3,
        });
        seen.push(...(page?.items.map((m) => m.id) ?? []));
        cursor = page?.nextCursor ?? undefined;
      } while (cursor !== undefined);
      expect(seen).toEqual([...sent].reverse());
      expect(
        await codeOf(() =>
          messages.listMessages(a, conversationId, { cursor: 'bad' }),
        ),
      ).toBe('INVALID_CURSOR');
    });

    it('BR-MSG-01: lists my conversations by last activity, with target, preview, unread count and mute', async () => {
      const a = await user('lista');
      const b = await user('listb');
      const older = await circleWith(a, [b]);
      const newer = await circleWith(a, [b]);
      const organizerKey = await occurrenceIn(b, 48);
      await registrations.register(organizerKey, a);
      const occurrenceConversation =
        await messages.getOrCreateOccurrenceConversation(a, organizerKey);

      await send(b, newer.conversationId, 'Newer');
      await send(b, older.conversationId, 'Older but active');
      await messages.setMuted(a, newer.conversationId, true);

      const first = await messages.listMyConversations(a, { limit: 2 });
      expect(first.items.map((c) => c.conversationId)).toEqual([
        older.conversationId,
        newer.conversationId,
      ]);
      expect(first.items[0]).toMatchObject({
        target: { kind: 'circle', circleId: older.circleId },
        lastMessage: { bodyPreview: 'Older but active' },
        unreadCount: 1,
        muted: false,
      });
      expect(first.items[1].muted).toBe(true);
      const second = await messages.listMyConversations(a, {
        cursor: first.nextCursor ?? undefined,
        limit: 2,
      });
      expect(second.items.map((c) => c.conversationId)).toEqual([
        occurrenceConversation,
      ]);
      expect(second.items[0].target).toMatchObject({
        kind: 'occurrence',
        key: organizerKey,
        title: 'Test event',
      });
      expect(second.items[0].lastMessage).toBeNull();
      expect(second.nextCursor).toBeNull();
    });
  });

  describe('real-time events (BR-TECH-09)', () => {
    const listener = new ChatEventListener(
      requiredEnv('TEST_DATABASE_URL_APP'),
    );
    const received: ChatEvent[] = [];

    beforeAll(async () => {
      listener.onEvent((event) => received.push(event));
      await listener.ready();
    });

    afterAll(async () => {
      await listener.close();
    });

    /** Waits until `count` events arrived, or 2 seconds. */
    async function waitFor(count: number): Promise<void> {
      const deadline = Date.now() + 2000;
      while (received.length < count && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }

    it('BR-TECH-09: every write sends an event with ids only, after commit; a deduplicated or failed send sends none', async () => {
      const a = await user('realtimea');
      const { conversationId } = await circleWith(a, []);
      received.length = 0;
      const clientMessageId = randomUUID();
      const sent = await messages.sendMessage(a, conversationId, {
        clientMessageId,
        body: 'Live',
      });
      await messages.sendMessage(a, conversationId, {
        clientMessageId,
        body: 'Live',
      });
      await codeOf(() => send(a, conversationId, 'Bad reply', randomUUID()));
      await messages.react(a, sent.message.id, 'smile');
      await messages.editMessage(a, sent.message.id, 'Live!');
      await messages.deleteMessage(sent.message.id);
      await waitFor(4);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const id = sent.message.id;
      expect(received).toEqual([
        { type: 'message_created', conversationId, messageId: id },
        { type: 'reaction_changed', conversationId, messageId: id },
        { type: 'message_edited', conversationId, messageId: id },
        { type: 'message_deleted', conversationId, messageId: id },
      ]);
    });
  });
});
