import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { StatusNota } from "@/lib/supabase";

/**
 * Camada de STATUS do design system: pílula com ponto redondo, fundo suave e texto
 * na mesma cor. Nunca texto branco sobre cor chapada.
 */
export type TomStatus = "success" | "warning" | "danger" | "neutro";

const TOM: Record<TomStatus, string> = {
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  danger: "bg-destructive/12 text-destructive",
  neutro: "bg-muted text-muted-foreground",
};

/** Pílula de status genérica (equipe, obrigações, tarefas…). Sempre com texto. */
export function StatusPill({
  tom,
  children,
  className,
}: {
  tom: TomStatus;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium",
        TOM[tom],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

const MAP: Record<StatusNota, { label: string; tom: TomStatus }> = {
  autorizada: { label: "Autorizada", tom: "success" },
  cancelada: { label: "Cancelada", tom: "danger" },
  denegada: { label: "Denegada", tom: "warning" },
};

export function StatusBadge({ status, className }: { status: StatusNota; className?: string }) {
  const item = MAP[status] ?? { label: status, tom: "neutro" as const };
  return (
    <StatusPill tom={item.tom} className={className}>
      {item.label}
    </StatusPill>
  );
}
