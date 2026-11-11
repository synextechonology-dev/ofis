/** Clientes esporádicos: quem não é da carteira do escritório, cobrado por emissão. */

export type ClienteEsporadico = {
  id: string;
  nome: string;
  /** Só dígitos: 11 (CPF) ou 14 (CNPJ). Único no banco. */
  documento: string | null;
  contato: string | null;
  observacao: string | null;
  criado_em: string;
  atualizado_em: string;
};

/** Linha da view `relatorio_financeiro_esporadicos`. */
export type LinhaRelatorioEsporadico = {
  nota_id: string;
  numero_nf: string;
  data_emissao: string;
  tipo_emissao: "rural" | "servico" | "comercio";
  status: "autorizada" | "cancelada" | "denegada";
  repassado_financeiro_em: string | null;
  cliente_esporadico_id: string;
  nome: string;
  documento: string | null;
  contato: string | null;
  observacao: string | null;
  valor_cobranca: number | null;
};

/** Valor padrão cobrado por emissão (o banco aplica o mesmo padrão se vier vazio). */
export const COBRANCA_PADRAO = 50;

export const soDigitos = (v: string) => v.replace(/\D/g, "");

/** Formata CPF/CNPJ para exibição. */
export function formatarDocumento(doc: string | null | undefined): string {
  if (!doc) return "—";
  const d = soDigitos(doc);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc;
}

/** Máscara progressiva enquanto o usuário digita. */
export function mascararDocumento(valor: string): string {
  const d = soDigitos(valor).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/** Valida dígitos verificadores de CPF (11) ou CNPJ (14). */
export function documentoValido(valor: string): boolean {
  const d = soDigitos(valor);
  if (d.length === 11) {
    if (/^(\d)\1+$/.test(d)) return false;
    const calc = (n: number) => {
      let soma = 0;
      for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
      return ((soma * 10) % 11) % 10;
    };
    return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
  }
  if (d.length === 14) {
    if (/^(\d)\1+$/.test(d)) return false;
    const calc = (n: number) => {
      const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      let soma = 0;
      for (let i = 0; i < n; i++) soma += Number(d[i]) * pesos[i]!;
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }
  return false;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatarReais = (v: number) => brl.format(v);

/** Converte "1.234,56" / "50" / "50,00" em número. Retorna NaN se inválido. */
export function lerReais(valor: string): number {
  const limpo = valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  if (!limpo.trim()) return Number.NaN;
  return Number(limpo);
}

/** Valor cobrado de uma nota (notas antigas sem valor contam como o padrão). */
export const valorDaNota = (v: number | null | undefined) => (v == null ? COBRANCA_PADRAO : Number(v));
