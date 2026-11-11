import type { NotaFiscal } from "@/lib/supabase";
import type { Obrigacao } from "@/lib/obrigacoes";

export type ScoreFiscal = {
  total: number;
  pontosNotas: number;
  pontosObrigacoes: number;
  pontosFrequencia: number;
  taxaAutorizacao: number | null;
  taxaEntrega: number | null;
  mesesComEmissao: number;
  label: string;
  className: string;
};

/**
 * Score fiscal 0-100 considerando os últimos 3 meses:
 * autorização das notas (40), obrigações entregues (40) e frequência de emissão (20).
 */
export function calcularScoreFiscal(
  notas: NotaFiscal[],
  obrigacoes: Obrigacao[],
  mesesRef: string[],
): ScoreFiscal {
  // Notas
  let pontosNotas = 0;
  let taxaAutorizacao: number | null = null;
  if (notas.length > 0) {
    const autorizadas = notas.filter((n) => n.status === "autorizada").length;
    taxaAutorizacao = (autorizadas / notas.length) * 100;
    if (taxaAutorizacao >= 100) pontosNotas = 40;
    else if (taxaAutorizacao >= 90) pontosNotas = 30;
    else if (taxaAutorizacao >= 80) pontosNotas = 20;
    else pontosNotas = 10;
  }

  // Obrigações
  let pontosObrigacoes = 20;
  let taxaEntrega: number | null = null;
  if (obrigacoes.length > 0) {
    const entregues = obrigacoes.filter((o) => o.status === "entregue").length;
    taxaEntrega = (entregues / obrigacoes.length) * 100;
    if (taxaEntrega >= 100) pontosObrigacoes = 40;
    else if (taxaEntrega >= 80) pontosObrigacoes = 30;
    else if (taxaEntrega >= 60) pontosObrigacoes = 20;
    else pontosObrigacoes = 10;
  }

  // Frequência
  const meses = new Set(notas.map((n) => n.data_emissao.slice(0, 7)));
  const mesesComEmissao = mesesRef.filter((m) => meses.has(m)).length;
  const pontosFrequencia =
    mesesComEmissao >= 3 ? 20 : mesesComEmissao === 2 ? 15 : mesesComEmissao === 1 ? 5 : 0;

  const total = Math.min(100, pontosNotas + pontosObrigacoes + pontosFrequencia);
  const faixa =
    total >= 80
      ? { label: "Excelente", className: "bg-success text-success-foreground" }
      : total >= 60
        ? { label: "Regular", className: "bg-warning text-warning-foreground" }
        : { label: "Atenção", className: "bg-destructive text-destructive-foreground" };

  return {
    total,
    pontosNotas,
    pontosObrigacoes,
    pontosFrequencia,
    taxaAutorizacao,
    taxaEntrega,
    mesesComEmissao,
    ...faixa,
  };
}
