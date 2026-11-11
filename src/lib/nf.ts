import { Store, Wrench, Sprout, type LucideIcon } from "lucide-react";

import type { NotaFiscal, StatusNota, TipoEmissao } from "@/lib/supabase";

export const TIPOS: TipoEmissao[] = ["comercio", "servico", "rural"];

export const TIPO_META: Record<
  TipoEmissao,
  { label: string; icon: LucideIcon; color: string; badgeClass: string; softClass: string }
> = {
  comercio: {
    label: "Comércio",
    icon: Store,
    color: "var(--tipo-comercio)",
    badgeClass: "bg-tipo-comercio text-tipo-foreground",
    softClass: "bg-tipo-comercio/10 text-tipo-comercio",
  },
  servico: {
    label: "Serviço",
    icon: Wrench,
    color: "var(--tipo-servico)",
    badgeClass: "bg-tipo-servico text-tipo-foreground",
    softClass: "bg-tipo-servico/10 text-tipo-servico",
  },
  rural: {
    label: "Rural",
    icon: Sprout,
    color: "var(--tipo-rural)",
    badgeClass: "bg-tipo-rural text-tipo-foreground",
    softClass: "bg-tipo-rural/10 text-tipo-rural",
  },
};

export const STATUS_LABEL: Record<StatusNota, string> = {
  autorizada: "Autorizada",
  cancelada: "Cancelada",
  denegada: "Denegada",
};

export const STATUS_COLOR: Record<StatusNota, string> = {
  autorizada: "var(--success)",
  cancelada: "var(--destructive)",
  denegada: "var(--warning)",
};

export type RankingCliente = {
  cliente: string;
  quantidade: number;
  tipoPrincipal: TipoEmissao;
  tipos: TipoEmissao[];
};

/** Agrupa notas por cliente, ordenando da maior para a menor quantidade. */
export function rankingClientes(notas: NotaFiscal[]): RankingCliente[] {
  const mapa = new Map<
    string,
    { nome: string; quantidade: number; porTipo: Record<string, number> }
  >();

  for (const nota of notas) {
    // Agrupa por cliente_id quando disponível; caso contrário, pelo nome digitado.
    const chave = nota.cliente_id ?? (nota.cliente?.trim() || "—");
    const atual = mapa.get(chave) ?? {
      nome: nota.cliente?.trim() || "—",
      quantidade: 0,
      porTipo: {},
    };
    atual.quantidade += 1;
    atual.porTipo[nota.tipo_emissao] = (atual.porTipo[nota.tipo_emissao] ?? 0) + 1;
    mapa.set(chave, atual);
  }

  return [...mapa.values()]
    .map(({ nome, quantidade, porTipo }) => {
      const tipos = (Object.keys(porTipo) as TipoEmissao[]).sort(
        (a, b) => (porTipo[b] ?? 0) - (porTipo[a] ?? 0),
      );
      return {
        cliente: nome,
        quantidade,
        tipos,
        tipoPrincipal: tipos[0] ?? "comercio",
      };
    })
    .sort((a, b) => b.quantidade - a.quantidade || a.cliente.localeCompare(b.cliente));
}

/** Percentual formatado com uma casa decimal. */
export function percentual(parte: number, total: number) {
  if (!total) return "0%";
  const valor = (parte / total) * 100;
  return `${valor.toFixed(valor % 1 === 0 ? 0 : 1)}%`;
}
