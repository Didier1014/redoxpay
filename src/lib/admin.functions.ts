import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ count: profiles }, { count: tx }, { count: products }, { data: vol }] = await Promise.all([
      supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("transactions").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("products").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("transactions").select("amount_mzn").eq("status", "paid"),
    ]);
    const total = (vol ?? []).reduce((a, r: any) => a + Number(r.amount_mzn || 0), 0);
    return { profiles: profiles ?? 0, transactions: tx ?? 0, products: products ?? 0, volume_mzn: total };
  });
