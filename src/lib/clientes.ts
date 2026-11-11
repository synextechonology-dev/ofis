import type { TipoEmissao } from "@/lib/supabase";

export type Cliente = {
  id: string;
  nome: string;
  tipo_emissao: TipoEmissao;
  criado_em: string;
};
