"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Note } from "@/components/ui/Feedback";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { activeAuthProvider, startSignIn, useSessionStore } from "@/lib/auth";
import { useSignInFlow } from "@/lib/auth/sign-in-flow";
import { AuthShell } from "@/components/auth/AuthShell";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/auctions";

  const status = useSessionStore((s) => s.status);
  const endedReason = useSessionStore((s) => s.endedReason);
  const begin = useSignInFlow((s) => s.begin);

  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in (e.g. a second tab): skip straight through.
  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, next, router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const validation = activeAuthProvider.validateIdentifier(identifier);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await startSignIn(identifier.trim());
      begin(identifier.trim());
      router.push(`/login/verify?next=${encodeURIComponent(next)}`);
    } catch (err) {
      if (isApiError(err) && err.status === 429) {
        setError(
          `Too many attempts. Try again in ${err.retryAfterSeconds ?? 60} seconds.`,
        );
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Operator sign in"
      subtitle="Consignment Warehouse admin console"
    >
      {endedReason && <Note tone="warning">{endedReason}</Note>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field
          label={activeAuthProvider.labels.identifier}
          htmlFor="identifier"
          hint={activeAuthProvider.labels.identifierHint}
          error={error}
          required
        >
          <Input
            id="identifier"
            name="identifier"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            autoFocus
            placeholder="+27820000001"
            value={identifier}
            invalid={Boolean(error)}
            onChange={(event) => {
              setIdentifier(event.target.value);
              setError(null);
            }}
          />
        </Field>

        <Button type="submit" variant="primary" loading={busy}>
          Send code
        </Button>
      </form>
    </AuthShell>
  );
}
