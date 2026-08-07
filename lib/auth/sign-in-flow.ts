/**
 * Carries the identifier between the two sign-in steps.
 *
 * Deliberately in memory and not in the URL: `phone_e164` is the most
 * sensitive data in the system and must never appear in a URL, a log or an
 * analytics payload. Losing it on refresh is the correct behaviour — the
 * verify screen sends the operator back to step one.
 */
import { create } from "zustand";

interface SignInFlowState {
  identifier: string | null;
  challengeSentAt: number | null;
  begin: (identifier: string) => void;
  reset: () => void;
}

export const useSignInFlow = create<SignInFlowState>((set) => ({
  identifier: null,
  challengeSentAt: null,
  begin: (identifier) =>
    set({ identifier, challengeSentAt: Date.now() }),
  reset: () => set({ identifier: null, challengeSentAt: null }),
}));
