import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { listMyProducts } from "@/lib/products.functions";
import { createCheckout } from "@/lib/transactions.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard/new-transaction")({
  component: NewTransactionPage,
});

function NewTransactionPage() {
  const router = useRouter();
  const fetchList = useServerFn(listMyProducts);
  const charge = useServerFn(createCheckout);
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => fetchList() });

  const [method, setMethod] = useState<"mpesa"|"emola">("mpesa");
  const [phone, setPhone] = useState("258");
  const [name, setName] = useState("");
  const [productId, setProductId] = useState<string>("");

  const m = useMutation({
    mutationFn: () => {
      const pid = productId || products[0]?.id;
      if (!pid) throw new Error("Crie um produto primeiro");
      return charge({ data: { product_id: pid, customer_name: name || "Cliente", customer_phone: phone, method } });
    },
    onSuccess: () => { toast.success("Pedido enviado!"); router.navigate({ to: "/dashboard/transactions" }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const ready = !!phone && phone.length >= 9 && !!products.length;

  return (
    <div className="space-y-5">
      <div className="px-1">
        <h1 className="text-2xl font-semibold tracking-tight">Nova transacção</h1>
        <p className="text-sm text-muted-foreground">Teste C2B com M-Pesa ou e-Mola. As taxas do sistema são aplicadas automaticamente.</p>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Método</p>
        <div className="grid grid-cols-2 gap-2">
          {(["mpesa","emola"] as const).map(opt => (
            <button key={opt} onClick={()=>setMethod(opt)}
              className={`h-14 rounded-xl text-sm font-medium border transition-colors ${method===opt ? "bg-foreground text-background border-foreground" : "bg-card border-border text-foreground/80"}`}>
              {opt === "mpesa" ? "M-Pesa" : "e-Mola"}
            </button>
          ))}
        </div>
      </div>

      <Field label="Número do cliente"><Input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="258840000000" className="h-12 bg-secondary border-0 rounded-xl" /></Field>
      <Field label="Nome do cliente (opcional)"><Input value={name} onChange={e=>setName(e.target.value)} placeholder="Maria Silva" className="h-12 bg-secondary border-0 rounded-xl" /></Field>

      {products.length > 1 && (
        <Field label="Produto associado">
          <select value={productId} onChange={e=>setProductId(e.target.value)} className="h-12 w-full bg-secondary rounded-xl px-3 text-sm">
            <option value="">{products[0].name}</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      )}

      <Button onClick={()=>m.mutate()} disabled={!ready || m.isPending} className="w-full h-14 rounded-xl bg-foreground text-background disabled:bg-muted disabled:text-muted-foreground">
        Enviar pedido de pagamento
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
