import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { addDays, format, parseISO } from "date-fns";
import { Check, ListChecks } from "lucide-react";

import { supabase, type NotaFiscal } from "@/lib/supabase";
import type { Cliente } from "@/lib/clientes";
import type { Obrigacao } from "@/lib/obrigacoes";
import { TIPO_OBRIGACAO_META } from "@/lib/obrigacoes";
import type { Tarefa } from "@/lib/tarefas";
import type { Comunicacao } from "@/lib/comunicacoes";
import { useMeiAno } from "@/lib/mei-dados";
import { faixaMei, formatarPct, moeda, pctDoLimite } from "@/lib/mei";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Severidade = "danger" | "warning" | "info";
type ItemFila = {
  id: string;
  sev: Severidade;
  titulo: string;
  detalhe: string;
  acao: string;
  link: { to: string; params?: Record<string, string>; search?: Record<string, string> };
};

const ORDEM: Record<Severidade, number> = { danger: 0, warning: 1, info: 2 };
const iso = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * "Precisa de você hoje": o que pede ação, do mais grave para o menos.
 * Cada item leva direto à tela certa. O botão do primeiro item é o primário da tela.
 */
export function FilaDoDia({ notasHoje }: { notasHoje: NotaFiscal[] }) {
  const hoje = new Date();
  const hojeIso = iso(hoje);
  const em7 = iso(addDays(hoje, 7));

  const { data, isLoading } = useQuery({
    queryKey: ["fila-do-dia", hojeIso],
    queryFn: async () => {
      const [obrigacoes, tarefas, comunicacoes] = await Promise.all([
        supabase
          .from("obrigacoes_acessorias")
          .select("*")
          .neq("status", "entregue")
          .lte("vencimento", em7)
          .order("vencimento", { ascending: true }),
        supabase
          .from("tarefas")
          .select("*")
          .lte("data_tarefa", hojeIso)
          .neq("status", "concluida")
          .in("prioridade", ["alta", "urgente"]),
        supabase.from("comunicacoes").select("*").eq("status", "aberta").eq("tipo", "pendencia"),
      ]);
      for (const r of [obrigacoes, tarefas, comunicacoes]) if (r.error) throw r.error;
      return {
        obrigacoes: (obrigacoes.data ?? []) as Obrigacao[],
        tarefas: (tarefas.data ?? []) as Tarefa[],
        comunicacoes: (comunicacoes.data ?? []) as Comunicacao[],
      };
    },
  });
  const { data: meiCabecalhos } = useMeiAno(hoje.getFullYear());
  const { data: clientes } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Cliente[];
    },
  });
  const nome = (id: string | null) =>
    (id && clientes?.find((c) => c.id === id)?.nome) || "Sem cliente";

  const itens: ItemFila[] = [];

  for (const n of notasHoje.filter((x) => x.status === "denegada"))
    itens.push({
      id: `den-${n.id}`,
      sev: "danger",
      titulo: `Nota ${n.numero_nf} denegada — ${n.cliente}`,
      detalhe: "Avisar o cliente e registrar a pendência. O número não pode ser reaproveitado.",
      acao: "Abrir nota",
      link: { to: "/historico", search: { nf: n.numero_nf } },
    });

  const obrig = data?.obrigacoes ?? [];
  const atrasadas = obrig.filter((o) => o.status === "atrasada" || o.vencimento < hojeIso);
  const proximas = obrig.filter((o) => !atrasadas.includes(o));
  const descreverObr = (lista: Obrigacao[], comData: boolean) =>
    lista
      .slice(0, 3)
      .map(
        (o) =>
          `${TIPO_OBRIGACAO_META[o.tipo]?.label ?? o.tipo} · ${nome(o.cliente_id)}${comData ? ` · ${format(parseISO(o.vencimento), "dd/MM")}` : ""}`,
      )
      .join(" · ");
  if (atrasadas.length)
    itens.push({
      id: "obr-atrasadas",
      sev: "danger",
      titulo: `${atrasadas.length} ${atrasadas.length > 1 ? "obrigações atrasadas" : "obrigação atrasada"}`,
      detalhe: descreverObr(atrasadas, false),
      acao: "Resolver",
      link: { to: "/obrigacoes" },
    });
  if (proximas.length)
    itens.push({
      id: "obr-proximas",
      sev: "warning",
      titulo: `${proximas.length} ${proximas.length > 1 ? "obrigações vencem" : "obrigação vence"} nos próximos 7 dias`,
      detalhe: descreverObr(proximas, true),
      acao: "Ver obrigações",
      link: { to: "/obrigacoes" },
    });

  for (const m of (meiCabecalhos ?? [])
    .map((m) => ({ ...m, pct: pctDoLimite(m.faturamento, m.limite_anual) }))
    .filter((m) => faixaMei(m.pct).key !== "regular")
    .sort((a, b) => b.pct - a.pct))
    itens.push({
      id: `mei-${m.cliente_id}`,
      sev: m.pct > 100 ? "danger" : "warning",
      titulo: `${nome(m.cliente_id)}: ${formatarPct(m.pct)} do limite do MEI`,
      detalhe:
        m.pct > 100
          ? `Excedeu ${moeda(m.faturamento - m.limite_anual)}. Avaliar o desenquadramento.`
          : `Restam ${moeda(m.limite_anual - m.faturamento)} até dezembro.`,
      acao: "Ver cliente",
      link: { to: "/mei/$clienteId", params: { clienteId: m.cliente_id } },
    });

  const tarefas = data?.tarefas ?? [];
  if (tarefas.length) {
    const deAntes = tarefas.filter((t) => t.data_tarefa < hojeIso).length;
    itens.push({
      id: "tarefas",
      sev: "info",
      titulo: `${tarefas.length} ${tarefas.length > 1 ? "tarefas" : "tarefa"} de prioridade alta ${deAntes ? `(${deAntes} de dias anteriores)` : "para hoje"}`,
      detalhe: tarefas
        .slice(0, 2)
        .map((t) => t.titulo)
        .join(" · "),
      acao: "Ver tarefas",
      link: { to: "/tarefas" },
    });
  }

  const pend = data?.comunicacoes ?? [];
  if (pend.length)
    itens.push({
      id: "pendencias",
      sev: "info",
      titulo: `${pend.length} ${pend.length > 1 ? "pendências abertas" : "pendência aberta"} com clientes`,
      detalhe: [...new Set(pend.map((c) => nome(c.cliente_id)))].slice(0, 3).join(" · "),
      acao: "Ver comunicações",
      link: { to: "/comunicacoes" },
    });

  itens.sort((a, b) => ORDEM[a.sev] - ORDEM[b.sev]);

  return (
    <Card className="rounded-lg border-border shadow-card">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="size-[18px] text-muted-foreground" aria-hidden />
          Precisa de você hoje
        </CardTitle>
        {itens.length ? (
          <span className="nums text-[13px] text-muted-foreground">
            {itens.length} {itens.length > 1 ? "itens" : "item"}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="pb-3.5">
        {isLoading ? (
          <div className="space-y-2 py-1">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-4/5" />
          </div>
        ) : itens.length === 0 ? (
          <p className="flex items-center gap-2.5 py-3 text-sm text-success">
            <Check className="size-4 shrink-0" aria-hidden />
            Nada pendente por hoje. Bom trabalho!
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {itens.map((it, i) => (
              <li key={it.id} className="flex min-h-[60px] items-center gap-3.5 px-1 py-2.5">
                <span
                  aria-hidden
                  className={cn(
                    "w-1 self-stretch rounded-full",
                    it.sev === "danger" && "bg-destructive",
                    it.sev === "warning" && "bg-warning",
                    it.sev === "info" && "bg-accent-foreground",
                  )}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-semibold text-foreground">
                    <span className="sr-only">
                      {it.sev === "danger" ? "Urgente: " : it.sev === "warning" ? "Atenção: " : ""}
                    </span>
                    {it.titulo}
                  </span>
                  {it.detalhe ? (
                    <span className="text-[13px] leading-[18px] text-muted-foreground">
                      {it.detalhe}
                    </span>
                  ) : null}
                </div>
                <Button variant={i === 0 ? "default" : "outline"} size="sm" asChild>
                  {/* Destinos fixos desta lista; a tipagem por rota não cabe aqui. */}
                  <Link {...(it.link as unknown as React.ComponentProps<typeof Link>)}>
                    {it.acao}
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
