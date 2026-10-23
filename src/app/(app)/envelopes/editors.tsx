"use client";

import { useActionState } from "react";

import { Button, Field, Money, Notice, amountClass, inputClass, controlClass } from "@/components/ui";
import type { Envelope, EnvelopeGroup } from "@/lib/db/types";
import type { FormState } from "@/lib/forms";
import { formatMoney } from "@/lib/money";

import {
  createEnvelope,
  createGroup,
  deleteEnvelope,
  deleteGroup,
  moveEnvelope,
  moveGroup,
  renameGroup,
  updateEnvelope,
} from "./actions";

function Arrows({ id, first, last, action }: { id: number; first: boolean; last: boolean; action: (d: FormData) => Promise<void> }) {
  return (
    <form action={action} className="flex shrink-0">
      <input type="hidden" name="id" value={id} />
      <button name="direction" value="up" disabled={first} className="px-1.5 disabled:opacity-20" aria-label="Move up">
        ↑
      </button>
      <button name="direction" value="down" disabled={last} className="px-1.5 disabled:opacity-20" aria-label="Move down">
        ↓
      </button>
    </form>
  );
}

export function GroupEditor({ group, first, last }: { group: EnvelopeGroup; first: boolean; last: boolean }) {
  const [renamed, rename] = useActionState<FormState, FormData>(renameGroup, {});
  const [removed, remove] = useActionState<FormState, FormData>(deleteGroup, {});
  return (
    <details className="normal-case">
      <summary className="flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
        <span className="uppercase">{group.name}</span>
        <span className="text-[10px] opacity-60">edit</span>
      </summary>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 font-normal tracking-normal">
        <form action={rename} className="flex gap-1.5">
          <input type="hidden" name="id" value={group.id} />
          <input name="name" defaultValue={group.name} className={`${controlClass} h-10 w-40`} aria-label="Group name" />
          <Button size="field" type="submit">
            Rename
          </Button>
        </form>
        <Arrows id={group.id} first={first} last={last} action={moveGroup} />
        <form action={remove}>
          <input type="hidden" name="id" value={group.id} />
          <Button size="field" variant="quiet" type="submit">
            Delete
          </Button>
        </form>
        <Notice kind="error">{renamed.error ?? removed.error}</Notice>
      </div>
    </details>
  );
}

export function EnvelopeEditor({
  envelope,
  groups,
  first,
  last,
}: {
  envelope: Envelope;
  groups: Pick<EnvelopeGroup, "id" | "name">[];
  first: boolean;
  last: boolean;
}) {
  const [saved, save, saving] = useActionState<FormState, FormData>(updateEnvelope, {});
  const [removed, remove] = useActionState<FormState, FormData>(deleteEnvelope, {});

  return (
    <details className="border-b border-rule dark:border-white/10">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-1 text-sm [&::-webkit-details-marker]:hidden">
        <span className={`min-w-0 flex-1 truncate ${envelope.hidden ? "line-through opacity-50" : ""}`}>
          {envelope.name}
        </span>
        <span className="num w-24 text-xs opacity-60">
          {envelope.targetCents === null ? "" : `target ${formatMoney(envelope.targetCents)}`}
        </span>
        <Money cents={envelope.balance} className="w-20" />
      </summary>
      <div className="space-y-2 bg-black/[0.03] p-2 dark:bg-white/[0.04]">
        <form action={save} className="grid grid-cols-2 gap-2">
          <input type="hidden" name="id" value={envelope.id} />
          <Field label="Name">
            <input name="name" defaultValue={envelope.name} required className={inputClass} />
          </Field>
          <Field label="Group">
            <select name="groupId" defaultValue={envelope.groupId ?? undefined} className={inputClass}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Target">
            <input
              name="target"
              inputMode="decimal"
              placeholder="none"
              defaultValue={envelope.targetCents === null ? "" : formatMoney(envelope.targetCents)}
              className={amountClass}
            />
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" name="hidden" defaultChecked={envelope.hidden} className="size-4" />
            Hidden
          </label>
          <div className="col-span-2 flex items-center gap-2">
            <Button size="sm" type="submit" disabled={saving}>
              Save
            </Button>
            <Arrows id={envelope.id} first={first} last={last} action={moveEnvelope} />
          </div>
        </form>
        <form action={remove}>
          <input type="hidden" name="id" value={envelope.id} />
          <button className="text-xs underline opacity-70">Delete envelope</button>
        </form>
        <Notice kind="error">{saved.error ?? removed.error}</Notice>
      </div>
    </details>
  );
}

export function NewEnvelope({ groupId }: { groupId: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createEnvelope, {});
  return (
    <form key={state.at} action={action} className="flex items-center gap-1.5 px-1 py-1.5">
      <input type="hidden" name="groupId" value={groupId} />
      <input name="name" placeholder="New envelope" required className={`${controlClass} h-10 min-w-0 flex-1`} />
      <input name="target" inputMode="decimal" placeholder="Target" className={`${controlClass} num h-10 w-24`} />
      <Button size="field" type="submit" disabled={pending}>
        Add
      </Button>
      <Notice kind="error">{state.error}</Notice>
    </form>
  );
}

export function NewGroup() {
  const [state, action, pending] = useActionState<FormState, FormData>(createGroup, {});
  return (
    <form key={state.at} action={action} className="mt-2 flex items-center gap-1.5">
      <input name="name" placeholder="New group, e.g. Bills" required className={`${controlClass} h-10 min-w-0 flex-1`} />
      <Button size="field" type="submit" disabled={pending}>
        Add group
      </Button>
      <Notice kind="error">{state.error}</Notice>
    </form>
  );
}
