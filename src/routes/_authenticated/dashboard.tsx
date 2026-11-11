import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, subDays, subMonths, getDaysInMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart3, FilePlus2, FileText, PieChart, Trophy } from "lucide-react";

import { supabase, type NotaFiscal, type StatusNota } from "@/lib/supabase";
import { MESES_CURTOS, formatarPct } from "@/lib/mei";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { TipoBadge } from "@/components/tipo-badge";
import { KpiCard, type KpiTrend } from "@/components/kpi-card";
import { EmptyState } from "@/components/empty-state";
import { FilaDoDia } from "@/components/fila-do-dia";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Ofis" },
      {
        name: "description",
        content: "O que precisa de você hoje e o volume de notas do dia, da semana e do mês.",
      },
    ],
  }),
  component: DashboardPage,
});

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Variação em % entre dois totais, no formato da pílula ("+12%", "−4%"). */
function variacao(atual: number, anterior: number): KpiTrend {
  if (anterior === 0)
    return { direction: atual > 0 ? "up" : "flat", label: atual > 0 ? "novo" : "0%" };
  const v = Math.round(((atual - anterior) / anterior) * 100);
  return {
    direction: v > 0 ? "up" : v < 0 ? "down" : "flat",
    label: `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}%`,
  };
}

function DashboardPage() {
  const hoje = useMemo(() => new Date(), []);
  const [periodo, setPeriodo] = useState<"7" | "12">("7");
  const desde = iso(startOfMonth(subMonths(hoje, 11)));

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-notas", desde],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("id, numero_nf, data_emissao, cliente, cliente_id, status, tipo_emissao, criado_em")
        .gte("data_emissao", desde)
        .order("data_emissao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NotaFiscal[];
    },
  });

  const { data: ultimas, isLoading: carregandoUltimas } = useQuery({
    queryKey: ["ultimas-notas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("*")
        .order("criado_em", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as NotaFiscal[];
    },
  });

  const notas = useMemo(() => data ?? [], [data]);
  const hojeIso = iso(hoje);
  const ontemIso = iso(subDays(hoje, 1));
  const inicioMes = iso(startOfMonth(hoje));
  const mesAnterior = startOfMonth(subMonths(hoje, 1));
  const inicioMesAnterior = iso(mesAnterior);
  // Mesmo pedaço do mês anterior (dia 1 até o dia de hoje), para comparar de forma justa.
  const fimComparavel = iso(
    new Date(
      mesAnterior.getFullYear(),
      mesAnterior.getMonth(),
      Math.min(hoje.getDate(), getDaysInMonth(mesAnterior)),
    ),
  );
  const sete = iso(subDays(hoje, 6));
  const quatorze = iso(subDays(hoje, 13));

  const k = useMemo(() => {
    const doDia = (d: string) => notas.filter((n) => n.data_emissao === d);
    const entre = (a: string, b: string) =>
      notas.filter((n) => n.data_emissao >= a && n.data_emissao <= b);
    const mes = notas.filter((n) => n.data_emissao >= inicioMes);
    const mesAnt = notas.filter(
      (n) => n.data_emissao >= inicioMesAnterior && n.data_emissao < inicioMes,
    );
    const pct = (l: NotaFiscal[]) =>
      l.length ? (l.filter((n) => n.status === "autorizada").length / l.length) * 100 : 0;
    return {
      hoje: doDia(hojeIso),
      ontem: doDia(ontemIso).length,
      semana: entre(sete, hojeIso).length,
      semanaAnt: entre(quatorze, iso(subDays(hoje, 7))).length,
      mes,
      mesComparavel: entre(inicioMesAnterior, fimComparavel).length,
      pctMes: pct(mes),
      pctMesAnt: pct(mesAnt),
      temMesAnt: mesAnt.length > 0,
    };
  }, [notas, hoje, hojeIso, ontemIso, inicioMes, inicioMesAnterior, fimComparavel, sete, quatorze]);

  const difPp = k.pctMes - k.pctMesAnt;
  const nomeMesAnt = format(mesAnterior, "MMMM", { locale: ptBR });

  const serie = useMemo(() => {
    if (periodo === "7")
      return Array.from({ length: 7 }, (_, i) => {
        const d = subDays(hoje, 6 - i);
        return {
          rotulo: i === 6 ? "Hoje" : DIAS_CURTOS[d.getDay()]!,
          valor: notas.filter((n) => n.data_emissao === iso(d)).length,
        };
      });
    return Array.from({ length: 12 }, (_, i) => {
      const d = subMonths(hoje, 11 - i);
      const chave = format(d, "yyyy-MM");
      return {
        rotulo: `${MESES_CURTOS[d.getMonth()]}${i === 11 ? "*" : ""}`,
        valor: notas.filter((n) => n.data_emissao.startsWith(chave)).length,
      };
    });
  }, [periodo, notas, hoje]);

  const statusMes = (["autorizada", "cancelada", "denegada"] as StatusNota[]).map((s) => ({
    status: s,
    n: k.mes.filter((x) => x.status === s).length,
  }));

  const ranking = useMemo(() => {
    const limite = iso(subDays(hoje, 29));
    const mapa = new Map<string, { nome: string; n: number }>();
    for (const n of notas) {
      if (n.data_emissao < limite) continue;
      const chave = n.cliente_id ?? n.cliente;
      const atual = mapa.get(chave) ?? { nome: n.cliente, n: 0 };
      atual.n += 1;
      mapa.set(chave, atual);
    }
    return [...mapa.values()].sort((a, b) => b.n - a.n).slice(0, 5);
  }, [notas, hoje]);

  const dataExtenso = format(hoje, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {dataExtenso.charAt(0).toUpperCase() + dataExtenso.slice(1)} · Acompanhamento das
            emissões de notas fiscais
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/lancar-nota">
            <FilePlus2 />
            Lançar nota
          </Link>
        </Button>
      </header>

      <FilaDoDia notasHoje={k.hoje} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Notas hoje"
          value={k.hoje.length}
          loading={isLoading}
          trend={variacao(k.hoje.length, k.ontem)}
          referencia={`vs ontem (${k.ontem})`}
        />
        <KpiCard
          label="Notas em 7 dias"
          value={k.semana}
          loading={isLoading}
          trend={variacao(k.semana, k.semanaAnt)}
          referencia={`vs 7 dias anteriores (${k.semanaAnt})`}
        />
        <KpiCard
          label="Notas no mês"
          value={k.mes.length}
          loading={isLoading}
          trend={variacao(k.mes.length, k.mesComparavel)}
          referencia={`vs mesmo período de ${nomeMesAnt} (${k.mesComparavel})`}
        />
        <KpiCard
          label="Autorizadas no mês"
          value={k.mes.length ? formatarPct(k.pctMes, 1) : "—"}
          loading={isLoading}
          {...(k.temMesAnt && k.mes.length
            ? {
                trend: {
                  direction: difPp > 0.05 ? "up" : difPp < -0.05 ? "down" : "flat",
                  label: `${difPp >= 0 ? "+" : "−"}${Math.abs(difPp).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} p.p.`,
                } satisfies KpiTrend,
                referencia: `${formatarPct(k.pctMesAnt, 1)} em ${nomeMesAnt}`,
              }
            : {})}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-12">
        <Card className="rounded-lg border-border shadow-card lg:col-span-8">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="size-[18px] text-muted-foreground" aria-hidden />
              Notas por dia
            </CardTitle>
            <div
              className="inline-flex rounded-md border border-border p-0.5"
              role="group"
              aria-label="Período do gráfico"
            >
              {(
                [
                  ["7", "7 dias"],
                  ["12", "12 meses"],
                ] as const
              ).map(([v, r]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={periodo === v}
                  onClick={() => setPeriodo(v)}
                  className="h-7 rounded-[6px] px-3 text-sm text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-secondary aria-pressed:text-foreground"
                >
                  {r}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <>
                <GraficoBarras serie={serie} />
                {periodo === "12" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    * {format(hoje, "MMMM", { locale: ptBR })} até hoje.
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border shadow-card lg:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieChart className="size-[18px] text-muted-foreground" aria-hidden />
              Status do mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <>
                <div className="flex flex-col gap-5">
                  {statusMes.map(({ status, n }) => (
                    <div key={status} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <StatusBadge status={status} />
                        <span className="nums font-semibold text-foreground">{n}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            status === "autorizada" && "bg-success",
                            status === "cancelada" && "bg-destructive",
                            status === "denegada" && "bg-warning",
                          )}
                          style={{
                            width: `${n ? Math.max((n / Math.max(1, k.mes.length)) * 100, 1.5) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-[13px] leading-[18px] text-muted-foreground">
                  <span className="nums">{k.mes.length}</span>{" "}
                  {k.mes.length === 1 ? "nota emitida" : "notas emitidas"} em{" "}
                  {format(hoje, "MMMM", { locale: ptBR })}, até hoje
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-12">
        <Card className="rounded-lg border-border shadow-card lg:col-span-8">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="size-[18px] text-muted-foreground" aria-hidden />
              Últimas notas lançadas
            </CardTitle>
            <Link
              to="/historico"
              className="text-sm font-medium text-accent-foreground underline-offset-4 hover:underline"
            >
              Ver todas
            </Link>
          </CardHeader>
          <CardContent>
            {carregandoUltimas ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (ultimas ?? []).length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Nenhuma nota lançada ainda"
                description="Use “Lançar nota” para registrar a primeira emissão."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nº</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Emissão</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(ultimas ?? []).map((n) => (
                      <TableRow key={n.id}>
                        <TableCell className="font-mono text-sm">{n.numero_nf}</TableCell>
                        <TableCell className="max-w-[16rem] truncate font-medium text-foreground">
                          {n.cliente}
                        </TableCell>
                        <TableCell className="nums text-muted-foreground">
                          {format(new Date(`${n.data_emissao}T12:00:00`), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell>
                          <TipoBadge tipo={n.tipo_emissao} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={n.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border shadow-card lg:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="size-[18px] text-muted-foreground" aria-hidden />
              Clientes que mais emitiram
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma nota nos últimos 30 dias.</p>
            ) : (
              <>
                <ol className="divide-y divide-border">
                  {ranking.map((r, i) => (
                    <li key={r.nome} className="flex items-center gap-3 py-2.5">
                      <span className="nums w-5 text-[13px] text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-foreground">{r.nome}</span>
                      <span className="nums text-muted-foreground">
                        {r.n} {r.n === 1 ? "nota" : "notas"}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-xs text-muted-foreground">Últimos 30 dias.</p>
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/** Barras neutras; a última (hoje / mês atual) em destaque com a cor de marca. */
function GraficoBarras({ serie }: { serie: { rotulo: string; valor: number }[] }) {
  const W = 700;
  const H = 170;
  const x0 = 44;
  const n = serie.length;
  const passo = (W - x0 - 8) / n;
  const larg = Math.min(56, passo * 0.62);
  const max = Math.max(4, ...serie.map((s) => s.valor)) * 1.18;
  const y = (v: number) => 16 + H - (v / max) * H;
  const bruto = max / 4;
  const ordem = 10 ** Math.floor(Math.log10(bruto));
  const degrau = Math.max(1, Math.ceil(bruto / ordem) * ordem);
  const linhas: number[] = [];
  for (let v = 0; v <= max; v += degrau) linhas.push(v);

  return (
    <svg
      viewBox={`0 0 ${W} 220`}
      className="h-auto w-full"
      role="img"
      aria-label="Notas por período"
    >
      {linhas.map((v) => (
        <g key={v}>
          <line
            x1={x0 - 6}
            x2={W - 8}
            y1={y(v)}
            y2={y(v)}
            className="stroke-border"
            strokeWidth={1}
          />
          <text
            x={x0 - 14}
            y={y(v) + 4}
            textAnchor="end"
            className="nums fill-muted-foreground text-[12px]"
          >
            {v}
          </text>
        </g>
      ))}
      {serie.map((s, i) => {
        const x = x0 + i * passo + (passo - larg) / 2;
        const atual = i === n - 1;
        return (
          <g key={s.rotulo + i}>
            {s.valor > 0 ? (
              <rect
                x={x}
                y={y(s.valor)}
                width={larg}
                height={16 + H - y(s.valor)}
                rx={8}
                className={atual ? "fill-primary" : "fill-chart-5"}
              >
                <title>
                  {s.rotulo}: {s.valor} {s.valor === 1 ? "nota" : "notas"}
                </title>
              </rect>
            ) : null}
            {s.valor > 0 ? (
              <text
                x={x + larg / 2}
                y={y(s.valor) - 6}
                textAnchor="middle"
                className={cn(
                  "nums text-[12px]",
                  atual ? "fill-foreground font-semibold" : "fill-muted-foreground",
                )}
              >
                {s.valor}
              </text>
            ) : null}
            <text
              x={x + larg / 2}
              y={16 + H + 24}
              textAnchor="middle"
              className={cn(
                "text-[12px]",
                atual ? "fill-foreground font-medium" : "fill-muted-foreground",
              )}
            >
              {s.rotulo}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
