import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Copy, FileDown, Loader2, Send } from "lucide-react";

import { supabase, mensagemDeErro, type NotaFiscal } from "@/lib/supabase";
import type { Cliente } from "@/lib/clientes";
import type { Obrigacao } from "@/lib/obrigacoes";
import { TIPO_OBRIGACAO_META, STATUS_OBRIGACAO_META } from "@/lib/obrigacoes";
import type { Comunicacao } from "@/lib/comunicacoes";
import { STATUS_LABEL } from "@/lib/nf";
import {
  MESES_LONGOS,
  MESES_CURTOS,
  faixaMei,
  formatarPct,
  moeda,
  pctDoLimite,
  type MeiMes,
} from "@/lib/mei";
import { useMeiAno, useMeiMeses } from "@/lib/mei-dados";
import {
  CORES_MARCA,
  SECOES,
  SECOES_PADRAO,
  gerarRelatorioClientePdf,
  iniciais,
  inicioDaBusca,
  mensagemCliente,
  montarRelatorio,
  rotuloTipoCliente,
  salvarEscritorio,
  textoLimiteMei,
  useEscritorio,
  variacao,
  type DadosRelatorio,
  type Escritorio,
  type Secoes,
} from "@/lib/relatorio-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Busca = { cliente?: string; mes?: string };

export const Route = createFileRoute("/_authenticated/relatorios")({
  validateSearch: (s: Record<string, unknown>): Busca => {
    const cliente = s["cliente"];
    const mes = s["mes"];
    return {
      ...(typeof cliente === "string" ? { cliente } : {}),
      ...(typeof mes === "string" && /^\d{4}-\d{2}$/.test(mes) ? { mes } : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "Relatório mensal — Ofis" },
      {
        name: "description",
        content: "Resumo fiscal do mês com a marca do escritório, pronto para enviar ao cliente.",
      },
    ],
  }),
  component: RelatoriosPage,
});

const CHAVE_SECOES = "ofis-relatorio-secoes";
const ESCRITORIO_PADRAO: Omit<Escritorio, "id"> = {
  nome: "Escritório de contabilidade",
  contato: "",
  cor_marca: CORES_MARCA[0],
};

function RelatoriosPage() {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const hoje = useMemo(() => new Date(), []);

  // Últimos 12 meses; padrão = mês anterior (o mês fechado mais recente).
  const opcoesMes = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        return format(d, "yyyy-MM");
      }),
    [hoje],
  );
  const mesSel = busca.mes && opcoesMes.includes(busca.mes) ? busca.mes : opcoesMes[1]!;
  const [ano, mes] = mesSel.split("-").map(Number) as [number, number];

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
  const { data: meiCabecalhos } = useMeiAno(ano);
  const { data: meiMeses } = useMeiMeses(ano);
  const { data: meiMesesAnterior } = useMeiMeses(ano - 1);
  const { data: escritorio, isLoading: carregandoEscritorio } = useEscritorio();

  const idsMei = new Set((meiCabecalhos ?? []).map((c) => c.cliente_id));
  const clienteId = busca.cliente ?? clientes?.[0]?.id ?? "";
  const cliente = clientes?.find((c) => c.id === clienteId);

  const inicio = inicioDaBusca(ano, mes);
  const fim = format(new Date(ano, mes, 0), "yyyy-MM-dd");
  const { data: extras, isLoading: carregandoExtras } = useQuery({
    queryKey: ["relatorio-cliente", clienteId, inicio, fim],
    enabled: !!clienteId,
    queryFn: async () => {
      const [notas, obrigacoes, comunicacoes] = await Promise.all([
        supabase
          .from("notas_fiscais")
          .select("*")
          .eq("cliente_id", clienteId)
          .gte("data_emissao", inicio)
          .lte("data_emissao", fim)
          .order("data_emissao", { ascending: true }),
        supabase.from("obrigacoes_acessorias").select("*").eq("cliente_id", clienteId),
        supabase.from("comunicacoes").select("*").eq("cliente_id", clienteId),
      ]);
      for (const r of [notas, obrigacoes, comunicacoes]) if (r.error) throw r.error;
      return {
        notas: (notas.data ?? []) as NotaFiscal[],
        obrigacoes: (obrigacoes.data ?? []) as Obrigacao[],
        comunicacoes: (comunicacoes.data ?? []) as Comunicacao[],
      };
    },
  });

  // Marca do escritório (rascunho local até salvar).
  const [marca, setMarca] = useState<Omit<Escritorio, "id">>(ESCRITORIO_PADRAO);
  useEffect(() => {
    if (escritorio)
      setMarca({
        nome: escritorio.nome,
        contato: escritorio.contato,
        cor_marca: escritorio.cor_marca,
      });
  }, [escritorio]);
  const marcaAlterada =
    !!escritorio &&
    (marca.nome !== escritorio.nome ||
      marca.contato !== escritorio.contato ||
      marca.cor_marca !== escritorio.cor_marca);
  const [salvandoMarca, setSalvandoMarca] = useState(false);

  const [secoes, setSecoes] = useState<Secoes>(SECOES_PADRAO);
  useEffect(() => {
    try {
      const s = localStorage.getItem(CHAVE_SECOES);
      if (s) setSecoes({ ...SECOES_PADRAO, ...(JSON.parse(s) as Partial<Secoes>) });
    } catch {
      // sem armazenamento: todas as seções ligadas
    }
  }, []);
  function alternarSecao(k: keyof Secoes, v: boolean) {
    setSecoes((atual) => {
      const novo = { ...atual, [k]: v };
      try {
        localStorage.setItem(CHAVE_SECOES, JSON.stringify(novo));
      } catch {
        // ignora
      }
      return novo;
    });
  }

  const [recado, setRecado] = useState("");
  const [dialogo, setDialogo] = useState(false);

  const dados: DadosRelatorio | null =
    cliente && extras
      ? montarRelatorio({
          cliente,
          ano,
          mes,
          hoje,
          notas: extras.notas,
          meiCabecalho: (meiCabecalhos ?? []).find((c) => c.cliente_id === cliente.id),
          meiMeses: (meiMeses ?? []).filter((m) => m.cliente_id === cliente.id),
          meiMesesAnoAnterior: (meiMesesAnterior ?? []).filter(
            (m: MeiMes) => m.cliente_id === cliente.id,
          ),
          obrigacoes: extras.obrigacoes,
          comunicacoes: extras.comunicacoes,
        })
      : null;

  const nomeEscritorio = marca.nome.trim() || ESCRITORIO_PADRAO.nome;
  const [mensagem, setMensagem] = useState("");

  async function gravarMarca() {
    if (!escritorio) return;
    if (!marca.nome.trim()) {
      toast.error("Informe o nome do escritório.");
      return;
    }
    setSalvandoMarca(true);
    const { data, error } = await salvarEscritorio(escritorio.id, marca);
    setSalvandoMarca(false);
    if (error || !data?.length) {
      toast.error(mensagemDeErro(error, "Não foi possível salvar a marca do escritório."));
      return;
    }
    toast.success("Marca do escritório salva para todos os relatórios.");
    await queryClient.invalidateQueries({ queryKey: ["configuracoes-escritorio"] });
  }

  function baixarPdf() {
    if (!dados) return;
    gerarRelatorioClientePdf({
      dados,
      escritorio: { ...marca, nome: nomeEscritorio },
      secoes,
      recado,
    });
  }

  async function copiarMensagem() {
    try {
      await navigator.clipboard.writeText(mensagem);
      toast.success("Mensagem copiada. Cole no WhatsApp ou no e-mail e anexe o PDF.");
    } catch {
      toast.error("Não foi possível copiar automaticamente. Selecione o texto e use Ctrl+C.");
    }
  }

  const mudarBusca = (b: Busca) =>
    navigate({ search: (atual: Busca) => ({ ...atual, ...b }), replace: true });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Relatório mensal do cliente</h1>
          <p className="text-sm text-muted-foreground">
            Um resumo fiscal do mês com a marca do escritório, pronto para enviar ao cliente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!dados}
            onClick={() => {
              if (dados) setMensagem(mensagemCliente(dados, nomeEscritorio));
              setDialogo(true);
            }}
          >
            <Send />
            Enviar ao cliente
          </Button>
          <Button onClick={baixarPdf} disabled={!dados}>
            <FileDown />
            Baixar PDF
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-start gap-4">
        <Card className="w-full rounded-lg border-border shadow-card lg:sticky lg:top-4 lg:w-[300px] lg:shrink-0">
          <CardContent className="space-y-5 pt-6">
            <Grupo titulo="Relatório">
              <div className="space-y-1.5">
                <Label htmlFor="rel-cliente">Cliente</Label>
                <Select value={clienteId} onValueChange={(v) => mudarBusca({ cliente: v })}>
                  <SelectTrigger id="rel-cliente" disabled={carregandoClientes}>
                    <SelectValue placeholder="Escolha o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {idsMei.size ? (
                      <SelectGroup>
                        <SelectLabel>MEI</SelectLabel>
                        {(clientes ?? [])
                          .filter((c) => idsMei.has(c.id))
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nome}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    ) : null}
                    <SelectGroup>
                      <SelectLabel>Clientes</SelectLabel>
                      {(clientes ?? [])
                        .filter((c) => !idsMei.has(c.id))
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rel-mes">Mês de referência</Label>
                <Select value={mesSel} onValueChange={(v) => mudarBusca({ mes: v })}>
                  <SelectTrigger id="rel-mes">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {opcoesMes.map((m, i) => {
                      const [a, mm] = m.split("-").map(Number) as [number, number];
                      return (
                        <SelectItem key={m} value={m}>
                          {MESES_LONGOS[mm - 1]} de {a}
                          {i === 0 ? " (parcial)" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </Grupo>

            <Grupo titulo="Seções">
              <div className="space-y-2">
                {SECOES.map(([k, rotulo]) => (
                  <label
                    key={k}
                    className="flex cursor-pointer items-center gap-2.5 text-sm text-muted-foreground"
                  >
                    <Checkbox
                      checked={secoes[k]}
                      onCheckedChange={(v) => alternarSecao(k, v === true)}
                    />
                    {rotulo}
                  </label>
                ))}
              </div>
            </Grupo>

            <Grupo titulo="Marca do escritório">
              {carregandoEscritorio ? (
                <Skeleton className="h-24 w-full" />
              ) : !escritorio ? (
                <p className="text-sm text-muted-foreground">
                  A marca do escritório ainda não foi configurada no banco. O relatório usa um nome
                  genérico até lá.
                </p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="rel-esc">Nome do escritório</Label>
                    <Input
                      id="rel-esc"
                      value={marca.nome}
                      maxLength={120}
                      onChange={(e) => setMarca({ ...marca, nome: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rel-contato">Contato no rodapé</Label>
                    <Input
                      id="rel-contato"
                      value={marca.contato}
                      maxLength={200}
                      placeholder="(14) 0000-0000 · contato@escritorio.com.br"
                      onChange={(e) => setMarca({ ...marca, contato: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-sm font-medium">Cor da marca</span>
                    <div className="flex gap-2" role="group" aria-label="Cor da marca">
                      {CORES_MARCA.map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-label={`Cor ${c}`}
                          aria-pressed={marca.cor_marca === c}
                          onClick={() => setMarca({ ...marca, cor_marca: c })}
                          className={cn(
                            "size-7 rounded-full border-2 border-card ring-1 ring-input transition-shadow",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                            marca.cor_marca === c && "ring-2 ring-ring",
                          )}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </div>
                  {marcaAlterada ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={gravarMarca}
                      disabled={salvandoMarca}
                    >
                      {salvandoMarca ? <Loader2 className="animate-spin" /> : null}
                      Salvar marca para todos
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Vale para todos os relatórios e para toda a equipe.
                    </p>
                  )}
                </>
              )}
            </Grupo>

            <Grupo titulo="Recado do contador">
              <Textarea
                aria-label="Recado do contador"
                value={recado}
                onChange={(e) => setRecado(e.target.value)}
                rows={4}
                placeholder="Ex.: lembre de enviar os extratos até o dia 10."
              />
              <p className="text-xs text-muted-foreground">
                Aparece no fim do relatório. Deixe em branco para não mostrar.
              </p>
            </Grupo>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-1 basis-[560px] justify-center overflow-auto rounded-lg border border-border bg-sidebar p-4 sm:p-8">
          {!dados || carregandoExtras ? (
            <Skeleton className="h-[900px] w-full max-w-[720px]" />
          ) : (
            <Folha
              d={dados}
              secoes={secoes}
              recado={recado}
              escritorio={{ ...marca, nome: nomeEscritorio }}
            />
          )}
        </div>
      </div>

      <Dialog open={dialogo} onOpenChange={setDialogo}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar ao cliente</DialogTitle>
            <DialogDescription>
              Mensagem pronta para WhatsApp ou e-mail. Baixe o PDF e anexe junto.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Mensagem para o cliente"
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            rows={9}
          />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setDialogo(false)}>
              Fechar
            </Button>
            <Button variant="outline" onClick={baixarPdf}>
              <FileDown />
              Baixar PDF
            </Button>
            <Button onClick={copiarMensagem}>
              <Copy />
              Copiar mensagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

/* ---------- Folha (prévia do PDF). Sempre clara, como o papel. ---------- */

const PAPEL = {
  texto: "#18181B",
  cinza: "#5F5F68",
  linha: "#E4E2DD",
  barra: "#D6D3CD",
  success: "#146C33",
  warning: "#B45309",
  danger: "#B91C1C",
};

function Folha({
  d,
  secoes,
  recado,
  escritorio,
}: {
  d: DadosRelatorio;
  secoes: Secoes;
  recado: string;
  escritorio: Omit<Escritorio, "id">;
}) {
  const cor = escritorio.cor_marca;
  const varNotas = variacao(d.autorizadas, d.autorizadasMesAnterior);
  const varFat =
    d.faturamentoMes !== null ? variacao(d.faturamentoMes, d.faturamentoMesAnterior ?? 0) : null;
  const pct = pctDoLimite(d.acumulado, d.limite);
  const faixa = faixaMei(pct);
  const corFaixa =
    faixa.tom === "danger" ? PAPEL.danger : faixa.tom === "warning" ? PAPEL.warning : PAPEL.success;
  const maxSerie = Math.max(1, ...d.serie.map((s) => s.valor)) * 1.15;

  const Secao = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
    <section className="mt-6">
      <h3
        className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: cor }}
      >
        {titulo}
      </h3>
      {children}
    </section>
  );
  const Variacao = ({ v, casas }: { v: number | null; casas: number }) =>
    v === null ? (
      <em className="text-xs not-italic" style={{ color: PAPEL.cinza }}>
        sem mês anterior
      </em>
    ) : (
      <em
        className="text-xs font-medium not-italic"
        style={{ color: v >= 0 ? PAPEL.success : PAPEL.danger }}
      >
        {v >= 0 ? "+" : "−"}
        {formatarPct(Math.abs(v), casas)} vs {MESES_CURTOS[(d.mes + 10) % 12]!.toLowerCase()}
      </em>
    );

  return (
    <article
      className="flex min-h-[900px] w-full max-w-[720px] flex-col rounded bg-white px-8 pb-7 pt-10 text-[12.5px] leading-[18px] shadow-[0_12px_32px_rgba(0,0,0,.25)] sm:px-12"
      style={{ color: PAPEL.texto }}
      aria-label="Prévia do relatório"
    >
      <header
        className="flex items-center gap-3.5 pb-4"
        style={{ borderBottom: `2px solid ${cor}` }}
      >
        <div
          className="grid size-11 shrink-0 place-items-center rounded-[10px] text-base font-bold text-white"
          style={{ background: cor }}
        >
          {iniciais(escritorio.nome)}
        </div>
        <div>
          <div className="text-[15px] font-semibold leading-5">{escritorio.nome}</div>
          <div className="text-xs" style={{ color: PAPEL.cinza }}>
            Relatório fiscal · {d.rotuloMes}
            {d.parcial ? " (parcial)" : ""}
          </div>
        </div>
      </header>

      <div className="mb-1.5 mt-5 flex items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold leading-[26px] tracking-tight">
            {d.cliente.nome}
          </div>
          <div className="text-[11.5px]" style={{ color: PAPEL.cinza }}>
            {rotuloTipoCliente(d)}
          </div>
        </div>
        <div className="whitespace-nowrap text-[11.5px]" style={{ color: PAPEL.cinza }}>
          Emitido em {format(new Date(), "dd/MM/yyyy")}
        </div>
      </div>

      {secoes.resumo ? (
        <Secao titulo="Resumo do mês">
          <div className={cn("grid gap-2.5", d.mei ? "grid-cols-3" : "grid-cols-2")}>
            {d.mei && d.faturamentoMes !== null ? (
              <Kpi rotulo="Faturamento lançado" valor={moeda(d.faturamentoMes)}>
                <Variacao v={varFat} casas={1} />
              </Kpi>
            ) : null}
            <Kpi rotulo="Notas autorizadas" valor={String(d.autorizadas)}>
              <Variacao v={varNotas} casas={0} />
            </Kpi>
            <Kpi rotulo="Canceladas / denegadas" valor={String(d.comProblema.length)}>
              <em className="text-xs not-italic" style={{ color: PAPEL.cinza }}>
                {d.comProblema.length ? "veja abaixo" : "nenhuma com problema"}
              </em>
            </Kpi>
          </div>
        </Secao>
      ) : null}

      {secoes.grafico ? (
        <Secao
          titulo={
            d.serieEmReais ? "Faturamento dos últimos meses" : "Notas autorizadas nos últimos meses"
          }
        >
          <svg viewBox="0 0 520 156" className="h-auto w-full" role="img" aria-label="Evolução">
            {d.serie.map((s, i) => {
              const passo = 500 / d.serie.length;
              const larg = Math.min(48, passo * 0.55);
              const x = 10 + i * passo + (passo - larg) / 2;
              const h = (s.valor / maxSerie) * 120;
              const atual = i === d.serie.length - 1;
              return (
                <g key={i}>
                  {h > 0 ? (
                    <rect
                      x={x}
                      y={16 + 120 - h}
                      width={larg}
                      height={h}
                      rx={4}
                      fill={atual ? cor : PAPEL.barra}
                    />
                  ) : null}
                  <text
                    x={x + larg / 2}
                    y={152}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={500}
                    fill={PAPEL.cinza}
                  >
                    {s.rotulo}
                  </text>
                  {s.valor > 0 ? (
                    <text
                      x={x + larg / 2}
                      y={16 + 120 - h - 5}
                      textAnchor="middle"
                      fontSize={9.5}
                      fontWeight={600}
                      fill={atual ? PAPEL.texto : PAPEL.cinza}
                    >
                      {d.serieEmReais
                        ? `${(s.valor / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
                        : s.valor}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </Secao>
      ) : null}

      {secoes.limite ? (
        d.mei ? (
          <Secao titulo="Limite anual do MEI">
            <div className="flex justify-between gap-3">
              <span>
                Acumulado em {d.ano} até {MESES_LONGOS[d.mes - 1]!.toLowerCase()}
              </span>
              <b className="tabular-nums">
                {moeda(d.acumulado)}{" "}
                <small className="font-normal" style={{ color: PAPEL.cinza }}>
                  de {moeda(d.limite)} · {formatarPct(pct, 1)}
                </small>
              </b>
            </div>
            <div className="relative mt-2 h-2 rounded-full" style={{ background: PAPEL.linha }}>
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${Math.min(pct, 100)}%`, background: corFaixa }}
              />
              <i
                className="absolute -inset-y-1 w-0.5"
                style={{ left: "80%", background: PAPEL.cinza }}
              />
            </div>
            <p className="mt-2" style={{ color: PAPEL.cinza }}>
              {textoLimiteMei(d)}
            </p>
          </Secao>
        ) : (
          <Secao titulo="Acumulado no ano">
            <p>
              <b className="tabular-nums">{d.acumulado}</b> nota{d.acumulado === 1 ? "" : "s"}{" "}
              autorizada{d.acumulado === 1 ? "" : "s"} de janeiro a{" "}
              {MESES_LONGOS[d.mes - 1]!.toLowerCase()} de {d.ano}.
            </p>
          </Secao>
        )
      ) : null}

      {secoes.atencao ? (
        <Secao titulo="Notas que pedem atenção">
          {d.comProblema.length ? (
            <TabelaPapel
              cab={["Nº", "Data", "Situação"]}
              linhas={d.comProblema.map((n) => [
                <span key="n" className="font-mono">
                  {n.numero_nf}
                </span>,
                format(parseISO(n.data_emissao), "dd/MM/yyyy"),
                `${STATUS_LABEL[n.status]}${n.status === "denegada" ? " · número não pode ser reutilizado" : " · não entra no faturamento"}`,
              ])}
            />
          ) : (
            <p style={{ color: PAPEL.success }}>Todas as notas do mês foram autorizadas.</p>
          )}
        </Secao>
      ) : null}

      {secoes.obrig ? (
        <Secao titulo="Obrigações do mês">
          {d.obrigacoes.length ? (
            <TabelaPapel
              cab={["Obrigação", "Competência", "Vencimento", "Situação"]}
              linhas={d.obrigacoes.map((o) => [
                TIPO_OBRIGACAO_META[o.tipo]?.label ?? o.tipo,
                format(parseISO(o.competencia), "MM/yyyy"),
                format(parseISO(o.vencimento), "dd/MM/yyyy"),
                STATUS_OBRIGACAO_META[o.status]?.label ?? o.status,
              ])}
            />
          ) : (
            <p style={{ color: PAPEL.cinza }}>Nenhuma obrigação registrada nesta competência.</p>
          )}
        </Secao>
      ) : null}

      {secoes.pend ? (
        <Secao titulo="O que precisamos de você">
          {d.pendencias.length ? (
            <ul className="list-disc space-y-1 pl-5">
              {d.pendencias.map((p) => (
                <li key={p.id}>
                  <b>{p.titulo}</b>
                  {p.descricao ? ` — ${p.descricao}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: PAPEL.success }}>Nenhuma pendência. Obrigado!</p>
          )}
        </Secao>
      ) : null}

      {secoes.obs && recado.trim() ? (
        <Secao titulo="Recado do contador">
          <p className="whitespace-pre-line">{recado.trim()}</p>
        </Secao>
      ) : null}

      <footer
        className="mt-auto flex justify-between gap-3 pt-4 text-[11px]"
        style={{ color: PAPEL.cinza, borderTop: `1px solid ${PAPEL.linha}` }}
      >
        <span>{[escritorio.nome, escritorio.contato].filter(Boolean).join(" · ")}</span>
        <span>Gerado pelo Ofis</span>
      </footer>
    </article>
  );
}

function Kpi({
  rotulo,
  valor,
  children,
}: {
  rotulo: string;
  valor: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-lg px-3.5 py-3"
      style={{ border: `1px solid ${PAPEL.linha}` }}
    >
      <small className="text-[11px]" style={{ color: PAPEL.cinza }}>
        {rotulo}
      </small>
      <b className="text-lg font-semibold leading-6 tabular-nums">{valor}</b>
      {children}
    </div>
  );
}

function TabelaPapel({ cab, linhas }: { cab: string[]; linhas: React.ReactNode[][] }) {
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr>
          {cab.map((c) => (
            <th
              key={c}
              className="py-1.5 pr-3 text-[11px] font-normal"
              style={{ color: PAPEL.cinza, borderBottom: `1px solid ${PAPEL.linha}` }}
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((l, i) => (
          <tr key={i}>
            {l.map((c, j) => (
              <td
                key={j}
                className="py-1.5 pr-3"
                style={{ borderBottom: `1px solid ${PAPEL.linha}` }}
              >
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
