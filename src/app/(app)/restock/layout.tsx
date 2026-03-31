import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";

export default async function RestockSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const p = await getSessionProfile();
  if (!p || (p.role !== "admin" && p.role !== "manager")) redirect("/pos");
  return children;
}
