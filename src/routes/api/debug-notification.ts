import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/debug-notification")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const errors: string[] = [];

        // Check notifications table exists
        const { data: tables, error: tblErr } = await supabaseAdmin
          .from("notifications").select("id").limit(1);
        if (tblErr) errors.push(`notifications table: ${tblErr.message}`);
        else errors.push(`notifications table: OK (${(tables ?? []).length} records)`);

        // Count recent notifications (last 24h)
        const yesterday = new Date(Date.now() - 86400000).toISOString();
        const { count: recent, error: cntErr } = await supabaseAdmin
          .from("notifications").select("*", { count: "exact", head: true })
          .gte("created_at", yesterday);
        if (cntErr) errors.push(`count error: ${cntErr.message}`);
        else errors.push(`notifications last 24h: ${recent ?? 0}`);

        // Check recent transactions
        const { data: txs, error: txErr } = await supabaseAdmin
          .from("transactions").select("id,status,amount_mzn,created_at")
          .order("created_at", { ascending: false }).limit(5);
        if (txErr) errors.push(`transactions: ${txErr.message}`);
        else errors.push(`recent transactions: ${JSON.stringify(txs)}`);

        return new Response(JSON.stringify({ ok: errors.length === 0, errors }, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
