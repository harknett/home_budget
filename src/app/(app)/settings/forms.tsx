"use client";

import { useActionState, useState } from "react";

import { Button, Field, Notice, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/forms";

import { addMember, removeMember, saveTimeZone } from "./actions";

export function TimeZoneForm({ timeZone }: { timeZone: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveTimeZone, {});
  return (
    <form action={action} className="flex items-end gap-1.5">
      <Field label="Time zone" hint="Decides which day today is." className="min-w-0 flex-1">
        <input name="timeZone" defaultValue={timeZone} required className={inputClass} />
      </Field>
      <Button size="field" className="mb-5" type="submit" disabled={pending}>
        Save
      </Button>
      <Notice kind="error">{state.error}</Notice>
    </form>
  );
}

export function AddMember() {
  const [state, action, pending] = useActionState<FormState, FormData>(addMember, {});
  return (
    <details className="px-1 py-2">
      <summary className="cursor-pointer text-sm font-medium">Add a login</summary>
      <form key={state.at} action={action} className="mt-2 grid grid-cols-2 gap-2">
        <Field label="Name">
          <input name="name" required className={inputClass} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" required className={inputClass} />
        </Field>
        <Field label="Role" hint="Owners can add and remove logins.">
          <select name="role" defaultValue="member" className={inputClass}>
            <option value="member">Member</option>
            <option value="owner">Owner</option>
          </select>
        </Field>
        <div className="flex items-start pt-4">
          <Button size="sm" type="submit" disabled={pending}>
            Add
          </Button>
        </div>
      </form>
      <div className="mt-2 space-y-1">
        <Notice kind="error">{state.error}</Notice>
        <Notice kind="ok">{state.ok}</Notice>
      </div>
    </details>
  );
}

export function RemoveMember({ id, name }: { id: number; name: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(removeMember, {});
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className="text-xs underline opacity-60">
        Remove
      </button>
    );
  }
  return (
    <form action={action} className="flex items-center gap-2 text-xs">
      <input type="hidden" name="id" value={id} />
      <button disabled={pending} className="font-medium text-short underline">
        Remove {name}
      </button>
      <button type="button" onClick={() => setArmed(false)} className="underline opacity-60">
        Keep
      </button>
      {state.error ? <span className="text-short">{state.error}</span> : null}
    </form>
  );
}
