import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

import { supabase, type NotaFiscal } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { TipoBadge } from "@/components/tipo-badge";
import { DeleteNotaButton } from "@/components/delete-nota-button";
import { EmptyState } from "@/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/notas-do-dia")({
  head: () => ({
    meta: [
      { title: "Notas do Dia — Ofis" },
      {
        name: "description",
        content: "Todas as notas fiscais emitidas hoje, atualizadas em tempo real.",
      },
      { property: "og:title", content: "Notas do Dia — Ofis" },
      {
        property: "og:description",
        content: "Acompanhe em tempo real as notas fiscais emitidas no dia.",
      },
    ],
  }),
  component: NotasDoDiaPage,
});

function NotasDoDiaPage() {
  const queryClient = useQueryClient();
  const hoje = format(new Date(), "yyyy-MM-dd");

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
      const { data, error } = await supabase.from("clientes").select("id, nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const nomePorId = new Map((clientes ?? []).map((c) => [c.id, c.nome] as const));
  const nomeCliente = (nota: NotaFiscal) =>
    (nota.cliente_id && nomePorId.get(nota.cliente_id)) || nota.cliente;

  const notas = data ?? [];

  async function excluir(nota: NotaFiscal) {
    const { error } = await supabase.from("notas_fiscais").delete().eq("id", nota.id);
    if (error) {
      toast.error("Erro ao excluir a nota.");
      return;
    }
    toast.success(`Nota ${nota.numero_nf} excluída.`);
    queryClient.invalidateQueries();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Notas do Dia</h1>
        <p className="text-sm text-muted-foreground">
          {format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </p>
      </header>

      <Card className="rounded-lg border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">
            {isLoading ? "Carregando notas..." : `${notas.length} notas emitidas hoje`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : notas.length === 0 ? (
            <EmptyState
              title="Nenhuma nota emitida hoje"
              description="As notas lançadas aparecem aqui automaticamente, em tempo real."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número NF</TableHead>
                    <TableHead>Hora do lançamento</TableHead>
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
                      <TableCell>{format(parseISO(nota.criado_em), "HH:mm")}</TableCell>
                      <TableCell className="max-w-[16rem] truncate">{nomeCliente(nota)}</TableCell>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
