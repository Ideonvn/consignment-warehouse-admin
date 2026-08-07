/**
 * Single-flight refresh.
 *
 * The backend rotates the refresh token on every call and revokes the whole
 * family if a rotated token is replayed. Two parallel refreshes would do
 * exactly that and log the operator out permanently, so at most one refresh is
 * ever in flight; everyone else awaits the same promise.
 */
import { ApiError } from "@/lib/api/errors";
import { activeAuthProvider } from "./provider";
import { useSessionStore } from "./session";
import type { AuthTokens } from "./types";

let inFlight: Promise<AuthTokens> | null = null;

export function refreshSession(): Promise<AuthTokens> {
  if (!inFlight) {
    inFlight = runRefresh().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

export function isRefreshInFlight(): boolean {
  return inFlight !== null;
}

async function runRefresh(): Promise<AuthTokens> {
  try {
    const tokens = await activeAuthProvider.refresh();
    useSessionStore.getState().setTokens(tokens);
    return tokens;
  } catch (error) {
    // A 401 here is terminal: the session is over. Never retry it.
    const reason =
      error instanceof ApiError && error.status === 401
        ? "Your session has expired. Sign in again."
        : error instanceof ApiError && error.kind === "network"
          ? null
          : null;
    if (error instanceof ApiError && error.kind === "network") {
      // Offline: keep whatever session state we had, do not force a logout.
      throw error;
    }
    useSessionStore.getState().setAnonymous(reason);
    throw error;
  }
}
