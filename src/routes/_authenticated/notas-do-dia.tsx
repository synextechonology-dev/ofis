import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { FilePlus2, Search } from "lucide-react";

import {
  supabase,
  mensagemDeErro,
  type NotaFiscal,
  type StatusNota,
  type TipoEmissao,
} from "@/lib/supabase";
import { normalizar } from "@/lib/navegacao";
import { TIPO_META } from "@/lib/nf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, StatusPill } from "@/components/status-badge";
import { TipoBadge } from "@/components/tipo-badge";
import { DeleteNotaButton } from "@/components/delete-nota-button";
import { EmptyState } from "@/components/empty-state";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notas-do-dia")({
  head: () => ({
    meta: [
      { title: "Notas do Dia — Ofis" },
      {
        name: "description",
        content: "Todas as notas fiscais emitidas hoje, atualizadas em tempo real.",
      },
    ],
  }),
  component: NotasDoDiaPage,
});

type FiltroStatus = "todos" | StatusNota;
const PONTO: Record<StatusNota, string> = {
  autorizada: "bg-success",
  cancelada: "bg-destructive",
  denegada: "bg-warning",
};
const ROTULO_CHIP: Record<FiltroStatus, string> = {
  todos: "Todas",
  autorizada: "Autorizadas",
  cancelada: "Canceladas",
  denegada: "Denegadas",
};

function NotasDoDiaPage() {
  const queryClient = useQueryClient();
  const hoje = format(new Date(), "yyyy-MM-dd");
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<"todos" | TipoEmissao>("todos");
  const [status, setStatus] = useState<FiltroStatus>("todos");

  const { data, isLoading } = useQuery({
    queryKey: ["notas-do-dia", hoje],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("*")
        .eq("data_emissao", hoje)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NotaFiscal[];
    },
  });

  // Atualiza sozinha quando alguém lança, altera ou exclui uma nota.
  useEffect(() => {
    const channel = supabase
      .channel("notas-do-dia-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "notas_fiscais" }, () => {
        queryClient.invalidateQueries({ queryKey: ["notas-do-dia", hoje] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, hoje]);

  const { data: clientes } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const nomePorId = useMemo(
    () => new Map((clientes ?? []).map((c) => [c.id, c.nome] as const)),
    [clientes],
  );
  const nomeCliente = (nota: NotaFiscal) =>
    (nota.cliente_id && nomePorId.get(nota.cliente_id)) || nota.cliente;

  const notas = useMemo(() => data ?? [], [data]);

  // Busca e tipo valem para as contagens dos chips; o status filtra a tabela.
  const base = useMemo(() => {
    const q = normalizar(busca.trim());
    return notas.filter(
      (n) =>
        (tipo === "todos" || n.tipo_emissao === tipo) &&
        (!q || n.numero_nf.includes(busca.trim()) || normalizar(n.cliente).includes(q)),
    );
  }, [notas, busca, tipo]);
  const linhas = status === "todos" ? base : base.filter((n) => n.status === status);
  const contar = (s: FiltroStatus) =>
    s === "todos" ? base.length : base.filter((n) => n.status === s).length;

  const comProblema = notas.filter((n) => n.status !== "autorizada").length;
  const esporadicas = notas.filter((n) => !!n.cliente_esporadico_id).length;
  const filtrando = !!busca.trim() || tipo !== "todos" || status !== "todos";

  function limparFiltros() {
    setBusca("");
    setTipo("todos");
    setStatus("todos");
  }

  async function excluir(nota: NotaFiscal) {
    const { error } = await supabase.from("notas_fiscais").delete().eq("id", nota.id);
    if (error) {
      toast.error(mensagemDeErro(error, "Erro ao excluir a nota."));
      return;
    }
    toast.success(`Nota ${nota.numero_nf} excluída.`);
    queryClient.invalidateQueries();
  }

  const dataExtenso = format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Notas do Dia</h1>
          <p className="text-sm text-muted-foreground">
            {dataExtenso.charAt(0).toUpperCase() + dataExtenso.slice(1)} ·{" "}
            <span className="nums">{notas.length}</span>{" "}
            {notas.length === 1 ? "nota lançada" : "notas lançadas"}
          </p>
        </div>
        <Button asChild>
          <Link to="/lancar-nota">
            <FilePlus2 />
            Lançar nota
          </Link>
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Resumo rotulo="Lançadas hoje">
          <span className="nums text-2xl font-semibold text-foreground">{notas.length}</span>
        </Resumo>
        <Resumo rotulo="Para esporádicos">
          <span className="nums text-2xl font-semibold text-foreground">{esporadicas}</span>
        </Resumo>
        <Resumo rotulo="Com problema">
          <div className="flex items-center gap-2.5">
            <span className="nums text-2xl font-semibold text-foreground">{comProblema}</span>
            {comProblema ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStatus(contar("denegada") ? "denegada" : "cancelada")}
              >
                Ver
              </Button>
            ) : (
              <StatusPill tom="success">Nenhum</StatusPill>
            )}
          </div>
        </Resumo>
      </div>

      <Card className="rounded-lg border-border shadow-card">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full space-y-1.5 sm:w-auto sm:min-w-56 sm:flex-1">
              <Label htmlFor="nd-busca">Buscar</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="nd-busca"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Cliente ou número da nota"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-full space-y-1.5 sm:w-44">
              <Label htmlFor="nd-tipo">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as "todos" | TipoEmissao)}>
                <SelectTrigger id="nd-tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {(["comercio", "servico", "rural"] as TipoEmissao[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_META[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {filtrando ? (
              <Button variant="ghost" onClick={limparFiltros}>
                Limpar filtros
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
            {(["todos", "autorizada", "cancelada", "denegada"] as FiltroStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-foreground/40 aria-pressed:bg-secondary aria-pressed:text-foreground"
              >
                {s !== "todos" ? (
                  <span aria-hidden className={cn("size-1.5 rounded-full", PONTO[s])} />
                ) : null}
                {ROTULO_CHIP[s]} <span className="nums font-semibold">{contar(s)}</span>
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : linhas.length === 0 ? (
            notas.length === 0 ? (
              <EmptyState
                icon={FilePlus2}
                title="Nenhuma nota emitida hoje"
                description="As notas lançadas aparecem aqui sozinhas, em tempo real."
              />
            ) : (
              <EmptyState
                icon={Search}
                title="Nenhuma nota com esses filtros"
                description="Tente outro termo de busca ou limpe os filtros."
              />
            )
          ) : (
            <>
              <div className="max-h-[620px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nº NF</TableHead>
                      <TableHead className="hidden sm:table-cell">Lançamento</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="hidden md:table-cell">Tipo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">Ações</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((nota) => (
                      <TableRow key={nota.id}>
                        <TableCell className="font-mono text-sm">{nota.numero_nf}</TableCell>
                        <TableCell className="nums hidden text-muted-foreground sm:table-cell">
                          {format(parseISO(nota.criado_em), "HH:mm")}
                        </TableCell>
                        <TableCell className="max-w-[12rem] sm:max-w-[20rem]">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-medium text-foreground">
                              {nomeCliente(nota)}
                            </span>
                            {nota.cliente_esporadico_id ? (
                              <span className="inline-flex h-5 shrink-0 items-center rounded-[4px] border border-border px-1.5 text-xs text-muted-foreground">
                                Esporádico
                              </span>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <TipoBadge tipo={nota.tipo_emissao} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={nota.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <DeleteNotaButton
                            numeroNf={nota.numero_nf}
                            onConfirm={() => excluir(nota)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                Mostrando <span className="nums">{linhas.length}</span> de{" "}
                <span className="nums">{notas.length}</span>. A lista se atualiza sozinha quando
                alguém lança ou exclui uma nota.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Resumo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <Card className="rounded-lg border-border shadow-kpi">
      <CardContent className="space-y-1.5 py-4">
        <p className="text-sm font-medium text-muted-foreground">{rotulo}</p>
        {children}
      </CardContent>
    </Card>
  );
}
