import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const subscribePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      endpoint: z.string().url(),
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("push_subscriptions").upsert({
      user_id: context.userId,
      endpoint: data.endpoint,
      p256dh: data.p256dh,
      auth: data.auth,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unsubscribePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("push_subscriptions")
      .delete().eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export async function sendPushToUser(
  supabaseAdmin: any,
  userId: string,
  title: string,
  body: string,
  url?: string,
) {
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions").select("endpoint,p256dh,auth").eq("user_id", userId).maybeSingle();
  if (!subs) return;

  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublic || !vapidPrivate) return;

  const webpush = await import("web-push");
  webpush.setVapidDetails("mailto:admin@redoxpay.com", vapidPublic, vapidPrivate);

  try {
    await webpush.sendNotification({
      endpoint: subs.endpoint,
      keys: { p256dh: subs.p256dh, auth: subs.auth },
    }, JSON.stringify({ title, body, url }));
  } catch {
    // subscription expired or invalid — remove it
    await supabaseAdmin.from("push_subscriptions")
      .delete().eq("user_id", userId);
  }
}
