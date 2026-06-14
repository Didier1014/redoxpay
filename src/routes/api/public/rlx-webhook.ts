import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const webhookSchema = z.object({
  event: z.string(),
  txid: z.string(),
  status: z.string(),
  valor_bruto: z.number().optional(),
  valor_liquido: z.number().optional(),
  taxa_rlx: z.number().optional(),
  canal: z.string().optional(),
  pagador: z.string().optional(),
  nome_pagador: z.string().optional(),
});

function stripPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("258") ? d.slice(3) : d;
}

export const Route = createFileRoute("/api/public/rlx-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.RLX_API_TOKEN;
        const auth = request.headers.get("authorization") ?? "";
        if (token && auth && !auth.includes(token)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: z.infer<typeof webhookSchema>;
        try {
          const body = await request.json();
          payload = webhookSchema.parse(body);
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Try matching by external_ref first
        let { data: tx } = await supabaseAdmin
          .from("transactions")
          .select("*")
          .eq("external_ref", payload.txid)
          .maybeSingle();

        // Fallback: match by normalised phone for pending transactions
        if (!tx) {
          const txidDigits = payload.txid.replace(/\D/g, "");
          const { data: candidates } = await supabaseAdmin
            .from("transactions")
            .select("*")
            .eq("status", "pending")
            .order("created_at", { ascending: false });
          if (candidates) {
            tx = candidates.find((c) => {
              const cPhone = stripPhone(c.customer_phone ?? "");
              return cPhone === txidDigits || cPhone === stripPhone(txidDigits);
            }) ?? null;
          }
        }

        if (!tx) return new Response("ok"); // ignore unknown txids

        const next =
          payload.status === "success" || payload.status === "paid" || payload.event === "payment.success"
            ? "paid"
            : payload.status === "failed" || payload.event === "payment.failed"
            ? "failed"
            : "pending";

        if (next !== tx.status) {
          const updates: Record<string, unknown> = { status: next };
          // Save external_ref if found via fallback so polling can use RLX check directly
          if (!tx.external_ref) updates.external_ref = payload.txid;
          await supabaseAdmin.from("transactions").update(updates).eq("id", tx.id);

          if (next === "paid") {
            const { data: prof } = await supabaseAdmin
              .from("profiles").select("balance_mzn").eq("id", tx.user_id).maybeSingle();
            await supabaseAdmin.from("profiles")
              .update({ balance_mzn: Number(prof?.balance_mzn ?? 0) + Number(tx.net_mzn) })
              .eq("id", tx.user_id);

            // Insert notification for the merchant
            await supabaseAdmin.from("notifications").insert({
              user_id: tx.user_id,
              type: "sale",
              title: "Nova venda",
              body: `Pagamento de ${Number(tx.amount_mzn).toLocaleString("pt-MZ", { style: "currency", currency: "MZN" })} recebido`,
              data: { transaction_id: tx.id },
            }).catch(() => {});
          }
        }
        return new Response("ok");
      },
    },
  },
});
