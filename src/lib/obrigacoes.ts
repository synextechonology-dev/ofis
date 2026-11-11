export type TipoObrigacao = "das" | "pgdas" | "dctf" | "efd" | "sped" | "defis" | "outro";

export type StatusObrigacao = "pendente" | "entregue" | "atrasada";

export type Obrigacao = {
  id: string;
  cliente_id: string | null;
  tipo: TipoObrigacao;
  competencia: string;
  vencimento: string;
  status: StatusObrigacao;
  observacao: string | null;
  criado_em: string;
  atualizado_em: string;
};

export const TIPOS_OBRIGACAO: TipoObrigacao[] = [
  "das",
  "pgdas",
  "dctf",
  "efd",
  "sped",
  "defis",
  "outro",
];

export const TIPO_OBRIGACAO_META: Record<TipoObrigacao, { label: string; className: string }> = {
  das: { label: "DAS", className: "bg-destructive text-destructive-foreground" },
  pgdas: { label: "PGDAS", className: "bg-warning text-warning-foreground" },
  dctf: { label: "DCTF", className: "bg-primary text-primary-foreground" },
  efd: { label: "EFD", className: "bg-tipo-servico text-tipo-foreground" },
  sped: { label: "SPED", className: "bg-chart-4 text-primary-foreground" },
  defis: { label: "DEFIS", className: "bg-success text-success-foreground" },
  outro: { label: "Outro", className: "bg-muted text-muted-foreground" },
};

export const STATUS_OBRIGACAO_META: Record<StatusObrigacao, { label: string; className: string }> =
  {
    pendente: { label: "Pendente", className: "bg-warning text-warning-foreground" },
    entregue: { label: "Entregue", className: "bg-success text-success-foreground" },
    atrasada: { label: "Atrasada", className: "bg-destructive text-destructive-foreground" },
  };
