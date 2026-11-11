import type { TomStatus } from "@/components/status-badge";

/**
 * Cabeçalho do ano de um cliente MEI. `faturamento` é o ACUMULADO, calculado pelo banco:
 *   faturamento = faturamento_sem_mes + soma de mei_faturamento_mensal do ano.
 * Não grave `faturamento` direto: lance os meses (ou ajuste `faturamento_sem_mes`).
 */
export type MeiFaturamento = {
  id: string;
  cliente_id: string;
  ano: number;
  faturamento: number;
  faturamento_sem_mes: number;
  limite_anual: number;
  criado_em: string;
  atualizado_em: string;
};

/** Faturamento de um mês, lançado pela equipe (sem ligação com o valor das notas). */
export type MeiMes = {
  id: string;
  cliente_id: string;
  ano: number;
  mes: number; // 1–12
  faturamento: number;
  observacao: string | null;
  criado_em: string;
  atualizado_em: string;
};

export const LIMITE_MEI_PADRAO = 81000;

/** Faixas decididas pelo João em 11/11/2026: abaixo de 80% regular, 80–100% atenção, acima de 100% excedido. */
export const FAIXA_ATENCAO = 80;

export type FaixaMei = {
  key: "regular" | "atencao" | "excedido";
  label: string;
  tom: TomStatus;
  /** classe da barra de progresso */
  barra: string;
};

export function faixaMei(pct: number): FaixaMei {
  if (pct > 100)
    return { key: "excedido", label: "Limite excedido", tom: "danger", barra: "bg-destructive" };
  if (pct >= FAIXA_ATENCAO)
    return { key: "atencao", label: "Acima de 80%", tom: "warning", barra: "bg-warning" };
  return { key: "regular", label: "Dentro do limite", tom: "success", barra: "bg-success" };
}

export const pctDoLimite = (valor: number, limite: number) =>
  limite > 0 ? (valor / limite) * 100 : 0;

/** "97,4%" */
export const formatarPct = (p: number, casas = 0) =>
  `${p.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

export const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

export const MESES_CURTOS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

export const MESES_LONGOS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

/**
 * Projeção simples até dezembro: acumulado + média dos meses lançados × meses que faltam.
 * Só serve para orientar a conversa com o cliente.
 */
export function projecaoAnual({
  acumulado,
  meses,
  mesAtual,
}: {
  acumulado: number;
  meses: MeiMes[];
  mesAtual: number; // 1–12
}) {
  const fechados = meses.filter((m) => m.mes < mesAtual);
  const base = fechados.length ? fechados : meses;
  const media = base.length ? base.reduce((s, m) => s + Number(m.faturamento), 0) / base.length : 0;
  const lancadoNoMesAtual = meses.some((m) => m.mes === mesAtual);
  const mesesQueFaltam = 12 - mesAtual + (lancadoNoMesAtual ? 0 : 1);
  return { media, mesesConsiderados: base.length, projetado: acumulado + media * mesesQueFaltam };
}
