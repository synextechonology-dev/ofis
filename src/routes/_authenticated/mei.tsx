import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ReceiptText, TrendingUp } from "lucide-react";

import { supabase, mensagemDeErro } from "@/lib/supabase";
import type { Cliente } from "@/lib/clientes";
import { LIMITE_MEI_PADRAO, MESES_LONGOS, faixaMei, moeda, pctDoLimite } from "@/lib/mei";
import { invalidarMei, registrarMes, useMeiAno } from "@/lib/mei-dados";
import { lerReais } from "@/lib/esporadicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { AvisoMei, MeiMeterCompacto } from "@/components/mei-limite";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
        content: "Faturamento dos clientes MEI frente ao limite anual, mês a mês.",
      },
    ],
  }),
  component: MeiPage,
});

type Filtro = "todos" | "risco";

function MeiPage() {
  const queryClient = useQueryClient();
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;

  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [clienteId, setClienteId] = useState("");
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState(mesAtual);
  const [valorTexto, setValorTexto] = useState("");
  const [erroValor, setErroValor] = useState("");
  const [salvando, setSalvando] = useState(false);

  const { data: clientes, isLoading: carregandoClientes } = useQuery({
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
  const { data: cabecalhos, isLoading: carregandoMei } = useMeiAno(anoAtual);
  const { data: cabecalhosForm } = useMeiAno(ano);

  const nomePorId = useMemo(
    () => new Map((clientes ?? []).map((c) => [c.id, c.nome] as const)),
    [clientes],
  );

  const linhas = useMemo(
    () =>
      (cabecalhos ?? [])
        .map((r) => {
          const limite = r.limite_anual || LIMITE_MEI_PADRAO;
          const pct = pctDoLimite(r.faturamento, limite);
          return {
            ...r,
            limite,
            pct,
            faixa: faixaMei(pct),
            nome: nomePorId.get(r.cliente_id) ?? "Cliente removido",
          };
        })
        .sort((a, b) => b.pct - a.pct),
    [cabecalhos, nomePorId],
  );

  const visiveis = filtro === "todos" ? linhas : linhas.filter((l) => l.faixa.key !== "regular");
  const acima80 = linhas.filter((l) => l.faixa.key === "atencao").length;
  const excedidos = linhas.filter((l) => l.faixa.key === "excedido").length;

  // Formulário: MEIs acompanhados primeiro; qualquer cliente pode começar a ser acompanhado.
  const idsMei = new Set((cabecalhos ?? []).map((c) => c.cliente_id));
  const clientesMei = (clientes ?? []).filter((c) => idsMei.has(c.id));
  const outrosClientes = (clientes ?? []).filter((c) => !idsMei.has(c.id));
  const cabecalhoSel = (cabecalhosForm ?? []).find((c) => c.cliente_id === clienteId);
  const valor = lerReais(valorTexto);

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (!clienteId) {
      toast.error("Escolha o cliente MEI.");
      return;
    }
    if (!(valor > 0)) {
      setErroValor("Informe um valor maior que zero.");
      return;
    }
    setSalvando(true);
    const { error } = await registrarMes({ clienteId, ano, mes, valor, modo: "somar" });
    setSalvando(false);
    if (error) {
      toast.error(mensagemDeErro(error, "Não foi possível registrar o faturamento."));
      return;
    }
    toast.success(
      `Faturamento de ${moeda(valor)} registrado para ${nomePorId.get(clienteId)} em ${MESES_LONGOS[mes - 1]!.toLowerCase()}.`,
    );
    setValorTexto("");
    await invalidarMei(queryClient, ano);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Controle MEI</h1>
        <p className="text-sm text-muted-foreground">
          Faturamento acumulado de {anoAtual} frente ao limite anual de{" "}
          <span className="nums">{moeda(LIMITE_MEI_PADRAO)}</span>.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { rotulo: "Clientes MEI", valor: linhas.length, rodape: `acompanhados em ${anoAtual}` },
          {
            rotulo: "Acima de 80%",
            valor: acima80,
            rodape: <StatusPill tom="warning">Atenção</StatusPill>,
          },
          {
            rotulo: "Limite excedido",
            valor: excedidos,
            rodape: <StatusPill tom="danger">Desenquadramento</StatusPill>,
          },
        ].map((k) => (
          <Card key={k.rotulo} className="rounded-lg border-border shadow-kpi">
            <CardContent className="space-y-1 py-4">
              <p className="text-sm text-muted-foreground">{k.rotulo}</p>
              {carregandoMei ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="nums text-2xl font-semibold text-foreground">{k.valor}</p>
              )}
              <div className="text-xs text-muted-foreground">{k.rodape}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="rounded-lg border-border shadow-card lg:col-span-8">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4 text-muted-foreground" />
              Clientes MEI — {anoAtual}
            </CardTitle>
            <div
              className="inline-flex rounded-md border border-border p-0.5"
              role="group"
              aria-label="Filtro"
            >
              {(
                [
                  ["todos", "Todos"],
                  ["risco", "Em risco"],
                ] as const
              ).map(([v, r]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={filtro === v}
                  onClick={() => setFiltro(v)}
                  className="h-7 rounded-[6px] px-3 text-sm text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-secondary aria-pressed:text-foreground"
                >
                  {r}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {carregandoMei || carregandoClientes ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : visiveis.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title={filtro === "risco" ? "Nenhum MEI em risco" : "Nenhum MEI acompanhado ainda"}
                description={
                  filtro === "risco"
                    ? "Nenhum cliente passou de 80% do limite."
                    : "Registre o faturamento de um mês ao lado para começar a acompanhar o cliente."
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Faturamento</TableHead>
                      <TableHead className="min-w-52">% do limite</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visiveis.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <Link
                            to="/mei/$clienteId"
                            params={{ clienteId: l.cliente_id }}
                            className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                            title="Ver meses, notas e limite do cliente"
                          >
                            {l.nome}
                          </Link>
                        </TableCell>
                        <TableCell className="nums text-right">{moeda(l.faturamento)}</TableCell>
                        <TableCell>
                          <MeiMeterCompacto pct={l.pct} rotulo={`Uso do limite de ${l.nome}`} />
                        </TableCell>
                        <TableCell>
                          <StatusPill tom={l.faixa.tom}>{l.faixa.label}</StatusPill>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border shadow-card lg:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ReceiptText className="size-4 text-muted-foreground" />
              Registrar faturamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={registrar} noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="mei-cliente">Cliente MEI</Label>
                <Select value={clienteId} onValueChange={setClienteId}>
                  <SelectTrigger id="mei-cliente">
                    <SelectValue placeholder="Escolha o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientesMei.length ? (
                      <SelectGroup>
                        <SelectLabel>Acompanhados</SelectLabel>
                        {clientesMei.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ) : null}
                    <SelectGroup>
                      <SelectLabel>Começar a acompanhar</SelectLabel>
                      {outrosClientes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="mei-mes">Mês</Label>
                  <Select
                    value={`${ano}-${mes}`}
                    onValueChange={(v) => {
                      const [a, m] = v.split("-").map(Number);
                      setAno(a!);
                      setMes(m!);
                    }}
                  >
                    <SelectTrigger id="mei-mes">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: mesAtual }, (_, i) => mesAtual - i).map((m) => (
                        <SelectItem key={`${anoAtual}-${m}`} value={`${anoAtual}-${m}`}>
                          {MESES_LONGOS[m - 1]}
                        </SelectItem>
                      ))}
                      <SelectGroup>
                        <SelectLabel>{anoAtual - 1}</SelectLabel>
                        {Array.from({ length: 12 }, (_, i) => 12 - i).map((m) => (
                          <SelectItem key={`${anoAtual - 1}-${m}`} value={`${anoAtual - 1}-${m}`}>
                            {MESES_LONGOS[m - 1]} de {anoAtual - 1}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mei-valor">Valor (R$)</Label>
                  <Input
                    id="mei-valor"
                    inputMode="decimal"
                    placeholder="0,00"
                    className="nums"
                    value={valorTexto}
                    aria-invalid={!!erroValor}
                    aria-describedby={erroValor ? "mei-valor-erro" : undefined}
                    onChange={(e) => {
                      setValorTexto(e.target.value);
                      setErroValor("");
                    }}
                  />
                </div>
              </div>
              {erroValor ? (
                <p id="mei-valor-erro" className="text-sm text-destructive">
                  {erroValor}
                </p>
              ) : null}
              {clienteId ? (
                <AvisoMei
                  nome={nomePorId.get(clienteId) ?? "Cliente"}
                  acumulado={cabecalhoSel?.faturamento ?? 0}
                  adicional={valor > 0 ? valor : 0}
                  limite={cabecalhoSel?.limite_anual || LIMITE_MEI_PADRAO}
                />
              ) : null}
              <p className="text-xs text-muted-foreground">
                O valor é somado ao que já estiver lançado no mês. Para corrigir um mês, abra o
                cliente na lista.
              </p>
              <Button type="submit" className="w-full" disabled={salvando}>
                {salvando ? <Loader2 className="animate-spin" /> : null}
                Registrar faturamento
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
