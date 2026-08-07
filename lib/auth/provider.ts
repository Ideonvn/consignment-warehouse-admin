/**
 * The one line to change when authentication is swapped.
 *
 * Point `activeAuthProvider` at a different `AuthProvider` (e.g. a Google OIDC
 * implementation) and the rest of the app follows: the login screen reads
 * `kind` and `labels` from here, and the API client only knows about refresh.
 */
import { phoneOtpProvider } from "./phone-otp";
import type { AuthProvider } from "./types";

export const activeAuthProvider: AuthProvider = phoneOtpProvider;
