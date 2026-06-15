import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { updateUserPreferences, sendTestNotification, type Currency } from "@/lib/notifications.functions";
import { PushToggle } from "@/components/push-setup";
import { Copy, Bell, Play, Palette, Volume2, Smartphone } from "lucide-react";

const currencies: { value: Currency; label: string }[] = [
  { value: "MZN", label: "MT (Metical)" },
  { value: "USD", label: "$ (Dólar)" },
  { value: "BRL", label: "R$ (Real)" },
  { value: "ZAR", label: "R (Rand)" },
  { value: "EUR", label: "€ (Euro)" },
];

const positions = [
  { value: "bottom-right", label: "Inferior direito" },
  { value: "bottom-left", label: "Inferior esquerdo" },
  { value: "top-right", label: "Superior direito" },
  { value: "top-left", label: "Superior esquerdo" },
];

export const Route = createFileRoute("/_authenticated/dashboard/notifications/config")({
  component: NotificationsConfigPage,
});

function NotificationsConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [currency, setCurrency] = useState<Currency>("MZN");
  const [position, setPosition] = useState("bottom-right");
  const [highlightColor, setHighlightColor] = useState("#ff3333");
  const [sound, setSound] = useState(true);
  const [duration, setDuration] = useState(6);
  const [userId, setUserId] = useState("");

  useEffect(() => {
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setLoading(false); return; }
      setUserId(u.user.id);
      const meta = u.user.user_metadata ?? {};
      setEnabled(meta.notifications_enabled !== false);
      setCurrency((meta.currency as Currency) ?? "MZN");
      setPosition((meta.notification_position as string) ?? "bottom-right");
      setHighlightColor((meta.notification_color as string) ?? "#ff3333");
      setSound(meta.notification_sound !== false);
      setDuration(Number(meta.notification_duration ?? 6));
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const r = await updateUserPreferences({
        notifications_enabled: enabled,
        currency,
        notification_position: position,
        notification_color: highlightColor,
        notification_sound: sound,
        notification_duration: duration,
      });
      setSaving(false);
      toast.success("Preferências salvas");
    } catch (e) {
      console.error("[save prefs]", e);
      setSaving(false);
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  async function testNotification() {
    try {
      const r = await sendTestNotification();
      toast.success("Notificação de teste enviada!");
    } catch (e) {
      console.error("[test notification]", e);
      toast.error(e instanceof Error ? e.message : "Erro ao testar");
    }
  }

  const embedCode = `<script src="https://redoxpay.vercel.app/api/public/embed-script?user_id=${userId}"></script>`;

  async function copyEmbed() {
    try {
      await navigator.clipboard.writeText(embedCode);
      toast.success("Código copiado!");
    } catch {
      toast.error("Erro ao copiar");
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground p-4">A carregar...</div>;

  return (
    <div className="space-y-4">
      <div className="px-1">
        <h1 className="text-2xl font-bold tracking-tight">Notificações em tempo real</h1>
        <p className="text-sm text-muted-foreground">Configure as notificações de vendas</p>
      </div>

      <Card className="p-5 bg-white/5 border-white/10 rounded-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <Label className="font-medium cursor-pointer">Notificações no site</Label>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-muted-foreground shrink-0" />
          <PushToggle />
        </div>

        <div>
          <Label>Moeda para exibir</Label>
          <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Posição</Label>
          <Select value={position} onValueChange={setPosition}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {positions.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <Palette className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1">
            <Label>Cor do destaque</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="color"
                value={highlightColor}
                onChange={(e) => setHighlightColor(e.target.value)}
                className="w-12 h-10 p-1 cursor-pointer"
              />
              <span className="text-xs text-muted-foreground">{highlightColor}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 className="h-5 w-5 text-muted-foreground" />
            <Label className="font-medium cursor-pointer">Som ao receber</Label>
          </div>
          <Switch checked={sound} onCheckedChange={setSound} />
        </div>

        <div>
          <Label>Duração: {duration}s</Label>
          <Slider
            value={[duration]}
            onValueChange={([v]) => setDuration(v)}
            min={3}
            max={10}
            step={1}
            className="mt-2"
          />
        </div>

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={testNotification}
          disabled={!enabled}
        >
          <Play className="h-4 w-4" /> Testar notificação
        </Button>

        <Button
          className="w-full rounded-xl bg-gradient-to-r from-primary to-primary-glow text-white"
          disabled={saving}
          onClick={save}
        >
          {saving ? "A guardar..." : "Guardar preferências"}
        </Button>
      </Card>

      <Card className="p-5 bg-white/5 border-white/10 rounded-2xl space-y-3">
        <h2 className="font-semibold">Código Embed</h2>
        <p className="text-xs text-muted-foreground">
          Copie o código abaixo e cole no seu site para mostrar notificações na sua loja.
        </p>
        <div className="relative">
          <pre className="text-xs bg-black/40 rounded-xl p-4 overflow-x-auto text-muted-foreground whitespace-pre-wrap break-all">
            {embedCode}
          </pre>
          <Button
            size="icon"
            variant="ghost"
            className="absolute top-2 right-2 h-8 w-8"
            onClick={copyEmbed}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
