/**
 * Generating the six digits a demo sign-in accepts.
 *
 * **The rules here mirror `demo_login.validate_code` on the backend exactly.**
 * They have to: the portal is what picks the code, so a generator that can
 * produce something the API refuses turns a one-click action into a confusing
 * 422. The backend stays the authority — this only keeps us from asking for
 * something it will say no to.
 *
 * Why the rules exist at all: an ordinary OTP is random and single-use, so
 * guessing it means beating a 90-second window and a 5-attempt cap. A demo code
 * is **fixed and standing**, and nothing caps how many challenges can be
 * requested for it over the life of the app — so `0000` or `123456` against that
 * is a few hundred attempts away from anyone who learns the number.
 */

/**
 * Six, matching `OTP_CODE_LENGTH` in the backend's `app/core/config.py`.
 *
 * **It is a constant at both ends and must stay that way.** It used to be a per-client env var
 * (`NEXT_PUBLIC_OTP_CODE_LENGTH` / `EXPO_PUBLIC_OTP_CODE_LENGTH`, set to `4` locally so a
 * four-digit dev code could be typed) — which meant this generator produced codes the bidder
 * apps' inputs could not accept on a local build. The backend now owns the number and refuses
 * an `OTP_DEV_CODE` of any other length; changing it means changing every end in one release.
 */
const LENGTH = 6;

/** The backend's own refusals, in the same order, so the messages match. */
export function demoCodeProblem(code: string): string | null {
  if (code.length !== LENGTH || !/^\d+$/.test(code)) {
    return "code must be exactly 6 digits";
  }
  if (new Set(code).size === 1) {
    return "code must not be a single repeated digit";
  }
  const steps = new Set(
    Array.from({ length: code.length - 1 }, (_, i) =>
      Number(code[i + 1]) - Number(code[i]),
    ),
  );
  if (steps.size === 1 && (steps.has(1) || steps.has(-1))) {
    return "code must not be a run of consecutive digits";
  }
  return null;
}

/**
 * Six uniformly random digits that the backend will accept.
 *
 * `crypto.getRandomValues`, not `Math.random` — this is a credential, and the
 * distinction costs nothing. One byte per digit with the out-of-range values
 * discarded rather than `% 10`, which would make 0–5 slightly likelier than
 * 6–9; a measurable bias in a six-digit code is not a theoretical concern when
 * the code never expires.
 *
 * The loop re-draws if the result is a refused shape. There are only 19 such
 * codes out of a million, so this effectively never runs twice.
 */
export function generateDemoCode(): string {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    let code = "";
    while (code.length < LENGTH) {
      const bytes = new Uint8Array(LENGTH);
      crypto.getRandomValues(bytes);
      for (const byte of bytes) {
        if (code.length === LENGTH) break;
        // 250 = 25 * 10, so the kept range divides evenly by ten.
        if (byte < 250) code += String(byte % 10);
      }
    }
    if (!demoCodeProblem(code)) return code;
  }
  // Unreachable in practice; throwing beats returning something unvalidated.
  throw new Error("could not generate a usable demo code");
}
