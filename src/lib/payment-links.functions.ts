import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function calcFee(amount: number) {
  const fee = Math.round((amount * 0.15 + 15) * 100) / 100;
  const net = Math.round((amount - fee) * 100) / 100;
  return { fee, net };
}
function normalizePhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("258") ? d.slice(3) : d;
}

export const getLinkBySlug = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link, error } = await supabaseAdmin
      .from("payment_links")
      .select("id,user_id,title,description,amount_mzn,active,slug")
      .eq("slug", data.slug).maybeSingle();
    if (error) throw new Error(error.message);
    if (!link || !link.active) throw new Error("Link indisponível");
    const current = (await supabaseAdmin.from("payment_links").select("clicks").eq("id", link.id).maybeSingle()).data?.clicks ?? 0;
    await supabaseAdmin.from("payment_links").update({ clicks: current + 1 }).eq("id", link.id);
    return link;
  });

export const payLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    link_id: z.string().uuid(),
    customer_name: z.string().trim().min(2).max(120),
    customer_email: z.string().trim().email().max(160).optional().or(z.literal("")).default(""),
    customer_phone: z.string().trim().regex(/^\+?\d{8,15}$/, "Telefone inválido"),
    method: z.enum(["mpesa", "emola"]),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link } = await supabaseAdmin.from("payment_links")
      .select("id,user_id,amount_mzn,active,payments_count").eq("id", data.link_id).maybeSingle();
    if (!link || !link.active) throw new Error("Link indisponível");
    const amount = Number(link.amount_mzn);
    const { fee, net } = calcFee(amount);

    let status: "pending" | "paid" | "failed" = "pending";
    let external_ref: string | null = null;
    const token = process.env.RLX_API_TOKEN;
    if (token) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch("https://checkout.rlxl.ink/api.php", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "pay", phone: normalizePhone(data.customer_phone), amount, nome_cliente: data.customer_name, webhook_url: "https://redoxpay.vercel.app/api/public/rlx-webhook" }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const j = (await res.json().catch(() => ({}))) as { status?: string; txid?: string; partner_transaction_id?: string; erro?: string; error?: string };
        external_ref = j.txid ?? j.partner_transaction_id ?? null;
        if (j.status === "success" || j.status === "paid") status = "paid";
        else if (j.status === "pending") status = "pending";
        else if (j.status === "failed" || j.status === "error") status = "failed";
        else status = "pending";
      } catch { status = "failed"; }
    } else {
      status = "paid"; external_ref = `SIM-${Date.now()}`;
    }

    const { data: tx, error } = await supabaseAdmin.from("transactions").insert({
      user_id: link.user_id, customer_name: data.customer_name, customer_email: data.customer_email || null,
      customer_phone: data.customer_phone, method: data.method, amount_mzn: amount, fee_mzn: fee, net_mzn: net, status, external_ref,
    }).select().single();
    if (error) throw new Error(error.message);

    if (status === "paid") {
      await supabaseAdmin.from("payment_links").update({ payments_count: (link.payments_count ?? 0) + 1 }).eq("id", link.id);
      const { data: prof } = await supabaseAdmin.from("profiles").select("balance_mzn").eq("id", link.user_id).maybeSingle();
      await supabaseAdmin.from("profiles").update({ balance_mzn: Number(prof?.balance_mzn ?? 0) + net }).eq("id", link.user_id);
    }
    return { id: tx.id, status };
  });

const schema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional().default(""),
  amount_mzn: z.number().min(1).max(1_000_000),
});

function shortId(len = 7) {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = ""; for (let i = 0; i < len; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

export const listLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("payment_links").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    for (let i = 0; i < 5; i++) {
      const slug = shortId();
      const { data: row, error } = await context.supabase
        .from("payment_links")
        .insert({ user_id: context.userId, slug, ...data })
        .select().single();
      if (!error) return row;
      if (!error.message.includes("payment_links_slug_key")) throw new Error(error.message);
    }
    throw new Error("Não foi possível gerar link único");
  });

export const toggleLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("payment_links").update({ active: data.active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("payment_links").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
