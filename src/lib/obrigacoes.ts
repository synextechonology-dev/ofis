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
  das: { label: "DAS", className: "border border-border bg-transparent text-muted-foreground" },
  pgdas: { label: "PGDAS", className: "border border-border bg-transparent text-muted-foreground" },
  dctf: { label: "DCTF", className: "border border-border bg-transparent text-muted-foreground" },
  efd: { label: "EFD", className: "border border-border bg-transparent text-muted-foreground" },
  sped: { label: "SPED", className: "border border-border bg-transparent text-muted-foreground" },
  defis: { label: "DEFIS", className: "border border-border bg-transparent text-muted-foreground" },
  outro: { label: "Outro", className: "border border-border bg-transparent text-muted-foreground" },
};

export const STATUS_OBRIGACAO_META: Record<StatusObrigacao, { label: string; className: string }> =
  {
    pendente: { label: "Pendente", className: "bg-warning/12 text-warning" },
    entregue: { label: "Entregue", className: "bg-success/12 text-success" },
    atrasada: { label: "Atrasada", className: "bg-destructive/12 text-destructive" },
  };
