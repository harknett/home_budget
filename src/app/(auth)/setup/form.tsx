"use client";

import { useActionState, useSyncExternalStore } from "react";

import { claimOwner, type FormState } from "../actions";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";
import { DEFAULT_TIME_ZONE } from "@/lib/dates";

const noSubscribe = () => () => {};

const box = "rounded border border-black/15 p-4 dark:border-white/15";

export function SetupForm({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(claimOwner, {});
  // The browser knows where it is; the server only knows UTC. Read through
  // useSyncExternalStore so the server render and hydration agree, then the
  // browser's own zone takes over.
  const guessed = useSyncExternalStore(
    noSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => DEFAULT_TIME_ZONE,
  );

  if (!configured) {
    return (
      <div className={box}>
        <h1 className="mb-2 text-xl font-semibold tracking-tight">Setup is closed</h1>
        <p className="text-sm opacity-70">
          No <code>SETUP_TOKEN</code> is set on the server, so the first login cannot be created.
          Set one temporarily, create your login, then remove it — see{" "}
          <code>deploy/README.md</code>.
        </p>
      </div>
    );
  }

  return (
    <div className={box}>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Set up the budget</h1>
      <p className="mb-4 text-sm opacity-70">
        The first login is the owner, who adds everyone else in the household.
      </p>

      <form action={action} className="space-y-3">
        <Field label="Setup token" hint="The value of SETUP_TOKEN on the server.">
          <input name="token" type="password" required autoFocus className={inputClass} />
        </Field>
        <Field label="Your name">
          <input name="name" required className={inputClass} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" autoComplete="username" required className={inputClass} />
        </Field>
        <Field label="Password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            className={inputClass}
          />
        </Field>
        <Field label="Time zone" hint="Decides which day today is. Taken from this browser.">
          <input key={guessed} name="timeZone" defaultValue={guessed} required className={inputClass} />
        </Field>
        <Notice kind="error">{state.error}</Notice>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating…" : "Create owner login"}
        </Button>
      </form>
    </div>
  );
}
