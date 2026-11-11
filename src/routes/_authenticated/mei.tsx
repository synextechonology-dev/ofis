import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Gauge, Pencil, TrendingUp, Users } from "lucide-react";

import { supabase } from "@/lib/supabase";
import type { Cliente } from "@/lib/clientes";
import { LIMITE_MEI_PADRAO, faixaMei, moeda, type MeiFaturamento } from "@/lib/mei";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/kpi-card";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

export const Route = createFileRoute("/_authenticated/mei")({
  head: () => ({
    meta: [
      { title: "Controle MEI — Ofis" },
      {
        name: "description",
        content:
          "Acompanhe o faturamento anual dos clientes MEI, o percentual do limite utilizado e os alertas de desenquadramento.",
      },
      { property: "og:title", content: "Controle MEI — Ofis" },
      {
        property: "og:description",
        content: "Faturamento acumulado, limite anual e alertas de risco para clientes MEI.",
      },
    ],
  }),
  component: MeiPage,
});

function MeiPage() {
  const queryClient = useQueryClient();
  const anoAtual = new Date().getFullYear();

  const [clienteId, setClienteId] = useState("");
  const [faturamento, setFaturamento] = useState("");
  const [limite, setLimite] = useState(String(LIMITE_MEI_PADRAO));
  const [ano, setAno] = useState(String(anoAtual));
  const [editando, setEditando] = useState<MeiFaturamento | null>(null);
  const [editValor, setEditValor] = useState("");

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

  const { data: registros, isLoading: loadingMei } = useQuery({
    queryKey: ["mei-faturamento", anoAtual],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mei_faturamento")
        .select("*")
        .eq("ano", anoAtual);
      if (error) throw error;
      return (data ?? []) as MeiFaturamento[];
    },
  });

  const isLoading = loadingClientes || loadingMei;
  const lista = clientes ?? [];
  const nomePorId = useMemo(
    () => new Map(lista.map((c) => [c.id, c.nome] as const)),
    [lista],
  );

  const linhas = useMemo(() => {
    return (registros ?? [])
      .map((r) => {
        const limiteAnual = Number(r.limite_anual) || LIMITE_MEI_PADRAO;
        const valor = Number(r.faturamento) || 0;
        const pct = limiteAnual > 0 ? (valor / limiteAnual) * 100 : 0;
        return {
          ...r,
          faturamento: valor,
          limite_anual: limiteAnual,
          nome: nomePorId.get(r.cliente_id) ?? "Cliente removido",
          pct,
          faixa: faixaMei(pct),
        };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [registros, nomePorId]);

  const clientesMei = useMemo(() => {
    const ids = new Set(linhas.map((l) => l.cliente_id));
    const porNome = lista.filter((c) => c.nome.toUpperCase().includes("MEI"));
    for (const c of porNome) ids.add(c.id);
    return ids.size;
  }, [linhas, lista]);

  const proximos = linhas.filter((l) => l.pct >= 70).length;
  const ultrapassaram = linhas.filter((l) => l.pct >= 100).length;
  const mediaUso = linhas.length
    ? Math.round(linhas.reduce((acc, l) => acc + l.pct, 0) / linhas.length)
    : 0;

  const criticos = linhas.filter((l) => l.pct >= 85);

  const registrar = useMutation({
    mutationFn: async () => {
      if (!clienteId) throw new Error("Selecione um cliente.");
      const valor = Number(faturamento.replace(",", "."));
      const limiteAnual = Number(limite.replace(",", ".")) || LIMITE_MEI_PADRAO;
      if (!Number.isFinite(valor) || valor < 0) throw new Error("Informe um faturamento válido.");
      const { error } = await supabase.from("mei_faturamento").upsert(
        {
          cliente_id: clienteId,
          ano: Number(ano),
          faturamento: valor,
          limite_anual: limiteAnual,
        },
        { onConflict: "cliente_id,ano" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Faturamento registrado com sucesso!");
      setClienteId("");
      setFaturamento("");
      setLimite(String(LIMITE_MEI_PADRAO));
      setAno(String(anoAtual));
      queryClient.invalidateQueries({ queryKey: ["mei-faturamento"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível registrar."),
  });

  const atualizar = useMutation({
    mutationFn: async () => {
      if (!editando) return;
      const valor = Number(editValor.replace(",", "."));
      if (!Number.isFinite(valor) || valor < 0) throw new Error("Informe um faturamento válido.");
      const { error } = await supabase
        .from("mei_faturamento")
        .update({ faturamento: valor })
        .eq("id", editando.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Faturamento atualizado.");
      setEditando(null);
      queryClient.invalidateQueries({ queryKey: ["mei-faturamento"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível atualizar."),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("mei_faturamento").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro excluído.");
      queryClient.invalidateQueries({ queryKey: ["mei-faturamento"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível excluir."),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Controle MEI</h1>
        <p className="text-sm text-muted-foreground">
          Faturamento acumulado e utilização do limite anual dos clientes MEI em {anoAtual}.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Clientes MEI" value={clientesMei} icon={Users} loading={isLoading} />
        <KpiCard
          label="Próximos do limite (≥70%)"
          value={proximos}
          icon={AlertTriangle}
          accent="warning"
          loading={isLoading}
        />
        <KpiCard
          label="Ultrapassaram o limite"
          value={ultrapassaram}
          icon={TrendingUp}
          accent="destructive"
          loading={isLoading}
        />
        <KpiCard
          label="Média de utilização"
          value={`${mediaUso}%`}
          icon={Gauge}
          loading={isLoading}
        />
      </section>

      <Card className="rounded-lg border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Registrar faturamento</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-5"
            onSubmit={(e) => {
              e.preventDefault();
              registrar.mutate();
            }}
          >
            <div className="space-y-1.5 md:col-span-2">
              <Label>Cliente</Label>
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {lista.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fat">Faturamento (R$)</Label>
              <Input
                id="fat"
                type="number"
                min="0"
                step="0.01"
                value={faturamento}
                onChange={(e) => setFaturamento(e.target.value)}
                placeholder="0,00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lim">Limite anual (R$)</Label>
              <Input
                id="lim"
                type="number"
                min="0"
                step="0.01"
                value={limite}
                onChange={(e) => setLimite(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Select value={ano} onValueChange={setAno}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={String(anoAtual)}>{anoAtual}</SelectItem>
                  <SelectItem value={String(anoAtual - 1)}>{anoAtual - 1}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-5">
              <Button type="submit" disabled={registrar.isPending}>
                {registrar.isPending ? "Registrando..." : "Registrar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {criticos.length > 0 && (
        <Card
          className={cn(
            "block-in rounded-lg border-l-4 shadow-card",
            ultrapassaram > 0 ? "border-l-destructive" : "border-l-warning",
          )}
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle
                className={cn("size-4.5", ultrapassaram > 0 ? "text-destructive" : "text-warning")}
              />
              Atenção ao limite MEI
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="space-y-1">
              {criticos.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3">
                  <span className="truncate font-medium">{l.nome}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {Math.round(l.pct)}% · {moeda(l.faturamento)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              Recomendação: revise as emissões, avalie o desenquadramento para ME e comunique o
              cliente antes do fechamento do ano.
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-lg border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Clientes MEI — {anoAtual}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : linhas.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="Nenhum faturamento registrado"
              description="Registre o faturamento acumulado dos clientes MEI para acompanhar o limite anual."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Faturamento</TableHead>
                    <TableHead>Limite anual</TableHead>
                    <TableHead className="min-w-48">% Utilizado</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => (
                    <TableRow key={l.id} className="row-in hover:bg-row-hover">
                      <TableCell className="font-medium">{l.nome}</TableCell>
                      <TableCell>{moeda(l.faturamento)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {moeda(l.limite_anual)}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn("h-full rounded-full transition-all", l.faixa.barra)}
                              style={{ width: `${Math.min(100, Math.round(l.pct))}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {Math.round(l.pct)}% · {l.faixa.label}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            "rounded-md border-transparent font-medium",
                            l.faixa.badge,
                          )}
                        >
                          {l.faixa.badgeLabel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Editar faturamento"
                            onClick={() => {
                              setEditando(l);
                              setEditValor(String(l.faturamento));
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <ConfirmDeleteButton
                            title="Excluir registro de faturamento?"
                            description={`O registro de ${l.nome} será removido.`}
                            onConfirm={async () => {
                              await excluir.mutateAsync(l.id);
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

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar faturamento</DialogTitle>
            <DialogDescription>
              {editando ? nomePorId.get(editando.cliente_id) ?? "Cliente" : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="edit-fat">Faturamento acumulado (R$)</Label>
            <Input
              id="edit-fat"
              type="number"
              min="0"
              step="0.01"
              value={editValor}
              onChange={(e) => setEditValor(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button onClick={() => atualizar.mutate()} disabled={atualizar.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
