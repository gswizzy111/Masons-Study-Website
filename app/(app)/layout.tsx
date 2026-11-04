import type { ReactNode } from "react";
import { requireUser } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle<{ display_name: string | null }>();

  return (
    <AppShell user={{ email: user.email ?? null, displayName: profile?.display_name ?? null }}>
      {children}
    </AppShell>
  );
}
