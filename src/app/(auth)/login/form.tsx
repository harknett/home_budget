"use client";

import { useActionState } from "react";

import { signIn, type FormState } from "../actions";
import { Button, Field, Notice, inputClass } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, {});

  return (
    <div className="rounded border border-black/15 p-4 dark:border-white/15">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Home Budget</h1>
      <p className="mb-5 text-sm opacity-70">Sign in to see the budget.</p>

      <form action={action} className="space-y-4">
        <Field label="Email">
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            className={inputClass}
          />
        </Field>
        <Field label="Password">
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
          />
        </Field>
        <Notice kind="error">{state.error}</Notice>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
