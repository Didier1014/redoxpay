import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getProductBySlug } from "@/lib/products.functions";
import { createCheckout } from "@/lib/transactions.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2, Lock, Smartphone, CreditCard, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/c/$slug")({
  component: CheckoutPage,
});

const fmt = (n: number) => new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN" }).format(n);

function CheckoutPage() {
  const { slug } = useParams({ from: "/c/$slug" });
  const fetchProduct = useServerFn(getProductBySlug);
  const checkout = useServerFn(createCheckout);

  const { data: product, isLoading, error } = useQuery({
    queryKey: ["product", slug],
    queryFn: () => fetchProduct({ data: { slug } }),
    retry: false,
  });

  const [form, setForm] = useState({ customer_name: "", customer_email: "", customer_phone: "" });
  const [method, setMethod] = useState<"mpesa" | "emola" | "card">("mpesa");
  const [done, setDone] = useState<{ id: string; status: string } | null>(null);

  const m = useMutation({
    mutationFn: () => checkout({ data: {
      product_id: product!.id, method, ...form,
    } }),
    onSuccess: (r) => {
      setDone(r);
      if (r.status === "paid") toast.success("Pagamento confirmado!");
      else if (r.status === "failed") toast.error("Pagamento falhou");
      else toast("Pagamento pendente — verifique o seu telefone");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  if (isLoading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (error || !product) return (
    <div className="min-h-screen grid place-items-center text-center px-4">
      <div>
        <h1 className="text-2xl font-bold">Produto não encontrado</h1>
        <p className="text-muted-foreground mt-2">O link pode estar incorreto ou o produto foi desactivado.</p>
      </div>
    </div>
  );

  if (done) return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-3">
          <CheckCircle2 className="h-14 w-14 text-success mx-auto" />
          <h1 className="text-2xl font-bold">
            {done.status === "paid" ? "Pagamento confirmado!" : done.status === "pending" ? "Pagamento pendente" : "Pagamento falhou"}
          </h1>
          <p className="text-muted-foreground">
            {done.status === "paid"
              ? "Recebemos o seu pagamento. Verifique o seu email para a entrega."
              : done.status === "pending"
              ? "Aprove a transação no seu telefone para concluir."
              : "Tente novamente ou use outro método."}
          </p>
          <p className="text-xs text-muted-foreground border-t border-border pt-3">Ref: {done.id}</p>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-primary/20 blur-[140px]" />
      </div>
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-2 text-sm">
          <Zap className="h-4 w-4 text-primary" />
          <span className="font-semibold">REDOX PAY</span>
          <span className="ml-auto flex items-center gap-1 text-muted-foreground"><Lock className="h-3 w-3" /> Pagamento seguro</span>
        </div>
      </header>
      <div className="max-w-5xl mx-auto px-4 py-8 grid lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardContent className="p-6">
              <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-3">Seus dados</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome completo</Label>
                  <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} maxLength={120} />
                </div>
                <div className="space-y-2">
                  <Label>Email (opcional)</Label>
                  <Input type="email" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} maxLength={160} />
                </div>
                <div className="space-y-2">
                  <Label>Telefone (M-Pesa/e-Mola)</Label>
                  <Input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                    placeholder="+258 84 000 0000" maxLength={20} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-3">Método de pagamento</h2>
              <div className="grid grid-cols-3 gap-2">
                <MethodBtn active={method === "mpesa"} onClick={() => setMethod("mpesa")} icon={Smartphone} label="M-Pesa" />
                <MethodBtn active={method === "emola"} onClick={() => setMethod("emola")} icon={Smartphone} label="e-Mola" />
                <MethodBtn active={method === "card"} onClick={() => setMethod("card")} icon={CreditCard} label="Cartão" />
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-2">
          <Card className="lg:sticky lg:top-6">
            <CardContent className="p-6 space-y-4">
              {product.cover_url && <img src={product.cover_url} alt={product.name} className="w-full h-40 object-cover rounded-md" />}
              <div>
                <h1 className="text-xl font-bold">{product.name}</h1>
                {product.description && <p className="text-sm text-muted-foreground mt-1">{product.description}</p>}
              </div>
              <div className="border-t border-border pt-4 flex items-center justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="text-2xl font-bold text-primary">{fmt(Number(product.price_mzn))}</span>
              </div>
              <Button className="w-full" size="lg"
                disabled={m.isPending || !form.customer_name || !form.customer_phone}
                onClick={() => m.mutate()}>
                {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                Pagar {fmt(Number(product.price_mzn))}
              </Button>
              <p className="text-xs text-center text-muted-foreground">Protegido por REDOX PAY</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MethodBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button onClick={onClick} type="button"
      className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition-colors ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent/30"
      }`}>
      <Icon className="h-5 w-5" /> {label}
    </button>
  );
}
