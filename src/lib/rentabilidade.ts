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
    className: "border border-border bg-transparent text-muted-foreground",
    color: "var(--foreground)",
  },
  media: {
    label: "Média",
    className: "border border-border bg-transparent text-muted-foreground",
    color: "var(--muted-foreground)",
  },
  baixa: {
    label: "Baixa",
    className: "border border-border bg-transparent text-muted-foreground",
    color: "var(--chart-5)",
  },
};

export type NivelDemanda = { label: string; className: string };

export function nivelDemanda(score: number): NivelDemanda {
  if (score > 20) return { label: "Alta", className: "bg-destructive/12 text-destructive" };
  if (score >= 10) return { label: "Média", className: "bg-warning/12 text-warning" };
  return { label: "Baixa", className: "bg-success/12 text-success" };
}

export function calcularScore(notas: number, obrigacoes: number, comunicacoes: number) {
  return notas * 1 + obrigacoes * 3 + comunicacoes * 2;
}
