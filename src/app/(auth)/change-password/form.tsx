"use client";

import { useActionState } from "react";

import { changePassword, type FormState } from "../actions";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, {});

  return (
    <div className="rounded border border-black/15 p-4 dark:border-white/15">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Change password</h1>
      <p className="mb-5 text-sm opacity-70">
        {forced
          ? "This login still has a password somebody else chose. Pick your own to carry on."
          : "Every other device is signed out when it changes."}
      </p>

      <form action={action} className="space-y-4">
        <Field label="Current password">
          <input
            name="current"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            className={inputClass}
          />
        </Field>
        <Field label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
          <input
            name="next"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            className={inputClass}
          />
        </Field>
        <Field label="New password again">
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            className={inputClass}
          />
        </Field>
        <Notice kind="error">{state.error}</Notice>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Saving…" : "Save password"}
        </Button>
      </form>
    </div>
  );
}
