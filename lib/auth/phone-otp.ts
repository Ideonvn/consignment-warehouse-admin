/**
 * Phone OTP provider — the only mechanism the backend has today.
 *
 * Everything OTP-specific stops at this file. It talks to the raw transport
 * (not the authenticated client) so there is no dependency cycle: the client
 * calls refresh, refresh calls the provider, the provider calls the transport.
 */
import { httpRequest } from "@/lib/api/http";
import { meSchema, tokenPairSchema, type Me } from "@/types/api";
import { getDeviceId, getDeviceName } from "./device";
import { getAccessToken } from "./session";
import type {
  AuthProvider,
  AuthTokens,
  CompleteSignInInput,
  StartSignInInput,
  StartSignInResult,
} from "./types";

const E164 = /^\+[1-9]\d{7,14}$/;

function toTokens(payload: unknown): AuthTokens {
  const parsed = tokenPairSchema.parse(payload);
  return {
    accessToken: parsed.access_token,
    expiresAt: Date.now() + parsed.expires_in * 1000,
  };
}

export const phoneOtpProvider: AuthProvider = {
  id: "phone-otp",
  kind: "challenge-response",

  labels: {
    identifier: "Mobile number",
    identifierHint:
      "Full international format, e.g. +27820000001. The backend does not infer a country code.",
    // No digit count here on purpose. The backend decides how long a code is —
    // six in production, the four-character 0000 locally — and a number in the
    // label is an assertion this app cannot keep true. The bidder app needs a
    // configured length because its input renders one box per digit; here it is
    // only prose, and prose that needs a setting to stay honest is worse than
    // prose that never claims anything.
    secret: "Verification code",
    // The local dev code is deliberately not mentioned. It is in the guides, the
    // seed prints it, and anyone running this locally meets it within a minute —
    // whereas an operator reading it on the real login screen is reading dev
    // detail that does not apply to them. Gating it on an environment variable
    // would be a setting, and a second place for the backend's OTP_DEV_CODE to
    // drift away from.
    secretHint: "Sent by SMS.",
  },

  validateIdentifier(value) {
    const trimmed = value.trim();
    if (!trimmed) return "Enter a mobile number";
    if (!trimmed.startsWith("+")) {
      return "Start with the country code, e.g. +27 for South Africa";
    }
    if (!E164.test(trimmed)) return "That is not a valid international number";
    return null;
  },

  async startSignIn({ identifier }: StartSignInInput): Promise<StartSignInResult> {
    const { data } = await httpRequest("/auth/otp/request", {
      method: "POST",
      body: { phone: identifier.trim() },
    });
    const message =
      typeof data === "object" && data !== null && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : undefined;
    return { message };
  },

  async completeSignIn({
    identifier,
    secret,
  }: CompleteSignInInput): Promise<AuthTokens> {
    const { data } = await httpRequest("/auth/otp/verify", {
      method: "POST",
      body: {
        phone: identifier.trim(),
        code: secret.trim(),
        device_id: getDeviceId(),
        device_name: getDeviceName(),
      },
    });
    return toTokens(data);
  },

  async refresh(): Promise<AuthTokens> {
    // Web sends an empty body: the HttpOnly cookie carries the refresh token,
    // and the backend rotates it on every call.
    const { data } = await httpRequest("/auth/refresh", {
      method: "POST",
      body: {},
    });
    return toTokens(data);
  },

  async signOut(options): Promise<void> {
    await httpRequest("/auth/logout", {
      method: "POST",
      body: {},
      query: { all_devices: options?.allDevices ?? false },
    });
  },

  async loadCurrentUser(): Promise<Me> {
    const { data } = await httpRequest("/auth/me", {
      token: getAccessToken(),
    });
    return meSchema.parse(data);
  },
};
