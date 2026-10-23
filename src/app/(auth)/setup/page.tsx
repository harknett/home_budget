import { redirect } from "next/navigation";

import { getStore } from "@/lib/db";

import { SetupForm } from "./form";

export const metadata = { title: "Set up - Home Budget" };

/*
 * Never prerendered.
 *
 * This page's answer depends on two things that only exist at request time:
 * how many accounts the database holds, and whether SETUP_TOKEN is set in the
 * environment. Prerendered, both get baked in at build time - the operator
 * sets SETUP_TOKEN on the server, restarts, and is still told setup is shut,
 * with no way to create the first account.
 */
export const dynamic = "force-dynamic";


export default function SetupPage() {
  // Setup is a one-time door. Once an owner exists it closes for good, so a
  // stale bookmark lands on the sign-in form instead.
  if (getStore().countUsers() > 0) redirect("/login");
  return <SetupForm configured={Boolean(process.env.SETUP_TOKEN?.trim())} />;
}
