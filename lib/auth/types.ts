/**
 * The authentication seam.
 *
 * Today the only implementation is phone OTP, because that is what the backend
 * has. It is written as if it will be replaced: nothing outside `lib/auth`
 * imports an OTP-specific symbol, and swapping in Google OIDC means writing a
 * second `AuthProvider` and changing the one line in `lib/auth/index.ts` that
 * picks the active one (plus the login screen, which asks the provider what
 * kind of flow it is).
 */
import type { Me, UserRole } from "@/types/api";

export interface AuthTokens {
  accessToken: string;
  /** ms epoch at which the access token stops being usable. */
  expiresAt: number;
}

export interface StartSignInInput {
  /** Phone in E.164 today; an email or nothing for a redirect provider. */
  identifier: string;
}

export interface StartSignInResult {
  /** Message to show the operator after step one, if any. */
  message?: string;
  /** Redirect providers hand back a URL to send the browser to. */
  redirectUrl?: string;
}

export interface CompleteSignInInput {
  identifier: string;
  /** OTP code today; an authorization code for OIDC. */
  secret: string;
}

export interface AuthProvider {
  readonly id: string;
  /** Drives which login UI the app renders. */
  readonly kind: "challenge-response" | "redirect";
  /** Labels the login screen uses, so the screen holds no provider knowledge. */
  readonly labels: {
    identifier: string;
    identifierHint: string;
    secret: string;
    secretHint: string;
  };
  /** Validate an identifier before spending a network call on it. */
  validateIdentifier(value: string): string | null;
  startSignIn(input: StartSignInInput): Promise<StartSignInResult>;
  completeSignIn(input: CompleteSignInInput): Promise<AuthTokens>;
  /** Single-flight is enforced by the caller in lib/auth/refresh.ts. */
  refresh(): Promise<AuthTokens>;
  signOut(options?: { allDevices?: boolean }): Promise<void>;
  loadCurrentUser(): Promise<Me>;
}

export const ADMIN_ROLES: UserRole[] = ["admin", "superadmin"];

export function isAdminRole(role: UserRole | undefined | null): boolean {
  return role === "admin" || role === "superadmin";
}

export function isSuperadmin(role: UserRole | undefined | null): boolean {
  return role === "superadmin";
}
