import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth/session";
import { getStore } from "@/lib/db";

import { LoginForm } from "./form";

export const metadata = { title: "Sign in - Home Budget" };

// Reads the session cookie and the account count, both per request.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  // A deployment with no accounts yet should send its first visitor to setup
  // rather than to a sign-in form nobody can pass.
  if (getStore().countUsers() === 0) redirect("/setup");
  return <LoginForm />;
}
