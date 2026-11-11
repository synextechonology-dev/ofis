import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, FileText, ListTodo, Plus } from "lucide-react";

import { supabase, type NotaFiscal } from "@/lib/supabase";
import type { Tarefa } from "@/lib/tarefas";
import { PRIORIDADE_META, STATUS_TAREFA_META } from "@/lib/tarefas";
import {
  TIPOS_EVENTO,
  TIPO_EVENTO_META,
  type EventoCalendario,
  type TipoEvento,
} from "@/lib/calendario";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/calendario")({
  head: () => ({
    meta: [
      { title: "Calendário Fiscal — Ofis" },
      {
        name: "description",
        content:
          "Calendário fiscal com vencimentos, obrigações, lembretes, reuniões, tarefas e notas emitidas por dia.",
      },
      { property: "og:title", content: "Calendário Fiscal — Ofis" },
      {
        property: "og:description",
        content: "Vencimentos, obrigações e emissões organizados em um calendário mensal.",
      },
    ],
  }),
  component: CalendarioPage,
});

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function CalendarioPage() {
  const queryClient = useQueryClient();
  const hoje = useMemo(() => new Date(), []);
  const [mesRef, setMesRef] = useState(() => startOfMonth(hoje));
  const [diaSelecionado, setDiaSelecionado] = useState(() => iso(hoje));

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [dataEvento, setDataEvento] = useState(() => iso(hoje));
  const [tipo, setTipo] = useState<TipoEvento>("vencimento_das");

  const inicioGrade = startOfWeek(startOfMonth(mesRef), { weekStartsOn: 1 });
  const fimGrade = endOfWeek(endOfMonth(mesRef), { weekStartsOn: 1 });
  const dias = useMemo(
    () => eachDayOfInterval({ start: inicioGrade, end: fimGrade }),
    [inicioGrade, fimGrade],
  );
  const de = iso(inicioGrade);
  const ate = iso(fimGrade);

  const { data: eventos, isLoading: loadingEventos } = useQuery({
    queryKey: ["eventos", de, ate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eventos_calendario")
        .select("*")
        .gte("data_evento", de)
        .lte("data_evento", ate)
        .order("data_evento", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EventoCalendario[];
    },
  });

  const { data: notas, isLoading: loadingNotas } = useQuery({
    queryKey: ["calendario-notas", de, ate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("*")
        .gte("data_emissao", de)
        .lte("data_emissao", ate);
      if (error) throw error;
      return (data ?? []) as NotaFiscal[];
    },
  });

  const { data: tarefas, isLoading: loadingTarefas } = useQuery({
    queryKey: ["calendario-tarefas", de, ate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("*")
        .gte("data_tarefa", de)
        .lte("data_tarefa", ate);
      if (error) throw error;
      return (data ?? []) as Tarefa[];
    },
  });

  const isLoading = loadingEventos || loadingNotas || loadingTarefas;

  const criar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("eventos_calendario").insert({
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        data_evento: dataEvento,
        tipo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evento cadastrado com sucesso!");
      setTitulo("");
      setDescricao("");
      queryClient.invalidateQueries({ queryKey: ["eventos"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível salvar o evento."),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("eventos_calendario").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evento excluído.");
      queryClient.invalidateQueries({ queryKey: ["eventos"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível excluir."),
  });

  const eventosDoDia = (key: string) => (eventos ?? []).filter((e) => e.data_evento === key);
  const notasDoDia = (key: string) => (notas ?? []).filter((n) => n.data_emissao === key);
  const tarefasDoDia = (key: string) => (tarefas ?? []).filter((t) => t.data_tarefa === key);

  const selecionado = parseISO(diaSelecionado);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Calendário Fiscal</h1>
        <p className="text-sm text-muted-foreground">
          Vencimentos, obrigações, tarefas e emissões organizados por dia.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-lg border-border shadow-card lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base capitalize">
              {format(mesRef, "MMMM 'de' yyyy", { locale: ptBR })}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                aria-label="Mês anterior"
                onClick={() => setMesRef((m) => subMonths(m, 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Próximo mês"
                onClick={() => setMesRef((m) => addMonths(m, 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-96 w-full" />
            ) : (
              <>
                <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground">
                  {DIAS.map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                  {dias.map((dia) => {
                    const key = iso(dia);
                    const doMes = isSameMonth(dia, mesRef);
                    const evs = eventosDoDia(key);
                    const qtdNotas = notasDoDia(key).length;
                    const pendentes = tarefasDoDia(key).filter(
                      (t) => t.status !== "concluida",
                    ).length;
                    const ativo = key === diaSelecionado;
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={ativo}
                        aria-label={`${format(dia, "d 'de' MMMM", { locale: ptBR })}${evs.length ? `, ${evs.length} evento(s)` : ""}${qtdNotas ? `, ${qtdNotas} nota(s)` : ""}${pendentes ? `, ${pendentes} tarefa(s) pendente(s)` : ""}`}
                        onClick={() => {
                          setDiaSelecionado(key);
                          setDataEvento(key);
                        }}
                        className={cn(
                          "flex min-h-14 min-w-0 flex-col gap-0.5 rounded-md border border-border p-1 text-left transition-colors hover:bg-row-hover sm:min-h-20 sm:gap-1 sm:p-1.5",
                          !doMes && "opacity-45",
                          ativo && "border-primary bg-primary/5",
                        )}
                      >
                        <span
                          className={cn(
                            "nums text-xs font-semibold",
                            isSameDay(dia, hoje) && "text-accent-foreground",
                          )}
                        >
                          {format(dia, "d")}
                        </span>
                        <div className="flex flex-wrap gap-0.5">
                          {evs.slice(0, 1).map((ev) => (
                            <span
                              key={ev.id}
                              className="flex min-w-0 max-w-full items-center gap-1 text-xs text-foreground"
                            >
                              <i
                                aria-hidden
                                className={cn(
                                  "size-2 shrink-0 rounded-full",
                                  TIPO_EVENTO_META[ev.tipo].dotClass,
                                )}
                              />
                              <span className="hidden truncate sm:inline">{ev.titulo}</span>
                            </span>
                          ))}
                          {evs.length > 1 ? (
                            <span className="nums text-xs text-muted-foreground">
                              +{evs.length - 1}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-auto flex flex-wrap items-center gap-x-1.5">
                          {qtdNotas > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                              <span className="size-1.5 rounded-full bg-success" />
                              {qtdNotas}
                            </span>
                          ) : null}
                          {pendentes > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                              <span className="size-1.5 rounded-full bg-warning" />
                              {pendentes}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-lg border-border shadow-card">
            <CardHeader>
              <CardTitle className="text-base">
                {format(selecionado, "dd 'de' MMMM", { locale: ptBR })}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Eventos</p>
                {eventosDoDia(diaSelecionado).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum evento neste dia.</p>
                ) : (
                  eventosDoDia(diaSelecionado).map((ev) => {
                    const meta = TIPO_EVENTO_META[ev.tipo];
                    return (
                      <div
                        key={ev.id}
                        className="flex items-start justify-between gap-2 rounded-md border border-border p-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{ev.titulo}</p>
                          {ev.descricao ? (
                            <p className="text-xs text-muted-foreground">{ev.descricao}</p>
                          ) : null}
                          <Badge className={cn("mt-1 rounded-[4px] text-xs", meta.badgeClass)}>
                            {meta.label}
                          </Badge>
                        </div>
                        <ConfirmDeleteButton
                          title={`Excluir evento "${ev.titulo}"?`}
                          onConfirm={async () => {
                            await excluir.mutateAsync(ev.id);
                          }}
                        />
                      </div>
                    );
                  })
                )}
              </div>

              <div className="space-y-2">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                  <ListTodo className="size-3.5" /> Tarefas
                </p>
                {tarefasDoDia(diaSelecionado).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma tarefa neste dia.</p>
                ) : (
                  tarefasDoDia(diaSelecionado).map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
                    >
                      <span className="min-w-0 truncate">{t.titulo}</span>
                      <div className="flex shrink-0 gap-1">
                        <Badge
                          className={cn(
                            "rounded-[4px] text-xs",
                            PRIORIDADE_META[t.prioridade].badgeClass,
                          )}
                        >
                          {PRIORIDADE_META[t.prioridade].label}
                        </Badge>
                        <Badge
                          className={cn(
                            "rounded-[4px] text-xs",
                            STATUS_TAREFA_META[t.status].badgeClass,
                          )}
                        >
                          {STATUS_TAREFA_META[t.status].label}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                  <FileText className="size-3.5" /> Notas emitidas
                </p>
                {notasDoDia(diaSelecionado).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma nota neste dia.</p>
                ) : (
                  notasDoDia(diaSelecionado).map((n) => (
                    <div
                      key={n.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{n.numero_nf}</span>{" "}
                        <span className="text-muted-foreground">· {n.cliente}</span>
                      </span>
                      <StatusBadge status={n.status} />
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-border shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Adicionar evento</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!titulo.trim()) {
                    toast.error("Informe o título do evento.");
                    return;
                  }
                  criar.mutate();
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="titulo-evento">Título</Label>
                  <Input
                    id="titulo-evento"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="Ex.: Vencimento DAS"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="descricao-evento">Descrição (opcional)</Label>
                  <Textarea
                    id="descricao-evento"
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="data-evento">Data</Label>
                  <Input
                    id="data-evento"
                    type="date"
                    value={dataEvento}
                    onChange={(e) => setDataEvento(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={tipo} onValueChange={(v) => setTipo(v as TipoEvento)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_EVENTO.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TIPO_EVENTO_META[t].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={criar.isPending} className="hover-scale w-full">
                  <Plus className="size-4" /> Salvar evento
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      {!isLoading && (eventos ?? []).length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nenhum evento no mês"
          description="Cadastre vencimentos, obrigações, lembretes e reuniões para acompanhar o calendário fiscal."
        />
      ) : null}
    </div>
  );
}
