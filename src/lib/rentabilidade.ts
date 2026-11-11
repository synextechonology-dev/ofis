export type Complexidade = "baixa" | "media" | "alta";

export type RentabilidadeCliente = {
  id: string;
  cliente_id: string;
  complexidade: Complexidade;
  observacao: string | null;
  criado_em: string;
  atualizado_em: string;
};

export const COMPLEXIDADES: Complexidade[] = ["alta", "media", "baixa"];

export const COMPLEXIDADE_META: Record<
  Complexidade,
  { label: string; className: string; color: string }
> = {
  alta: {
    label: "Alta",
    className: "bg-destructive text-destructive-foreground",
    color: "var(--destructive)",
  },
  media: {
    label: "Média",
    className: "bg-warning text-warning-foreground",
    color: "var(--warning)",
  },
  baixa: {
    label: "Baixa",
    className: "bg-success text-success-foreground",
    color: "var(--success)",
  },
};

export type NivelDemanda = { label: string; className: string };

export function nivelDemanda(score: number): NivelDemanda {
  if (score > 20)
    return { label: "Alta", className: "bg-destructive text-destructive-foreground" };
  if (score >= 10) return { label: "Média", className: "bg-warning text-warning-foreground" };
  return { label: "Baixa", className: "bg-success text-success-foreground" };
}

export function calcularScore(notas: number, obrigacoes: number, comunicacoes: number) {
  return notas * 1 + obrigacoes * 3 + comunicacoes * 2;
}
