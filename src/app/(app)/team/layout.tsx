import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";

export default async function TeamSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const p = await getSessionProfile();
  if (!p || p.role !== "admin") redirect("/pos");
  return children;
}
