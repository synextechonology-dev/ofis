import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Gauge, X, UserPlus, Users } from "lucide-react";
import { z } from "zod";

import {
  supabase,
  mensagemDeErro,
  type NotaFiscal,
  type StatusNota,
  type TipoEmissao,
} from "@/lib/supabase";
import {
  COBRANCA_PADRAO,
  documentoValido,
  formatarDocumento,
  formatarReais,
  lerReais,
  mascararDocumento,
  soDigitos,
  type ClienteEsporadico,
} from "@/lib/esporadicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { TipoBadge } from "@/components/tipo-badge";
import { ClienteCombobox, type ClienteOption } from "@/components/cliente-combobox";
import type { Cliente } from "@/lib/clientes";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/lancar-nota")({
  head: () => ({
    meta: [
      { title: "Lançar Nota — Ofis" },
      {
        name: "description",
        content: "Cadastre uma nova nota fiscal informando número, data de emissão, cliente e status.",
      },
      { property: "og:title", content: "Lançar Nota — Ofis" },
      {
        property: "og:description",
        content: "Cadastro rápido de notas fiscais emitidas pelo setor fiscal.",
      },
    ],
  }),
  component: LancarNotaPage,
});

type Modo = "base" | "esporadico";

const schemaNota = z.object({
  numero_nf: z.string().trim().min(1, "Informe o número da NF").max(50, "Número muito longo"),
  data_emissao: z.string().min(1, "Informe a data de emissão"),
  status: z.enum(["autorizada", "cancelada", "denegada"]),
  tipo_emissao: z.enum(["rural", "servico", "comercio"]),
});

type NotaSalva = z.infer<typeof schemaNota> & {
  cliente: string;
  esporadico: boolean;
  valor_cobranca: number | null;
};

const hoje = () => format(new Date(), "yyyy-MM-dd");
const normalizar = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

function LancarNotaPage() {
  const queryClient = useQueryClient();
  const [modo, setModo] = useState<Modo>("base");
  const [numeroNf, setNumeroNf] = useState("");
  const [dataEmissao, setDataEmissao] = useState(hoje);
  const [status, setStatus] = useState<StatusNota>("autorizada");
  const [tipoEmissao, setTipoEmissao] = useState<TipoEmissao>("comercio");
  const [loading, setLoading] = useState(false);
  const [ultimaSalva, setUltimaSalva] = useState<NotaSalva | null>(null);

  // Cliente da base
  const [cliente, setCliente] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);

  // Cliente esporádico
  const [espNome, setEspNome] = useState("");
  const [espDoc, setEspDoc] = useState("");
  const [espContato, setEspContato] = useState("");
  const [espCobranca, setEspCobranca] = useState("50,00");

  const { data: notasHoje } = useQuery({
    queryKey: ["notas-do-dia", hoje()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("*")
        .eq("data_emissao", hoje())
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NotaFiscal[];
    },
  });

  const { data: clientesCadastrados, isLoading: loadingClientes } = useQuery({
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

  const { data: esporadicos } = useQuery({
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

  const opcoesClientes: ClienteOption[] = useMemo(() => {
    return (clientesCadastrados ?? []).map((c) => ({
      cliente: c.nome,
      tipoPrincipal: c.tipo_emissao,
      quantidade: 0,
      id: c.id,
    }));
  }, [clientesCadastrados]);

  const totalHoje = notasHoje?.length ?? 0;

  // Esporádico já cadastrado com o mesmo documento: a nota vai para esse cadastro.
  const espExistente = useMemo(() => {
    const d = soDigitos(espDoc);
    if (d.length !== 11 && d.length !== 14) return null;
    return (esporadicos ?? []).find((e) => e.documento === d) ?? null;
  }, [espDoc, esporadicos]);

  // Nome parecido com um cliente da base: provavelmente não é esporádico.
  const parecidoComBase = useMemo(() => {
    const n = normalizar(espNome);
    if (n.length < 4) return null;
    return (clientesCadastrados ?? []).find((c) => normalizar(c.nome).includes(n)) ?? null;
  }, [espNome, clientesCadastrados]);

  const docDigitos = soDigitos(espDoc);
  const docCompleto = docDigitos.length === 11 || docDigitos.length === 14;
  const docInvalido = docCompleto && !documentoValido(docDigitos);
  const cobrancaNum = lerReais(espCobranca);

  function limparFormulario() {
    setNumeroNf("");
    setDataEmissao(hoje());
    setStatus("autorizada");
    setTipoEmissao("comercio");
    setCliente("");
    setClienteId(null);
    setEspNome("");
    setEspDoc("");
    setEspContato("");
    setEspCobranca("50,00");
  }

  /** Retorna o id do esporádico (existente ou recém-criado) ou null em caso de erro. */
  async function obterEsporadicoId(): Promise<{ id: string; nome: string } | null> {
    if (espExistente) return { id: espExistente.id, nome: espExistente.nome };
    const { data, error } = await supabase
      .from("clientes_esporadicos")
      .insert({
        nome: espNome.trim(),
        documento: docDigitos,
        contato: espContato.trim() || null,
      })
      .select("id, nome")
      .single();
    if (!error && data) return data as { id: string; nome: string };

    // Outro usuário pode ter cadastrado o mesmo documento ao mesmo tempo.
    if (error?.code === "23505") {
      const { data: ja } = await supabase
        .from("clientes_esporadicos")
        .select("id, nome")
        .eq("documento", docDigitos)
        .maybeSingle();
      if (ja) return ja as { id: string; nome: string };
    }
    toast.error(mensagemDeErro(error, "Não foi possível cadastrar o cliente esporádico."));
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schemaNota.safeParse({
      numero_nf: numeroNf,
      data_emissao: dataEmissao,
      status,
      tipo_emissao: tipoEmissao,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Verifique os dados informados.");
      return;
    }

    if (modo === "base") {
      if (!clienteId) {
        toast.error("Selecione um cliente da lista ou marque como cliente esporádico.");
        return;
      }
      setLoading(true);
      const { error } = await supabase
        .from("notas_fiscais")
        .insert({ ...parsed.data, cliente, cliente_id: clienteId });
      setLoading(false);
      if (error) {
        toast.error(mensagemDeErro(error, "Erro ao salvar a nota. Tente novamente."));
        return;
      }
      concluir({ ...parsed.data, cliente, esporadico: false, valor_cobranca: null });
      return;
    }

    // Modo esporádico
    if (!espNome.trim()) {
      toast.error("Informe o nome ou a razão social do cliente esporádico.");
      return;
    }
    if (!docCompleto || docInvalido) {
      toast.error("Informe um CPF ou CNPJ válido. O financeiro precisa dele para cobrar.");
      return;
    }
    if (!Number.isFinite(cobrancaNum) || cobrancaNum < 0) {
      toast.error("Informe o valor da cobrança desta emissão.");
      return;
    }

    setLoading(true);
    const esp = await obterEsporadicoId();
    if (!esp) {
      setLoading(false);
      return;
    }
    const { error } = await supabase.from("notas_fiscais").insert({
      ...parsed.data,
      cliente: esp.nome,
      cliente_esporadico_id: esp.id,
      valor_cobranca: cobrancaNum,
    });
    setLoading(false);
    if (error) {
      toast.error(mensagemDeErro(error, "Erro ao salvar a nota. Tente novamente."));
      return;
    }
    concluir({ ...parsed.data, cliente: esp.nome, esporadico: true, valor_cobranca: cobrancaNum });
  }

  function concluir(nota: NotaSalva) {
    toast.success(
      `Nota ${nota.numero_nf} salva${nota.esporadico ? " · cliente esporádico" : ""}.`,
    );
    setUltimaSalva(nota);
    limparFormulario();
    queryClient.invalidateQueries();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Lançar Nota</h1>
        <p className="text-sm text-muted-foreground">Registre uma nova nota fiscal emitida.</p>
      </header>

      <Card className="rounded-lg border-border shadow-kpi">
        <CardContent className="flex items-center gap-3 py-4">
          <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Gauge className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Produtividade de hoje</p>
            <p className="text-base font-semibold text-foreground">
              Você já lançou <span className="nums">{totalHoje}</span>{" "}
              {totalHoje === 1 ? "nota" : "notas"} hoje
            </p>
          </div>
        </CardContent>
      </Card>

      {ultimaSalva ? (
        <Card className="block-in rounded-lg border border-success/40 bg-success/5 shadow-card">
          <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-success" />
              <CardTitle className="text-base text-success">Nota salva com sucesso</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Fechar resumo"
              className="size-7"
              onClick={() => setUltimaSalva(null)}
            >
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Número da NF</p>
              <p className="font-mono font-semibold text-foreground">{ultimaSalva.numero_nf}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Data de emissão</p>
              <p className="nums font-semibold text-foreground">
                {format(parseISO(ultimaSalva.data_emissao), "dd/MM/yyyy", { locale: ptBR })}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-muted-foreground">
                Cliente{ultimaSalva.esporadico ? " esporádico" : ""}
              </p>
              <p className="font-semibold text-foreground">{ultimaSalva.cliente}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={ultimaSalva.status} />
              <TipoBadge tipo={ultimaSalva.tipo_emissao} />
            </div>
            {ultimaSalva.esporadico && ultimaSalva.valor_cobranca != null ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Cobrança</p>
                <p className="nums font-semibold text-foreground">
                  {formatarReais(ultimaSalva.valor_cobranca)}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="rounded-lg border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Dados da nota</CardTitle>
          <CardDescription>Todos os campos são obrigatórios, exceto o contato.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <span className="text-sm font-medium">Quem é o cliente?</span>
              <div
                role="group"
                aria-label="Tipo de cliente"
                className="inline-flex w-full rounded-lg border border-border bg-muted p-1 sm:w-auto"
              >
                {(
                  [
                    ["base", "Cliente da base", Users],
                    ["esporadico", "Cliente esporádico", UserPlus],
                  ] as const
                ).map(([valor, rotulo, Icone]) => (
                  <button
                    key={valor}
                    type="button"
                    aria-pressed={modo === valor}
                    onClick={() => setModo(valor)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors sm:flex-none",
                      "aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-card",
                    )}
                  >
                    <Icone className="size-4" />
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>

            {modo === "base" ? (
              <div className="space-y-2">
                <Label htmlFor="cliente">Cliente (razão social)</Label>
                <ClienteCombobox
                  value={cliente}
                  onChange={(v) => {
                    setCliente(v);
                    const exato = opcoesClientes.find(
                      (o) => normalizar(o.cliente) === normalizar(v),
                    );
                    setClienteId(exato?.id ?? null);
                  }}
                  options={opcoesClientes}
                  loading={loadingClientes}
                  onSelect={(option) => {
                    setCliente(option.cliente);
                    setClienteId(option.id ?? null);
                    setTipoEmissao(option.tipoPrincipal);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {cliente && !clienteId
                    ? "Cliente não encontrado na base. Selecione da lista ou use “Cliente esporádico”."
                    : "Selecione um cliente cadastrado para preencher o tipo de emissão automaticamente."}
                </p>
              </div>
            ) : (
              <div className="space-y-4 rounded-lg border border-dashed border-border p-4">
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <UserPlus className="mt-0.5 size-4 shrink-0" />
                  Cliente que não é da carteira do escritório. Ele vai para a base separada de{" "}
                  clientes esporádicos e entra no relatório do financeiro.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="esp_nome">Nome / razão social</Label>
                  <Input
                    id="esp_nome"
                    value={espNome}
                    onChange={(e) => setEspNome(e.target.value)}
                    maxLength={200}
                    placeholder="Nome completo ou razão social"
                    autoComplete="off"
                  />
                  {parecidoComBase ? (
                    <p className="text-xs text-warning">
                      Parece cliente da base: {parecidoComBase.nome}.{" "}
                      <button
                        type="button"
                        className="font-medium text-primary underline-offset-2 hover:underline"
                        onClick={() => {
                          setModo("base");
                          setCliente(parecidoComBase.nome);
                          setClienteId(parecidoComBase.id);
                          setTipoEmissao(parecidoComBase.tipo_emissao);
                        }}
                      >
                        Usar cliente da base
                      </button>
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="esp_doc">CPF ou CNPJ</Label>
                    <Input
                      id="esp_doc"
                      value={espDoc}
                      onChange={(e) => {
                        const masc = mascararDocumento(e.target.value);
                        setEspDoc(masc);
                        const d = soDigitos(masc);
                        const ja = (esporadicos ?? []).find((x) => x.documento === d);
                        if (ja) {
                          if (!espNome.trim()) setEspNome(ja.nome);
                          if (!espContato.trim() && ja.contato) setEspContato(ja.contato);
                        }
                      }}
                      inputMode="numeric"
                      className="font-mono"
                      placeholder="000.000.000-00"
                      aria-invalid={docInvalido || undefined}
                    />
                    <p
                      className={cn(
                        "text-xs",
                        docInvalido
                          ? "text-destructive"
                          : espExistente
                            ? "text-success"
                            : "text-muted-foreground",
                      )}
                    >
                      {docInvalido
                        ? "CPF/CNPJ inválido. Confira os números."
                        : espExistente
                          ? `Já cadastrado: ${espExistente.nome}. A nota vai para este cadastro.`
                          : docCompleto
                            ? "Novo cliente esporádico: será cadastrado ao salvar."
                            : "O financeiro precisa do documento para cobrar."}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="esp_contato">
                      Contato <span className="font-normal text-muted-foreground">(opcional)</span>
                    </Label>
                    <Input
                      id="esp_contato"
                      value={espContato}
                      onChange={(e) => setEspContato(e.target.value)}
                      maxLength={200}
                      placeholder="Telefone ou e-mail"
                    />
                  </div>
                </div>

                <div className="space-y-2 sm:max-w-[calc(50%-0.5rem)]">
                  <Label htmlFor="esp_cobranca">Cobrança desta emissão</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      R$
                    </span>
                    <Input
                      id="esp_cobranca"
                      value={espCobranca}
                      onChange={(e) => setEspCobranca(e.target.value)}
                      inputMode="decimal"
                      className="nums pl-9"
                    />
                  </div>
                  <p
                    className={cn(
                      "text-xs",
                      Number.isFinite(cobrancaNum) && cobrancaNum !== COBRANCA_PADRAO
                        ? "text-warning"
                        : "text-muted-foreground",
                    )}
                  >
                    {!Number.isFinite(cobrancaNum)
                      ? "Informe um valor."
                      : cobrancaNum !== COBRANCA_PADRAO
                        ? `Diferente do padrão: ${formatarReais(cobrancaNum)}`
                        : `Padrão ${formatarReais(COBRANCA_PADRAO)}. Mude só se esta for diferente.`}
                  </p>
                </div>
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="numero_nf">Número da NF</Label>
                <Input
                  id="numero_nf"
                  value={numeroNf}
                  onChange={(e) => setNumeroNf(e.target.value)}
                  placeholder="Ex.: 000123456"
                  className="font-mono"
                  maxLength={50}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="data_emissao">Data de emissão</Label>
                <Input
                  id="data_emissao"
                  type="date"
                  value={dataEmissao}
                  onChange={(e) => setDataEmissao(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipo_emissao">Tipo de Emissão</Label>
                <Select value={tipoEmissao} onValueChange={(v) => setTipoEmissao(v as TipoEmissao)}>
                  <SelectTrigger id="tipo_emissao">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comercio">Comércio</SelectItem>
                    <SelectItem value="servico">Serviço</SelectItem>
                    <SelectItem value="rural">Rural</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as StatusNota)}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="autorizada">Autorizada</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                    <SelectItem value="denegada">Denegada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {modo === "esporadico" && espExistente ? (
              <p className="text-xs text-muted-foreground">
                Documento {formatarDocumento(espExistente.documento)} já está na base de esporádicos.
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={limparFormulario} disabled={loading}>
                Limpar
              </Button>
              <Button type="submit" disabled={loading} className="sm:min-w-40">
                {loading && <Loader2 className="animate-spin" />}
                Salvar Nota
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
