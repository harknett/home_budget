"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { LedgerError } from "@/lib/db/store";
import { failure, id, optionalMoney, requiredText, text, type FormState } from "@/lib/forms";

const KNOWN = [LedgerError];

function refresh() {
  revalidatePath("/", "layout");
}

export async function createGroup(_prev: FormState, data: FormData): Promise<FormState> {
  await requireUser();
  try {
    getStore().createGroup(requiredText(data, "name", "Name the group."));
    refresh();
    return { ok: "Group added.", at: Date.now() };
  } catch (err) {
    return failure(err, KNOWN);
  }
}

export async function renameGroup(_prev: FormState, data: FormData): Promise<FormState> {
  await requireUser();
  try {
    getStore().renameGroup(id(data, "id", "No such group."), requiredText(data, "name", "Name the group."));
    refresh();
    return { ok: "Saved.", at: Date.now() };
  } catch (err) {
    return failure(err, KNOWN);
  }
}

export async function deleteGroup(_prev: FormState, data: FormData): Promise<FormState> {
  await requireUser();
  try {
    getStore().deleteGroup(id(data, "id", "No such group."));
    refresh();
    return {};
  } catch (err) {
    return failure(err, KNOWN);
  }
}

export async function moveGroup(data: FormData): Promise<void> {
  await requireUser();
  getStore().moveGroup(Number(data.get("id")), data.get("direction") === "up" ? -1 : 1);
  refresh();
}

export async function createEnvelope(_prev: FormState, data: FormData): Promise<FormState> {
  await requireUser();
  try {
    getStore().createEnvelope({
      groupId: id(data, "groupId", "Pick a group."),
      name: requiredText(data, "name", "Name the envelope."),
      targetCents: optionalMoney(data, "target"),
    });
    refresh();
    return { ok: `${text(data, "name")} added.`, at: Date.now() };
  } catch (err) {
    return failure(err, KNOWN);
  }
}

export async function updateEnvelope(_prev: FormState, data: FormData): Promise<FormState> {
  await requireUser();
  try {
    getStore().updateEnvelope(id(data, "id", "No such envelope."), {
      name: requiredText(data, "name", "Name the envelope."),
      groupId: id(data, "groupId", "Pick a group."),
      targetCents: optionalMoney(data, "target"),
      hidden: data.get("hidden") === "on",
    });
    refresh();
    return { ok: "Saved.", at: Date.now() };
  } catch (err) {
    return failure(err, KNOWN);
  }
}

export async function deleteEnvelope(_prev: FormState, data: FormData): Promise<FormState> {
  await requireUser();
  try {
    getStore().deleteEnvelope(id(data, "id", "No such envelope."));
    refresh();
    return {};
  } catch (err) {
    return failure(err, KNOWN);
  }
}

export async function moveEnvelope(data: FormData): Promise<void> {
  await requireUser();
  getStore().moveEnvelope(Number(data.get("id")), data.get("direction") === "up" ? -1 : 1);
  refresh();
}
