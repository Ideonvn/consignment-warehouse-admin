/**
 * WebSocket client for the live auction monitor.
 *
 * The rules this encodes, from the backend contract:
 *  - a fresh single-use ticket is minted before EVERY connection attempt,
 *    including reconnects; a reused or expired ticket closes with 4401
 *  - at most 200 lots per connection, 4 KB per message, 120 messages a minute
 *  - the server pings every 30s and we must answer with a pong, and it drops
 *    idle connections after 120s
 *  - the highest `sequence` per lot is tracked so a reconnect can ask for
 *    everything after it
 */
import { mintWsTicket } from "@/lib/api/endpoints";
import {
  wsServerMessageSchema,
  type WsClientMessage,
  type WsServerMessage,
} from "@/types/api";
import type { ConnectionStatus } from "./store";

export const MAX_SUBSCRIBED_LOTS = 200;
/** UUIDs are 36 chars; 80 per message keeps us well inside the 4 KB cap. */
const LOT_IDS_PER_MESSAGE = 80;
/** Bound the reconnect burst so we never trip the 120 messages/minute limit. */
const MAX_SUBSCRIBE_MESSAGES = 30;

const KEEPALIVE_MS = 45_000;
const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 500;

export interface RealtimeHandlers {
  onEvent: (message: WsServerMessage) => void;
  onStatus: (status: ConnectionStatus, detail?: string) => void;
  /** Fired when the socket cannot fill a gap and REST must take over. */
  onNeedsRefetch: (reason: string) => void;
  onSubscribedCount: (count: number) => void;
}

function wsUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/api/v1/ws";
}

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private handlers: RealtimeHandlers;
  private lotIds: string[] = [];
  private lastSequence = new Map<string, number>();
  private attempt = 0;
  private keepaliveTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private closedByUs = false;

  constructor(handlers: RealtimeHandlers) {
    this.handlers = handlers;
  }

  /** Highest sequence seen for a lot, so a reconnect can resume from it. */
  sequenceFor(lotId: string): number {
    return this.lastSequence.get(lotId) ?? 0;
  }

  seedSequences(entries: Iterable<[string, number]>) {
    for (const [lotId, sequence] of entries) {
      const known = this.lastSequence.get(lotId) ?? 0;
      if (sequence > known) this.lastSequence.set(lotId, sequence);
    }
  }

  setLots(lotIds: string[]) {
    const next = lotIds.slice(0, MAX_SUBSCRIBED_LOTS);
    const changed =
      next.length !== this.lotIds.length ||
      next.some((id, index) => id !== this.lotIds[index]);
    this.lotIds = next;
    if (changed && this.socket?.readyState === WebSocket.OPEN) {
      this.sendSubscriptions();
    }
  }

  async connect() {
    this.closedByUs = false;
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.handlers.onStatus(this.attempt === 0 ? "connecting" : "reconnecting");

    let ticket: string;
    try {
      // Fresh ticket every attempt: they are single-use and last 30 seconds.
      ticket = (await mintWsTicket()).ticket;
    } catch (error) {
      this.handlers.onStatus(
        "offline",
        error instanceof Error ? error.message : "Could not get a ticket",
      );
      this.scheduleReconnect();
      return;
    }

    if (this.closedByUs) return;

    const socket = new WebSocket(
      `${wsUrl()}?ticket=${encodeURIComponent(ticket)}`,
    );
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.handlers.onStatus("open");
      this.sendSubscriptions();
      this.startKeepalive();
    };

    socket.onmessage = (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const result = wsServerMessageSchema.safeParse(parsed);
      if (!result.success) return;
      const message = result.data;

      if (message.type === "ping") {
        // The server pings every 30s and expects a pong back.
        this.send({ action: "pong" });
        return;
      }
      if (message.type === "pong") return;

      if (message.type === "resync_too_far") {
        this.handlers.onNeedsRefetch(
          "The gap was too large to replay over the socket",
        );
        return;
      }

      if ("sequence" in message && typeof message.sequence === "number") {
        const lotId = "lot_id" in message ? message.lot_id : null;
        if (lotId) {
          const known = this.lastSequence.get(lotId) ?? 0;
          if (message.sequence > known + 1 && known > 0) {
            // Missed something: ask for just this lot's gap.
            this.send({
              action: "resync",
              lot_id: lotId,
              after_sequence: known,
            });
          }
          if (message.sequence > known) {
            this.lastSequence.set(lotId, message.sequence);
          }
        }
      }

      this.handlers.onEvent(message);
    };

    socket.onclose = (event) => {
      this.stopKeepalive();
      if (this.closedByUs) {
        this.handlers.onStatus("idle");
        return;
      }
      // 4401: ticket reused or expired. A brand new ticket fixes it, so retry
      // straight away rather than backing off.
      if (event.code === 4401) {
        this.attempt = 0;
        this.handlers.onStatus("reconnecting", "Ticket expired, retrying");
        this.scheduleReconnect(250);
        return;
      }
      this.handlers.onStatus("reconnecting");
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      this.handlers.onStatus("reconnecting", "Connection error");
    };
  }

  close() {
    this.closedByUs = true;
    this.stopKeepalive();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.handlers.onStatus("idle");
    this.handlers.onSubscribedCount(0);
  }

  private send(message: WsClientMessage) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  /**
   * Subscribes in chunks, grouped by the sequence each lot should resume from,
   * so a reconnect catches up in the same round trip where it can.
   */
  private sendSubscriptions() {
    if (this.lotIds.length === 0) {
      this.handlers.onSubscribedCount(0);
      return;
    }

    const groups = new Map<number, string[]>();
    for (const lotId of this.lotIds) {
      const sequence = this.lastSequence.get(lotId) ?? 0;
      const bucket = groups.get(sequence);
      if (bucket) bucket.push(lotId);
      else groups.set(sequence, [lotId]);
    }

    let messages = 0;
    let overflowed = false;
    for (const [sequence, ids] of groups) {
      for (let i = 0; i < ids.length; i += LOT_IDS_PER_MESSAGE) {
        if (messages >= MAX_SUBSCRIBE_MESSAGES) {
          overflowed = true;
          break;
        }
        const chunk = ids.slice(i, i + LOT_IDS_PER_MESSAGE);
        this.send(
          sequence > 0
            ? { action: "subscribe", lot_ids: chunk, after_sequence: sequence }
            : { action: "subscribe", lot_ids: chunk },
        );
        messages += 1;
      }
      if (overflowed) break;
    }

    if (overflowed) {
      this.handlers.onNeedsRefetch(
        "Too many distinct catch-up points to replay; refreshed over the API instead",
      );
    }
    this.handlers.onSubscribedCount(this.lotIds.length);
  }

  private startKeepalive() {
    this.stopKeepalive();
    // The server drops idle connections after 120s.
    this.keepaliveTimer = window.setInterval(() => {
      this.send({ action: "ping" });
    }, KEEPALIVE_MS);
  }

  private stopKeepalive() {
    if (this.keepaliveTimer !== null) {
      window.clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  private scheduleReconnect(fixedDelay?: number) {
    if (this.reconnectTimer !== null) return;
    const exponential = Math.min(
      BASE_BACKOFF_MS * 2 ** this.attempt,
      MAX_BACKOFF_MS,
    );
    // Jitter so several open tabs do not reconnect in lockstep.
    const delay = fixedDelay ?? exponential * (0.7 + Math.random() * 0.6);
    this.attempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }
}
