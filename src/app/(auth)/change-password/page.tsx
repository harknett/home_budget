import { requireSignedIn } from "@/lib/auth/guard";

import { ChangePasswordForm } from "./form";

export const metadata = { title: "Change password - Home Budget" };

export default async function ChangePasswordPage() {
  const user = await requireSignedIn();
  return <ChangePasswordForm forced={user.mustChangePassword} />;
}
