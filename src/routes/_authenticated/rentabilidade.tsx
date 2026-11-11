import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { toast } from "sonner";
import { BarChart3, Flame, Gauge, Layers, Save } from "lucide-react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip as ReTooltip } from "recharts";

import { supabase, type NotaFiscal } from "@/lib/supabase";
import type { Cliente } from "@/lib/clientes";
import type { Obrigacao } from "@/lib/obrigacoes";
import type { Comunicacao } from "@/lib/comunicacoes";
import {
  COMPLEXIDADES,
  COMPLEXIDADE_META,
  calcularScore,
  nivelDemanda,
  type Complexidade,
  type RentabilidadeCliente,
} from "@/lib/rentabilidade";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/kpi-card";
import { EmptyState } from "@/components/empty-state";
import { TipoBadge } from "@/components/tipo-badge";
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

export const Route = createFileRoute("/_authenticated/rentabilidade")({
  head: () => ({
    meta: [
      { title: "Rentabilidade — Ofis" },
      {
        name: "description",
        content:
          "Painel de rentabilidade: complexidade por cliente e score de esforço calculado com notas, obrigações e comunicações.",
      },
      { property: "og:title", content: "Rentabilidade — Ofis" },
      {
        property: "og:description",
        content: "Score de esforço e complexidade de atendimento por cliente.",
      },
    ],
  }),
  component: RentabilidadePage,
});

const iso = (d: Date) => format(d, "yyyy-MM-dd");

function RentabilidadePage() {
  const queryClient = useQueryClient();
  const hoje = useMemo(() => new Date(), []);
  const inicioMes = iso(startOfMonth(hoje));
  const fimMes = iso(endOfMonth(hoje));

  const [clienteId, setClienteId] = useState("");
  const [complexidade, setComplexidade] = useState<Complexidade>("media");
  const [observacao, setObservacao] = useState("");
  const [detalhe, setDetalhe] = useState<string | null>(null);

  const { data: clientes, isLoading: l1 } = useQuery({
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

  const { data: classificacoes, isLoading: l2 } = useQuery({
    queryKey: ["rentabilidade"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rentabilidade_clientes").select("*");
      if (error) throw error;
      return (data ?? []) as RentabilidadeCliente[];
    },
  });

  const { data: notas, isLoading: l3 } = useQuery({
    queryKey: ["rentabilidade-notas", inicioMes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("*")
        .gte("data_emissao", inicioMes)
        .lte("data_emissao", fimMes);
      if (error) throw error;
      return (data ?? []) as NotaFiscal[];
    },
  });

  const { data: obrigacoes, isLoading: l4 } = useQuery({
    queryKey: ["rentabilidade-obrigacoes", inicioMes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obrigacoes_acessorias")
        .select("*")
        .gte("vencimento", inicioMes)
        .lte("vencimento", fimMes);
      if (error) throw error;
      return (data ?? []) as Obrigacao[];
    },
  });

  const { data: comunicacoes, isLoading: l5 } = useQuery({
    queryKey: ["rentabilidade-comunicacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comunicacoes")
        .select("*")
        .eq("status", "aberta");
      if (error) throw error;
      return (data ?? []) as Comunicacao[];
    },
  });

  const isLoading = l1 || l2 || l3 || l4 || l5;
  const lista = clientes ?? [];
  const classes = classificacoes ?? [];
  const classePorCliente = useMemo(
    () => new Map(classes.map((c) => [c.cliente_id, c] as const)),
    [classes],
  );

  const linhas = useMemo(() => {
    const todasNotas = notas ?? [];
    const todasObrig = obrigacoes ?? [];
    const todasCom = comunicacoes ?? [];
    return lista
      .map((cliente) => {
        const alvo = cliente.nome.trim().toLowerCase();
        const qtdNotas = todasNotas.filter((n) =>
          n.cliente_id
            ? n.cliente_id === cliente.id
            : (n.cliente ?? "").trim().toLowerCase() === alvo,
        ).length;
        const qtdObrig = todasObrig.filter((o) => o.cliente_id === cliente.id).length;
        const qtdCom = todasCom.filter((c) => c.cliente_id === cliente.id).length;
        const score = calcularScore(qtdNotas, qtdObrig, qtdCom);
        return { cliente, qtdNotas, qtdObrig, qtdCom, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [lista, notas, obrigacoes, comunicacoes]);

  const contagem = useMemo(
    () => ({
      alta: classes.filter((c) => c.complexidade === "alta").length,
      media: classes.filter((c) => c.complexidade === "media").length,
      baixa: classes.filter((c) => c.complexidade === "baixa").length,
    }),
    [classes],
  );

  const dadosRosca = COMPLEXIDADES.map((c) => ({
    name: COMPLEXIDADE_META[c].label,
    value: contagem[c],
    color: COMPLEXIDADE_META[c].color,
  })).filter((d) => d.value > 0);

  const salvar = useMutation({
    mutationFn: async (payload: {
      cliente_id: string;
      complexidade: Complexidade;
      observacao: string | null;
    }) => {
      const { error } = await supabase
        .from("rentabilidade_clientes")
        .upsert(payload, { onConflict: "cliente_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Classificação salva!");
      setObservacao("");
      queryClient.invalidateQueries({ queryKey: ["rentabilidade"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível salvar."),
  });

  const detalheLinha = linhas.find((l) => l.cliente.id === detalhe) ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Painel de Rentabilidade</h1>
        <p className="text-sm text-muted-foreground">
          Esforço de atendimento por cliente no mês atual, cruzando notas, obrigações e
          comunicações.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total classificados"
          value={classes.length}
          icon={Layers}
          loading={isLoading}
        />
        <KpiCard
          label="Alta complexidade"
          value={contagem.alta}
          icon={Flame}
          accent="destructive"
          loading={isLoading}
        />
        <KpiCard
          label="Média complexidade"
          value={contagem.media}
          icon={Gauge}
          accent="warning"
          loading={isLoading}
        />
        <KpiCard
          label="Baixa complexidade"
          value={contagem.baixa}
          icon={BarChart3}
          accent="success"
          loading={isLoading}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-lg border-border shadow-card lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Distribuição por complexidade</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : dadosRosca.length === 0 ? (
              <EmptyState
                title="Sem classificações"
                description="Classifique clientes no formulário ao lado."
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={dadosRosca} dataKey="value" nameKey="name" innerRadius={55}>
                    {dadosRosca.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <ReTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border shadow-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Classificar cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!clienteId) {
                  toast.error("Selecione um cliente.");
                  return;
                }
                salvar.mutate({
                  cliente_id: clienteId,
                  complexidade,
                  observacao: observacao.trim() || null,
                });
              }}
            >
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <Select value={clienteId} onValueChange={setClienteId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
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
                <Label>Complexidade</Label>
                <Select
                  value={complexidade}
                  onValueChange={(v) => setComplexidade(v as Complexidade)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPLEXIDADES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {COMPLEXIDADE_META[c].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="obs-rent">Observação</Label>
                <Textarea
                  id="obs-rent"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Notas sobre o atendimento deste cliente (opcional)"
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={salvar.isPending} className="hover-scale">
                  <Save className="size-4" /> Salvar classificação
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-lg border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Score de esforço por cliente</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : linhas.length === 0 ? (
            <EmptyState
              title="Nenhum cliente cadastrado"
              description="Cadastre clientes na página Clientes para calcular o score."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo emissão</TableHead>
                    <TableHead>Complexidade</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead>Nível demanda</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l, index) => {
                    const classe = classePorCliente.get(l.cliente.id);
                    const nivel = nivelDemanda(l.score);
                    return (
                      <TableRow
                        key={l.cliente.id}
                        className=""
                      >
                        <TableCell className="font-medium">{l.cliente.nome}</TableCell>
                        <TableCell>
                          <TipoBadge tipo={l.cliente.tipo_emissao} />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={classe?.complexidade ?? ""}
                            onValueChange={(v) =>
                              salvar.mutate({
                                cliente_id: l.cliente.id,
                                complexidade: v as Complexidade,
                                observacao: classe?.observacao ?? null,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-32">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {COMPLEXIDADES.map((c) => (
                                <SelectItem key={c} value={c}>
                                  {COMPLEXIDADE_META[c].label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{l.score}</TableCell>
                        <TableCell>
                          <Badge
                            className={`rounded-md border-transparent font-medium ${nivel.className}`}
                          >
                            {nivel.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDetalhe(l.cliente.id)}
                          >
                            Detalhes
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={detalhe !== null} onOpenChange={(aberto) => !aberto && setDetalhe(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes do score</DialogTitle>
            <DialogDescription>{detalheLinha?.cliente.nome}</DialogDescription>
          </DialogHeader>
          {detalheLinha ? (
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between rounded-md bg-secondary/50 px-3 py-2">
                <span>{detalheLinha.qtdNotas} nota(s) no mês × 1</span>
                <span className="font-semibold">{detalheLinha.qtdNotas}</span>
              </li>
              <li className="flex justify-between rounded-md bg-secondary/50 px-3 py-2">
                <span>{detalheLinha.qtdObrig} obrigação(ões) no mês × 3</span>
                <span className="font-semibold">{detalheLinha.qtdObrig * 3}</span>
              </li>
              <li className="flex justify-between rounded-md bg-secondary/50 px-3 py-2">
                <span>{detalheLinha.qtdCom} comunicação(ões) aberta(s) × 2</span>
                <span className="font-semibold">{detalheLinha.qtdCom * 2}</span>
              </li>
              <li className="flex justify-between rounded-md bg-primary/10 px-3 py-2 font-semibold text-primary">
                <span>Score total</span>
                <span>{detalheLinha.score}</span>
              </li>
              {classePorCliente.get(detalheLinha.cliente.id)?.observacao ? (
                <li className="text-muted-foreground">
                  {classePorCliente.get(detalheLinha.cliente.id)?.observacao}
                </li>
              ) : null}
            </ul>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
