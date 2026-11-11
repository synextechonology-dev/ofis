import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, startOfMonth, subDays, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { History, Layers, Pencil, Plus, Search, UserCheck, UserX, Users } from "lucide-react";

import { supabase, mensagemDeErro, type NotaFiscal, type TipoEmissao } from "@/lib/supabase";
import { tiposDoCliente, type Cliente } from "@/lib/clientes";
import { SeletorTipos } from "@/components/seletor-tipos";
import { TIPOS, TIPO_META } from "@/lib/nf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/kpi-card";
import { EmptyState } from "@/components/empty-state";
import { TipoBadge } from "@/components/tipo-badge";
import { StatusBadge, StatusPill } from "@/components/status-badge";
import { normalizar } from "@/lib/navegacao";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export const Route = createFileRoute("/_authenticated/clientes")({
  // ?busca=nome abre a lista já filtrada (usado pela busca geral, Ctrl+K).
  validateSearch: (s: Record<string, unknown>): { busca?: string } => {
    const b = s["busca"];
    return typeof b === "string" && b.trim() ? { busca: b } : {};
  },
  head: () => ({
    meta: [
      { title: "Clientes — Ofis" },
      {
        name: "description",
        content:
          "Gestão de clientes do setor fiscal: cadastro, tipo de emissão, volume de notas e histórico de emissões.",
      },
      { property: "og:title", content: "Clientes — Ofis" },
      {
        property: "og:description",
        content: "Cadastro de clientes com volume de notas, última emissão e status de atividade.",
      },
    ],
  }),
  component: ClientesPage,
});

const iso = (d: Date) => format(d, "yyyy-MM-dd");

function ClientesPage() {
  const hoje = useMemo(() => new Date(), []);
  const queryClient = useQueryClient();

  const [nome, setNome] = useState("");
  const [tipos, setTipos] = useState<TipoEmissao[]>(["comercio"]);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [tiposEdicao, setTiposEdicao] = useState<TipoEmissao[]>([]);
  const buscaUrl = Route.useSearch().busca;
  const [busca, setBusca] = useState(buscaUrl ?? "");
  useEffect(() => {
    if (buscaUrl) setBusca(buscaUrl);
  }, [buscaUrl]);
  const [filtroTipo, setFiltroTipo] = useState<"todos" | TipoEmissao>("todos");
  const [historicoCliente, setHistoricoCliente] = useState<string | null>(null);

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

  const { data: notas, isLoading: loadingNotas } = useQuery({
    queryKey: ["clientes-notas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("*")
        .order("data_emissao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NotaFiscal[];
    },
  });

  const isLoading = loadingClientes || loadingNotas;
  const lista = clientes ?? [];
  const todasNotas = notas ?? [];
  const inicioMes = iso(startOfMonth(hoje));
  const limite30 = iso(subDays(hoje, 30));

  const porCliente = useMemo(() => {
    const mapa = new Map<string, { mes: number; ultima: string | null }>();
    for (const nota of todasNotas) {
      // Agrupa por cliente_id quando disponível; fallback para o nome digitado.
      const chave = nota.cliente_id ?? (nota.cliente ?? "").trim().toLowerCase();
      if (!chave) continue;
      const atual = mapa.get(chave) ?? { mes: 0, ultima: null };
      if (nota.data_emissao >= inicioMes) atual.mes += 1;
      if (!atual.ultima || nota.data_emissao > atual.ultima) atual.ultima = nota.data_emissao;
      mapa.set(chave, atual);
    }
    return mapa;
  }, [todasNotas, inicioMes]);

  const enriquecidos = useMemo(
    () =>
      lista.map((cliente) => {
        const info =
          porCliente.get(cliente.id) ?? porCliente.get(cliente.nome.trim().toLowerCase());
        const ultima = info?.ultima ?? null;
        const ativo = !!ultima && ultima >= limite30;
        return {
          ...cliente,
          tipos: tiposDoCliente(cliente),
          notasMes: info?.mes ?? 0,
          ultima,
          ativo,
        };
      }),
    [lista, porCliente, limite30],
  );

  const ativosMes = enriquecidos.filter((c) => c.notasMes > 0).length;
  const inativos = enriquecidos.filter((c) => !c.ativo).length;

  const tipoMaisComum = useMemo(() => {
    const contagem = TIPOS.map((t) => ({
      tipo: t,
      qtd: lista.filter((c) => tiposDoCliente(c).includes(t)).length,
    })).sort((a, b) => b.qtd - a.qtd);
    return contagem[0]?.qtd ? TIPO_META[contagem[0].tipo].label : "—";
  }, [lista]);

  const filtrados = enriquecidos.filter((c) => {
    const okBusca = normalizar(c.nome).includes(normalizar(busca.trim()));
    const okTipo = filtroTipo === "todos" || c.tipos.includes(filtroTipo);
    return okBusca && okTipo;
  });

  const adicionar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("clientes")
        .insert({ nome: nome.trim(), tipo_emissao: tipos[0], tipos_emissao: tipos });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente cadastrado.");
      setNome("");
      setTipos(["comercio"]);
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (error: Error & { code?: string }) =>
      toast.error(mensagemDeErro(error, "Não foi possível cadastrar o cliente.")),
  });

  const salvarTipos = useMutation({
    mutationFn: async ({ id, novos }: { id: string; novos: TipoEmissao[] }) => {
      const { error } = await supabase
        .from("clientes")
        .update({ tipo_emissao: novos[0], tipos_emissao: novos })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tipos de emissão atualizados.");
      setEditando(null);
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (error: Error & { code?: string }) =>
      toast.error(mensagemDeErro(error, "Não foi possível salvar os tipos.")),
  });

  const abrirEdicao = (c: Cliente) => {
    setEditando(c);
    setTiposEdicao(tiposDoCliente(c));
  };

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clientes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente excluído.");
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (error: Error & { code?: string }) =>
      toast.error(
        // O banco não deixa nota sem cliente: cliente com notas não pode ser excluído.
        /notas_um_tipo_de_cliente/.test(error.message)
          ? "Este cliente tem notas lançadas e não pode ser excluído."
          : mensagemDeErro(error, "Não foi possível excluir."),
      ),
  });

  const notasDoHistorico = useMemo(() => {
    if (!historicoCliente) return [];
    const alvo = historicoCliente.trim().toLowerCase();
    const registro = lista.find((c) => c.nome === historicoCliente);
    return todasNotas.filter((n) =>
      n.cliente_id
        ? n.cliente_id === registro?.id
        : (n.cliente ?? "").trim().toLowerCase() === alvo,
    );
  }, [historicoCliente, todasNotas, lista]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Clientes</h1>
        <p className="text-sm text-muted-foreground">
          Cadastro e acompanhamento da atividade de emissão por cliente.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Clientes cadastrados"
          value={lista.length}
          icon={Users}
          loading={isLoading}
        />
        <KpiCard
          label="Ativos no mês"
          value={ativosMes}
          icon={UserCheck}
          accent="success"
          loading={isLoading}
        />
        <KpiCard
          label="Inativos (30 dias)"
          value={inativos}
          icon={UserX}
          accent="destructive"
          loading={isLoading}
        />
        <KpiCard
          label="Tipo mais comum"
          value={tipoMaisComum}
          icon={Layers}
          accent="warning"
          loading={isLoading}
        />
      </section>

      <Card className="rounded-lg border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Adicionar cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-start"
            onSubmit={(e) => {
              e.preventDefault();
              if (!nome.trim()) {
                toast.error("Informe o nome do cliente.");
                return;
              }
              adicionar.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="nome-cliente">Nome / razão social</Label>
              <Input
                id="nome-cliente"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do cliente..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tipos-cliente">Tipos de emissão</Label>
              <SeletorTipos id="tipos-cliente" value={tipos} onChange={setTipos} />
            </div>
            <Button type="submit" disabled={adicionar.isPending} className="lg:mt-6">
              <Plus className="size-4" /> Adicionar cliente
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-lg border-border shadow-card">
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Lista de clientes</CardTitle>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome..."
                className="pl-9"
                aria-label="Buscar cliente"
              />
            </div>
            <Select
              value={filtroTipo}
              onValueChange={(v) => setFiltroTipo(v as "todos" | TipoEmissao)}
            >
              <SelectTrigger className="sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                {TIPOS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIPO_META[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : filtrados.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhum cliente encontrado"
              description="Cadastre um cliente no formulário acima ou ajuste a busca e os filtros."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipos</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Notas no mês</TableHead>
                    <TableHead className="hidden md:table-cell">Última emissão</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrados.map((cliente) => (
                    <TableRow key={cliente.id}>
                      <TableCell className="font-medium text-foreground">{cliente.nome}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {cliente.tipos.map((t) => (
                            <TipoBadge key={t} tipo={t} />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="nums hidden text-right font-semibold text-foreground sm:table-cell">
                        {cliente.notasMes}
                      </TableCell>
                      <TableCell className="nums hidden text-muted-foreground md:table-cell">
                        {cliente.ultima
                          ? `${format(parseISO(cliente.ultima), "dd/MM/yyyy", { locale: ptBR })} · ${differenceInCalendarDays(hoje, parseISO(cliente.ultima))}d`
                          : "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {cliente.ativo ? (
                          <StatusPill tom="success">Ativo</StatusPill>
                        ) : (
                          <StatusPill tom="neutro">Inativo</StatusPill>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => abrirEdicao(cliente)}
                            aria-label={`Editar tipos de ${cliente.nome}`}
                          >
                            <Pencil className="size-4" />
                            <span className="hidden lg:inline">Editar tipos</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setHistoricoCliente(cliente.nome)}
                            aria-label={`Ver histórico de ${cliente.nome}`}
                          >
                            <History className="size-4" />
                            <span className="hidden lg:inline">Ver histórico</span>
                          </Button>
                          <ConfirmDeleteButton
                            title={`Excluir cliente ${cliente.nome}?`}
                            description="O cliente sai do cadastro. Clientes com notas lançadas não podem ser excluídos: o sistema avisa e não apaga nada."
                            onConfirm={async () => {
                              await excluir.mutateAsync(cliente.id);
                            }}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editando !== null} onOpenChange={(aberto) => !aberto && setEditando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tipos de emissão</DialogTitle>
            <DialogDescription>
              {editando?.nome}. O tipo principal é o sugerido ao lançar uma nota; as notas já
              lançadas não mudam.
            </DialogDescription>
          </DialogHeader>
          <SeletorTipos value={tiposEdicao} onChange={setTiposEdicao} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button
              disabled={salvarTipos.isPending || tiposEdicao.length === 0}
              onClick={() =>
                editando && salvarTipos.mutate({ id: editando.id, novos: tiposEdicao })
              }
            >
              Salvar tipos
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={historicoCliente !== null}
        onOpenChange={(aberto) => !aberto && setHistoricoCliente(null)}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Histórico de {historicoCliente}</DialogTitle>
            <DialogDescription>
              <span className="nums">{notasDoHistorico.length}</span>{" "}
              {notasDoHistorico.length === 1
                ? "nota fiscal registrada para este cliente."
                : "notas fiscais registradas para este cliente."}
            </DialogDescription>
          </DialogHeader>
          {notasDoHistorico.length === 0 ? (
            <EmptyState
              title="Nenhuma nota encontrada"
              description="Este cliente ainda não possui notas lançadas."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº NF</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notasDoHistorico.map((nota) => (
                  <TableRow key={nota.id}>
                    <TableCell className="font-mono text-sm">{nota.numero_nf}</TableCell>
                    <TableCell className="nums">
                      {format(parseISO(nota.data_emissao), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={nota.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
