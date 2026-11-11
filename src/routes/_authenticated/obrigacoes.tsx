import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, Check, CheckCircle2, Clock, FileCheck } from "lucide-react";

import { supabase } from "@/lib/supabase";
import type { Cliente } from "@/lib/clientes";
import {
  STATUS_OBRIGACAO_META,
  TIPOS_OBRIGACAO,
  TIPO_OBRIGACAO_META,
  type Obrigacao,
  type StatusObrigacao,
  type TipoObrigacao,
} from "@/lib/obrigacoes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/kpi-card";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export const Route = createFileRoute("/_authenticated/obrigacoes")({
  head: () => ({
    meta: [
      { title: "Obrigações Acessórias — Ofis" },
      {
        name: "description",
        content:
          "Controle de obrigações acessórias: DAS, PGDAS, DCTF, EFD, SPED e DEFIS com vencimentos, status e alertas semanais.",
      },
      { property: "og:title", content: "Obrigações Acessórias — Ofis" },
      {
        property: "og:description",
        content: "Vencimentos, entregas e atrasos das obrigações acessórias por cliente.",
      },
    ],
  }),
  component: ObrigacoesPage,
});

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const GERAL = "__geral__";
const TODOS = "todos";

function ObrigacoesPage() {
  const queryClient = useQueryClient();
  const hoje = useMemo(() => new Date(), []);
  const hojeIso = iso(hoje);

  const [clienteId, setClienteId] = useState(GERAL);
  const [tipo, setTipo] = useState<TipoObrigacao>("das");
  const [competencia, setCompetencia] = useState(iso(startOfMonth(hoje)));
  const [vencimento, setVencimento] = useState(hojeIso);
  const [status, setStatus] = useState<StatusObrigacao>("pendente");
  const [observacao, setObservacao] = useState("");

  const [filtroTipo, setFiltroTipo] = useState<string>(TODOS);
  const [filtroMes, setFiltroMes] = useState(format(hoje, "yyyy-MM"));
  const [filtroCliente, setFiltroCliente] = useState<string>(TODOS);

  const { data: clientes, isLoading: loadingClientes } = useQuery({
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

  const { data: obrigacoes, isLoading: loadingObrigacoes } = useQuery({
    queryKey: ["obrigacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obrigacoes_acessorias")
        .select("*")
        .order("vencimento", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Obrigacao[];
    },
  });

  const isLoading = loadingClientes || loadingObrigacoes;
  const lista = clientes ?? [];
  const todas = obrigacoes ?? [];
  const nomePorId = useMemo(() => new Map(lista.map((c) => [c.id, c.nome] as const)), [lista]);

  const inicioMes = iso(startOfMonth(hoje));
  const fimMes = iso(endOfMonth(hoje));

  const pendentesMes = todas.filter(
    (o) => o.status === "pendente" && o.vencimento >= inicioMes && o.vencimento <= fimMes,
  ).length;
  const entreguesMes = todas.filter(
    (o) => o.status === "entregue" && o.vencimento >= inicioMes && o.vencimento <= fimMes,
  ).length;
  const atrasadas = todas.filter(
    (o) => o.vencimento < hojeIso && (o.status === "pendente" || o.status === "atrasada"),
  );
  const proximoVenc = todas
    .filter((o) => o.status !== "entregue" && o.vencimento >= hojeIso)
    .map((o) => o.vencimento)
    .sort()[0];

  const proximos7 = useMemo(
    () =>
      todas
        .filter((o) => {
          if (o.status === "entregue") return false;
          const dias = differenceInCalendarDays(parseISO(o.vencimento), hoje);
          return dias >= 0 && dias <= 7;
        })
        .sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
    [todas, hoje],
  );

  const filtradas = useMemo(
    () =>
      todas.filter((o) => {
        const okTipo = filtroTipo === TODOS || o.tipo === filtroTipo;
        const okMes = !filtroMes || o.vencimento.startsWith(filtroMes);
        const okCliente =
          filtroCliente === TODOS ||
          (filtroCliente === GERAL ? !o.cliente_id : o.cliente_id === filtroCliente);
        return okTipo && okMes && okCliente;
      }),
    [todas, filtroTipo, filtroMes, filtroCliente],
  );

  const grupos = useMemo(
    () => ({
      pendente: filtradas.filter((o) => o.status === "pendente"),
      entregue: filtradas.filter((o) => o.status === "entregue"),
      atrasada: filtradas.filter(
        (o) => o.status === "atrasada" || (o.status === "pendente" && o.vencimento < hojeIso),
      ),
    }),
    [filtradas, hojeIso],
  );

  const adicionar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("obrigacoes_acessorias").insert({
        cliente_id: clienteId === GERAL ? null : clienteId,
        tipo,
        competencia,
        vencimento,
        status,
        observacao: observacao.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Obrigação adicionada com sucesso!");
      setObservacao("");
      setStatus("pendente");
      queryClient.invalidateQueries({ queryKey: ["obrigacoes"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível adicionar."),
  });

  const marcarEntregue = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("obrigacoes_acessorias")
        .update({ status: "entregue" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Obrigação marcada como entregue.");
      queryClient.invalidateQueries({ queryKey: ["obrigacoes"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível atualizar."),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("obrigacoes_acessorias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Obrigação excluída.");
      queryClient.invalidateQueries({ queryKey: ["obrigacoes"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível excluir."),
  });

  function Urgencia({ o }: { o: Obrigacao }) {
    if (o.status === "entregue") return null;
    const dias = differenceInCalendarDays(parseISO(o.vencimento), hoje);
    if (dias < 0)
      return (
        <Badge className="rounded-md border-transparent bg-destructive font-medium text-destructive-foreground">
          Atrasada
        </Badge>
      );
    if (dias <= 3)
      return (
        <Badge className="animate-pulse rounded-md border-transparent bg-warning font-medium text-warning-foreground">
          Vence em breve
        </Badge>
      );
    return null;
  }

  function Lista({ itens }: { itens: Obrigacao[] }) {
    if (isLoading)
      return (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      );
    if (itens.length === 0)
      return (
        <EmptyState
          icon={FileCheck}
          title="Nenhuma obrigação encontrada"
          description="Ajuste os filtros ou adicione uma nova obrigação acessória."
        />
      );
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Competência</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Observação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((o) => (
              <TableRow key={o.id} className="hover:bg-row-hover">
                <TableCell className="font-medium">
                  {o.cliente_id ? (nomePorId.get(o.cliente_id) ?? "Cliente removido") : "Geral"}
                </TableCell>
                <TableCell>
                  <Badge
                    className={cn(
                      "rounded-md border-transparent font-medium",
                      TIPO_OBRIGACAO_META[o.tipo]?.className ?? "bg-muted text-muted-foreground",
                    )}
                  >
                    {TIPO_OBRIGACAO_META[o.tipo]?.label ?? o.tipo}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(parseISO(o.competencia), "MM/yyyy", { locale: ptBR })}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{format(parseISO(o.vencimento), "dd/MM/yyyy")}</span>
                    <Urgencia o={o} />
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    className={cn(
                      "rounded-md border-transparent font-medium",
                      STATUS_OBRIGACAO_META[o.status]?.className ??
                        "bg-muted text-muted-foreground",
                    )}
                  >
                    {STATUS_OBRIGACAO_META[o.status]?.label ?? o.status}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground">
                  {o.observacao || "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {o.status !== "entregue" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Marcar como entregue"
                        className="text-success hover:bg-success/10 hover:text-success"
                        onClick={() => marcarEntregue.mutate(o.id)}
                      >
                        <Check className="size-4" />
                      </Button>
                    )}
                    <ConfirmDeleteButton
                      title="Excluir obrigação?"
                      description="A obrigação será removida permanentemente."
                      onConfirm={async () => {
                        await excluir.mutateAsync(o.id);
                      }}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Obrigações Acessórias</h1>
        <p className="text-sm text-muted-foreground">
          Controle de entregas fiscais por cliente, com vencimentos e alertas de atraso.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Pendentes no mês" value={pendentesMes} icon={Clock} loading={isLoading} />
        <KpiCard
          label="Entregues no mês"
          value={entreguesMes}
          icon={CheckCircle2}
          accent="success"
          loading={isLoading}
        />
        <KpiCard
          label="Atrasadas"
          value={atrasadas.length}
          icon={AlertTriangle}
          accent="destructive"
          loading={isLoading}
        />
        <KpiCard
          label="Próximo vencimento"
          value={proximoVenc ? format(parseISO(proximoVenc), "dd/MM/yyyy") : "—"}
          icon={CalendarClock}
          accent="warning"
          loading={isLoading}
        />
      </section>

      <Card className="rounded-lg border-l-4 border-l-warning shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="size-4.5 text-warning" />
            Resumo dos próximos 7 dias
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : proximos7.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma obrigação vence nos próximos 7 dias.</p>
          ) : (
            <ul className="space-y-1.5">
              {proximos7.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">
                    <span className="font-medium">
                      {TIPO_OBRIGACAO_META[o.tipo]?.label ?? o.tipo}
                    </span>{" "}
                    · {o.cliente_id ? (nomePorId.get(o.cliente_id) ?? "Cliente removido") : "Geral"}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {format(parseISO(o.vencimento), "dd/MM")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-lg border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Nova obrigação</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              adicionar.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GERAL}>Geral (sem cliente)</SelectItem>
                  {lista.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoObrigacao)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_OBRIGACAO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_OBRIGACAO_META[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusObrigacao)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="entregue">Entregue</SelectItem>
                  <SelectItem value="atrasada">Atrasada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp">Competência</Label>
              <Input
                id="comp"
                type="date"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="venc">Vencimento</Label>
              <Input
                id="venc"
                type="date"
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5 md:col-span-3">
              <Label htmlFor="obs">Observação</Label>
              <Textarea
                id="obs"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Opcional"
                rows={2}
              />
            </div>
            <div className="md:col-span-3">
              <Button type="submit" disabled={adicionar.isPending}>
                {adicionar.isPending ? "Adicionando..." : "Adicionar Obrigação"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-lg border-border shadow-card">
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Obrigações</CardTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos os tipos</SelectItem>
                  {TIPOS_OBRIGACAO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_OBRIGACAO_META[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mes">Mês de vencimento</Label>
              <Input
                id="mes"
                type="month"
                value={filtroMes}
                onChange={(e) => setFiltroMes(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Select value={filtroCliente} onValueChange={setFiltroCliente}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos os clientes</SelectItem>
                  <SelectItem value={GERAL}>Geral</SelectItem>
                  {lista.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pendentes">
            <TabsList>
              <TabsTrigger value="pendentes">Pendentes ({grupos.pendente.length})</TabsTrigger>
              <TabsTrigger value="entregues">Entregues ({grupos.entregue.length})</TabsTrigger>
              <TabsTrigger value="atrasadas">Atrasadas ({grupos.atrasada.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="pendentes" className="mt-4">
              <Lista itens={grupos.pendente} />
            </TabsContent>
            <TabsContent value="entregues" className="mt-4">
              <Lista itens={grupos.entregue} />
            </TabsContent>
            <TabsContent value="atrasadas" className="mt-4">
              <Lista itens={grupos.atrasada} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
