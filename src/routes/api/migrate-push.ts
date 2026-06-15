import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/migrate-push")({
  component: () => null,
  server: {
    handlers: {
      GET: async () => {
        const { default: pg } = await import("pg");
        const url = process.env.SUPABASE_URL!;
        const projectRef = new URL(url).hostname.split(".")[0];
        const password = process.env.SUPABASE_DB_PASSWORD;
        if (!password) return new Response("Missing SUPABASE_DB_PASSWORD", { status: 500 });

        const client = new pg.Client({
          host: "aws-0-eu-west-1.pooler.supabase.com",
          port: 5432,
          database: "postgres",
          user: `postgres.${projectRef}`,
          password,
          ssl: { rejectUnauthorized: false },
        });

        try {
          await client.connect();
          await client.query(`
            CREATE TABLE IF NOT EXISTS push_subscriptions (
              user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
              endpoint TEXT NOT NULL,
              p256dh TEXT NOT NULL,
              auth TEXT NOT NULL,
              created_at TIMESTAMPTZ DEFAULT now(),
              updated_at TIMESTAMPTZ DEFAULT now()
            );
          `);
          await client.query("ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;");
          await client.query(`
            CREATE POLICY IF NOT EXISTS "Users can manage own push subscription"
              ON push_subscriptions USING (auth.uid() = user_id);
          `);
          await client.end();
          return new Response(JSON.stringify({ ok: true, message: "Tabela criada!" }), {
            headers: { "content-type": "application/json" },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "content-type": "application/json" } });
        }
      },
    },
  },
});
