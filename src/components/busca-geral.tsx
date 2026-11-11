import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Command as CommandPrimitive } from "cmdk";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  FileCheck,
  FilePlus2,
  FileText,
  Keyboard,
  MessageSquare,
  Moon,
  Plus,
  Receipt,
  Search,
  TrendingUp,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

import { supabase, type NotaFiscal } from "@/lib/supabase";
import type { Cliente } from "@/lib/clientes";
import { useMeuPapel } from "@/lib/equipe";
import { useTema } from "@/lib/tema";
import { TIPO_META, STATUS_LABEL } from "@/lib/nf";
import { useMeiAno } from "@/lib/mei-dados";
import { formatarPct, pctDoLimite } from "@/lib/mei";
import {
  EVENTO_ABRIR_ATALHOS,
  EVENTO_ABRIR_BUSCA,
  EVENTO_ALTERNAR_MENU,
  GRUPOS,
  GRUPO_ADMIN,
  digitando,
  janelaAberta,
  normalizar,
} from "@/lib/navegacao";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Item = {
  id: string;
  icone: LucideIcon;
  titulo: string;
  sub?: ReactNode;
  executar: () => void;
};

/** Teclas da forma "G depois N". */
const IR_PARA: Record<string, string> = {
  n: "/notas-do-dia",
  d: "/dashboard",
  m: "/mei",
  c: "/clientes",
  o: "/obrigacoes",
  t: "/tarefas",
};

function Tecla({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-secondary px-1 font-sans text-[11px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

/** Destaca o trecho buscado, sem diferenciar acento. */
function Destaque({ texto, busca }: { texto: string; busca: string }) {
  const q = normalizar(busca.trim());
  if (!q) return <>{texto}</>;
  const i = normalizar(texto).indexOf(q);
  if (i < 0) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, i)}
      <mark className="bg-transparent font-semibold text-accent-foreground">
        {texto.slice(i, i + q.length)}
      </mark>
      {texto.slice(i + q.length)}
    </>
  );
}

/**
 * Busca geral (Ctrl+K ou "/") e atalhos de teclado do Ofis.
 * Montado uma vez no layout autenticado.
 */
export function BuscaGeral() {
  const navigate = useNavigate();
  const { tema, setTema } = useTema();
  const { data: eu } = useMeuPapel();
  const [aberta, setAberta] = useState(false);
  const [atalhos, setAtalhos] = useState(false);
  const [busca, setBusca] = useState("");
  const gPendente = useRef<number | null>(null);

  // Destinos vêm de listas fixas (menu e atalhos); a tipagem por rota não cabe aqui.
  const ir = (to: string, search?: Record<string, string>) =>
    navigate({ to, ...(search ? { search } : {}) } as unknown as Parameters<typeof navigate>[0]);

  // ---------- atalhos globais ----------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberta((v) => !v);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || digitando() || janelaAberta()) return;

      const k = e.key.toLowerCase();
      if (gPendente.current !== null) {
        window.clearTimeout(gPendente.current);
        gPendente.current = null;
        const destino = IR_PARA[k];
        if (destino) {
          e.preventDefault();
          ir(destino);
        }
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        setAberta(true);
      } else if (k === "n") {
        e.preventDefault();
        ir("/lancar-nota");
      } else if (k === "g") {
        gPendente.current = window.setTimeout(() => (gPendente.current = null), 1200);
      } else if (e.key === "?") {
        e.preventDefault();
        setAtalhos(true);
      } else if (e.key === "[") {
        e.preventDefault();
        window.dispatchEvent(new Event(EVENTO_ALTERNAR_MENU));
      }
    }
    const onAbrir = () => setAberta(true);
    const onAtalhos = () => setAtalhos(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(EVENTO_ABRIR_BUSCA, onAbrir);
    window.addEventListener(EVENTO_ABRIR_ATALHOS, onAtalhos);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(EVENTO_ABRIR_BUSCA, onAbrir);
      window.removeEventListener(EVENTO_ABRIR_ATALHOS, onAtalhos);
    };
  });

  useEffect(() => {
    if (!aberta) setBusca("");
  }, [aberta]);

  // ---------- dados ----------
  const ano = new Date().getFullYear();
  const { data: clientes } = useQuery({
    queryKey: ["clientes"],
    enabled: aberta,
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

  const digitos = busca.replace(/\D/g, "");
  const buscaNotas = digitos.length >= 3 ? digitos : "";
  const { data: notas } = useQuery({
    queryKey: ["busca-notas", buscaNotas],
    enabled: aberta && !!buscaNotas,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("id, numero_nf, data_emissao, cliente, status")
        .ilike("numero_nf", `%${buscaNotas}%`)
        .order("data_emissao", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as Pick<
        NotaFiscal,
        "id" | "numero_nf" | "data_emissao" | "cliente" | "status"
      >[];
    },
  });

  // ---------- itens ----------
  const grupos = useMemo(() => {
    const q = normalizar(busca.trim());
    const bate = (t: string) => !q || normalizar(t).includes(q);
    const fechar = (fn: () => void) => () => {
      setAberta(false);
      fn();
    };

    const acoes: Item[] = [
      {
        id: "a-nota",
        icone: FilePlus2,
        titulo: "Lançar nota",
        sub: <Tecla>N</Tecla>,
        executar: () => ir("/lancar-nota"),
      },
      {
        id: "a-rel",
        icone: Receipt,
        titulo: "Gerar relatório mensal",
        executar: () => ir("/relatorios"),
      },
      {
        id: "a-mei",
        icone: TrendingUp,
        titulo: "Registrar faturamento MEI",
        executar: () => ir("/mei"),
      },
      {
        id: "a-esp",
        icone: UserPlus,
        titulo: "Relatório de esporádicos para o financeiro",
        executar: () => ir("/esporadicos"),
      },
      {
        id: "a-den",
        icone: AlertTriangle,
        titulo: "Ver notas denegadas",
        executar: () => ir("/historico", { status: "denegada" }),
      },
      { id: "a-tar", icone: Plus, titulo: "Nova tarefa", executar: () => ir("/tarefas") },
      {
        id: "a-obr",
        icone: FileCheck,
        titulo: "Nova obrigação",
        executar: () => ir("/obrigacoes"),
      },
      {
        id: "a-com",
        icone: MessageSquare,
        titulo: "Registrar comunicação",
        executar: () => ir("/comunicacoes"),
      },
      {
        id: "a-tema",
        icone: Moon,
        titulo: tema === "escuro" ? "Usar tema claro" : "Usar tema escuro",
        executar: () => setTema(tema === "escuro" ? "claro" : "escuro"),
      },
      {
        id: "a-atalhos",
        icone: Keyboard,
        titulo: "Atalhos de teclado",
        sub: <Tecla>?</Tecla>,
        executar: () => setAtalhos(true),
      },
    ]
      .filter((a) => bate(a.titulo))
      .slice(0, q ? 5 : 4)
      .map((a) => ({ ...a, executar: fechar(a.executar) }));

    const telas: Item[] = [...GRUPOS, ...(eu?.papel === "admin" ? [GRUPO_ADMIN] : [])]
      .flatMap((g) => g.itens)
      .filter((t) => bate(t.label))
      .slice(0, q ? 5 : 20)
      .map((t) => ({
        id: `t-${t.to}`,
        icone: t.icon,
        titulo: t.label,
        sub: "Ir para",
        executar: fechar(() => ir(t.to)),
      }));

    const meiPorId = new Map((meiCabecalhos ?? []).map((m) => [m.cliente_id, m] as const));
    const clientesAchados: Item[] =
      q.length >= 2
        ? (clientes ?? [])
            .filter((c) => normalizar(c.nome).includes(q))
            .slice(0, 6)
            .map((c) => {
              const mei = meiPorId.get(c.id);
              return mei
                ? {
                    id: `c-${c.id}`,
                    icone: TrendingUp,
                    titulo: c.nome,
                    sub: `MEI · ${formatarPct(pctDoLimite(mei.faturamento, mei.limite_anual))} do limite`,
                    executar: fechar(() =>
                      navigate({ to: "/mei/$clienteId", params: { clienteId: c.id } }),
                    ),
                  }
                : {
                    id: `c-${c.id}`,
                    icone: Users,
                    titulo: c.nome,
                    sub: TIPO_META[c.tipo_emissao]?.label ?? "Cliente",
                    executar: fechar(() => ir("/clientes", { busca: c.nome })),
                  };
            })
        : [];

    const notasAchadas: Item[] = (buscaNotas ? (notas ?? []) : []).map((n) => ({
      id: `n-${n.id}`,
      icone: FileText,
      titulo: `Nota ${n.numero_nf} · ${n.cliente}`,
      sub: `${format(parseISO(n.data_emissao), "dd/MM/yyyy")} · ${STATUS_LABEL[n.status]}`,
      executar: fechar(() => ir("/historico", { nf: n.numero_nf })),
    }));

    return [
      { titulo: "Ações", itens: acoes },
      { titulo: "Telas", itens: telas },
      { titulo: "Clientes", itens: clientesAchados },
      { titulo: "Notas", itens: notasAchadas },
    ].filter((g) => g.itens.length);
  }, [busca, clientes, meiCabecalhos, notas, buscaNotas, tema, eu?.papel]);

  return (
    <>
      <Dialog open={aberta} onOpenChange={setAberta}>
        <DialogContent
          className="top-[12vh] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 [&>button]:hidden"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">Busca geral</DialogTitle>
          <CommandPrimitive shouldFilter={false} loop label="Busca geral">
            <div className="flex items-center gap-2.5 border-b border-border px-4">
              <Search className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
              <CommandPrimitive.Input
                value={busca}
                onValueChange={setBusca}
                placeholder="Buscar cliente, nota, tela ou ação…"
                className="h-14 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
              />
              <Tecla>Esc</Tecla>
            </div>
            <CommandPrimitive.List className="max-h-[min(420px,55vh)] overflow-y-auto p-1.5">
              <CommandPrimitive.Empty className="px-4 py-7 text-center text-sm text-muted-foreground">
                Nada encontrado para “{busca}”.
              </CommandPrimitive.Empty>
              {grupos.map((g) => (
                <CommandPrimitive.Group
                  key={g.titulo}
                  heading={g.titulo}
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  {g.itens.map((it) => (
                    <CommandPrimitive.Item
                      key={it.id}
                      value={it.id}
                      onSelect={it.executar}
                      className="group flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2.5 py-1.5 text-sm text-foreground outline-none data-[selected=true]:bg-secondary"
                    >
                      <it.icone
                        className="size-4 shrink-0 text-muted-foreground group-data-[selected=true]:text-accent-foreground"
                        aria-hidden
                      />
                      <span className="min-w-0 truncate">
                        <Destaque texto={it.titulo} busca={busca} />
                      </span>
                      {it.sub ? (
                        <span className="ml-auto whitespace-nowrap pl-3 text-xs text-muted-foreground">
                          {it.sub}
                        </span>
                      ) : null}
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              ))}
            </CommandPrimitive.List>
            <div className="flex flex-wrap gap-4 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Tecla>↑</Tecla>
                <Tecla>↓</Tecla> navegar
              </span>
              <span className="inline-flex items-center gap-1">
                <Tecla>Enter</Tecla> abrir
              </span>
              <span className="inline-flex items-center gap-1">
                <Tecla>Ctrl</Tecla>
                <Tecla>K</Tecla> abre de qualquer tela
              </span>
            </div>
          </CommandPrimitive>
        </DialogContent>
      </Dialog>

      <Dialog open={atalhos} onOpenChange={setAtalhos}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Atalhos de teclado</DialogTitle>
            <DialogDescription>
              Funcionam em qualquer tela, fora de campos de texto.
            </DialogDescription>
          </DialogHeader>
          <dl className="divide-y divide-border text-sm">
            {(
              [
                [
                  "Busca geral",
                  <>
                    <Tecla>Ctrl</Tecla> <Tecla>K</Tecla> ou <Tecla>/</Tecla>
                  </>,
                ],
                ["Lançar nota", <Tecla>N</Tecla>],
                [
                  "Ir para Notas do Dia",
                  <>
                    <Tecla>G</Tecla> depois <Tecla>N</Tecla>
                  </>,
                ],
                [
                  "Ir para o Dashboard",
                  <>
                    <Tecla>G</Tecla> depois <Tecla>D</Tecla>
                  </>,
                ],
                [
                  "Ir para Controle MEI",
                  <>
                    <Tecla>G</Tecla> depois <Tecla>M</Tecla>
                  </>,
                ],
                [
                  "Ir para Clientes",
                  <>
                    <Tecla>G</Tecla> depois <Tecla>C</Tecla>
                  </>,
                ],
                [
                  "Ir para Obrigações",
                  <>
                    <Tecla>G</Tecla> depois <Tecla>O</Tecla>
                  </>,
                ],
                [
                  "Ir para Tarefas",
                  <>
                    <Tecla>G</Tecla> depois <Tecla>T</Tecla>
                  </>,
                ],
                [
                  "Recolher/expandir menu",
                  <>
                    <Tecla>[</Tecla> ou <Tecla>Ctrl</Tecla> <Tecla>B</Tecla>
                  </>,
                ],
                ["Fechar painel ou janela", <Tecla>Esc</Tecla>],
                ["Esta lista", <Tecla>?</Tecla>],
              ] as [string, ReactNode][]
            ).map(([rotulo, teclas]) => (
              <div key={rotulo} className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-foreground">{rotulo}</dt>
                <dd className="flex items-center gap-1 text-muted-foreground">{teclas}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}
