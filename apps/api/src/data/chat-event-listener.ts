import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Client } from 'pg';
import { CHAT_CHANNEL } from './internal/conversations';
import type { ChatEvent, ChatEventType } from './types/messaging.types';

/** Injection token of the connection string used by `ChatEventListener`. Internal to the data layer. */
export const CHAT_LISTENER_URL = Symbol('CHAT_LISTENER_URL');

const EVENT_TYPES: readonly ChatEventType[] = [
  'message_created',
  'message_edited',
  'message_deleted',
  'reaction_changed',
];

/** Delay before reconnecting after a lost connection, in milliseconds. */
const RECONNECT_DELAY_MS = 1000;

/** Parses a NOTIFY payload. Returns null for anything that is not a chat event. */
function parseEvent(payload: string | undefined): ChatEvent | null {
  if (payload === undefined) {
    return null;
  }
  try {
    const value = JSON.parse(payload) as Partial<ChatEvent>;
    if (
      typeof value.type === 'string' &&
      EVENT_TYPES.includes(value.type) &&
      typeof value.conversationId === 'string' &&
      typeof value.messageId === 'string'
    ) {
      return {
        type: value.type,
        conversationId: value.conversationId,
        messageId: value.messageId,
      };
    }
    return null;
  } catch {
    // A malformed payload is not ours: it is ignored on purpose.
    return null;
  }
}

/**
 * Real-time chat events (BR-TECH-09: no Redis, PostgreSQL LISTEN/NOTIFY). `MessageRepository` sends an event at the
 * commit of every write: `message_created`, `message_edited`, `message_deleted`, `reaction_changed`. Events carry ids
 * only. For each connected viewer, reload with `MessageRepository.getMessage(viewerId, messageId)`, which applies
 * access and blocking. Events are not persisted: after a reconnection, clients reload missed messages with
 * `listMessages`.
 *
 * One dedicated connection is opened on the first `onEvent` call, and reopened automatically if it is lost.
 */
@Injectable()
export class ChatEventListener implements OnModuleDestroy {
  private readonly logger = new Logger(ChatEventListener.name);
  private readonly handlers = new Set<(event: ChatEvent) => void>();
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;
  private closed = false;

  constructor(@Inject(CHAT_LISTENER_URL) private readonly url: string) {}

  /**
   * Registers a handler for every chat event. The first call opens the connection.
   * Outcome: a function that unregisters the handler.
   */
  onEvent(handler: (event: ChatEvent) => void): () => void {
    this.handlers.add(handler);
    void this.ensureConnected();
    return () => {
      this.handlers.delete(handler);
    };
  }

  /** Resolves when the LISTEN connection is open. Useful in tests and at startup. */
  async ready(): Promise<void> {
    await this.ensureConnected();
  }

  /** Closes the connection when the application shuts down. */
  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  /** Closes the connection and stops reconnecting. */
  async close(): Promise<void> {
    this.closed = true;
    const client = this.client;
    this.client = null;
    if (client !== null) {
      await client.end();
    }
  }

  private ensureConnected(): Promise<void> {
    if (this.closed || this.client !== null) {
      return Promise.resolve();
    }
    this.connecting ??= this.connect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async connect(): Promise<void> {
    const client = new Client({ connectionString: this.url });
    client.on('notification', (message) => {
      if (message.channel !== CHAT_CHANNEL) {
        return;
      }
      const event = parseEvent(message.payload);
      if (event === null) {
        return;
      }
      for (const handler of this.handlers) {
        handler(event);
      }
    });
    client.on('error', () => {
      // The connection details are never logged.
      this.logger.warn('Chat event connection lost, reconnecting');
      this.client = null;
      // Best-effort close of a connection that is already broken; the reconnection below replaces it.
      void client.end().catch(() => undefined);
      this.scheduleReconnect();
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${CHAT_CHANNEL}`);
      if (this.closed) {
        await client.end();
        return;
      }
      this.client = client;
    } catch {
      this.logger.warn('Chat event connection failed, retrying');
      // Best-effort close of a connection that never opened.
      await client.end().catch(() => undefined);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.closed || this.handlers.size === 0) {
      return;
    }
    setTimeout(() => {
      void this.ensureConnected();
    }, RECONNECT_DELAY_MS).unref();
  }
}
