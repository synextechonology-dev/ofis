export type TipoComunicacao = "solicitacao" | "retorno" | "pendencia" | "informativo";

export type StatusComunicacao = "aberta" | "resolvida";

export type Comunicacao = {
  id: string;
  cliente_id: string | null;
  tipo: TipoComunicacao;
  titulo: string;
  descricao: string | null;
  status: StatusComunicacao;
  criado_em: string;
  atualizado_em: string;
};

export const TIPOS_COMUNICACAO: TipoComunicacao[] = [
  "solicitacao",
  "retorno",
  "pendencia",
  "informativo",
];

export const TIPO_COMUNICACAO_META: Record<TipoComunicacao, { label: string; className: string }> =
  {
    solicitacao: { label: "Solicitação", className: "bg-primary text-primary-foreground" },
    retorno: { label: "Retorno", className: "bg-success text-success-foreground" },
    pendencia: { label: "Pendência", className: "bg-destructive text-destructive-foreground" },
    informativo: { label: "Informativo", className: "bg-muted text-muted-foreground" },
  };
