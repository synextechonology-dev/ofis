import { useQuery, type QueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { MeiFaturamento, MeiMes } from "@/lib/mei";

export const chaveMeiAno = (ano: number) => ["mei-faturamento", ano] as const;
export const chaveMeiMeses = (ano: number) => ["mei-mensal", ano] as const;

/** Cabeçalhos (acumulado e limite) de todos os clientes MEI no ano. */
export function useMeiAno(ano: number) {
  return useQuery({
    queryKey: chaveMeiAno(ano),
    queryFn: async () => {
      const { data, error } = await supabase.from("mei_faturamento").select("*").eq("ano", ano);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        faturamento: Number(r.faturamento) || 0,
        faturamento_sem_mes: Number(r.faturamento_sem_mes) || 0,
        limite_anual: Number(r.limite_anual) || 0,
      })) as MeiFaturamento[];
    },
  });
}

/** Meses lançados no ano (todos os clientes; a página do cliente filtra). */
export function useMeiMeses(ano: number) {
  return useQuery({
    queryKey: chaveMeiMeses(ano),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mei_faturamento_mensal")
        .select("*")
        .eq("ano", ano)
        .order("mes", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        faturamento: Number(r.faturamento) || 0,
      })) as MeiMes[];
    },
  });
}

/**
 * Lança o faturamento de um mês. `somar` adiciona ao que já estiver no mês (como a prévia);
 * `substituir` grava o valor exato (correção na página do cliente).
 * O banco recalcula o acumulado do ano e cria o cabeçalho se for o primeiro lançamento.
 */
export async function registrarMes({
  clienteId,
  ano,
  mes,
  valor,
  modo,
}: {
  clienteId: string;
  ano: number;
  mes: number;
  valor: number;
  modo: "somar" | "substituir";
}) {
  let total = valor;
  if (modo === "somar") {
    const { data, error } = await supabase
      .from("mei_faturamento_mensal")
      .select("faturamento")
      .eq("cliente_id", clienteId)
      .eq("ano", ano)
      .eq("mes", mes)
      .maybeSingle();
    if (error) return { error };
    total = Math.round(((Number(data?.faturamento) || 0) + valor) * 100) / 100;
  }
  return supabase
    .from("mei_faturamento_mensal")
    .upsert(
      { cliente_id: clienteId, ano, mes, faturamento: total },
      { onConflict: "cliente_id,ano,mes" },
    );
}

export async function apagarMes(id: string) {
  return supabase.from("mei_faturamento_mensal").delete().eq("id", id);
}

/** Ajusta a parte do acumulado que não tem mês (lançada antes do controle mensal). */
export async function ajustarSemMes(cabecalhoId: string, valor: number) {
  return supabase
    .from("mei_faturamento")
    .update({ faturamento_sem_mes: valor })
    .eq("id", cabecalhoId);
}

export function invalidarMei(queryClient: QueryClient, ano: number) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: chaveMeiAno(ano) }),
    queryClient.invalidateQueries({ queryKey: chaveMeiMeses(ano) }),
  ]);
}
