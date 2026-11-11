import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Download, SearchX } from "lucide-react";

import { supabase, type NotaFiscal, type StatusNota, type TipoEmissao } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
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

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({
    meta: [
      { title: "Histórico — Ofis" },
      {
        name: "description",
        content:
          "Consulte todas as notas fiscais por período e status, com paginação e exportação em CSV.",
      },
      { property: "og:title", content: "Histórico — Ofis" },
      {
        property: "og:description",
        content: "Histórico completo de notas fiscais com filtros e exportação CSV.",
      },
    ],
  }),
  component: HistoricoPage,
});

const PAGE_SIZE = 20;

function HistoricoPage() {
  const queryClient = useQueryClient();
  const [dataInicio, setDataInicio] = useState(() =>
    format(startOfMonth(new Date()), "yyyy-MM-dd"),
  );
  const [dataFim, setDataFim] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [status, setStatus] = useState<"todos" | StatusNota>("todos");
  const [tipo, setTipo] = useState<"todos" | TipoEmissao>("todos");
  const [page, setPage] = useState(0);

  const filtros = useMemo(
    () => ({ dataInicio, dataFim, status, tipo, page }),
    [dataInicio, dataFim, status, tipo, page],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["historico", filtros],
    queryFn: async () => {
      let query = supabase
        .from("notas_fiscais")
        .select("*", { count: "exact" })
        .order("data_emissao", { ascending: false })
        .order("criado_em", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (dataInicio) query = query.gte("data_emissao", dataInicio);
      if (dataFim) query = query.lte("data_emissao", dataFim);
      if (status !== "todos") query = query.eq("status", status);
      if (tipo !== "todos") query = query.eq("tipo_emissao", tipo);

      const { data, count, error } = await query;
      if (error) throw error;
      return { notas: (data ?? []) as NotaFiscal[], total: count ?? 0 };
    },
  });

  const { data: clientes } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("id, nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const nomePorId = new Map((clientes ?? []).map((c) => [c.id, c.nome] as const));
  const nomeCliente = (nota: NotaFiscal) =>
    (nota.cliente_id && nomePorId.get(nota.cliente_id)) || nota.cliente;

  const notas = data?.notas ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setPage(0);
      setter(v);
    };
  }

  async function excluir(nota: NotaFiscal) {
    const { error } = await supabase.from("notas_fiscais").delete().eq("id", nota.id);
    if (error) {
      toast.error("Erro ao excluir a nota.");
      return;
    }
    toast.success(`Nota ${nota.numero_nf} excluída.`);
    queryClient.invalidateQueries();
  }

  async function exportarCsv() {
    let query = supabase
      .from("notas_fiscais")
      .select("numero_nf, data_emissao, cliente, status, tipo_emissao")
      .order("data_emissao", { ascending: false });
    if (dataInicio) query = query.gte("data_emissao", dataInicio);
    if (dataFim) query = query.lte("data_emissao", dataFim);
    if (status !== "todos") query = query.eq("status", status);
    if (tipo !== "todos") query = query.eq("tipo_emissao", tipo);

    const { data, error } = await query;
    if (error || !data) {
      toast.error("Erro ao exportar o CSV.");
      return;
    }

    const TIPO_LABEL: Record<string, string> = {
      comercio: "Comércio",
      servico: "Serviço",
      rural: "Rural",
    };
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const linhas = [
      ["Numero NF", "Data de emissao", "Cliente", "Status", "Tipo de Emissao"].join(";"),
      ...data.map((n) =>
        [
          escape(n.numero_nf),
          escape(format(parseISO(n.data_emissao), "dd/MM/yyyy")),
          escape(n.cliente),
          escape(n.status),
          escape(TIPO_LABEL[n.tipo_emissao] ?? n.tipo_emissao),
        ].join(";"),
      ),
    ].join("\n");

    const blob = new Blob([`\uFEFF${linhas}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `notas-fiscais-${dataInicio}-a-${dataFim}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`${data.length} notas exportadas.`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Histórico</h1>
        <p className="text-sm text-muted-foreground">
          Consulte e exporte as notas fiscais por período e status.
        </p>
      </header>

      <Card className="rounded-lg border-border shadow-card">
        <CardContent className="grid gap-4 py-5 md:grid-cols-3 md:items-end lg:grid-cols-5">
          <div className="space-y-2">
            <Label htmlFor="inicio">Data início</Label>
            <Input
              id="inicio"
              type="date"
              value={dataInicio}
              onChange={(e) => resetPage(setDataInicio)(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fim">Data fim</Label>
            <Input
              id="fim"
              type="date"
              value={dataFim}
              onChange={(e) => resetPage(setDataFim)(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="filtro-status">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => resetPage(setStatus)(v as "todos" | StatusNota)}
            >
              <SelectTrigger id="filtro-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="autorizada">Autorizada</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
                <SelectItem value="denegada">Denegada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="filtro-tipo">Tipo de Emissão</Label>
            <Select
              value={tipo}
              onValueChange={(v) => resetPage(setTipo)(v as "todos" | TipoEmissao)}
            >
              <SelectTrigger id="filtro-tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="comercio">Comércio</SelectItem>
                <SelectItem value="servico">Serviço</SelectItem>
                <SelectItem value="rural">Rural</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={exportarCsv} className="w-full md:w-auto">
            <Download className="size-4" />
            Exportar CSV
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-lg border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">
            {isLoading ? "Carregando..." : `${total} notas encontradas`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : notas.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Nenhuma nota encontrada"
              description="Ajuste o período, o status ou o tipo de emissão para ver resultados."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número NF</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notas.map((nota) => (
                      <TableRow key={nota.id}>
                        <TableCell className="font-medium">{nota.numero_nf}</TableCell>
                        <TableCell>
                          {format(parseISO(nota.data_emissao), "dd/MM/yyyy", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="max-w-[18rem] truncate">
                          {nomeCliente(nota)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={nota.status} />
                        </TableCell>
                        <TableCell>
                          <TipoBadge tipo={nota.tipo_emissao} />
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

              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  Página {page + 1} de {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page + 1 >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
