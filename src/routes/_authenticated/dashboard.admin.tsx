import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  getAdminOverview, listAllProfiles, listAllTransactions,
  listAllWithdrawals, listAllProducts,
} from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { useState } from "react";
import {
  Shield, Users, Receipt, Package, TrendingUp, AlertTriangle,
  WithdrawalIcon, ArrowUpDown, Smartphone, CreditCard, Search,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/admin")({ component: AdminPage });

const fmtMT = (n: number) => `${new Intl.NumberFormat("pt-MZ").format(n)} MT`;
const fmt = (n: number) => new Intl.NumberFormat("pt-MZ", { maximumFractionDigits: 0 }).format(n);

type Tab = "overview" | "users" | "transactions" | "withdrawals" | "products";

function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");

  const fnOverview = useServerFn(getAdminOverview);
  const fnProfiles = useServerFn(listAllProfiles);
  const fnTx = useServerFn(listAllTransactions);
  const fnWd = useServerFn(listAllWithdrawals);
  const fnProd = useServerFn(listAllProducts);

  const overview = useQuery({ queryKey: ["admin_overview"], queryFn: () => fnOverview(), retry: false });
  const profiles = useQuery({ queryKey: ["admin_profiles"], queryFn: () => fnProfiles(), enabled: tab === "users" });
  const txs = useQuery({ queryKey: ["admin_tx"], queryFn: () => fnTx(), enabled: tab === "transactions" });
  const wds = useQuery({ queryKey: ["admin_wd"], queryFn: () => fnWd(), enabled: tab === "withdrawals" });
  const prods = useQuery({ queryKey: ["admin_prods"], queryFn: () => fnProd(), enabled: tab === "products" });

  const isAdmin = !overview.error;

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "overview", label: "Visão Geral", icon: TrendingUp },
    { id: "users", label: "Utilizadores", icon: Users },
    { id: "transactions", label: "Transações", icon: Receipt },
    { id: "withdrawals", label: "Saques", icon: ArrowUpDown },
    { id: "products", label: "Produtos", icon: Package },
  ];

  if (!isAdmin) {
    return (
      <Card className="p-8 bg-white/5 border-white/10 rounded-2xl text-center">
        <Shield className="h-12 w-12 mx-auto text-amber-400 mb-3" />
        <h2 className="text-xl font-semibold">Acesso restrito</h2>
        <p className="text-sm text-muted-foreground mt-1">Esta área requer permissões de administrador.</p>
      </Card>
    );
  }

  const d = overview.data;

  return (
    <div className="space-y-4">
      <div className="px-1 flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary-glow" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">Gestão completa da plataforma Redox Pay</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 bg-secondary rounded-xl p-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? "bg-foreground text-background" : "text-foreground/70 hover:text-foreground"}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && d && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat label="Utilizadores" value={fmt(d.profiles)} icon={Users} />
            <Stat label="Transações" value={fmt(d.transactions)} icon={Receipt} />
            <Stat label="Produtos" value={fmt(d.products)} icon={Package} />
            <Stat label="Saques" value={fmt(d.withdrawals)} icon={ArrowUpDown} />
            <Stat label="Volume pago" value={fmtMT(d.volume_mzn)} icon={TrendingUp} highlight />
          </div>

          <Card className="p-5 bg-card/40 border border-white/5 rounded-2xl">
            <h2 className="font-semibold mb-3">Sistema</h2>
            <div className="space-y-2 text-sm">
              <Row label="Gateway RLX" value="Online" color="text-emerald-400" />
              <Row label="Base de dados" value="Operacional" color="text-emerald-400" />
              <Row label="Webhook" value="https://redoxpay.vercel.app/api/public/rlx-webhook" color="text-muted-foreground" mono />
            </div>
          </Card>
        </>
      )}

      {tab === "users" && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar por nome, email ou telefone..."
              className="w-full h-11 pl-10 pr-4 rounded-xl bg-card border border-border text-sm" />
          </div>
          <Card className="rounded-2xl shadow-sm divide-y divide-border">
            {(profiles.data ?? [])
              .filter((p: any) => {
                if (!search) return true;
                const q = search.toLowerCase();
                return (p.full_name?.toLowerCase() ?? "").includes(q)
                  || (p.business_name?.toLowerCase() ?? "").includes(q)
                  || (p.phone ?? "").includes(q)
                  || (p.email ?? "").includes(q);
              })
              .map((p: any) => (
                <div key={p.id} className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-xs font-bold">
                    {(p.full_name || p.business_name || "U").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{p.full_name || p.business_name || "Sem nome"}</p>
                    <p className="text-xs text-muted-foreground">{p.email || p.phone || "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">{fmtMT(Number(p.balance_mzn ?? 0))}</p>
                    <p className="text-xs text-muted-foreground">{p.city || "—"}</p>
                  </div>
                </div>
              ))}
          </Card>
        </div>
      )}

      {tab === "transactions" && (
        <Card className="rounded-2xl shadow-sm divide-y divide-border">
          {(txs.data ?? []).map((t: any) => (
            <div key={t.id} className="p-4 flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-xs font-bold ${t.method === 'mpesa' ? 'bg-rose-50 text-[#e11d48]' : t.method === 'emola' ? 'bg-amber-50 text-[#f59e0b]' : 'bg-secondary'}`}>
                {t.method === 'mpesa' ? 'MP' : t.method === 'emola' ? 'EM' : 'CC'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{t.customer_name || "—"}</p>
                <p className="text-xs text-muted-foreground">{t.customer_phone} · {new Date(t.created_at).toLocaleDateString("pt-MZ")}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{fmtMT(Number(t.amount_mzn))}</p>
                {t.status === 'paid' && <p className="text-xs text-emerald-600">● Sucesso</p>}
                {t.status === 'failed' && <p className="text-xs text-[#e11d48]">● Falhou</p>}
                {t.status === 'pending' && <p className="text-xs text-amber-600">● Pendente</p>}
              </div>
            </div>
          ))}
          {!txs.data?.length && <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma transação.</p>}
        </Card>
      )}

      {tab === "withdrawals" && (
        <Card className="rounded-2xl shadow-sm divide-y divide-border">
          {(wds.data ?? []).map((w: any) => (
            <div key={w.id} className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center text-xs font-bold">
                {w.method === 'mpesa' ? 'MP' : w.method === 'emola' ? 'EM' : 'BN'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{w.destination}</p>
                <p className="text-xs text-muted-foreground">{w.method} · {new Date(w.created_at).toLocaleDateString("pt-MZ")}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{fmtMT(Number(w.amount_mzn))}</p>
                {w.status === 'paid' && <p className="text-xs text-emerald-600">● Pago</p>}
                {w.status === 'pending' && <p className="text-xs text-amber-600">● Pendente</p>}
                {w.status === 'failed' && <p className="text-xs text-[#e11d48]">● Falhou</p>}
              </div>
            </div>
          ))}
          {!wds.data?.length && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum saque.</p>}
        </Card>
      )}

      {tab === "products" && (
        <Card className="rounded-2xl shadow-sm divide-y divide-border">
          {(prods.data ?? []).map((p: any) => (
            <div key={p.id} className="p-4 flex items-center gap-3">
              {p.cover_url ? (
                <img src={p.cover_url} alt={p.name} className="h-10 w-10 rounded-xl object-cover" />
              ) : (
                <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center text-xs font-bold">
                  {p.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {(p as any).profiles?.full_name || (p as any).profiles?.business_name || "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{fmtMT(Number(p.price_mzn))}</p>
                <p className={`text-xs ${p.active ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  {p.active ? '● Activo' : 'Inactivo'}
                </p>
              </div>
            </div>
          ))}
          {!prods.data?.length && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum produto.</p>}
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, highlight }: { label: string; value: string; icon: any; highlight?: boolean }) {
  return (
    <Card className={`p-4 rounded-2xl ${highlight ? 'bg-primary/10 border-primary/30' : 'bg-card border-border'}`}>
      <Icon className={`h-5 w-5 mb-2 ${highlight ? 'text-primary-glow' : 'text-muted-foreground'}`} />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold mt-1 ${highlight ? 'text-primary-glow' : ''}`}>{value}</p>
    </Card>
  );
}

function Row({ label, value, color, mono }: { label: string; value: string; color: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${color} ${mono ? 'text-xs font-mono' : ''}`}>{value}</span>
    </div>
  );
}
