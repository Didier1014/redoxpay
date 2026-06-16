import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const checkApiStatus = createServerFn({ method: "GET" }).handler(async () => {
  const token = process.env.RLX_API_TOKEN;
  if (!token) return { ok: false, configured: false, latency_ms: 0, message: "Gateway não configurado" };
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
      message: res.ok ? "Gateway online" : `HTTP ${res.status}`,
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
  customer_phone: z.string().trim().regex(/^\+?[\d\s]{8,15}$/, "Telefone inválido"),
  method: z.enum(["mpesa", "emola", "card"]),
});

// Taxa do vendedor: 15% + 15 MT; custo do processador: 10% + 10 MT; margem = diferença.
function calcFee(amount: number) {
  const seller_fee = Math.round((amount * 0.15 + 15) * 100) / 100;
  const rlx_cost = Math.round((amount * 0.10 + 10) * 100) / 100;
  const admin_margin = Math.round((seller_fee - rlx_cost) * 100) / 100;
  const seller_net = Math.round((amount - seller_fee) * 100) / 100;
  return { seller_fee, rlx_cost, admin_margin, seller_net };
}

// Normalizar telefone para formato local 9 dígitos.
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
    const { seller_fee, seller_net } = calcFee(amount);

    // Insert transaction FIRST with pending status
    const { data: tx, error: tErr } = await supabaseAdmin.from("transactions").insert({
      user_id: product.user_id,
      product_id: product.id,
      customer_name: data.customer_name,
      customer_email: data.customer_email || null,
      customer_phone: data.customer_phone,
      method: data.method,
      amount_mzn: amount,
      fee_mzn: seller_fee,
      net_mzn: seller_net,
      status: "pending",
      external_ref: null,
    }).select().single();
    if (tErr) throw new Error(tErr.message);

    const token = process.env.RLX_API_TOKEN;
    if (token && data.method !== "card") {
      const phone = normalizePhone(data.customer_phone);
      const webhookUrl = `${process.env.SITE_URL ?? "https://redoxpay.vercel.app"}/api/public/webhook-payment?tx_id=${tx.id}`;
      fetch("https://checkout.rlxl.ink/api.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "pay", phone, amount, nome_cliente: data.customer_name, webhook_url: webhookUrl }),
      }).catch(() => {});
    } else if (!token) {
      await supabaseAdmin.from("transactions").update({ status: "paid", external_ref: `SIM-${Date.now()}` }).eq("id", tx.id);
      const { data: prof } = await supabaseAdmin.from("profiles").select("balance_mzn").eq("id", product.user_id).maybeSingle();
      await supabaseAdmin.from("profiles").update({ balance_mzn: Number(prof?.balance_mzn ?? 0) + seller_net }).eq("id", product.user_id);
    }

    return { id: tx.id, status: "pending", amount, fee: seller_fee, net: seller_net, message: null };
  });

// Polling endpoint — verifica estado da transacção.
export const checkTransactionStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ transaction_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tx } = await supabaseAdmin
      .from("transactions").select("*").eq("id", data.transaction_id).maybeSingle();
    if (!tx) throw new Error("Transacção não encontrada");
    if (tx.status === "paid" || tx.status === "failed") {
      if (tx.status === "paid") {
        const { data: prod } = await supabaseAdmin
          .from("products").select("delivery_url").eq("id", tx.product_id).maybeSingle();
        return { status: tx.status, delivery_url: prod?.delivery_url ?? undefined };
      }
      return { status: tx.status };
    }

    const token = process.env.RLX_API_TOKEN;
    if (!token) return { status: tx.status };

    const checkTxid = tx.external_ref || normalizePhone(tx.customer_phone || "");
    if (!checkTxid) return { status: tx.status };

    try {
      const res = await fetch("https://checkout.rlxl.ink/api.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "check", txid: checkTxid }),
      });
      const json = (await res.json().catch(() => ({}))) as { status?: string };
      const next = json.status === "success" || json.status === "paid"
        ? "paid"
        : json.status === "failed" ? "failed" : "pending";

      if (next !== tx.status) {
        const txUpdate: Record<string, unknown> = { status: next };

        if (next === "paid") {
          const amount = Number(tx.amount_mzn) || 0;
          const sellerFee = Math.round((amount * 0.15 + 15) * 100) / 100;
          const sellerNet = Math.round((amount - sellerFee) * 100) / 100;
          txUpdate.net_mzn = sellerNet;
          txUpdate.rlx_fee = Math.round((amount * 0.10 + 10) * 100) / 100;

          await supabaseAdmin.from("transactions").update(txUpdate).eq("id", tx.id);

          const { data: prof } = await supabaseAdmin
            .from("profiles").select("balance_mzn").eq("id", tx.user_id).maybeSingle();
          await supabaseAdmin.from("profiles")
            .update({ balance_mzn: Number(prof?.balance_mzn ?? 0) + sellerNet })
            .eq("id", tx.user_id);
        } else {
          await supabaseAdmin.from("transactions").update(txUpdate).eq("id", tx.id);
        }
      }
      if (next === "paid" || tx.status === "paid") {
        const { data: prod } = await supabaseAdmin
          .from("products").select("delivery_url").eq("id", tx.product_id).maybeSingle();
        return { status: next === "paid" ? next : tx.status, delivery_url: prod?.delivery_url ?? undefined };
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await context.supabase.from("withdrawals").insert({
      user_id: context.userId,
      amount_mzn: data.amount_mzn,
      method: data.method,
      destination: data.destination,
    });
    if (error) throw new Error(error.message);

    // Notifica admins sobre o novo pedido de saque
    const { data: admins } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", "admin");
    if (admins?.length) {
      const { data: prof } = await supabaseAdmin
        .from("profiles").select("full_name,business_name").eq("id", context.userId).maybeSingle();
      const merchantName = prof?.full_name || prof?.business_name || "Um utilizador";
      const amt = new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN" }).format(data.amount_mzn);

      const notifPayload = {
        type: "withdrawal_request",
        title: "Novo pedido de saque",
        message: `${merchantName} solicitou ${amt} via ${data.method.toUpperCase()}`,
        data: {
          withdrawal_amount: data.amount_mzn,
          merchant_id: context.userId,
          merchant_name: merchantName,
          method: data.method,
          destination: data.destination,
        },
      };

      await Promise.all(
        admins.map((a) =>
          supabaseAdmin.from("notifications").insert({
            user_id: a.user_id,
            ...notifPayload,
          }).catch(() => {})
        )
      );
    }

    return { ok: true };
  });
