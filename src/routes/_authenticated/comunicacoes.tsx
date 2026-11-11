import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { CheckCircle2, Inbox, MessageSquare, AlertTriangle, Check } from "lucide-react";

import { supabase } from "@/lib/supabase";
import type { Cliente } from "@/lib/clientes";
import {
  TIPOS_COMUNICACAO,
  TIPO_COMUNICACAO_META,
  type Comunicacao,
  type TipoComunicacao,
} from "@/lib/comunicacoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/kpi-card";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-badge";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/comunicacoes")({
  head: () => ({
    meta: [
      { title: "Central de Comunicação — Ofis" },
      {
        name: "description",
        content:
          "Registre solicitações, retornos, pendências e informativos dos clientes com acompanhamento de status.",
      },
      { property: "og:title", content: "Central de Comunicação — Ofis" },
      {
        property: "og:description",
        content: "Solicitações, pendências e retornos dos clientes em um só lugar.",
      },
    ],
  }),
  component: ComunicacoesPage,
});

const GERAL = "__geral__";
const TODOS = "todos";

function ComunicacoesPage() {
  const queryClient = useQueryClient();
  const hoje = useMemo(() => new Date(), []);
  const inicioMes = format(startOfMonth(hoje), "yyyy-MM-dd");

  const [clienteId, setClienteId] = useState(GERAL);
  const [tipo, setTipo] = useState<TipoComunicacao>("solicitacao");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");

  const [filtroTipo, setFiltroTipo] = useState<string>(TODOS);
  const [filtroCliente, setFiltroCliente] = useState<string>(TODOS);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

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

  const { data: comunicacoes, isLoading: loadingCom } = useQuery({
    queryKey: ["comunicacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comunicacoes")
        .select("*")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Comunicacao[];
    },
  });

  const isLoading = loadingClientes || loadingCom;
  const lista = clientes ?? [];
  const todas = comunicacoes ?? [];
  const nomePorId = useMemo(() => new Map(lista.map((c) => [c.id, c.nome] as const)), [lista]);

  const abertas = todas.filter((c) => c.status === "aberta");
  const solicitacoesPendentes = abertas.filter((c) => c.tipo === "solicitacao").length;
  const pendenciasAbertas = abertas.filter((c) => c.tipo === "pendencia").length;
  const resolvidasMes = todas.filter(
    (c) => c.status === "resolvida" && c.atualizado_em >= inicioMes,
  ).length;

  const filtradas = useMemo(
    () =>
      todas.filter((c) => {
        const okTipo = filtroTipo === TODOS || c.tipo === filtroTipo;
        const okCliente =
          filtroCliente === TODOS ||
          (filtroCliente === GERAL ? !c.cliente_id : c.cliente_id === filtroCliente);
        const dia = c.criado_em.slice(0, 10);
        const okDe = !de || dia >= de;
        const okAte = !ate || dia <= ate;
        return okTipo && okCliente && okDe && okAte;
      }),
    [todas, filtroTipo, filtroCliente, de, ate],
  );

  const registrar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("comunicacoes").insert({
        cliente_id: clienteId === GERAL ? null : clienteId,
        tipo,
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        status: "aberta",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Comunicação registrada!");
      setTitulo("");
      setDescricao("");
      queryClient.invalidateQueries({ queryKey: ["comunicacoes"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível registrar."),
  });

  const resolver = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("comunicacoes")
        .update({ status: "resolvida" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Comunicação marcada como resolvida.");
      queryClient.invalidateQueries({ queryKey: ["comunicacoes"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível atualizar."),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("comunicacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Comunicação excluída.");
      queryClient.invalidateQueries({ queryKey: ["comunicacoes"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível excluir."),
  });

  function Lista({ itens }: { itens: Comunicacao[] }) {
    if (isLoading)
      return (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      );
    if (itens.length === 0)
      return (
        <EmptyState
          icon={Inbox}
          title="Nenhuma comunicação"
          description="Registre uma comunicação no formulário acima ou ajuste os filtros."
        />
      );
    return (
      <div className="space-y-3">
        {itens.map((c) => (
          <div
            key={c.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className={`rounded-[4px] font-medium ${TIPO_COMUNICACAO_META[c.tipo].className}`}
                >
                  {TIPO_COMUNICACAO_META[c.tipo].label}
                </Badge>
                <span className="font-semibold text-foreground">{c.titulo}</span>
              </div>
              {c.descricao ? <p className="text-sm text-muted-foreground">{c.descricao}</p> : null}
              <p className="text-xs text-muted-foreground">
                {c.cliente_id ? (nomePorId.get(c.cliente_id) ?? "Cliente") : "Geral"} ·{" "}
                {format(parseISO(c.criado_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {c.status === "aberta" ? (
                <Button variant="ghost" size="sm" onClick={() => resolver.mutate(c.id)}>
                  <Check className="size-4" /> Marcar como resolvida
                </Button>
              ) : (
                <StatusPill tom="success">Resolvida</StatusPill>
              )}
              <ConfirmDeleteButton
                title={`Excluir "${c.titulo}"?`}
                description="Esta comunicação será removida permanentemente."
                onConfirm={async () => {
                  await excluir.mutateAsync(c.id);
                }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Central de Comunicação</h1>
        <p className="text-sm text-muted-foreground">
          Solicitações, retornos, pendências e informativos por cliente.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Abertas" value={abertas.length} icon={MessageSquare} loading={isLoading} />
        <KpiCard
          label="Solicitações pendentes"
          value={solicitacoesPendentes}
          icon={Inbox}
          accent="warning"
          loading={isLoading}
        />
        <KpiCard
          label="Pendências em aberto"
          value={pendenciasAbertas}
          icon={AlertTriangle}
          accent="destructive"
          loading={isLoading}
        />
        <KpiCard
          label="Resolvidas no mês"
          value={resolvidasMes}
          icon={CheckCircle2}
          accent="success"
          loading={isLoading}
        />
      </section>

      <Card className="rounded-lg border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Registrar comunicação</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!titulo.trim()) {
                toast.error("Informe o título.");
                return;
              }
              registrar.mutate();
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
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoComunicacao)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_COMUNICACAO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_COMUNICACAO_META[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="titulo-com">Título</Label>
              <Input
                id="titulo-com"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex.: Enviar notas de janeiro"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="desc-com">Descrição</Label>
              <Textarea
                id="desc-com"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Detalhes da comunicação (opcional)"
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={registrar.isPending} className="hover-scale">
                <MessageSquare className="size-4" /> Registrar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-lg border-border shadow-card">
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Comunicações</CardTitle>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos os tipos</SelectItem>
                  {TIPOS_COMUNICACAO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_COMUNICACAO_META[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <div className="space-y-1.5">
              <Label htmlFor="de-com">De</Label>
              <Input id="de-com" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ate-com">Até</Label>
              <Input
                id="ate-com"
                type="date"
                value={ate}
                onChange={(e) => setAte(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="abertas">
            <TabsList>
              <TabsTrigger value="abertas">
                Abertas ({filtradas.filter((c) => c.status === "aberta").length})
              </TabsTrigger>
              <TabsTrigger value="resolvidas">
                Resolvidas ({filtradas.filter((c) => c.status === "resolvida").length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="abertas" className="mt-4">
              <Lista itens={filtradas.filter((c) => c.status === "aberta")} />
            </TabsContent>
            <TabsContent value="resolvidas" className="mt-4">
              <Lista itens={filtradas.filter((c) => c.status === "resolvida")} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
