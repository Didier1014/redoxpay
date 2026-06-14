import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { checkApiStatus } from "@/lib/transactions.functions";
import { Activity, CheckCircle2, XCircle, Zap, RefreshCw, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard/settings")({
  component: SettingsPage,
});

const webhookUrl = typeof window !== "undefined"
  ? `${window.location.origin}/api/public/rlx-webhook`
  : "";

function SettingsPage() {
  const ping = useServerFn(checkApiStatus);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["api-status"],
    queryFn: () => ping(),
    refetchInterval: 30_000,
  });

  const ok = !!data?.ok;
  const dot = ok ? "bg-emerald-400 shadow-[0_0_10px_#34d399]" : "bg-rose-500 shadow-[0_0_10px_#f43f5e]";

  return (
    <div className="space-y-4">
      <div className="px-1">
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Estado das integrações e referência rápida.</p>
      </div>

      <Card className="relative overflow-hidden rounded-2xl p-5 bg-card/40 border border-white/5">
        <div aria-hidden className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
        <div className="flex items-start justify-between relative">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Activity className="h-5 w-5 text-primary-glow" />
            </div>
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                Gateway RLX
                <span className={`h-2 w-2 rounded-full ${dot}`} />
              </h3>
              <p className="text-xs text-muted-foreground">{data?.message ?? "A verificar…"}</p>
            </div>
          </div>
          <button onClick={() => refetch()} className="h-9 w-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 relative">
          <Metric icon={ok ? CheckCircle2 : XCircle} label="Estado" value={ok ? "Online" : "Offline"} tone={ok ? "ok" : "err"} />
          <Metric icon={Zap} label="Latência" value={data ? `${data.latency_ms} ms` : "—"} />
          <Metric icon={Activity} label="HTTP" value={data?.status ? String(data.status) : "—"} />
        </div>
      </Card>

      <Card className="relative overflow-hidden rounded-2xl p-5 bg-card/40 border border-white/5">
        <h3 className="font-semibold">Webhook</h3>
        <p className="text-sm text-muted-foreground mt-1">URL configurada no painel RLX:</p>
        <code className="block mt-2 p-3 rounded-lg bg-white/5 border border-white/5 text-xs break-all text-primary-glow">
          {webhookUrl}
        </code>
        <button onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("URL copiado"); }} className="mt-2 text-xs text-primary-glow hover:underline flex items-center gap-1">
          <Copy className="h-3 w-3" /> Copiar URL
        </button>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="rounded-2xl p-5 bg-card/40 border border-white/5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Taxas</p>
          <p className="mt-1 text-lg font-semibold">11.99% + 11.99 MT</p>
          <p className="text-xs text-muted-foreground">por transação aprovada</p>
        </Card>
        <Card className="rounded-2xl p-5 bg-card/40 border border-white/5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Valor mínimo</p>
          <p className="mt-1 text-lg font-semibold">50 MT</p>
          <p className="text-xs text-muted-foreground">C2B M-Pesa / e-Mola</p>
        </Card>
      </div>

      <Card className="rounded-2xl p-5 bg-card/40 border border-white/5">
        <h3 className="font-semibold">API</h3>
        <p className="text-sm text-muted-foreground">Documentação completa em breve. Para criar transações via API, contacte o suporte.</p>
      </Card>
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone?: "ok" | "err" }) {
  const color = tone === "ok" ? "text-emerald-400" : tone === "err" ? "text-rose-400" : "text-foreground";
  return (
    <div className="rounded-xl bg-white/5 border border-white/5 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <p className={`mt-1 text-sm font-semibold ${color}`}>{value}</p>
    </div>
  );
}
