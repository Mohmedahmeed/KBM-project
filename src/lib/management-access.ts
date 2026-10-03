import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireManagementAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email.toLowerCase() : "";
  if (error || email !== "derbycafe33@gmail.com") redirect("/login");
  return supabase;
}

export function getTunisToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
