import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  FileText,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";

import { supabase, mensagemDeErro, type NotaFiscal } from "@/lib/supabase";
import type { Cliente } from "@/lib/clientes";
import {
  LIMITE_MEI_PADRAO,
  MESES_CURTOS,
  MESES_LONGOS,
  faixaMei,
  formatarPct,
  moeda,
  pctDoLimite,
  projecaoAnual,
  type MeiMes,
} from "@/lib/mei";
import {
  ajustarSemMes,
  apagarMes,
  invalidarMei,
  registrarMes,
  useMeiAno,
  useMeiMeses,
} from "@/lib/mei-dados";
import { lerReais } from "@/lib/esporadicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/status-badge";
import { StatusBadge } from "@/components/status-badge";
import { TipoBadge } from "@/components/tipo-badge";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Aviso, AvisoMei, MeiMeterGrande } from "@/components/mei-limite";
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

export const Route = createFileRoute("/_authenticated/mei_/$clienteId")({
  head: () => ({ meta: [{ title: "Cliente MEI — Ofis" }] }),
  component: MeiClientePage,
});

/** Diálogo: lançar (somar) ou corrigir (substituir) um mês, ou ajustar o valor sem mês. */
type Edicao =
  | { tipo: "lancar" }
  | { tipo: "corrigir"; mes: MeiMes }
  | { tipo: "sem-mes"; cabecalhoId: string; atual: number };

function MeiClientePage() {
  const { clienteId } = Route.useParams();
  const queryClient = useQueryClient();
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;

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
  const { data: cabecalhos, isLoading: carregandoMei } = useMeiAno(ano);
  const { data: todosMeses, isLoading: carregandoMeses } = useMeiMeses(ano);
  const { data: notas, isLoading: carregandoNotas } = useQuery({
    queryKey: ["notas-do-cliente", clienteId, ano],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("*")
        .eq("cliente_id", clienteId)
        .gte("data_emissao", `${ano}-01-01`)
        .lte("data_emissao", `${ano}-12-31`)
        .order("data_emissao", { ascending: false })
        .order("numero_nf", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NotaFiscal[];
    },
  });

  const [mesNotas, setMesNotas] = useState("todos");
  const [edicao, setEdicao] = useState<Edicao | null>(null);

  const cliente = clientes?.find((c) => c.id === clienteId);
  const cabecalho = cabecalhos?.find((c) => c.cliente_id === clienteId);
  const meses = useMemo(
    () => (todosMeses ?? []).filter((m) => m.cliente_id === clienteId),
    [todosMeses, clienteId],
  );

  const carregando = carregandoClientes || carregandoMei || carregandoMeses;
  if (carregando) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <VoltarMei />
        <EmptyState
          title="Cliente não encontrado"
          description="Ele pode ter sido removido. Volte ao Controle MEI e escolha outro cliente."
        />
      </div>
    );
  }

  const limite = cabecalho?.limite_anual || LIMITE_MEI_PADRAO;
  const acumulado = cabecalho?.faturamento ?? 0;
  const semMes = cabecalho?.faturamento_sem_mes ?? 0;
  const pct = pctDoLimite(acumulado, limite);
  const faixa = faixaMei(pct);
  const restam = limite - acumulado;

  const porMes = Array.from({ length: 12 }, (_, i) =>
    meses.filter((m) => m.mes === i + 1).reduce((s, m) => s + m.faturamento, 0),
  );
  const { media, mesesConsiderados, projetado } = projecaoAnual({ acumulado, meses, mesAtual });
  const maior = Math.max(0, ...porMes);
  const mesMaior = maior > 0 ? porMes.indexOf(maior) : -1;
  const mediaPermitida = limite / 12;
  const mesesQueFaltam = 12 - mesAtual + 1;

  const autorizadas = (notas ?? []).filter((n) => n.status === "autorizada").length;
  const notasVisiveis = (notas ?? []).filter(
    (n) => mesNotas === "todos" || Number(n.data_emissao.slice(5, 7)) === Number(mesNotas),
  );

  async function excluirMes(m: MeiMes) {
    const { error } = await apagarMes(m.id);
    if (error) {
      toast.error(mensagemDeErro(error, "Não foi possível apagar o mês."));
      return;
    }
    toast.success(`${MESES_LONGOS[m.mes - 1]} apagado.`);
    await invalidarMei(queryClient, ano);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <VoltarMei />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{cliente.nome}</h1>
          <p className="text-sm text-muted-foreground">
            MEI ·{" "}
            <span className="nums">
              {carregandoNotas ? "…" : autorizadas}{" "}
              {autorizadas === 1 ? "nota autorizada" : "notas autorizadas"} em {ano}
            </span>
          </p>
        </div>
        <Button onClick={() => setEdicao({ tipo: "lancar" })}>Registrar faturamento</Button>
      </header>

      {/* Limite */}
      <Card className="rounded-lg border-border shadow-card">
        <CardContent className="space-y-5 pt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Uso do limite anual</p>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="nums text-4xl font-semibold tracking-tight text-foreground">
                  {formatarPct(pct, 1)}
                </span>
                <StatusPill tom={faixa.tom}>{faixa.label}</StatusPill>
              </div>
            </div>
            <div className="text-right">
              <p className="nums text-lg font-semibold text-foreground">
                {moeda(acumulado)}{" "}
                <span className="font-normal text-muted-foreground">de {moeda(limite)}</span>
              </p>
              <p
                className={
                  restam < 0 ? "text-sm text-destructive" : "text-sm text-muted-foreground"
                }
              >
                {restam < 0 ? `Excedeu ${moeda(-restam)}` : `Restam ${moeda(restam)}`}
              </p>
            </div>
          </div>
          <MeiMeterGrande valor={acumulado} limite={limite} />
          {pct > 100 ? (
            <Aviso tom="danger" titulo="Faturamento acima do limite do MEI">
              {pct <= 120
                ? "Excesso de até 20%: o desenquadramento vale a partir de janeiro do ano seguinte, com recolhimento do DAS complementar sobre o excesso."
                : "Excesso acima de 20%: o desenquadramento é retroativo a janeiro do ano corrente."}{" "}
              Confirme a regra vigente antes de orientar o cliente.
            </Aviso>
          ) : pct >= 80 ? (
            <Aviso tom="warning" titulo="Atenção ao ritmo de faturamento">
              Restam {moeda(restam)} até o limite, cerca de {moeda(restam / mesesQueFaltam)} por mês
              até dezembro.
            </Aviso>
          ) : null}
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            rotulo: `Faturado em ${MESES_LONGOS[mesAtual - 1]!.toLowerCase()}`,
            valor: moeda(porMes[mesAtual - 1] ?? 0),
            rodape: porMes[mesAtual - 1] ? "lançado até agora" : "nada lançado ainda",
          },
          {
            rotulo: "Média mensal",
            valor: mesesConsiderados ? moeda(media) : "—",
            rodape: mesesConsiderados
              ? `${mesesConsiderados} ${mesesConsiderados === 1 ? "mês lançado" : "meses lançados"}`
              : "lance os meses para calcular",
          },
          {
            rotulo: "Maior mês",
            valor: mesMaior >= 0 ? moeda(maior) : "—",
            rodape: mesMaior >= 0 ? `${MESES_LONGOS[mesMaior]} de ${ano}` : "—",
          },
          {
            rotulo: "Média permitida",
            valor: moeda(mediaPermitida),
            rodape: "por mês, para não estourar",
          },
        ].map((k) => (
          <Card key={k.rotulo} className="rounded-lg border-border shadow-kpi">
            <CardContent className="space-y-1 py-4">
              <p className="text-sm text-muted-foreground">{k.rotulo}</p>
              <p className="nums text-2xl font-semibold text-foreground">{k.valor}</p>
              <p className="text-xs text-muted-foreground">{k.rodape}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráfico + projeção */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="rounded-lg border-border shadow-card lg:col-span-8">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="size-4 text-muted-foreground" />
              Faturamento por mês — {ano}
            </CardTitle>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <i className="size-2.5 rounded-[2px] bg-chart-5" /> Mês
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="size-2.5 rounded-[2px] bg-primary" /> Mês atual
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="w-3.5 border-t-2 border-dashed border-warning" /> Média mensal
                permitida
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <GraficoMeses porMes={porMes} mesAtual={mesAtual} mediaPermitida={mediaPermitida} />
            {semMes > 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                <span className="nums">{moeda(semMes)}</span> do acumulado foram registrados sem mês
                (antes do controle mensal) e não aparecem no gráfico.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border shadow-card lg:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-4 text-muted-foreground" />
              Projeção até dezembro
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mesesConsiderados ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Se mantiver a média dos meses lançados:
                </p>
                <p className="nums text-2xl font-semibold text-foreground">{moeda(projetado)}</p>
                <StatusPill tom={faixaMei(pctDoLimite(projetado, limite)).tom}>
                  {formatarPct(pctDoLimite(projetado, limite))} do limite ·{" "}
                  {faixaMei(pctDoLimite(projetado, limite)).label.toLowerCase()}
                </StatusPill>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Lance o faturamento dos meses para ver a projeção.
              </p>
            )}
            <dl className="divide-y divide-border border-t border-border text-sm">
              <div className="flex justify-between py-2.5">
                <dt className="text-muted-foreground">Pode faturar até dezembro</dt>
                <dd
                  className={
                    restam < 0
                      ? "nums font-semibold text-destructive"
                      : "nums font-semibold text-foreground"
                  }
                >
                  {restam < 0 ? "—" : moeda(restam)}
                </dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-muted-foreground">Por mês, em média</dt>
                <dd className="nums font-semibold text-foreground">
                  {restam < 0 ? "—" : moeda(restam / mesesQueFaltam)}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              Projeção simples, só para orientar a conversa com o cliente.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lançamentos por mês */}
      <Card className="rounded-lg border-border shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4 text-muted-foreground" />
            Faturamento lançado
          </CardTitle>
        </CardHeader>
        <CardContent>
          {meses.length === 0 && semMes === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Nenhum faturamento lançado"
              description="Use “Registrar faturamento” para lançar o primeiro mês."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">% do limite</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Ações</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...meses]
                    .sort((a, b) => b.mes - a.mes)
                    .map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium text-foreground">
                          {MESES_LONGOS[m.mes - 1]}
                        </TableCell>
                        <TableCell className="nums text-right">{moeda(m.faturamento)}</TableCell>
                        <TableCell className="nums text-right text-muted-foreground">
                          {formatarPct(pctDoLimite(m.faturamento, limite), 1)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Corrigir ${MESES_LONGOS[m.mes - 1]}`}
                              onClick={() => setEdicao({ tipo: "corrigir", mes: m })}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <ConfirmDeleteButton
                              title={`Apagar ${MESES_LONGOS[m.mes - 1]!.toLowerCase()}?`}
                              description={`O faturamento de ${moeda(m.faturamento)} sai do acumulado de ${cliente.nome}. Fica registrado na auditoria.`}
                              label="Apagar mês"
                              onConfirm={() => excluirMes(m)}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Apagar ${MESES_LONGOS[m.mes - 1]}`}
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </ConfirmDeleteButton>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  {cabecalho && (semMes > 0 || meses.length === 0) ? (
                    <TableRow>
                      <TableCell>
                        <div className="font-medium text-foreground">Sem mês</div>
                        <div className="text-xs text-muted-foreground">
                          lançado antes do controle mensal
                        </div>
                      </TableCell>
                      <TableCell className="nums text-right">{moeda(semMes)}</TableCell>
                      <TableCell className="nums text-right text-muted-foreground">
                        {formatarPct(pctDoLimite(semMes, limite), 1)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Ajustar valor sem mês"
                            onClick={() =>
                              setEdicao({
                                tipo: "sem-mes",
                                cabecalhoId: cabecalho.id,
                                atual: semMes,
                              })
                            }
                          >
                            <Pencil className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
              {semMes > 0 && meses.length > 0 ? (
                <p className="pt-3 text-xs text-muted-foreground">
                  Ao lançar meses que já estavam dentro do valor “sem mês”, diminua o “sem mês” na
                  mesma quantia para não contar duas vezes.
                </p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notas emitidas */}
      <Card className="rounded-lg border-border shadow-card">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4 text-muted-foreground" />
            Notas emitidas
          </CardTitle>
          <Select value={mesNotas} onValueChange={setMesNotas}>
            <SelectTrigger className="h-8 w-44" aria-label="Mês das notas">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os meses</SelectItem>
              {Array.from({ length: mesAtual }, (_, i) => mesAtual - i).map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {MESES_CURTOS[m - 1]}/{ano}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {carregandoNotas ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : notasVisiveis.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={mesNotas === "todos" ? `Nenhuma nota em ${ano}` : "Nenhuma nota neste mês"}
              description="As notas aparecem aqui conforme são lançadas em Lançar Nota."
            />
          ) : (
            <div className="max-h-[520px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº NF</TableHead>
                    <TableHead>Emissão</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notasVisiveis.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell className="font-mono text-sm">{n.numero_nf}</TableCell>
                      <TableCell className="nums">
                        {format(parseISO(n.data_emissao), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell>
                        <TipoBadge tipo={n.tipo_emissao} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={n.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <DialogoFaturamento
        edicao={edicao}
        onClose={() => setEdicao(null)}
        clienteId={clienteId}
        nome={cliente.nome}
        ano={ano}
        mesAtual={mesAtual}
        acumulado={acumulado}
        limite={limite}
        onSalvo={() => invalidarMei(queryClient, ano)}
      />
    </div>
  );
}

function VoltarMei() {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link to="/mei">
        <ArrowLeft />
        Controle MEI
      </Link>
    </Button>
  );
}

/** Gráfico de barras em SVG: barras neutras, mês atual em destaque, linha da média permitida. */
function GraficoMeses({
  porMes,
  mesAtual,
  mediaPermitida,
}: {
  porMes: number[];
  mesAtual: number;
  mediaPermitida: number;
}) {
  const W = 640;
  const H = 170;
  const x0 = 56;
  const passo = (W - x0) / 12;
  const larg = Math.min(30, passo * 0.6);
  const max = Math.max(mediaPermitida, ...porMes) * 1.2;
  const y = (v: number) => 12 + H - (v / max) * H;
  const degrau = max > 40000 ? 10000 : max > 16000 ? 4000 : 2000;
  const linhas: number[] = [];
  for (let v = 0; v <= max; v += degrau) linhas.push(v);

  return (
    <svg
      viewBox={`0 0 ${W} ${H + 40}`}
      className="h-auto w-full"
      role="img"
      aria-label="Faturamento por mês"
    >
      {linhas.map((v) => (
        <g key={v}>
          <line x1={x0 - 6} x2={W} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} />
          <text
            x={x0 - 10}
            y={y(v) + 4}
            textAnchor="end"
            className="nums fill-muted-foreground text-[12px]"
          >
            {v ? `${(v / 1000).toLocaleString("pt-BR")} mil` : "0"}
          </text>
        </g>
      ))}
      {porMes.map((v, k) => {
        const x = x0 + k * passo + (passo - larg) / 2;
        const atual = k + 1 === mesAtual;
        return (
          <g key={k}>
            {v > 0 ? (
              <rect
                x={x}
                y={y(v)}
                width={larg}
                height={12 + H - y(v)}
                rx={6}
                className={atual ? "fill-primary" : "fill-chart-5"}
              >
                <title>
                  {MESES_CURTOS[k]}: {moeda(v)}
                </title>
              </rect>
            ) : null}
            <text
              x={x + larg / 2}
              y={12 + H + 20}
              textAnchor="middle"
              className={
                atual
                  ? "fill-foreground text-[12px] font-medium"
                  : "fill-muted-foreground text-[12px]"
              }
            >
              {MESES_CURTOS[k]}
            </text>
          </g>
        );
      })}
      <line
        x1={x0 - 6}
        x2={W}
        y1={y(mediaPermitida)}
        y2={y(mediaPermitida)}
        className="stroke-warning"
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />
    </svg>
  );
}

function DialogoFaturamento({
  edicao,
  onClose,
  clienteId,
  nome,
  ano,
  mesAtual,
  acumulado,
  limite,
  onSalvo,
}: {
  edicao: Edicao | null;
  onClose: () => void;
  clienteId: string;
  nome: string;
  ano: number;
  mesAtual: number;
  acumulado: number;
  limite: number;
  onSalvo: () => Promise<unknown>;
}) {
  const [mes, setMes] = useState(mesAtual);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aberto, setAberto] = useState<Edicao | null>(null);

  // Reinicia o formulário sempre que abre com uma edição nova.
  if (edicao !== aberto) {
    setAberto(edicao);
    setErro("");
    if (edicao?.tipo === "corrigir") {
      setMes(edicao.mes.mes);
      setTexto(edicao.mes.faturamento.toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
    } else if (edicao?.tipo === "sem-mes") {
      setTexto(edicao.atual.toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
    } else {
      setMes(mesAtual);
      setTexto("");
    }
  }

  const valor = lerReais(texto);
  const diferenca =
    edicao?.tipo === "lancar"
      ? valor > 0
        ? valor
        : 0
      : edicao?.tipo === "corrigir"
        ? (Number.isFinite(valor) ? valor : edicao.mes.faturamento) - edicao.mes.faturamento
        : edicao?.tipo === "sem-mes"
          ? (Number.isFinite(valor) ? valor : edicao.atual) - edicao.atual
          : 0;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!edicao) return;
    const minimo = edicao.tipo === "lancar" ? 0.01 : 0;
    if (!Number.isFinite(valor) || valor < minimo) {
      setErro(
        edicao.tipo === "lancar" ? "Informe um valor maior que zero." : "Informe um valor válido.",
      );
      return;
    }
    setSalvando(true);
    const { error } =
      edicao.tipo === "sem-mes"
        ? await ajustarSemMes(edicao.cabecalhoId, valor)
        : await registrarMes({
            clienteId,
            ano,
            mes,
            valor,
            modo: edicao.tipo === "lancar" ? "somar" : "substituir",
          });
    setSalvando(false);
    if (error) {
      toast.error(mensagemDeErro(error, "Não foi possível salvar o faturamento."));
      return;
    }
    toast.success(
      edicao.tipo === "lancar"
        ? `Faturamento de ${moeda(valor)} registrado em ${MESES_LONGOS[mes - 1]!.toLowerCase()}.`
        : "Faturamento corrigido.",
    );
    await onSalvo();
    onClose();
  }

  const titulo =
    edicao?.tipo === "corrigir"
      ? `Corrigir ${MESES_LONGOS[edicao.mes.mes - 1]!.toLowerCase()}`
      : edicao?.tipo === "sem-mes"
        ? "Ajustar valor sem mês"
        : "Registrar faturamento";
  const descricao =
    edicao?.tipo === "corrigir"
      ? `${nome} · o valor abaixo substitui o que estava lançado no mês.`
      : edicao?.tipo === "sem-mes"
        ? `${nome} · parte do acumulado de ${ano} lançada antes do controle mensal.`
        : `${nome} · soma ao mês escolhido e entra no acumulado de ${ano}.`;

  return (
    <Dialog open={!!edicao} onOpenChange={(v) => !v && !salvando && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={salvar} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descricao}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {edicao?.tipo === "lancar" ? (
              <div className="space-y-1.5">
                <Label htmlFor="dlg-mes">Mês</Label>
                <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                  <SelectTrigger id="dlg-mes">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: mesAtual }, (_, i) => mesAtual - i).map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {MESES_LONGOS[m - 1]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className={edicao?.tipo === "lancar" ? "space-y-1.5" : "col-span-2 space-y-1.5"}>
              <Label htmlFor="dlg-valor">Valor (R$)</Label>
              <Input
                id="dlg-valor"
                inputMode="decimal"
                placeholder="0,00"
                className="nums"
                autoFocus
                value={texto}
                aria-invalid={!!erro}
                onChange={(e) => {
                  setTexto(e.target.value);
                  setErro("");
                }}
              />
            </div>
          </div>
          {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
          <AvisoMei nome={nome} acumulado={acumulado} adicional={diferenca} limite={limite} />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? <Loader2 className="animate-spin" /> : null}
              {edicao?.tipo === "lancar" ? "Registrar" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
