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

export const Route = createFileRoute("/api/public/rlx-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.RLX_API_TOKEN;
        const auth = request.headers.get("authorization") ?? "";
        // Optional shared secret check: RLX may send token in Authorization
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
        const { data: tx } = await supabaseAdmin
          .from("transactions")
          .select("*")
          .eq("external_ref", payload.txid)
          .maybeSingle();
        if (!tx) return new Response("ok"); // ignore unknown txids

        const next =
          payload.status === "success" || payload.status === "paid" || payload.event === "payment.success"
            ? "paid"
            : payload.status === "failed" || payload.event === "payment.failed"
            ? "failed"
            : "pending";

        if (next !== tx.status) {
          await supabaseAdmin.from("transactions").update({ status: next }).eq("id", tx.id);
          if (next === "paid") {
            const { data: prof } = await supabaseAdmin
              .from("profiles").select("balance_mzn").eq("id", tx.user_id).maybeSingle();
            await supabaseAdmin.from("profiles")
              .update({ balance_mzn: Number(prof?.balance_mzn ?? 0) + Number(tx.net_mzn) })
              .eq("id", tx.user_id);
          }
        }
        return new Response("ok");
      },
    },
  },
});
