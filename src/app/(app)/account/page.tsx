import { redirect } from "next/navigation";
import { AccountClient } from "@/components/account/AccountClient";
import { getSessionProfile } from "@/lib/auth";

export default async function AccountPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  return <AccountClient profile={profile} />;
}
