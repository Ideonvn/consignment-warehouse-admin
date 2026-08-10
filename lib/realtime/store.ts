/**
 * Connection state for the live socket, surfaced by the top bar indicator so
 * the operator always knows whether what they are looking at is live.
 */
import { create } from "zustand";

export type ConnectionStatus =
  /** Nothing on this screen needs the socket. */
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "offline";

interface RealtimeState {
  status: ConnectionStatus;
  /** Lots currently subscribed on the open connection. */
  subscribedCount: number;
  /** Why the socket last fell back to REST, if it did. */
  lastError: string | null;
  /** ms timestamp of the last gap the socket could not replay. */
  lastGapAt: number | null;
  lastMessageAt: number | null;
  set: (patch: Partial<Omit<RealtimeState, "set">>) => void;
  reset: () => void;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  status: "idle",
  subscribedCount: 0,
  lastError: null,
  lastGapAt: null,
  lastMessageAt: null,
  set: (patch) => set(patch),
  reset: () =>
    set({
      status: "idle",
      subscribedCount: 0,
      lastError: null,
      lastGapAt: null,
      lastMessageAt: null,
    }),
}));
