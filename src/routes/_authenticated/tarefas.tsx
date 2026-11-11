import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  subDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronDown,
  CircleDashed,
  Timer,
  CheckCircle2,
  Gauge,
  ClipboardList,
  Lightbulb,
  Plus,
  Trophy,
  AlertTriangle,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  CATEGORIAS,
  CATEGORIA_META,
  PRIORIDADES,
  PRIORIDADE_META,
  categoriaMaisPendente,
  faixaTaxa,
  isAlta,
  taxaConclusao,
  type CategoriaTarefa,
  type PrioridadeTarefa,
  type Tarefa,
} from "@/lib/tarefas";
import { KpiCard } from "@/components/kpi-card";
import { EmptyState } from "@/components/empty-state";
import {
  CategoriaBadge,
  PrioridadeBadge,
  StatusTarefaBadge,
  TarefaItem,
} from "@/components/tarefa-item";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export const Route = createFileRoute("/_authenticated/tarefas")({
  head: () => ({
    meta: [
      { title: "Tarefas do Dia — Ofis" },
      {
        name: "description",
        content:
          "Organize e acompanhe as tarefas do setor fiscal por prioridade, categoria e status.",
      },
      { property: "og:title", content: "Tarefas do Dia — Ofis" },
      {
        property: "og:description",
        content: "Checklist diário do setor fiscal com progresso, insights e histórico.",
      },
    ],
  }),
  component: TarefasPage,
});

const HOJE_KEY = "tarefas";

function Secao({
  titulo,
  contagem,
  children,
  defaultOpen = true,
}: {
  titulo: string;
  contagem: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-1 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/60">
        <span>
          {titulo} <span className="text-muted-foreground">({contagem})</span>
        </span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function TarefasPage() {
  const queryClient = useQueryClient();
  const [aba, setAba] = useState<"hoje" | "semana" | "mes">("hoje");
  const hoje = format(new Date(), "yyyy-MM-dd");
  const inicioSemana = format(subDays(new Date(), 6), "yyyy-MM-dd");
  const inicioMes = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const fimMes = format(endOfMonth(new Date()), "yyyy-MM-dd");

  const [titulo, setTitulo] = useState("");
  const [prioridade, setPrioridade] = useState<PrioridadeTarefa>("normal");
  const [categoria, setCategoria] = useState<CategoriaTarefa>("geral");

  const listaQuery = (chave: string, de: string, ate: string) => ({
    queryKey: [HOJE_KEY, chave, de, ate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("*")
        .gte("data_tarefa", de)
        .lte("data_tarefa", ate)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tarefa[];
    },
  });

  const hojeQuery = useQuery(listaQuery("hoje", hoje, hoje));
  const semanaQuery = useQuery({
    ...listaQuery("semana", inicioSemana, hoje),
    enabled: aba === "semana",
  });
  const mesQuery = useQuery({ ...listaQuery("mes", inicioMes, fimMes), enabled: aba === "mes" });

  useEffect(() => {
    const channel = supabase
      .channel("tarefas-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tarefas" }, () => {
        queryClient.invalidateQueries({ queryKey: [HOJE_KEY] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const tarefasHoje = hojeQuery.data ?? [];
  const pendentes = tarefasHoje.filter((t) => t.status === "pendente");
  const andamento = tarefasHoje.filter((t) => t.status === "em_andamento");
  const concluidas = tarefasHoje.filter((t) => t.status === "concluida");
  const taxa = taxaConclusao(tarefasHoje);
  const faixa = faixaTaxa(taxa);

  const criar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tarefas").insert({
        titulo: titulo.trim(),
        prioridade,
        categoria,
        data_tarefa: hoje,
        status: "pendente",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa adicionada.");
      setTitulo("");
      setPrioridade("normal");
      setCategoria("geral");
      queryClient.invalidateQueries({ queryKey: [HOJE_KEY] });
    },
    onError: () => toast.error("Não foi possível adicionar a tarefa."),
  });

  async function atualizarStatus(tarefa: Tarefa, status: Tarefa["status"]) {
    const { error } = await supabase.from("tarefas").update({ status }).eq("id", tarefa.id);
    if (error) {
      toast.error("Não foi possível atualizar a tarefa.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: [HOJE_KEY] });
  }

  async function excluir(tarefa: Tarefa) {
    const { error } = await supabase.from("tarefas").delete().eq("id", tarefa.id);
    if (error) {
      toast.error("Não foi possível excluir a tarefa.");
      return;
    }
    toast.success("Tarefa excluída.");
    queryClient.invalidateQueries({ queryKey: [HOJE_KEY] });
  }

  const insights = useMemo(() => {
    const lista: { icon: typeof Lightbulb; texto: string; tone: string }[] = [];
    const urgentes = tarefasHoje.filter(
      (t) => t.prioridade === "urgente" && t.status !== "concluida",
    );
    if (urgentes.length) {
      lista.push({
        icon: AlertTriangle,
        tone: "bg-destructive/10 text-destructive",
        texto: `Você tem ${urgentes.length} tarefa${urgentes.length > 1 ? "s" : ""} urgente${urgentes.length > 1 ? "s" : ""}! Priorize-as antes das demais.`,
      });
    }
    if (new Date().getHours() >= 14 && taxa < 50 && tarefasHoje.length > 0) {
      lista.push({
        icon: Gauge,
        tone: "bg-warning/10 text-warning",
        texto: "Metade do dia passou. Acelere o ritmo para bater a meta!",
      });
    }
    if (tarefasHoje.length > 0 && taxa >= 100) {
      lista.push({
        icon: Trophy,
        tone: "bg-success/10 text-success",
        texto: "🎉 Todas as tarefas concluídas! Ótimo dia de trabalho.",
      });
    }
    const cat = categoriaMaisPendente(tarefasHoje);
    if (cat) {
      lista.push({
        icon: Lightbulb,
        tone: "bg-primary/10 text-primary",
        texto: `A categoria ${CATEGORIA_META[cat].label} tem mais tarefas abertas hoje.`,
      });
    }
    return lista;
  }, [tarefasHoje, taxa]);

  const semana = semanaQuery.data ?? [];
  const diasSemana = eachDayOfInterval({ start: subDays(new Date(), 6), end: new Date() });
  const graficoSemana = diasSemana.map((dia) => {
    const chave = format(dia, "yyyy-MM-dd");
    const doDia = semana.filter((t) => t.data_tarefa === chave);
    return {
      dia: format(dia, "EEE dd", { locale: ptBR }),
      concluidas: doDia.filter((t) => t.status === "concluida").length,
    };
  });

  const mes = mesQuery.data ?? [];
  const totalMes = mes.length;
  const concluidasMes = mes.filter((t) => t.status === "concluida").length;
  const diasMes = [...new Set(mes.map((t) => t.data_tarefa))];
  const taxaMedia = diasMes.length
    ? Math.round(
        diasMes.reduce((acc, d) => acc + taxaConclusao(mes.filter((t) => t.data_tarefa === d)), 0) /
          diasMes.length,
      )
    : 0;
  const diaMaisProdutivo = diasMes
    .map((d) => ({
      dia: d,
      qtd: mes.filter((t) => t.data_tarefa === d && t.status === "concluida").length,
    }))
    .sort((a, b) => b.qtd - a.qtd)[0];

  const semanasMes = useMemo(() => {
    const inicio = startOfMonth(new Date());
    const fim = endOfMonth(new Date());
    const blocos: { semana: string; concluidas: number; pendentes: number }[] = [];
    let cursor = inicio;
    let i = 1;
    while (cursor <= fim) {
      const fimBloco = addDays(cursor, 6);
      const de = format(cursor, "yyyy-MM-dd");
      const ate = format(fimBloco > fim ? fim : fimBloco, "yyyy-MM-dd");
      const doBloco = mes.filter((t) => t.data_tarefa >= de && t.data_tarefa <= ate);
      blocos.push({
        semana: `Sem ${i}`,
        concluidas: doBloco.filter((t) => t.status === "concluida").length,
        pendentes: doBloco.filter((t) => t.status !== "concluida").length,
      });
      cursor = addDays(cursor, 7);
      i += 1;
    }
    return blocos;
  }, [mes]);

  const rankingCategorias = CATEGORIAS.map((c) => ({
    categoria: c,
    qtd: mes.filter((t) => t.categoria === c && t.status === "concluida").length,
  })).sort((a, b) => b.qtd - a.qtd);

  const diasComTarefa = [...new Set(semana.map((t) => t.data_tarefa))].sort((a, b) =>
    b.localeCompare(a),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tarefas do Dia</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
        <Tabs value={aba} onValueChange={(v) => setAba(v as typeof aba)}>
          <TabsList>
            <TabsTrigger value="hoje">Hoje</TabsTrigger>
            <TabsTrigger value="semana">Semana</TabsTrigger>
            <TabsTrigger value="mes">Mês</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Pendentes hoje"
          value={pendentes.length}
          icon={CircleDashed}
          accent="warning"
          loading={hojeQuery.isLoading}
        />
        <KpiCard
          label="Em andamento"
          value={andamento.length}
          icon={Timer}
          accent="primary"
          loading={hojeQuery.isLoading}
        />
        <KpiCard
          label="Concluídas hoje"
          value={concluidas.length}
          icon={CheckCircle2}
          accent="success"
          loading={hojeQuery.isLoading}
        />
        <KpiCard
          label="Taxa de conclusão"
          value={`${taxa}%`}
          icon={Gauge}
          accent={taxa >= 70 ? "success" : taxa >= 40 ? "warning" : "destructive"}
          loading={hojeQuery.isLoading}
          trend={{
            direction: taxa >= 70 ? "up" : taxa >= 40 ? "flat" : "down",
            label: `${concluidas.length} de ${tarefasHoje.length} tarefas`,
          }}
        />
      </div>

      <Card className="rounded-lg border-border shadow-card">
        <CardContent className="space-y-2 py-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">Progresso do dia</span>
            <span className={cn("font-semibold", faixa.text)}>{taxa}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn("h-full rounded-full transition-all duration-500", faixa.bg)}
              style={{ width: `${taxa}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {concluidas.length} de {tarefasHoje.length} tarefas concluídas hoje
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card className="rounded-lg border-border shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Nova tarefa</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem_9rem_auto] md:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!titulo.trim()) {
                    toast.error("Informe o título da tarefa.");
                    return;
                  }
                  criar.mutate();
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="titulo">Título</Label>
                  <Input
                    id="titulo"
                    placeholder="Nova tarefa..."
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Prioridade</Label>
                  <Select
                    value={prioridade}
                    onValueChange={(v) => setPrioridade(v as PrioridadeTarefa)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORIDADES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {PRIORIDADE_META[p].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Categoria</Label>
                  <Select
                    value={categoria}
                    onValueChange={(v) => setCategoria(v as CategoriaTarefa)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIAS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORIA_META[c].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={criar.isPending} className="gap-1">
                  <Plus className="size-4" />
                  Adicionar
                </Button>
              </form>
            </CardContent>
          </Card>

          {aba === "hoje" ? (
            <Card className="rounded-lg border-border shadow-card">
              <CardHeader>
                <CardTitle className="text-base">Tarefas de hoje</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {hojeQuery.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : tarefasHoje.length === 0 ? (
                  <EmptyState
                    icon={ClipboardList}
                    title="Nenhuma tarefa para hoje"
                    description="Use o formulário acima para adicionar a primeira tarefa do dia."
                  />
                ) : (
                  <>
                    <Secao
                      titulo="🔴 Urgente/Alta"
                      contagem={
                        tarefasHoje.filter((t) => t.status !== "concluida" && isAlta(t)).length
                      }
                    >
                      {tarefasHoje
                        .filter((t) => t.status !== "concluida" && isAlta(t))
                        .map((t) => (
                          <TarefaItem
                            key={t.id}
                            tarefa={t}
                            onToggleConcluida={(x) =>
                              void atualizarStatus(
                                x,
                                x.status === "concluida" ? "pendente" : "concluida",
                              )
                            }
                            onToggleAndamento={(x) =>
                              void atualizarStatus(
                                x,
                                x.status === "em_andamento" ? "pendente" : "em_andamento",
                              )
                            }
                            onDelete={excluir}
                          />
                        ))}
                    </Secao>
                    <Secao
                      titulo="🟡 Normal/Baixa"
                      contagem={
                        tarefasHoje.filter((t) => t.status !== "concluida" && !isAlta(t)).length
                      }
                    >
                      {tarefasHoje
                        .filter((t) => t.status !== "concluida" && !isAlta(t))
                        .map((t) => (
                          <TarefaItem
                            key={t.id}
                            tarefa={t}
                            onToggleConcluida={(x) =>
                              void atualizarStatus(
                                x,
                                x.status === "concluida" ? "pendente" : "concluida",
                              )
                            }
                            onToggleAndamento={(x) =>
                              void atualizarStatus(
                                x,
                                x.status === "em_andamento" ? "pendente" : "em_andamento",
                              )
                            }
                            onDelete={excluir}
                          />
                        ))}
                    </Secao>
                    <Secao titulo="✅ Concluídas" contagem={concluidas.length} defaultOpen={false}>
                      {concluidas.map((t) => (
                        <TarefaItem
                          key={t.id}
                          tarefa={t}
                          onToggleConcluida={(x) => void atualizarStatus(x, "pendente")}
                          onToggleAndamento={(x) => void atualizarStatus(x, "em_andamento")}
                          onDelete={excluir}
                        />
                      ))}
                    </Secao>
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}

          {aba === "semana" ? (
            <>
              <Card className="rounded-lg border-border shadow-card">
                <CardHeader>
                  <CardTitle className="text-base">Concluídas por dia (últimos 7 dias)</CardTitle>
                </CardHeader>
                <CardContent className="h-64">
                  {semanaQuery.isLoading ? (
                    <Skeleton className="h-full w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={graficoSemana}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="var(--border)"
                        />
                        <XAxis dataKey="dia" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <ReTooltip />
                        <Bar
                          dataKey="concluidas"
                          name="Concluídas"
                          fill="var(--success)"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-lg border-border shadow-card">
                <CardHeader>
                  <CardTitle className="text-base">Tarefas dos últimos 7 dias</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {semanaQuery.isLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  ) : diasComTarefa.length === 0 ? (
                    <EmptyState
                      icon={ClipboardList}
                      title="Nenhuma tarefa na semana"
                      description="As tarefas dos últimos 7 dias aparecem aqui."
                    />
                  ) : (
                    diasComTarefa.map((dia) => {
                      const doDia = semana.filter((t) => t.data_tarefa === dia);
                      return (
                        <Secao
                          key={dia}
                          titulo={format(parseISO(dia), "EEEE, dd/MM", { locale: ptBR })}
                          contagem={doDia.length}
                        >
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Data</TableHead>
                                  <TableHead>Título</TableHead>
                                  <TableHead>Categoria</TableHead>
                                  <TableHead>Prioridade</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead>Conclusão</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {doDia.map((t) => (
                                  <TableRow key={t.id}>
                                    <TableCell>
                                      {format(parseISO(t.data_tarefa), "dd/MM/yyyy")}
                                    </TableCell>
                                    <TableCell className="max-w-[18rem] truncate font-medium">
                                      {t.titulo}
                                    </TableCell>
                                    <TableCell>
                                      <CategoriaBadge categoria={t.categoria} />
                                    </TableCell>
                                    <TableCell>
                                      <PrioridadeBadge prioridade={t.prioridade} />
                                    </TableCell>
                                    <TableCell>
                                      <StatusTarefaBadge status={t.status} />
                                    </TableCell>
                                    <TableCell>
                                      {t.concluida_em
                                        ? format(parseISO(t.concluida_em), "HH:mm")
                                        : "—"}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </Secao>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}

          {aba === "mes" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label="Criadas no mês"
                  value={totalMes}
                  icon={ClipboardList}
                  accent="primary"
                  loading={mesQuery.isLoading}
                />
                <KpiCard
                  label="Concluídas no mês"
                  value={concluidasMes}
                  icon={CheckCircle2}
                  accent="success"
                  loading={mesQuery.isLoading}
                />
                <KpiCard
                  label="Taxa média diária"
                  value={`${taxaMedia}%`}
                  icon={Gauge}
                  accent={taxaMedia >= 70 ? "success" : taxaMedia >= 40 ? "warning" : "destructive"}
                  loading={mesQuery.isLoading}
                />
                <KpiCard
                  label="Dia mais produtivo"
                  value={
                    diaMaisProdutivo && diaMaisProdutivo.qtd > 0
                      ? format(parseISO(diaMaisProdutivo.dia), "dd/MM")
                      : "—"
                  }
                  icon={Trophy}
                  accent="warning"
                  loading={mesQuery.isLoading}
                  {...(diaMaisProdutivo && diaMaisProdutivo.qtd > 0
                    ? {
                        trend: {
                          direction: "up" as const,
                          label: `${diaMaisProdutivo.qtd} concluídas`,
                        },
                      }
                    : {})}
                />
              </div>

              <Card className="rounded-lg border-border shadow-card">
                <CardHeader>
                  <CardTitle className="text-base">Concluídas vs pendentes por semana</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  {mesQuery.isLoading ? (
                    <Skeleton className="h-full w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={semanasMes}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="var(--border)"
                        />
                        <XAxis dataKey="semana" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <ReTooltip />
                        <Legend />
                        <Bar
                          dataKey="concluidas"
                          name="Concluídas"
                          fill="var(--success)"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="pendentes"
                          name="Pendentes"
                          fill="var(--warning)"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-lg border-border shadow-card">
                <CardHeader>
                  <CardTitle className="text-base">Ranking de categorias concluídas</CardTitle>
                </CardHeader>
                <CardContent className="h-64">
                  {mesQuery.isLoading ? (
                    <Skeleton className="h-full w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={rankingCategorias} layout="vertical">
                        <CartesianGrid
                          strokeDasharray="3 3"
                          horizontal={false}
                          stroke="var(--border)"
                        />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                        <YAxis
                          type="category"
                          dataKey="categoria"
                          tick={{ fontSize: 12 }}
                          tickFormatter={(v: CategoriaTarefa) => CATEGORIA_META[v].label}
                          width={80}
                        />
                        <ReTooltip
                          formatter={(v: number) => [v, "Concluídas"]}
                          labelFormatter={(v: CategoriaTarefa) => CATEGORIA_META[v].label}
                        />
                        <Bar dataKey="qtd" radius={[0, 4, 4, 0]}>
                          {rankingCategorias.map((r) => (
                            <Cell key={r.categoria} fill={CATEGORIA_META[r.categoria].color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>

        <Card className="block-in h-fit rounded-lg border-border shadow-card lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="size-4 text-warning" />
              Insights do dia
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {hojeQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : insights.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Adicione tarefas para receber recomendações do dia.
              </p>
            ) : (
              insights.map((i, idx) => (
                <div key={idx} className={cn("flex gap-2 rounded-md p-3 text-sm", i.tone)}>
                  <i.icon className="mt-0.5 size-4 shrink-0" />
                  <span>{i.texto}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
