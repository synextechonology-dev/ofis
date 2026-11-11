import type { TipoEmissao } from "@/lib/supabase";

export type Cliente = {
  id: string;
  nome: string;
  /** Tipo principal: o primeiro de `tipos_emissao` (o banco mantém os dois em sincronia). */
  tipo_emissao: TipoEmissao;
  /** Todos os tipos que o cliente emite. Sempre tem ao menos um. */
  tipos_emissao: TipoEmissao[];
  criado_em: string;
};

/** Tipos do cliente com o principal primeiro (cadastros antigos podem vir sem `tipos_emissao`). */
export function tiposDoCliente(c: Pick<Cliente, "tipo_emissao" | "tipos_emissao">): TipoEmissao[] {
  const lista = c.tipos_emissao?.length ? c.tipos_emissao : [c.tipo_emissao];
  return [c.tipo_emissao, ...lista.filter((t) => t !== c.tipo_emissao)];
}
