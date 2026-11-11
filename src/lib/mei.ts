export type MeiFaturamento = {
  id: string;
  cliente_id: string;
  ano: number;
  faturamento: number;
  limite_anual: number;
  criado_em: string;
  atualizado_em: string;
};

export type FaixaMei = {
  key: "dentro" | "atencao" | "proximo" | "ultrapassado";
  label: string;
  barra: string;
  badgeLabel: string;
  badge: string;
};

export const LIMITE_MEI_PADRAO = 81000;

export function faixaMei(pct: number): FaixaMei {
  if (pct >= 100)
    return {
      key: "ultrapassado",
      label: "Limite ultrapassado",
      barra: "bg-destructive",
      badgeLabel: "Crítico",
      badge: "bg-destructive text-destructive-foreground",
    };
  if (pct >= 85)
    return {
      key: "proximo",
      label: "Próximo do limite",
      barra: "bg-warning",
      badgeLabel: "Crítico",
      badge: "bg-destructive text-destructive-foreground",
    };
  if (pct >= 60)
    return {
      key: "atencao",
      label: "Atenção",
      barra: "bg-nav-6",
      badgeLabel: "Atenção",
      badge: "bg-warning text-warning-foreground",
    };
  return {
    key: "dentro",
    label: "Dentro do limite",
    barra: "bg-success",
    badgeLabel: "Regular",
    badge: "bg-success text-success-foreground",
  };
}

export const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
