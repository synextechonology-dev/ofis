import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  subMonths,
  subDays,
  eachDayOfInterval,
  eachWeekOfInterval,
  addDays,
  isSameMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, BarChart3, CalendarClock, FileDown, Trophy, UserX } from "lucide-react";

import { supabase, type NotaFiscal } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TipoBadge } from "@/components/tipo-badge";
import { EmptyState } from "@/components/empty-state";
import { gerarRelatorioMensalPdf } from "@/lib/relatorio-pdf";
import { TIPOS, TIPO_META, percentual, rankingClientes } from "@/lib/nf";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/analises")({
  head: () => ({
    meta: [
      { title: "Análises — Ofis" },
      {
        name: "description",
        content:
          "Insights das emissões: ranking de clientes, evolução mensal, taxa de cancelamento e dias mais movimentados.",
      },
      { property: "og:title", content: "Análises — Ofis" },
      {
        property: "og:description",
        content: "Ranking de clientes, evolução mensal e padrões de emissão de notas fiscais.",
      },
    ],
  }),
  component: AnalisesPage,
});

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

type Periodo = "mes" | "trimestre" | "personalizado";

function AnalisesPage() {
  const hoje = useMemo(() => new Date(), []);
  const desde = iso(startOfMonth(subMonths(hoje, 5)));

  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [inicioCustom, setInicioCustom] = useState(() => iso(startOfMonth(hoje)));
  const [fimCustom, setFimCustom] = useState(() => iso(hoje));

  const { data, isLoading } = useQuery({
    queryKey: ["analises-notas", desde],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("*")
        .gte("data_emissao", desde)
        .order("data_emissao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NotaFiscal[];
    },
  });

  const notas = data ?? [];

  const intervaloRanking = useMemo(() => {
    if (periodo === "mes") return { inicio: iso(startOfMonth(hoje)), fim: iso(hoje) };
    if (periodo === "trimestre")
      return { inicio: iso(startOfMonth(subMonths(hoje, 2))), fim: iso(hoje) };
    return { inicio: inicioCustom, fim: fimCustom };
  }, [periodo, hoje, inicioCustom, fimCustom]);

  const notasRanking = notas.filter(
    (n) => n.data_emissao >= intervaloRanking.inicio && n.data_emissao <= intervaloRanking.fim,
  );
  const ranking = useMemo(() => rankingClientes(notasRanking), [notasRanking]);
  const totalRanking = notasRanking.length;

  // Bloco 2 — evolução mensal por tipo (últimos 6 meses)
  const evolucaoMensal = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const mes = subMonths(hoje, 5 - i);
      const inicio = iso(startOfMonth(mes));
      const fim = iso(endOfMonth(mes));
      const doMes = notas.filter((n) => n.data_emissao >= inicio && n.data_emissao <= fim);
      return {
        mes: format(mes, "MMM/yy", { locale: ptBR }),
        comercio: doMes.filter((n) => n.tipo_emissao === "comercio").length,
        servico: doMes.filter((n) => n.tipo_emissao === "servico").length,
        rural: doMes.filter((n) => n.tipo_emissao === "rural").length,
      };
    });
  }, [notas, hoje]);

  // Bloco 3 — taxa de não autorizadas
  const taxaMensal = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const mes = subMonths(hoje, 5 - i);
      const inicio = iso(startOfMonth(mes));
      const fim = iso(endOfMonth(mes));
      const doMes = notas.filter((n) => n.data_emissao >= inicio && n.data_emissao <= fim);
      const naoAutorizadas = doMes.filter((n) => n.status !== "autorizada").length;
      return {
        mes: format(mes, "MMM/yy", { locale: ptBR }),
        taxa: doMes.length ? Number(((naoAutorizadas / doMes.length) * 100).toFixed(1)) : 0,
      };
    });
  }, [notas, hoje]);

  const taxaAtual = taxaMensal[taxaMensal.length - 1]?.taxa ?? 0;
  const alerta = taxaAtual > 5;

  // Bloco 4 — heatmap semanal do mês atual
  const heatmap = useMemo(() => {
    const inicioMes = startOfMonth(hoje);
    const fimMes = endOfMonth(hoje);
    const semanas = eachWeekOfInterval(
      { start: inicioMes, end: fimMes },
      { weekStartsOn: 1 },
    );
    const grade = semanas.map((inicioSemana, index) => ({
      semana: `S${index + 1}`,
      dias: eachDayOfInterval({
        start: inicioSemana,
        end: endOfWeek(inicioSemana, { weekStartsOn: 1 }),
      }).map((dia) => ({
        data: dia,
        doMes: isSameMonth(dia, hoje),
        quantidade: notas.filter((n) => n.data_emissao === iso(dia)).length,
      })),
    }));
    const max = Math.max(
      1,
      ...grade.flatMap((s) => s.dias.filter((d) => d.doMes).map((d) => d.quantidade)),
    );
    return { grade, max };
  }, [notas, hoje]);

  const totalPorDiaSemana = useMemo(() => {
    const contagem = Array.from({ length: 7 }, () => 0);
    const inicioMes = iso(startOfMonth(hoje));
    for (const nota of notas) {
      if (nota.data_emissao < inicioMes) continue;
      const dia = parseISO(nota.data_emissao).getDay();
      const index = (dia + 6) % 7;
      contagem[index] = (contagem[index] ?? 0) + 1;
    }
    const maxIndex = contagem.indexOf(Math.max(...contagem));
    return { contagem, maxIndex, total: contagem.reduce((a, b) => a + b, 0) };
  }, [notas, hoje]);

  // Bloco 5 — clientes sem emissão nos últimos 7 dias
  const inativos = useMemo(() => {
    const limite = iso(subDays(hoje, 7));
    const porCliente = new Map<
      string,
      { nome: string; ultima: string; tipo: NotaFiscal["tipo_emissao"] }
    >();
    for (const nota of notas) {
      const chave = nota.cliente_id ?? (nota.cliente?.trim() || "—");
      const atual = porCliente.get(chave);
      if (!atual || nota.data_emissao > atual.ultima) {
        porCliente.set(chave, {
          nome: nota.cliente?.trim() || "—",
          ultima: nota.data_emissao,
          tipo: nota.tipo_emissao,
        });
      }
    }
    return [...porCliente.values()]
      .filter((info) => info.ultima < limite)
      .sort((a, b) => b.ultima.localeCompare(a.ultima))
      .map((info) => ({ cliente: info.nome, ultima: info.ultima, tipo: info.tipo }));
  }, [notas, hoje]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Análises</h1>
          <p className="text-sm text-muted-foreground">
            Insights sobre volume, clientes e padrões de emissão das notas fiscais.
          </p>
        </div>
        <Button
          variant="outline"
          className="shrink-0 gap-2"
          onClick={() => gerarRelatorioMensalPdf(notas, new Date())}
          disabled={isLoading || notas.length === 0}
        >
          <FileDown className="size-4" />
          Exportar Relatório PDF
        </Button>
      </header>

      {/* Bloco 1 — Ranking completo de clientes */}
      <Card className="rounded-lg border-border shadow-card">
        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="size-4 text-warning" />
            <CardTitle className="text-base">Ranking de clientes</CardTitle>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="periodo">Período</Label>
              <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
                <SelectTrigger id="periodo" className="min-w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mes">Mês atual</SelectItem>
                  <SelectItem value="trimestre">Últimos 3 meses</SelectItem>
                  <SelectItem value="personalizado">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {periodo === "personalizado" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ranking-inicio">Início</Label>
                  <Input
                    id="ranking-inicio"
                    type="date"
                    value={inicioCustom}
                    onChange={(e) => setInicioCustom(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ranking-fim">Fim</Label>
                  <Input
                    id="ranking-fim"
                    type="date"
                    value={fimCustom}
                    onChange={(e) => setFimCustom(e.target.value)}
                  />
                </div>
              </>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : ranking.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title="Nenhuma nota no período selecionado"
              description="Ajuste o período ou lance novas notas para gerar o ranking."
            />
          ) : (
            <div className="max-h-[30rem] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Posição</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo de Emissão</TableHead>
                    <TableHead className="text-right">Qtd Notas</TableHead>
                    <TableHead className="text-right">% do Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranking.map((item, index) => (
                    <TableRow key={item.cliente}>
                      <TableCell className="font-semibold text-muted-foreground">
                        {index + 1}º
                      </TableCell>
                      <TableCell className="max-w-[18rem] truncate font-medium">
                        {item.cliente}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {item.tipos.map((tipo) => (
                            <TipoBadge key={tipo} tipo={tipo} />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{item.quantidade}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {percentual(item.quantidade, totalRanking)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bloco 2 — Evolução mensal */}
      <Card className="rounded-lg border-border shadow-card">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <BarChart3 className="size-4 text-primary" />
          <CardTitle className="text-base">Evolução mensal por tipo (6 meses)</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={evolucaoMensal} barGap={4}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {TIPOS.map((tipo) => (
                  <Bar
                    key={tipo}
                    dataKey={tipo}
                    name={TIPO_META[tipo].label}
                    fill={TIPO_META[tipo].color}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Bloco 3 — Taxa de cancelamento/denegamento */}
      <section className="grid gap-4 lg:grid-cols-5">
        <Card
          className={cn(
            "hover-lift rounded-lg shadow-kpi lg:col-span-2",
            alerta ? "border-2 border-destructive" : "border border-border",
          )}
        >
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <AlertTriangle className={cn("size-4", alerta ? "text-destructive" : "text-warning")} />
            <CardTitle className="text-base">Taxa de não autorizadas (mês)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <Skeleton className="h-12 w-24" />
            ) : (
              <>
                <p
                  className={cn(
                    "text-4xl font-bold",
                    alerta ? "text-destructive" : "text-foreground",
                  )}
                >
                  {taxaAtual}%
                </p>
                <p className="text-sm text-muted-foreground">
                  Notas canceladas ou denegadas sobre o total emitido no mês atual.
                </p>
                {alerta ? (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                    Atenção: taxa acima de 5%. Revise os processos de emissão.
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border shadow-card lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Histórico da taxa (6 meses)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={taxaMensal}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    formatter={(v) => [`${v}%`, "Taxa"]}
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="taxa"
                    name="Taxa"
                    stroke="var(--destructive)"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Bloco 4 — Dias mais movimentados */}
      <Card className="rounded-lg border-border shadow-card">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <CalendarClock className="size-4 text-primary" />
          <CardTitle className="text-base">
            Dias mais movimentados — {format(hoje, "MMMM 'de' yyyy", { locale: ptBR })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <div className="min-w-[26rem] space-y-1.5">
                  <div className="grid grid-cols-8 gap-1.5 text-xs font-medium text-muted-foreground">
                    <span />
                    {DIAS_SEMANA.map((dia) => (
                      <span key={dia} className="text-center">
                        {dia}
                      </span>
                    ))}
                  </div>
                  {heatmap.grade.map((semana) => (
                    <div key={semana.semana} className="grid grid-cols-8 items-center gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        {semana.semana}
                      </span>
                      {semana.dias.map((dia) => {
                        const intensidade = dia.doMes ? dia.quantidade / heatmap.max : 0;
                        return (
                          <div
                            key={dia.data.toISOString()}
                            title={`${format(dia.data, "dd/MM/yyyy")} — ${dia.quantidade} nota(s)`}
                            className={cn(
                              "flex h-10 items-center justify-center rounded-md text-xs font-semibold transition-colors",
                              dia.doMes
                                ? intensidade > 0.6
                                  ? "text-primary-foreground"
                                  : "text-foreground"
                                : "text-muted-foreground/40",
                            )}
                            style={{
                              backgroundColor: dia.doMes
                                ? `color-mix(in oklab, var(--primary) ${Math.round(intensidade * 100)}%, var(--secondary))`
                                : "transparent",
                            }}
                          >
                            {dia.doMes ? format(dia.data, "d") : ""}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {totalPorDiaSemana.total > 0 ? (
                  <>
                    Dia da semana com maior volume:{" "}
                    <span className="font-semibold text-foreground">
                      {DIAS_SEMANA[totalPorDiaSemana.maxIndex]}
                    </span>{" "}
                    ({totalPorDiaSemana.contagem[totalPorDiaSemana.maxIndex]} notas no mês).
                  </>
                ) : (
                  "Nenhuma nota registrada neste mês."
                )}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Bloco 5 — Clientes sem emissão recente */}
      <Card className="rounded-lg border-border shadow-card">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <UserX className="size-4 text-destructive" />
          <CardTitle className="text-base">Clientes sem emissão nos últimos 7 dias</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : inativos.length === 0 ? (
            <EmptyState
              icon={UserX}
              title="Todos os clientes emitiram recentemente"
              description="Nenhum cliente ficou mais de 7 dias sem emissão de notas."
            />
          ) : (
            <div className="max-h-[24rem] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Última emissão</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inativos.map((item) => (
                    <TableRow key={item.cliente}>
                      <TableCell className="max-w-[18rem] truncate font-medium">
                        {item.cliente}
                      </TableCell>
                      <TableCell>
                        {format(parseISO(item.ultima), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <TipoBadge tipo={item.tipo} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge className="rounded-md border-transparent bg-destructive font-medium text-destructive-foreground">
                          Inativo
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
