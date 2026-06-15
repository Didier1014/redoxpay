import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { checkTransactionStatus } from "@/lib/transactions.functions";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { z } from "zod";

export const Route = createFileRoute("/obrigado")({
  validateSearch: z.object({ tx_id: z.string().optional(), slug: z.string().optional() }),
  component: ThankYouPage,
});

function ThankYouPage() {
  const { tx_id, slug } = useSearch({ from: "/obrigado" });
  const navigate = useNavigate();
  const check = useServerFn(checkTransactionStatus);

  const { data: result, isLoading } = useQuery({
    queryKey: ["tx-status", tx_id],
    queryFn: () => tx_id ? check({ data: { transaction_id: tx_id } }) : null,
    refetchInterval: (q) => q.state.data?.status === "paid" ? false : 3000,
    enabled: !!tx_id,
  });

  if (isLoading || !result) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #f9fafc 0%, #f1f5f9 100%)" }}>
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 mx-auto animate-spin" style={{ color: "#ff3333" }} />
          <p className="text-sm text-gray-400">A verificar o pagamento...</p>
        </div>
      </div>
    );
  }

  if (result.status === "paid") {
    const deliveryUrl = result.delivery_url;
    if (deliveryUrl) {
      window.location.href = deliveryUrl;
      return null;
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #f9fafc 0%, #f1f5f9 100%)" }}>
      <div className="bg-white rounded-3xl p-10 max-w-md w-full text-center shadow-[0_25px_60px_rgba(0,0,0,0.1)] space-y-4">
        {result.status === "paid" ? (
          <>
            <CheckCircle2 className="h-16 w-16 mx-auto" style={{ color: "#ff3333" }} />
            <h1 className="text-2xl font-bold text-gray-900">Obrigado!</h1>
            <p className="text-gray-500">Pagamento confirmado com sucesso.</p>
            {result.delivery_url && (
              <a href={result.delivery_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:brightness-110"
                style={{ background: "linear-gradient(135deg, #ff3333, #cc0000)" }}>
                <ExternalLink className="h-4 w-4" />
                Acessar Produto
              </a>
            )}
            {!result.delivery_url && (
              <p className="text-sm text-gray-400">Produto disponível em breve, verifique seu email.</p>
            )}
            <button onClick={() => navigate({ to: "/" })}
              className="text-sm text-gray-400 hover:text-gray-600 underline">
              Voltar ao início
            </button>
          </>
        ) : result.status === "failed" ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900">Pagamento falhou</h1>
            <p className="text-gray-500">Tente novamente mais tarde.</p>
            {slug && (
              <a href={`/c/${slug}`}
                className="inline-block w-full py-3 rounded-xl text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg, #ff3333, #cc0000)" }}>
                Tentar novamente
              </a>
            )}
          </>
        ) : (
          <>
            <Loader2 className="h-10 w-10 mx-auto animate-spin" style={{ color: "#ff3333" }} />
            <h1 className="text-xl font-bold text-gray-900">A processar pagamento</h1>
            <p className="text-sm text-gray-400">Aguardando confirmação...</p>
          </>
        )}
      </div>
    </div>
  );
}
