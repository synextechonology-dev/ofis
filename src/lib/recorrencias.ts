import type { TipoObrigacao } from "@/lib/obrigacoes";

export type Recorrencia = {
  id: string;
  cliente_id: string | null;
  tipo: TipoObrigacao;
  dia_vencimento: number;
  ativo: boolean;
  observacao: string | null;
  criado_em: string;
  atualizado_em: string;
};
