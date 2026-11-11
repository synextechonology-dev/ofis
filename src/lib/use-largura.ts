import { useEffect, useRef, useState } from "react";

/**
 * Largura real de um elemento, atualizada quando a tela muda. Usado pelos gráficos em SVG
 * para desenhar na largura do card: assim o texto continua em 12px também no celular.
 */
export function useLargura<T extends HTMLElement>(inicial: number, minima = 280) {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(inicial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(([e]) => {
      if (e) setLargura(Math.max(minima, Math.round(e.contentRect.width)));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [minima]);
  return [ref, largura] as const;
}
