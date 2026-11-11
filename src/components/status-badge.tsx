import { cn } from "@/lib/utils";
import type { StatusNota } from "@/lib/supabase";

/**
 * Camada de STATUS do design system: pílula com ponto redondo, fundo suave e texto
 * na mesma cor. Nunca texto branco sobre cor chapada.
 */
const MAP: Record<StatusNota, { label: string; className: string }> = {
  autorizada: { label: "Autorizada", className: "bg-success/12 text-success" },
  cancelada: { label: "Cancelada", className: "bg-destructive/12 text-destructive" },
  denegada: { label: "Denegada", className: "bg-warning/12 text-warning" },
};

export function StatusBadge({ status, className }: { status: StatusNota; className?: string }) {
  const item = MAP[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium",
        item.className,
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {item.label}
    </span>
  );
}
