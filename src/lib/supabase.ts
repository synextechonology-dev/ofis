import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://usytnvtkmlbmqcsmajsg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzeXRudnRrbWxibXFjc21hanNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0ODI2OTgsImV4cCI6MjEwMTA1ODY5OH0.uZVxxEvyLTCiBRfYR0h2vH8-XSGHpRzjJZAJF8TEMlc";

export type StatusNota = "autorizada" | "cancelada" | "denegada";

export type TipoEmissao = "rural" | "servico" | "comercio";

/**
 * Nota fiscal. Regras garantidas pelo banco (ver docs/banco-de-dados.md):
 * - toda nota pertence a UM cliente da base (cliente_id) OU a UM cliente esporádico
 *   (cliente_esporadico_id), nunca aos dois e nunca a nenhum;
 * - `cliente` é preenchido pelo banco com o nome do cadastro (não confie no texto digitado);
 * - `valor_cobranca` só existe para esporádicos (padrão R$ 50,00 por emissão).
 */
export type NotaFiscal = {
  id: string;
  numero_nf: string;
  data_emissao: string;
  cliente: string;
  cliente_id: string | null;
  cliente_esporadico_id: string | null;
  valor_cobranca: number | null;
  repassado_financeiro_em: string | null;
  status: StatusNota;
  tipo_emissao: TipoEmissao;
  criado_em: string;
  atualizado_em: string;
};

/**
 * Traduz erros do Supabase/Postgres em mensagens que a equipe entende.
 * Os gatilhos do banco já devolvem mensagens em português (ex.: cliente não cadastrado);
 * nesses casos a mensagem do banco é mostrada como está.
 */
export function mensagemDeErro(
  error: { code?: string; message?: string } | null | undefined,
  padrao = "Não foi possível salvar. Tente novamente.",
): string {
  if (!error) return padrao;
  const msg = error.message ?? "";
  switch (error.code) {
    case "23514": // check_violation (inclui mensagens dos gatilhos)
    case "23503": // foreign_key_violation
      if (/[áéíóúãõç]|cadastr|cliente/i.test(msg)) return msg;
      return "Algum dado não passou na validação do banco. Confira os campos.";
    case "23505": // unique_violation
      if (/documento/i.test(msg)) return "Já existe um cliente esporádico com este CPF/CNPJ.";
      return "Este registro já existe.";
    case "42501": // insufficient_privilege (RLS)
      return "Sua conta não tem permissão. Peça a um administrador para incluir você na equipe.";
    case "PGRST301":
    case "401":
      return "Sua sessão expirou. Entre novamente.";
    default:
      if (/row-level security/i.test(msg))
        return "Sua conta não tem permissão. Peça a um administrador para incluir você na equipe.";
      if (/fetch|network/i.test(msg)) return "Sem conexão com o servidor. Verifique a internet.";
      return padrao;
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window === "undefined" ? undefined : window.localStorage,
  },
});
