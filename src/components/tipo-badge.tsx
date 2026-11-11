import { cn } from "@/lib/utils";
import type { TipoEmissao } from "@/lib/supabase";

/**
 * Camada de CATEGORIA do design system: canto reto e ponto quadrado, para não ser
 * confundida com status (pílula e ponto redondo).
 */
const MAP: Record<TipoEmissao, { label: string; className: string }> = {
  comercio: { label: "Comércio", className: "bg-tipo-comercio/12 text-tipo-comercio" },
  servico: { label: "Serviço", className: "bg-tipo-servico/12 text-tipo-servico" },
  rural: { label: "Rural", className: "bg-tipo-rural/12 text-tipo-rural" },
};

export function TipoBadge({ tipo, className }: { tipo: TipoEmissao; className?: string }) {
  const item = MAP[tipo] ?? { label: tipo, className: "bg-muted text-muted-foreground" };
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-[4px] px-2 text-xs font-medium",
        item.className,
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-[1px] bg-current" />
      {item.label}
    </span>
  );
}
