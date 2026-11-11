import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Copy, FileDown, FileCheck2, Loader2, Search, UserPlus } from "lucide-react";

import { supabase, mensagemDeErro } from "@/lib/supabase";
import {
  formatarDocumento,
  formatarReais,
  valorDaNota,
  type ClienteEsporadico,
  type LinhaRelatorioEsporadico,
} from "@/lib/esporadicos";
import { gerarRelatorioEsporadicosPdf, mensagemFinanceiro } from "@/lib/relatorio-esporadicos-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { TipoBadge } from "@/components/tipo-badge";
import { EmptyState } from "@/components/empty-state";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/esporadicos")({
  head: () => ({
    meta: [
      { title: "Clientes esporádicos — Ofis" },
      {
        name: "description",
        content:
          "Notas emitidas para quem não é cliente do escritório, prontas para o financeiro cobrar.",
      },
    ],
  }),
  component: EsporadicosPage,
});

type Filtro = "arepassar" | "repassadas" | "todas";

const mesDe = (iso: string) => iso.slice(0, 7); // "2026-11"
const rotuloMes = (ym: string) => {
  const s = format(parseISO(`${ym}-01`), "MMMM 'de' yyyy", { locale: ptBR });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const normalizar = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function EsporadicosPage() {
  const queryClient = useQueryClient();
  const mesAtual = format(new Date(), "yyyy-MM");
  const [periodo, setPeriodo] = useState<string>(mesAtual);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("arepassar");
  const [cobrarCanceladas, setCobrarCanceladas] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [dialogo, setDialogo] = useState(false);
  const [para, setPara] = useState("Financeiro");
  const [observacao, setObservacao] = useState("");

  const { data: linhas, isLoading } = useQuery({
    queryKey: ["relatorio-esporadicos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("relatorio_financeiro_esporadicos")
        .select("*")
        .order("data_emissao", { ascending: false })
        .order("numero_nf", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LinhaRelatorioEsporadico[];
    },
  });

  const { data: base } = useQuery({
    queryKey: ["clientes-esporadicos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes_esporadicos")
        .select("*")
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClienteEsporadico[];
    },
  });

  const todas = linhas ?? [];
  const meses = useMemo(() => {
    const set = new Set(todas.map((l) => mesDe(l.data_emissao)));
    set.add(mesAtual);
    return [...set].sort().reverse();
  }, [todas, mesAtual]);

  const cobravel = (l: LinhaRelatorioEsporadico) => l.status === "autorizada" || cobrarCanceladas;

  const doPeriodo = useMemo(() => {
    const q = normalizar(busca.trim());
    const qDig = busca.replace(/\D/g, "");
    return todas.filter((l) => {
      if (periodo !== "todos" && mesDe(l.data_emissao) !== periodo) return false;
      if (!q) return true;
      return (
        normalizar(l.nome).includes(q) ||
        (qDig.length > 0 && (l.documento ?? "").includes(qDig)) ||
        l.numero_nf.includes(busca.trim())
      );
    });
  }, [todas, periodo, busca]);

  const aRepassar = doPeriodo.filter((l) => cobravel(l) && !l.repassado_financeiro_em);
  const repassadas = doPeriodo.filter((l) => !!l.repassado_financeiro_em);
  const visiveis =
    filtro === "arepassar" ? aRepassar : filtro === "repassadas" ? repassadas : doPeriodo;

  // Notas que entram no relatório: as selecionadas, ou todas as a repassar do período.
  const doRelatorio = selecionadas.size
    ? doPeriodo.filter((l) => selecionadas.has(l.nota_id))
    : aRepassar;
  const totalRelatorio = doRelatorio.reduce((s, l) => s + valorDaNota(l.valor_cobranca), 0);
  const rotuloPeriodo = periodo === "todos" ? "Todos os períodos" : rotuloMes(periodo);

  const selecionaveis = visiveis.filter((l) => cobravel(l) && !l.repassado_financeiro_em);
  const todasMarcadas =
    selecionaveis.length > 0 && selecionaveis.every((l) => selecionadas.has(l.nota_id));

  function alternar(id: string, marcar: boolean) {
    setSelecionadas((atual) => {
      const novo = new Set(atual);
      if (marcar) novo.add(id);
      else novo.delete(id);
      return novo;
    });
  }

  async function marcarRepassadas(ids: string[]) {
    if (!ids.length) return;
    setSalvando(true);
    const { error } = await supabase
      .from("notas_fiscais")
      .update({ repassado_financeiro_em: new Date().toISOString() })
      .in("id", ids);
    setSalvando(false);
    if (error) {
      toast.error(mensagemDeErro(error, "Não foi possível marcar as notas como repassadas."));
      return;
    }
    setSelecionadas(new Set());
    await queryClient.invalidateQueries({ queryKey: ["relatorio-esporadicos"] });
    toast.success(
      `${ids.length} ${ids.length === 1 ? "nota marcada como repassada" : "notas marcadas como repassadas"}`,
      {
        action: {
          label: "Desfazer",
          onClick: async () => {
            const { error: e2 } = await supabase
              .from("notas_fiscais")
              .update({ repassado_financeiro_em: null })
              .in("id", ids);
            if (e2) toast.error(mensagemDeErro(e2));
            queryClient.invalidateQueries({ queryKey: ["relatorio-esporadicos"] });
          },
        },
      },
    );
  }

  async function copiarMensagem() {
    const texto = mensagemFinanceiro({
      linhas: doRelatorio,
      periodo: rotuloPeriodo,
      para,
      observacao,
    });
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Mensagem copiada. Cole no WhatsApp ou no e-mail.");
    } catch {
      toast.error("Não foi possível copiar automaticamente.");
    }
  }

  function baixarPdf() {
    gerarRelatorioEsporadicosPdf({ linhas: doRelatorio, periodo: rotuloPeriodo, para, observacao });
  }

  const contagemPorCliente = useMemo(() => {
    const m = new Map<string, { n: number; ultima: string }>();
    for (const l of todas) {
      const a = m.get(l.cliente_esporadico_id);
      if (!a) m.set(l.cliente_esporadico_id, { n: 1, ultima: l.data_emissao });
      else {
        a.n += 1;
        if (l.data_emissao > a.ultima) a.ultima = l.data_emissao;
      }
    }
    return m;
  }, [todas]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clientes esporádicos</h1>
          <p className="text-sm text-muted-foreground">
            Notas emitidas para quem não é cliente do escritório. Gere o relatório e repasse ao
            financeiro para cobrança.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setDialogo(true)} disabled={!doRelatorio.length}>
            <FileDown />
            Gerar relatório
          </Button>
          <Button
            onClick={() => marcarRepassadas([...selecionadas])}
            disabled={!selecionadas.size || salvando}
          >
            {salvando ? <Loader2 className="animate-spin" /> : <FileCheck2 />}
            {selecionadas.size
              ? `Marcar ${selecionadas.size} como repassada${selecionadas.size > 1 ? "s" : ""}`
              : "Marcar como repassadas"}
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            rotulo: "Esporádicos cadastrados",
            valor: String(base?.length ?? "—"),
            rodape: "base separada da carteira",
          },
          {
            rotulo: "Notas no período",
            valor: String(doPeriodo.length),
            rodape: `${doPeriodo.filter(cobravel).length} emissões cobráveis`,
          },
          {
            rotulo: "A repassar ao financeiro",
            valor: formatarReais(aRepassar.reduce((s, l) => s + valorDaNota(l.valor_cobranca), 0)),
            rodape: aRepassar.length
              ? `${aRepassar.length} ${aRepassar.length === 1 ? "emissão" : "emissões"} a cobrar`
              : "Tudo repassado",
            destaque: aRepassar.length > 0,
          },
          { rotulo: "Já repassadas", valor: String(repassadas.length), rodape: "no período" },
        ].map((k) => (
          <Card key={k.rotulo} className="rounded-lg border-border shadow-kpi">
            <CardContent className="space-y-1 py-4">
              <p className="text-sm text-muted-foreground">{k.rotulo}</p>
              <p className="nums text-2xl font-semibold text-foreground">{k.valor}</p>
              <p className={cn("text-xs", k.destaque ? "text-warning" : "text-muted-foreground")}>
                {k.rodape}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-lg border-border shadow-card">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1 space-y-1.5">
              <Label htmlFor="esp-busca">Buscar</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="esp-busca"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome, CPF/CNPJ ou número da nota"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-52 space-y-1.5">
              <Label htmlFor="esp-periodo">Período</Label>
              <Select
                value={periodo}
                onValueChange={(v) => {
                  setPeriodo(v);
                  setSelecionadas(new Set());
                }}
              >
                <SelectTrigger id="esp-periodo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {meses.map((m) => (
                    <SelectItem key={m} value={m}>
                      {rotuloMes(m)}
                    </SelectItem>
                  ))}
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex h-10 items-center gap-2 text-sm text-muted-foreground">
              <Switch
                checked={cobrarCanceladas}
                onCheckedChange={(v) => {
                  setCobrarCanceladas(v);
                  setSelecionadas(new Set());
                }}
              />
              Cobrar canceladas e denegadas
            </label>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar notas">
            {(
              [
                ["arepassar", "A repassar", aRepassar.length],
                ["repassadas", "Repassadas", repassadas.length],
                ["todas", "Todas", doPeriodo.length],
              ] as const
            ).map(([valor, rotulo, qtd]) => (
              <button
                key={valor}
                type="button"
                aria-pressed={filtro === valor}
                onClick={() => {
                  setFiltro(valor);
                  setSelecionadas(new Set());
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              >
                {rotulo} <span className="nums font-semibold">{qtd}</span>
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : visiveis.length === 0 ? (
            <EmptyState
              icon={FileCheck2}
              title={filtro === "arepassar" ? "Nada a repassar" : "Nenhuma nota aqui"}
              description={
                filtro === "arepassar"
                  ? "Todas as notas de esporádicos do período já foram enviadas ao financeiro."
                  : "Mude o período ou o filtro. Notas de esporádicos são lançadas em Lançar Nota."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Selecionar todas as notas a repassar"
                        checked={todasMarcadas}
                        disabled={!selecionaveis.length}
                        onCheckedChange={(v) => {
                          for (const l of selecionaveis) alternar(l.nota_id, v === true);
                        }}
                      />
                    </TableHead>
                    <TableHead>Nº NF</TableHead>
                    <TableHead>Emissão</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Cobrança</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Financeiro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((l) => {
                    const pode = cobravel(l) && !l.repassado_financeiro_em;
                    return (
                      <TableRow
                        key={l.nota_id}
                        data-state={selecionadas.has(l.nota_id) ? "selected" : undefined}
                      >
                        <TableCell>
                          {pode ? (
                            <Checkbox
                              aria-label={`Selecionar nota ${l.numero_nf}`}
                              checked={selecionadas.has(l.nota_id)}
                              onCheckedChange={(v) => alternar(l.nota_id, v === true)}
                            />
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{l.numero_nf}</TableCell>
                        <TableCell className="nums">
                          {format(parseISO(l.data_emissao), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">{l.nome}</div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {formatarDocumento(l.documento)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {l.contato || "—"}
                        </TableCell>
                        <TableCell>
                          <TipoBadge tipo={l.tipo_emissao} />
                        </TableCell>
                        <TableCell className="nums text-right">
                          {cobravel(l) ? formatarReais(valorDaNota(l.valor_cobranca)) : "—"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={l.status} />
                        </TableCell>
                        <TableCell className="text-sm">
                          {l.repassado_financeiro_em ? (
                            <span className="text-success">
                              Repassada {format(parseISO(l.repassado_financeiro_em), "dd/MM")}
                            </span>
                          ) : !cobravel(l) ? (
                            <span className="text-muted-foreground">Não cobrar</span>
                          ) : (
                            <span className="text-warning">A repassar</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="pt-3 text-xs text-muted-foreground">
                {selecionadas.size ? (
                  <strong className="text-foreground">
                    {selecionadas.size} selecionada{selecionadas.size > 1 ? "s" : ""} ·{" "}
                  </strong>
                ) : null}
                Cobrança definida em cada emissão (padrão R$ 50,00).{" "}
                {cobrarCanceladas
                  ? "Canceladas e denegadas também são cobradas."
                  : "Canceladas e denegadas não são cobradas."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-lg border-border shadow-card">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="size-4 text-muted-foreground" />
            Base de esporádicos
          </CardTitle>
          <span className="text-xs text-muted-foreground">Cadastrados pelo Lançar Nota</span>
        </CardHeader>
        <CardContent>
          {!base?.length ? (
            <EmptyState
              icon={UserPlus}
              title="Nenhum cliente esporádico ainda"
              description="Ao lançar uma nota como “Cliente esporádico”, o cadastro aparece aqui."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF / CNPJ</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead className="text-right">Notas</TableHead>
                    <TableHead>Última nota</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {base.map((e) => {
                    const c = contagemPorCliente.get(e.id);
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.nome}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatarDocumento(e.documento)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {e.contato || "—"}
                        </TableCell>
                        <TableCell className="nums text-right">{c?.n ?? 0}</TableCell>
                        <TableCell className="nums">
                          {c ? format(parseISO(c.ultima), "dd/MM/yyyy") : "—"}
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

      <Dialog open={dialogo} onOpenChange={setDialogo}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Relatório para o financeiro</DialogTitle>
            <DialogDescription>
              {selecionadas.size
                ? `${doRelatorio.length} nota(s) selecionada(s)`
                : `Notas ainda não repassadas · ${rotuloPeriodo}`}{" "}
              · total {formatarReais(totalRelatorio)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rel-para">Para</Label>
              <Input id="rel-para" value={para} onChange={(e) => setPara(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rel-obs">
                Observação <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Textarea
                id="rel-obs"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: cobrar até dia 15. Marcos pediu boleto."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={copiarMensagem}>
              <Copy />
              Copiar mensagem
            </Button>
            <Button variant="outline" onClick={baixarPdf}>
              <FileDown />
              Baixar PDF
            </Button>
            <Button
              onClick={async () => {
                await marcarRepassadas(
                  doRelatorio.filter((l) => !l.repassado_financeiro_em).map((l) => l.nota_id),
                );
                setDialogo(false);
              }}
              disabled={salvando || !doRelatorio.some((l) => !l.repassado_financeiro_em)}
            >
              <FileCheck2 />
              Marcar como repassadas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
