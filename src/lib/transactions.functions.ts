import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Lightweight health check used by the dashboard to confirm RLX connectivity.
export const checkApiStatus = createServerFn({ method: "GET" }).handler(async () => {
  const token = process.env.RLX_API_TOKEN;
  if (!token) return { ok: false, configured: false, latency_ms: 0, message: "Token RLX não configurado" };
  const started = Date.now();
  try {
    const res = await fetch("https://checkout.rlxl.ink/api.php", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "ping" }),
    });
    const latency = Date.now() - started;
    const text = await res.text().catch(() => "");
    return {
      ok: res.status < 500,
      configured: true,
      latency_ms: latency,
      status: res.status,
      message: res.ok ? "Gateway RLX online" : `HTTP ${res.status}`,
      sample: text.slice(0, 120),
    };
  } catch (e) {
    return { ok: false, configured: true, latency_ms: Date.now() - started, message: e instanceof Error ? e.message : "Sem resposta do gateway" };
  }
});

const checkoutSchema = z.object({
  product_id: z.string().uuid().optional(),
  amount_mzn: z.number().min(60, "Valor mínimo é 60 MT").max(1_000_000).optional(),
  customer_name: z.string().trim().min(2).max(120),
  customer_email: z.string().trim().email().max(160).optional().or(z.literal("")).default(""),
  customer_phone: z.string().trim().regex(/^\+?\d{8,15}$/, "Telefone inválido"),
  method: z.enum(["mpesa", "emola", "card"]),
});

// Taxa do comerciante: 15% + 15 MT por transação
function calcFee(amount: number) {
  const fee = Math.round((amount * 0.15 + 15) * 100) / 100;
  const net = Math.round((amount - fee) * 100) / 100;
  return { fee, net };
}

// Normalize phone to local 9-digit format expected by RLX (e.g. 84xxxxxxx).
function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("258")) return digits.slice(3);
  return digits;
}

export const createCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => checkoutSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: product, error: pErr } = await supabaseAdmin
      .from("products")
      .select("id,user_id,price_mzn,active,name")
      .eq("id", data.product_id).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!product || !product.active) throw new Error("Produto indisponível");

    const amount = data.amount_mzn ?? Number(product.price_mzn);
    if (amount < 60) throw new Error("Valor mínimo é 60 MT");
    const { fee, net } = calcFee(amount);

    // Insert transaction FIRST with pending status
    const { data: tx, error: tErr } = await supabaseAdmin.from("transactions").insert({
      user_id: product.user_id,
      product_id: product.id,
      customer_name: data.customer_name,
      customer_email: data.customer_email || null,
      customer_phone: data.customer_phone,
      method: data.method,
      amount_mzn: amount,
      fee_mzn: fee,
      net_mzn: net,
      status: "pending",
      external_ref: null,
    }).select().single();
    if (tErr) throw new Error(tErr.message);

    // Fire-and-forget RLX pay — Vercel Hobby kills functions after 10s, RLX takes 30-60s.
    // Initiate request without awaiting; RLX processes async and sends webhook.
    const token = process.env.RLX_API_TOKEN;
    if (token && data.method !== "card") {
      const phone = normalizePhone(data.customer_phone);
      const webhookUrl = `${process.env.SITE_URL ?? "https://redoxpay.vercel.app"}/api/public/rlx-webhook?tx_id=${tx.id}`;
      fetch("https://checkout.rlxl.ink/api.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "pay", phone, amount, nome_cliente: data.customer_name, webhook_url: webhookUrl }),
      }).catch(() => {});
    } else if (!token) {
      await supabaseAdmin.from("transactions").update({ status: "paid", external_ref: `SIM-${Date.now()}` }).eq("id", tx.id);
      const { data: prof } = await supabaseAdmin.from("profiles").select("balance_mzn").eq("id", product.user_id).maybeSingle();
      await supabaseAdmin.from("profiles").update({ balance_mzn: Number(prof?.balance_mzn ?? 0) + net }).eq("id", product.user_id);
    }

    return { id: tx.id, status: "pending", amount, fee, net, message: null };
  });

// Polling endpoint — checks RLX for an updated transaction status.
export const checkTransactionStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ transaction_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tx } = await supabaseAdmin
      .from("transactions").select("*").eq("id", data.transaction_id).maybeSingle();
    if (!tx) throw new Error("Transacção não encontrada");
    if (tx.status === "paid" || tx.status === "failed") return { status: tx.status };

    const token = process.env.RLX_API_TOKEN;
    if (!token || !tx.external_ref) return { status: tx.status };

    try {
      const res = await fetch("https://checkout.rlxl.ink/api.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "check", txid: tx.external_ref }),
      });
      const json = (await res.json().catch(() => ({}))) as { status?: string };
      const next = json.status === "success" || json.status === "paid"
        ? "paid"
        : json.status === "failed" ? "failed" : "pending";

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
      return { status: next };
    } catch {
      return { status: tx.status };
    }
  });

export const listMyTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("transactions").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: txs } = await context.supabase
      .from("transactions").select("amount_mzn,net_mzn,status,created_at,method");
    const { data: prof } = await context.supabase
      .from("profiles").select("balance_mzn,full_name,business_name").eq("id", context.userId).maybeSingle();
    const paid = (txs ?? []).filter(t => t.status === "paid");
    const total = paid.reduce((s, t) => s + Number(t.amount_mzn), 0);
    const count = (txs ?? []).length;
    const conv = count ? Math.round((paid.length / count) * 100) : 0;
    return {
      balance: Number(prof?.balance_mzn ?? 0),
      total_volume: total,
      total_tx: count,
      paid_tx: paid.length,
      conversion: conv,
      profile: prof,
      recent: (txs ?? []).slice(0, 30),
    };
  });

export const createWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    amount_mzn: z.number().positive().max(10_000_000),
    method: z.enum(["mpesa", "emola", "bank"]),
    destination: z.string().trim().min(3).max(120),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("withdrawals").insert({
      user_id: context.userId,
      amount_mzn: data.amount_mzn,
      method: data.method,
      destination: data.destination,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
