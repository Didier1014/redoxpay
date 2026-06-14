import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QrCode, Download, Copy } from "lucide-react";
import { toast } from "sonner";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/dashboard/qr-code")({ component: Page });

function Page() {
  const [amount, setAmount] = useState("100");
  const [ref, setRef] = useState("");

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (amount) params.set("amount", amount);
    if (ref) params.set("slug", ref || "qr");
    return `${typeof window !== "undefined" ? window.location.origin : ""}/l/qr-pay?${params.toString()}`;
  }, [amount, ref]);

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&bgcolor=ffffff&color=8B0000&margin=10&data=${encodeURIComponent(url)}`;

  return (
    <div className="space-y-4">
      <div className="px-1">
        <h1 className="text-2xl font-bold tracking-tight">QR Code</h1>
        <p className="text-sm text-muted-foreground">Gere QR para receber pagamentos</p>
      </div>

      <Card className="p-6 bg-white/5 border-white/10 rounded-2xl space-y-4">
        <div className="flex justify-center">
          <div className="rounded-2xl bg-white p-4 shadow-[0_0_60px_-15px_var(--primary-glow)]">
            <img src={qrSrc} alt="QR Code" width={240} height={240} className="rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Valor (MZN)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><Label>Referência</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="opcional" /></div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 rounded-xl bg-white/5 border-white/10" onClick={() => { navigator.clipboard.writeText(url); toast.success("Link copiado"); }}>
            <Copy className="h-4 w-4 mr-2" /> Copiar link
          </Button>
          <Button asChild className="flex-1 rounded-xl bg-gradient-to-r from-primary to-primary-glow text-white">
            <a href={qrSrc} download="redox-pay-qr.png"><Download className="h-4 w-4 mr-2" /> Baixar PNG</a>
          </Button>
        </div>
      </Card>

      <Card className="p-4 bg-white/5 border-white/10 rounded-2xl text-xs text-muted-foreground flex items-start gap-2">
        <QrCode className="h-4 w-4 text-primary-glow shrink-0 mt-0.5" />
        Imprima o QR no seu balcão. O cliente lê com a câmara e paga via M-Pesa ou e-Mola.
      </Card>
    </div>
  );
}
