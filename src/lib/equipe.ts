import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export type Papel = "admin" | "membro";

export type MembroEquipe = {
  user_id: string;
  email: string;
  nome: string | null;
  papel: Papel;
  ativo: boolean;
  criado_em: string;
  ultimo_acesso: string | null;
};

export const ROTULO_PAPEL: Record<Papel, string> = {
  admin: "Administrador",
  membro: "Membro",
};

/**
 * Papel de quem está logado (null = fora da equipe ou inativo).
 * A política da tabela `equipe` deixa qualquer membro ativo ler a própria linha.
 */
export function useMeuPapel() {
  return useQuery({
    queryKey: ["meu-papel"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return { userId: null, papel: null as Papel | null };
      const { data, error } = await supabase
        .from("equipe")
        .select("papel, ativo")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (error) throw error;
      const papel = data?.ativo ? (data.papel as Papel) : null;
      return { userId: auth.user.id, papel };
    },
  });
}

/** Lista com e-mail e último acesso. Só funciona para administradores (função no banco). */
export async function listarEquipe(): Promise<MembroEquipe[]> {
  const { data, error } = await supabase.rpc("listar_equipe");
  if (error) throw error;
  return (data ?? []) as MembroEquipe[];
}
