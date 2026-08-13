"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { activeAuthProvider, completeSignIn, isAdminRole } from "@/lib/auth";
import { useSignInFlow } from "@/lib/auth/sign-in-flow";

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  );
}

/** Masks all but the last three digits — the operator only needs to recognise it. */
function maskIdentifier(value: string): string {
  if (value.length <= 4) return value;
  return `${value.slice(0, 3)}${"•".repeat(Math.max(value.length - 6, 3))}${value.slice(-3)}`;
}

function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/auctions";

  const identifier = useSignInFlow((s) => s.identifier);
  const reset = useSignInFlow((s) => s.reset);
  const begin = useSignInFlow((s) => s.begin);

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState<string | null>(null);

  // The identifier is held in memory only, so a refresh lands here empty.
  useEffect(() => {
    if (!identifier) router.replace("/login");
  }, [identifier, router]);

  if (!identifier) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!identifier) return;
    setBusy(true);
    setError(null);
    try {
      const user = await completeSignIn(identifier, code);
      reset();
      // A bidder gets the no-access screen inside the console rather than a
      // wall of 403s; the console layout handles that.
      router.replace(isAdminRole(user.role) ? next : "/no-access");
    } catch (err) {
      if (isApiError(err) && err.status === 403) {
        setError("That account is suspended. Contact a superadmin.");
      } else if (isApiError(err) && err.status === 429) {
        setError(
          `Too many attempts. Try again in ${err.retryAfterSeconds ?? 60} seconds.`,
        );
      } else if (isApiError(err) && err.status === 401) {
        setError("That code is not right, or it has expired.");
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (!identifier) return;
    setResent(null);
    setError(null);
    try {
      await activeAuthProvider.startSignIn({ identifier });
      begin(identifier);
      setResent("A new code is on its way.");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <AuthShell
      title="Enter your code"
      subtitle={`Sent to ${maskIdentifier(identifier)}`}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field
          label={activeAuthProvider.labels.secret}
          htmlFor="code"
          hint={resent ?? activeAuthProvider.labels.secretHint}
          error={error}
          required
        >
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            // Deliberately no placeholder: "0000" was the local dev code, so it
            // showed every production operator a four-character example of a
            // six-digit code. The hint below says where the code comes from.
            // The cap is a ceiling, not a length — it accommodates both.
            maxLength={8}
            className="tnum tracking-[0.4em]"
            value={code}
            invalid={Boolean(error)}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, ""));
              setError(null);
            }}
          />
        </Field>

        <Button type="submit" variant="primary" loading={busy} disabled={!code}>
          Sign in
        </Button>

        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={handleResend}
            className="font-medium text-accent-strong underline underline-offset-2"
          >
            Send another code
          </button>
          <button
            type="button"
            onClick={() => {
              reset();
              router.replace("/login");
            }}
            className="text-text-muted underline underline-offset-2"
          >
            Use a different number
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
