import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { FilePlus2, Loader2, UserPlus, Users } from "lucide-react";
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
  formatarReais,
  lerReais,
  mascararDocumento,
  soDigitos,
  type ClienteEsporadico,
} from "@/lib/esporadicos";
import { normalizar } from "@/lib/navegacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
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
        content: "Lance notas em sequência: o cliente continua selecionado e o número é sugerido.",
      },
    ],
  }),
  component: LancarNotaPage,
});

type Modo = "base" | "esporadico";

const schemaNota = z.object({
  numero_nf: z.string().trim().min(1, "Informe o número da nota.").max(50, "Número muito longo."),
  data_emissao: z.string().min(1, "Informe a data de emissão."),
  status: z.enum(["autorizada", "cancelada", "denegada"]),
  tipo_emissao: z.enum(["rural", "servico", "comercio"]),
});

/** Nota lançada nesta visita à tela (lista "Lançadas agora"). */
type Lancada = {
  id: string;
  numero_nf: string;
  cliente: string;
  hora: string;
  status: StatusNota;
  esporadico: boolean;
  valor_cobranca: number | null;
};

const hoje = () => format(new Date(), "yyyy-MM-dd");

/** Próximo número mantendo os zeros à esquerda ("000123" → "000124"). Só para números puros. */
function proximoNumero(n: string) {
  const s = n.trim();
  if (!/^\d+$/.test(s)) return null;
  return (BigInt(s) + BigInt(1)).toString().padStart(s.length, "0");
}

/** Valor que só muda depois de `ms` sem alteração (evita consultar o banco a cada tecla). */
function useAtrasado<T>(valor: T, ms = 300) {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = window.setTimeout(() => setV(valor), ms);
    return () => window.clearTimeout(t);
  }, [valor, ms]);
  return v;
}

function LancarNotaPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const numeroRef = useRef<HTMLInputElement>(null);

  const [modo, setModo] = useState<Modo>("base");
  const [numeroNf, setNumeroNf] = useState("");
  const [numeroSugerido, setNumeroSugerido] = useState(false);
  const [dataEmissao, setDataEmissao] = useState(hoje);
  const [status, setStatus] = useState<StatusNota>("autorizada");
  const [tipoEmissao, setTipoEmissao] = useState<TipoEmissao>("comercio");
  const [tipoDoCadastro, setTipoDoCadastro] = useState(false);
  const [salvando, setSalvando] = useState<"continuar" | "sair" | null>(null);
  const [lancadas, setLancadas] = useState<Lancada[]>([]);
  const [erroCliente, setErroCliente] = useState(false);

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

  const opcoesClientes: ClienteOption[] = useMemo(
    () =>
      (clientesCadastrados ?? []).map((c) => ({
        cliente: c.nome,
        tipoPrincipal: c.tipo_emissao,
        quantidade: 0,
        id: c.id,
      })),
    [clientesCadastrados],
  );

  // Esporádico já cadastrado com o mesmo documento: a nota vai para esse cadastro.
  const espExistente = useMemo(() => {
    const d = soDigitos(espDoc);
    if (d.length !== 11 && d.length !== 14) return null;
    return (esporadicos ?? []).find((e) => e.documento === d) ?? null;
  }, [espDoc, esporadicos]);

  // Nome parecido com um cliente da base: provavelmente não é esporádico.
  const parecidoComBase = useMemo(() => {
    const n = normalizar(espNome.trim());
    if (n.length < 4) return null;
    return (clientesCadastrados ?? []).find((c) => normalizar(c.nome).includes(n)) ?? null;
  }, [espNome, clientesCadastrados]);

  const docDigitos = soDigitos(espDoc);
  const docCompleto = docDigitos.length === 11 || docDigitos.length === 14;
  const docInvalido = docCompleto && !documentoValido(docDigitos);
  const cobrancaNum = lerReais(espCobranca);

  // Quem é o cliente, para sugerir número e checar repetição.
  const alvo: { coluna: "cliente_id" | "cliente_esporadico_id"; id: string } | null =
    modo === "base"
      ? clienteId
        ? { coluna: "cliente_id", id: clienteId }
        : null
      : espExistente
        ? { coluna: "cliente_esporadico_id", id: espExistente.id }
        : null;

  // Último número lançado para este cliente → sugestão do próximo.
  const { data: ultimoNumero } = useQuery({
    queryKey: ["ultima-nota-cliente", alvo?.coluna, alvo?.id],
    enabled: !!alvo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("numero_nf")
        .eq(alvo!.coluna, alvo!.id)
        .order("criado_em", { ascending: false })
        .limit(30);
      if (error) throw error;
      const numeros = (data ?? [])
        .map((n) => String(n.numero_nf).trim())
        .filter((n) => /^\d+$/.test(n));
      if (!numeros.length) return null;
      return numeros.reduce((a, b) => (BigInt(b) > BigInt(a) ? b : a));
    },
  });

  useEffect(() => {
    if (!alvo || ultimoNumero === undefined) return;
    if (numeroNf.trim() && !numeroSugerido) return; // não apaga o que a pessoa digitou
    const proximo = ultimoNumero ? proximoNumero(ultimoNumero) : null;
    setNumeroNf(proximo ?? "");
    setNumeroSugerido(!!proximo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultimoNumero, alvo?.id]);

  // Mesmo número já lançado para este cliente?
  const numeroAtrasado = useAtrasado(numeroNf.trim());
  const { data: duplicada } = useQuery({
    queryKey: ["nota-duplicada", alvo?.coluna, alvo?.id, numeroAtrasado],
    enabled: !!alvo && !!numeroAtrasado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("id, numero_nf, data_emissao")
        .eq(alvo!.coluna, alvo!.id)
        .eq("numero_nf", numeroAtrasado)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Pick<NotaFiscal, "id" | "numero_nf" | "data_emissao"> | null;
    },
  });
  const ehDuplicada = !!duplicada && duplicada.numero_nf === numeroNf.trim();

  function focarNumero() {
    window.setTimeout(() => {
      numeroRef.current?.focus();
      numeroRef.current?.select();
    }, 0);
  }

  function limparTudo() {
    setNumeroNf("");
    setNumeroSugerido(false);
    setDataEmissao(hoje());
    setStatus("autorizada");
    setTipoEmissao("comercio");
    setTipoDoCadastro(false);
    setCliente("");
    setClienteId(null);
    setErroCliente(false);
    setEspNome("");
    setEspDoc("");
    setEspContato("");
    setEspCobranca("50,00");
    window.setTimeout(
      () => document.getElementById(modo === "base" ? "cliente" : "esp_nome")?.focus(),
      0,
    );
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

  async function lancar(depois: "continuar" | "sair") {
    if (salvando) return;
    const parsed = schemaNota.safeParse({
      numero_nf: numeroNf,
      data_emissao: dataEmissao,
      status,
      tipo_emissao: tipoEmissao,
    });

    if (modo === "base" && !clienteId) {
      setErroCliente(true);
      toast.error("Escolha um cliente da lista ou use “Cliente esporádico”.");
      document.getElementById("cliente")?.focus();
      return;
    }
    if (modo === "esporadico") {
      if (!espNome.trim()) {
        toast.error("Informe o nome ou a razão social do cliente esporádico.");
        document.getElementById("esp_nome")?.focus();
        return;
      }
      if (!docCompleto || docInvalido) {
        toast.error("Informe um CPF ou CNPJ válido. O financeiro precisa dele para cobrar.");
        document.getElementById("esp_doc")?.focus();
        return;
      }
      if (!Number.isFinite(cobrancaNum) || cobrancaNum < 0) {
        toast.error("Informe o valor da cobrança desta emissão.");
        document.getElementById("esp_cobranca")?.focus();
        return;
      }
    }
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Verifique os dados informados.");
      if (!numeroNf.trim()) numeroRef.current?.focus();
      return;
    }
    if (ehDuplicada) {
      toast.error(`A nota ${numeroNf.trim()} já foi lançada para este cliente.`);
      numeroRef.current?.focus();
      return;
    }

    setSalvando(depois);
    let nomeCliente = cliente;
    let insercao: Record<string, unknown>;
    if (modo === "base") {
      insercao = { ...parsed.data, cliente, cliente_id: clienteId };
    } else {
      const esp = await obterEsporadicoId();
      if (!esp) {
        setSalvando(null);
        return;
      }
      nomeCliente = esp.nome;
      insercao = {
        ...parsed.data,
        cliente: esp.nome,
        cliente_esporadico_id: esp.id,
        valor_cobranca: cobrancaNum,
      };
    }
    const { data, error } = await supabase
      .from("notas_fiscais")
      .insert(insercao)
      .select("id")
      .single();
    setSalvando(null);
    if (error || !data) {
      toast.error(mensagemDeErro(error, "Erro ao salvar a nota. Tente novamente."));
      return;
    }

    const nota: Lancada = {
      id: data.id as string,
      numero_nf: parsed.data.numero_nf,
      cliente: nomeCliente,
      hora: format(new Date(), "HH:mm"),
      status: parsed.data.status,
      esporadico: modo === "esporadico",
      valor_cobranca: modo === "esporadico" ? cobrancaNum : null,
    };
    setLancadas((l) => [nota, ...l]);
    void queryClient.invalidateQueries();

    if (depois === "sair") {
      toast.success(`Nota ${nota.numero_nf} lançada.`);
      navigate({ to: "/notas-do-dia" });
      return;
    }

    toast.success(`Nota ${nota.numero_nf} lançada`, {
      action: { label: "Desfazer", onClick: () => void desfazer(nota) },
    });
    // Continua com o mesmo cliente, data e tipo; sugere o próximo número.
    const proximo = proximoNumero(nota.numero_nf);
    setNumeroNf(proximo ?? "");
    setNumeroSugerido(!!proximo);
    setStatus("autorizada");
    focarNumero();
  }

  async function desfazer(nota: Lancada) {
    const { error } = await supabase.from("notas_fiscais").delete().eq("id", nota.id);
    if (error) {
      toast.error(mensagemDeErro(error, "Não foi possível desfazer."));
      return;
    }
    setLancadas((l) => l.filter((x) => x.id !== nota.id));
    toast.success(`Nota ${nota.numero_nf} removida.`);
    void queryClient.invalidateQueries();
  }

  const totalHoje = notasHoje?.length ?? 0;
  const descricaoNumero = ehDuplicada
    ? null
    : numeroSugerido && ultimoNumero
      ? `Sugerido: próxima depois da ${ultimoNumero}`
      : alvo && ultimoNumero === null
        ? "Primeira nota deste cliente"
        : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Lançar Nota</h1>
          <p className="text-sm text-muted-foreground">
            Lance em sequência: depois de salvar, o cliente continua selecionado e o cursor volta
            para o número.
          </p>
        </div>
        <p className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <Kbd>Enter</Kbd> lança e continua · <Kbd>Esc</Kbd> limpa
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="rounded-lg border-border shadow-card lg:col-span-8">
          <CardContent className="pt-6">
            <form
              noValidate
              autoComplete="off"
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                void lancar("continuar");
              }}
              onKeyDown={(e) => {
                // Só limpa se o Esc veio de um campo do formulário (não de uma lista aberta,
                // que fica fora dele na página e só deve se fechar).
                if (
                  e.key === "Escape" &&
                  !e.defaultPrevented &&
                  e.currentTarget.contains(e.target as Node)
                ) {
                  e.preventDefault();
                  limparTudo();
                }
              }}
            >
              <div className="space-y-2">
                <span className="text-sm font-medium">Quem é o cliente?</span>
                <div
                  role="group"
                  aria-label="Tipo de cliente"
                  className="flex w-full rounded-lg border border-border bg-secondary p-1 sm:inline-flex sm:w-auto"
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
                      onClick={() => {
                        setModo(valor);
                        setNumeroNf("");
                        setNumeroSugerido(false);
                      }}
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
                  <Label htmlFor="cliente">Cliente</Label>
                  <ClienteCombobox
                    value={cliente}
                    invalido={erroCliente}
                    descricaoId="cliente-ajuda"
                    onChange={(v) => {
                      setCliente(v);
                      const exato = opcoesClientes.find(
                        (o) => normalizar(o.cliente) === normalizar(v),
                      );
                      setClienteId(exato?.id ?? null);
                      if (!exato) {
                        setTipoDoCadastro(false);
                        setNumeroNf("");
                        setNumeroSugerido(false);
                      }
                    }}
                    options={opcoesClientes}
                    loading={loadingClientes}
                    onSelect={(option) => {
                      setCliente(option.cliente);
                      setClienteId(option.id ?? null);
                      setTipoEmissao(option.tipoPrincipal);
                      setTipoDoCadastro(true);
                      setErroCliente(false);
                      setNumeroNf("");
                      setNumeroSugerido(true);
                      focarNumero();
                    }}
                  />
                  <p
                    id="cliente-ajuda"
                    className={cn(
                      "text-xs",
                      erroCliente || (cliente && !clienteId)
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {cliente && !clienteId
                      ? "Cliente não encontrado na base. Escolha da lista ou use “Cliente esporádico”."
                      : clienteId
                        ? "Tipo de emissão preenchido pelo cadastro."
                        : "Comece a digitar para buscar. Use ↑ ↓ e Enter para escolher."}
                  </p>
                </div>
              ) : (
                <div className="space-y-4 rounded-lg border border-dashed border-border p-4">
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <UserPlus className="mt-0.5 size-4 shrink-0" />
                    Cliente que não é da carteira do escritório. Ele vai para a base separada de
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
                            setTipoDoCadastro(true);
                            setNumeroNf("");
                            setNumeroSugerido(true);
                            focarNumero();
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
                        Contato{" "}
                        <span className="font-normal text-muted-foreground">(opcional)</span>
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
                  <Label htmlFor="numero_nf">Número da nota</Label>
                  <Input
                    id="numero_nf"
                    ref={numeroRef}
                    value={numeroNf}
                    onChange={(e) => {
                      setNumeroNf(e.target.value);
                      setNumeroSugerido(false);
                    }}
                    placeholder="000000"
                    className="font-mono"
                    maxLength={50}
                    aria-invalid={ehDuplicada || undefined}
                    aria-describedby="numero-ajuda"
                  />
                  <p
                    id="numero-ajuda"
                    className={cn(
                      "min-h-4 text-xs",
                      ehDuplicada ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {ehDuplicada && duplicada ? (
                      <>
                        Já lançada para este cliente em{" "}
                        {format(new Date(`${duplicada.data_emissao}T12:00:00`), "dd/MM/yyyy")}.{" "}
                        <Link
                          to="/historico"
                          search={{ nf: duplicada.numero_nf }}
                          className="font-medium underline underline-offset-2"
                        >
                          Ver nota
                        </Link>
                      </>
                    ) : (
                      descricaoNumero
                    )}
                  </p>
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
                  <Label htmlFor="tipo_emissao">Tipo de emissão</Label>
                  <Select
                    value={tipoEmissao}
                    onValueChange={(v) => {
                      setTipoEmissao(v as TipoEmissao);
                      setTipoDoCadastro(false);
                    }}
                  >
                    <SelectTrigger id="tipo_emissao">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comercio">Comércio</SelectItem>
                      <SelectItem value="servico">Serviço</SelectItem>
                      <SelectItem value="rural">Rural</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="min-h-4 text-xs text-muted-foreground">
                    {tipoDoCadastro && modo === "base" ? "Do cadastro do cliente" : null}
                  </p>
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

              <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={limparTudo} disabled={!!salvando}>
                  Limpar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void lancar("sair")}
                  disabled={!!salvando}
                >
                  {salvando === "sair" ? <Loader2 className="animate-spin" /> : null}
                  Lançar e ver notas
                </Button>
                <Button type="submit" disabled={!!salvando} className="sm:min-w-44">
                  {salvando === "continuar" ? <Loader2 className="animate-spin" /> : <FilePlus2 />}
                  Lançar e continuar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border shadow-card lg:col-span-4">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <FilePlus2 className="size-4 text-muted-foreground" />
              Lançadas agora
            </CardTitle>
            <span className="nums rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {lancadas.length}
            </span>
          </CardHeader>
          <CardContent>
            {lancadas.length === 0 ? (
              <EmptyState
                icon={FilePlus2}
                title="Nenhuma ainda"
                description="As notas que você lançar agora aparecem aqui, para conferir antes de sair."
                className="border-0 bg-transparent px-2 py-6"
              />
            ) : (
              <ul className="divide-y divide-border">
                {lancadas.map((n) => (
                  <li key={n.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{n.cliente}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{n.numero_nf}</span> · {n.hora}
                        {n.esporadico && n.valor_cobranca != null
                          ? ` · esporádico ${formatarReais(n.valor_cobranca)}`
                          : ""}
                      </p>
                    </div>
                    {n.status !== "autorizada" ? <StatusBadge status={n.status} /> : null}
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/historico" search={{ nf: n.numero_nf }}>
                        Abrir
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              <span className="nums">{lancadas.length}</span> nesta visita ·{" "}
              <span className="nums">{totalHoje}</span> com emissão hoje no escritório
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 items-center rounded border border-border bg-secondary px-1.5 font-sans text-[11px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}
