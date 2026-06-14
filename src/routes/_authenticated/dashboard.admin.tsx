import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getAdminOverview } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Shield, Users, Receipt, Package, TrendingUp, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/admin")({ component: Page });

const fmtMT = (n: number) => `${new Intl.NumberFormat("pt-MZ").format(n)} MT`;

function Page() {
  const fn = useServerFn(getAdminOverview);
  const { data, error, isLoading } = useQuery({ queryKey: ["admin_overview"], queryFn: () => fn(), retry: false });

  if (error) {
    return (
      <Card className="p-8 bg-white/5 border-white/10 rounded-2xl text-center">
        <AlertTriangle className="h-10 w-10 mx-auto text-amber-400 mb-3" />
        <h2 className="font-semibold">Acesso restrito</h2>
        <p className="text-sm text-muted-foreground mt-1">Esta área requer permissões de administrador.</p>
      </Card>
    );
  }

  const stats = [
    { label: "Utilizadores", value: data?.profiles ?? 0, icon: Users },
    { label: "Transações", value: data?.transactions ?? 0, icon: Receipt },
    { label: "Produtos", value: data?.products ?? 0, icon: Package },
    { label: "Volume pago", value: fmtMT(data?.volume_mzn ?? 0), icon: TrendingUp },
  ];

  return (
    <div className="space-y-4">
      <div className="px-1 flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary-glow" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">Visão global da plataforma</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-4 bg-white/5 border-white/10 rounded-2xl">
            <s.icon className="h-5 w-5 text-primary-glow mb-2" />
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-xl font-bold mt-1">{isLoading ? "..." : s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5 bg-white/5 border-white/10 rounded-2xl">
        <h2 className="font-semibold mb-2">Sistema</h2>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Status</span><span className="text-emerald-400 font-medium">Operacional</span></div>
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Gateway M-Pesa</span><span className="text-emerald-400 font-medium">Online</span></div>
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Gateway e-Mola</span><span className="text-emerald-400 font-medium">Online</span></div>
        </div>
      </Card>
    </div>
  );
}
