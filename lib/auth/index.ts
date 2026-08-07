/**
 * Public surface of the auth module. Nothing outside `lib/auth` should import
 * from a deeper path than this (except the session store hook, re-exported
 * here) so the mechanism stays swappable.
 */
import { activeAuthProvider } from "./provider";
import { refreshSession } from "./refresh";
import { useSessionStore } from "./session";

export { activeAuthProvider } from "./provider";
export { refreshSession, isRefreshInFlight } from "./refresh";
export {
  useSessionStore,
  getAccessToken,
  getCurrentUser,
  type SessionStatus,
} from "./session";
export { getDeviceId } from "./device";
export { ADMIN_ROLES, isAdminRole, isSuperadmin } from "./types";
export type {
  AuthProvider,
  AuthTokens,
  StartSignInInput,
  StartSignInResult,
  CompleteSignInInput,
} from "./types";

/** Step one of sign-in: send the challenge (an OTP SMS today). */
export function startSignIn(identifier: string) {
  return activeAuthProvider.startSignIn({ identifier });
}

/** Step two: exchange the response for a session, then load the operator. */
export async function completeSignIn(identifier: string, secret: string) {
  const tokens = await activeAuthProvider.completeSignIn({ identifier, secret });
  useSessionStore.getState().setTokens(tokens);
  const user = await activeAuthProvider.loadCurrentUser();
  useSessionStore.getState().setUser(user);
  return user;
}

/**
 * Restore a session on app start using whatever the provider persists (the
 * HttpOnly refresh cookie today). Resolves to the operator or null.
 */
export async function restoreSession() {
  try {
    await refreshSession();
  } catch {
    useSessionStore.getState().setAnonymous();
    return null;
  }
  try {
    const user = await activeAuthProvider.loadCurrentUser();
    useSessionStore.getState().setUser(user);
    return user;
  } catch {
    useSessionStore.getState().setAnonymous();
    return null;
  }
}

export async function reloadCurrentUser() {
  const user = await activeAuthProvider.loadCurrentUser();
  useSessionStore.getState().setUser(user);
  return user;
}

export async function signOut(options?: { allDevices?: boolean }) {
  try {
    await activeAuthProvider.signOut(options);
  } finally {
    useSessionStore.getState().clear();
  }
}
