/**
 * Session state. The access token lives here and nowhere else — in memory
 * only, never localStorage, so a stolen disk or an XSS-readable store does not
 * hand over an admin bearer token.
 */
import { create } from "zustand";
import type { Me } from "@/types/api";
import type { AuthTokens } from "./types";

export type SessionStatus =
  /** Before the first refresh attempt has settled. */
  | "loading"
  | "anonymous"
  | "authenticated";

interface SessionState {
  status: SessionStatus;
  accessToken: string | null;
  expiresAt: number | null;
  user: Me | null;
  /** Set when a refresh failed, so the login screen can explain why. */
  endedReason: string | null;

  setTokens: (tokens: AuthTokens) => void;
  setUser: (user: Me | null) => void;
  setAnonymous: (reason?: string | null) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: "loading",
  accessToken: null,
  expiresAt: null,
  user: null,
  endedReason: null,

  setTokens: (tokens) =>
    set({
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
      endedReason: null,
    }),

  setUser: (user) =>
    set((state) => ({
      user,
      status: user && state.accessToken ? "authenticated" : state.status,
    })),

  setAnonymous: (reason = null) =>
    set({
      status: "anonymous",
      accessToken: null,
      expiresAt: null,
      user: null,
      endedReason: reason,
    }),

  clear: () =>
    set({
      status: "anonymous",
      accessToken: null,
      expiresAt: null,
      user: null,
      endedReason: null,
    }),
}));

/** Non-hook access for the API client. */
export function getAccessToken(): string | null {
  return useSessionStore.getState().accessToken;
}

export function getCurrentUser(): Me | null {
  return useSessionStore.getState().user;
}
