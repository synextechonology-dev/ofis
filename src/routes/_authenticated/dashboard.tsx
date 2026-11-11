import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  format,
  parseISO,
  subDays,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  subMonths,
  eachDayOfInterval,
  isWithinInterval,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  FileText,
  CalendarRange,
  CalendarDays,
  CheckCircle2,
  ArrowDown,
  ArrowUp,
  Trophy,
  TrendingUp,
  TrendingDown,
  PieChart as PieIcon,
} from "lucide-react";

import { supabase, type NotaFiscal, type StatusNota } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { TipoBadge } from "@/components/tipo-badge";
import { KpiCard, type KpiTrend } from "@/components/kpi-card";
import { EmptyState } from "@/components/empty-state";
import { DashboardAlertas } from "@/components/dashboard-alertas";
import { STATUS_COLOR, TIPOS, TIPO_META, percentual, rankingClientes } from "@/lib/nf";
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
        content: "Visão geral do volume e status das notas fiscais emitidas no dia, semana e mês.",
      },
      { property: "og:title", content: "Dashboard — Ofis" },
      {
        property: "og:description",
        content: "Volume e status das notas fiscais emitidas pelo setor fiscal.",
      },
    ],
  }),
  component: DashboardPage,
});

const iso = (d: Date) => format(d, "yyyy-MM-dd");

function tendencia(atual: number, anterior: number, sufixo: string): KpiTrend {
  if (anterior === 0) {
    return atual === 0
      ? { direction: "flat", label: `sem histórico ${sufixo}` }
      : { direction: "up", label: `novas notas ${sufixo}` };
  }
  const variacao = Math.round(((atual - anterior) / anterior) * 100);
  return {
    direction: variacao > 0 ? "up" : variacao < 0 ? "down" : "flat",
    label: `${variacao > 0 ? "+" : ""}${variacao}% ${sufixo}`,
  };
}

function DashboardPage() {
  const hoje = useMemo(() => new Date(), []);
  const [ordemData, setOrdemData] = useState<"asc" | "desc">("desc");
  const inicioMes = iso(startOfMonth(hoje));
  const desde = iso(startOfMonth(subMonths(hoje, 1)));

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-notas", desde],
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

  const { data: ultimas, isLoading: loadingUltimas } = useQuery({
    queryKey: ["ultimas-notas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("*")
        .order("criado_em", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as NotaFiscal[];
    },
  });

  const notas = data ?? [];
  const hojeIso = iso(hoje);
  const ontemIso = iso(subDays(hoje, 1));
  const semanaAtual = {
    start: startOfWeek(hoje, { weekStartsOn: 1 }),
    end: endOfWeek(hoje, { weekStartsOn: 1 }),
  };
  const semanaAnterior = {
    start: startOfWeek(subDays(hoje, 7), { weekStartsOn: 1 }),
    end: endOfWeek(subDays(hoje, 7), { weekStartsOn: 1 }),
  };
  const inicioMesAnterior = iso(startOfMonth(subMonths(hoje, 1)));

  const noIntervalo = (nota: NotaFiscal, intervalo: { start: Date; end: Date }) =>
    isWithinInterval(parseISO(nota.data_emissao), intervalo);

  const totalHoje = notas.filter((n) => n.data_emissao === hojeIso).length;
  const totalOntem = notas.filter((n) => n.data_emissao === ontemIso).length;
  const notasSemana = notas.filter((n) => noIntervalo(n, semanaAtual));
  const notasSemanaAnterior = notas.filter((n) => noIntervalo(n, semanaAnterior));
  const doMes = notas.filter((n) => n.data_emissao >= inicioMes);
  const doMesAnterior = notas.filter(
    (n) => n.data_emissao >= inicioMesAnterior && n.data_emissao < inicioMes,
  );
  const totalMes = doMes.length;
  const autorizadasMes = doMes.filter((n) => n.status === "autorizada").length;
  const pctAutorizadas = totalMes > 0 ? Math.round((autorizadasMes / totalMes) * 100) : 0;
  const pctAutorizadasAnterior =
    doMesAnterior.length > 0
      ? Math.round(
          (doMesAnterior.filter((n) => n.status === "autorizada").length / doMesAnterior.length) *
            100,
        )
      : 0;

  const barData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const dia = subDays(hoje, 6 - i);
      const key = iso(dia);
      const doDia = notas.filter((n) => n.data_emissao === key);
      return {
        dia: format(dia, "dd/MM", { locale: ptBR }),
        autorizada: doDia.filter((n) => n.status === "autorizada").length,
        cancelada: doDia.filter((n) => n.status === "cancelada").length,
        denegada: doDia.filter((n) => n.status === "denegada").length,
      };
    });
  }, [notas, hoje]);

  const pieData = (["autorizada", "cancelada", "denegada"] as StatusNota[])
    .map((status) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      status,
      value: doMes.filter((n) => n.status === status).length,
    }))
    .filter((d) => d.value > 0);

  const ranking = useMemo(() => rankingClientes(doMes).slice(0, 5), [doMes]);
  const maiorRanking = ranking[0]?.quantidade ?? 0;

  const distribuicaoTipo = TIPOS.map((tipo) => ({
    tipo,
    quantidade: doMes.filter((n) => n.tipo_emissao === tipo).length,
  }));

  const comparativoSemanas = useMemo(() => {
    const dias = eachDayOfInterval({ start: semanaAtual.start, end: semanaAtual.end });
    return dias.map((dia, index) => ({
      dia: format(dia, "EEEEEE", { locale: ptBR }),
      atual: notas.filter((n) => n.data_emissao === iso(dia)).length,
      anterior: notas.filter(
        (n) =>
          n.data_emissao ===
          iso(eachDayOfInterval({ start: semanaAnterior.start, end: semanaAnterior.end })[index]!),
      ).length,
    }));
  }, [notas, semanaAtual.start, semanaAtual.end, semanaAnterior.start, semanaAnterior.end]);

  const diffSemanas = notasSemana.length - notasSemanaAnterior.length;

  const ultimasOrdenadas = useMemo(() => {
    return [...(ultimas ?? [])].sort((a, b) =>
      ordemData === "desc"
        ? b.data_emissao.localeCompare(a.data_emissao)
        : a.data_emissao.localeCompare(b.data_emissao),
    );
  }, [ultimas, ordemData]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhamento das emissões de notas fiscais.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Notas hoje"
          value={totalHoje}
          icon={FileText}
          loading={isLoading}
          trend={tendencia(totalHoje, totalOntem, "vs ontem")}
        />
        <KpiCard
          label="Notas na semana"
          value={notasSemana.length}
          icon={CalendarRange}
          accent="warning"
          loading={isLoading}
          trend={tendencia(notasSemana.length, notasSemanaAnterior.length, "vs semana anterior")}
        />
        <KpiCard
          label="Notas no mês"
          value={totalMes}
          icon={CalendarDays}
          loading={isLoading}
          trend={tendencia(totalMes, doMesAnterior.length, "vs mês anterior")}
        />
        <KpiCard
          label="Autorizadas no mês"
          value={`${pctAutorizadas}%`}
          icon={CheckCircle2}
          accent="success"
          loading={isLoading}
          trend={{
            direction:
              pctAutorizadas > pctAutorizadasAnterior
                ? "up"
                : pctAutorizadas < pctAutorizadasAnterior
                  ? "down"
                  : "flat",
            label: `${pctAutorizadasAnterior}% no mês anterior`,
          }}
        />
      </section>

      <DashboardAlertas />

      <section className="grid gap-4 sm:grid-cols-3">
        {distribuicaoTipo.map(({ tipo, quantidade }) => {
          const meta = TIPO_META[tipo];
          return (
            <Card key={tipo} className="hover-lift rounded-lg border-border shadow-kpi">
              <CardContent className="flex items-center gap-3 py-4">
                <div
                  className={cn(
                    "flex size-10 items-center justify-center rounded-lg",
                    meta.softClass,
                  )}
                >
                  <meta.icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">{meta.label}</p>
                  {isLoading ? (
                    <Skeleton className="mt-1 h-6 w-20" />
                  ) : (
                    <p className="text-lg font-bold text-foreground">
                      {quantidade}{" "}
                      <span className="text-xs font-medium text-muted-foreground">
                        · {percentual(quantidade, totalMes)} do total
                      </span>
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <Card className="rounded-lg border-border shadow-card lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Notas por dia (últimos 7 dias)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="dia" tickLine={false} axisLine={false} fontSize={12} />
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
                  <Bar
                    dataKey="autorizada"
                    name="Autorizada"
                    stackId="s"
                    fill={STATUS_COLOR.autorizada}
                  />
                  <Bar
                    dataKey="cancelada"
                    name="Cancelada"
                    stackId="s"
                    fill={STATUS_COLOR.cancelada}
                  />
                  <Bar
                    dataKey="denegada"
                    name="Denegada"
                    stackId="s"
                    fill={STATUS_COLOR.denegada}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border shadow-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Status do mês</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : pieData.length === 0 ? (
              <EmptyState
                icon={PieIcon}
                title="Nenhuma nota registrada neste mês"
                description="Assim que as primeiras notas forem lançadas, a distribuição aparece aqui."
                className="h-full"
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLOR[entry.status]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-lg border-border shadow-card">
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <Trophy className="size-4 text-warning" />
            <CardTitle className="text-base">Clientes que mais emitiram (mês)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : ranking.length === 0 ? (
              <EmptyState
                icon={Trophy}
                title="Sem ranking por enquanto"
                description="Lance notas neste mês para descobrir os clientes mais ativos."
              />
            ) : (
              ranking.map((item, index) => (
                <div key={item.cliente} className="block-in space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-bold text-primary">
                        {index + 1}
                      </span>
                      <span className="truncate font-medium text-foreground">{item.cliente}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <TipoBadge tipo={item.tipoPrincipal} />
                      <span className="text-sm font-semibold text-foreground">
                        {item.quantidade}
                      </span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${maiorRanking ? (item.quantidade / maiorRanking) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border shadow-card">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Semana atual vs semana anterior</CardTitle>
            {isLoading ? (
              <Skeleton className="h-4 w-40" />
            ) : (
              <p
                className={cn(
                  "inline-flex items-center gap-1 text-sm font-medium",
                  diffSemanas > 0 && "text-success",
                  diffSemanas < 0 && "text-destructive",
                  diffSemanas === 0 && "text-muted-foreground",
                )}
              >
                {diffSemanas >= 0 ? (
                  <TrendingUp className="size-4" />
                ) : (
                  <TrendingDown className="size-4" />
                )}
                {notasSemana.length} nesta semana · {notasSemanaAnterior.length} na anterior
              </p>
            )}
          </CardHeader>
          <CardContent className="h-56">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={comparativoSemanas}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="dia" tickLine={false} axisLine={false} fontSize={12} />
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
                  <Line
                    type="monotone"
                    dataKey="anterior"
                    name="Semana anterior"
                    stroke="var(--chart-5)"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="atual"
                    name="Semana atual"
                    stroke={diffSemanas >= 0 ? "var(--success)" : "var(--destructive)"}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="rounded-lg border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Últimas 10 notas lançadas</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingUltimas ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (ultimas ?? []).length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nenhuma nota lançada ainda"
              description="Use a página “Lançar Nota” para registrar a primeira emissão."
            />
          ) : (
            <div className="max-h-[26rem] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número NF</TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => setOrdemData((o) => (o === "desc" ? "asc" : "desc"))}
                        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                      >
                        Data
                        {ordemData === "desc" ? (
                          <ArrowDown className="size-3.5" />
                        ) : (
                          <ArrowUp className="size-3.5" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ultimasOrdenadas.map((nota) => (
                    <TableRow key={nota.id}>
                      <TableCell className="font-medium">{nota.numero_nf}</TableCell>
                      <TableCell>
                        {format(parseISO(nota.data_emissao), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="max-w-[16rem] truncate">{nota.cliente}</TableCell>
                      <TableCell>
                        <StatusBadge status={nota.status} />
                      </TableCell>
                      <TableCell>
                        <TipoBadge tipo={nota.tipo_emissao} />
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
