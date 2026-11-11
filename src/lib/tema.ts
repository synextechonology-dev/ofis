import { useCallback, useEffect, useState } from "react";

export type Tema = "escuro" | "claro";

const CHAVE = "ofis-tema";

/**
 * Script inline que roda antes da pintura da página, para não "piscar" o tema errado.
 * O padrão do Ofis é o tema escuro.
 */
export const SCRIPT_TEMA = `try{var t=localStorage.getItem('${CHAVE}');document.documentElement.classList.toggle('dark',t!=='claro')}catch(e){document.documentElement.classList.add('dark')}`;

function lerTema(): Tema {
  if (typeof document === "undefined") return "escuro";
  return document.documentElement.classList.contains("dark") ? "escuro" : "claro";
}

export function useTema() {
  const [tema, setTemaState] = useState<Tema>("escuro");

  useEffect(() => {
    setTemaState(lerTema());
  }, []);

  const setTema = useCallback((novo: Tema) => {
    document.documentElement.classList.toggle("dark", novo === "escuro");
    try {
      localStorage.setItem(CHAVE, novo);
    } catch {
      // armazenamento indisponível (modo privado): o tema vale só nesta aba
    }
    setTemaState(novo);
  }, []);

  return { tema, setTema };
}
