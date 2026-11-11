import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type KpiTrend = {
  direction: "up" | "down" | "flat";
  /** Texto da pílula: "+12%", "−1,2 p.p." */
  label: string;
};

/**
 * KPI no padrão do design system: rótulo, número grande (tabular) e rodapé com a variação
 * numa pílula de status + referência em texto. Sem ícone colorido e sem efeito de hover.
 *
 * `icon` e `accent` continuam aceitos por compatibilidade com as telas antigas, mas não
 * pintam mais o cartão: o ícone aparece pequeno e neutro ao lado do rótulo.
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  trend,
  referencia,
  rodape,
  loading,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: KpiTrend | undefined;
  /** Texto depois da pílula: "vs ontem (15)" */
  referencia?: string | undefined;
  /** Rodapé livre, quando não há variação */
  rodape?: ReactNode;
  loading?: boolean;
  accent?: "primary" | "success" | "warning" | "destructive";
}) {
  return (
    <Card className="rounded-lg border-border shadow-kpi">
      <CardContent className="py-5">
        <p className="flex items-center gap-2 text-[13px] font-medium leading-[18px] text-muted-foreground">
          {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
          {label}
        </p>
        {loading ? (
          <Skeleton className="mt-3 h-10 w-20" />
        ) : (
          <p className="nums mt-3 text-[32px] font-semibold leading-10 tracking-[-0.02em] text-foreground">
            {value}
          </p>
        )}
        {loading ? (
          <Skeleton className="mt-2 h-4 w-28" />
        ) : trend || referencia || rodape ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] leading-[18px] text-muted-foreground">
            {trend ? (
              <span
                className={cn(
                  "nums inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium",
                  trend.direction === "up" && "bg-success/12 text-success",
                  trend.direction === "down" && "bg-destructive/12 text-destructive",
                  trend.direction === "flat" && "bg-secondary text-muted-foreground",
                )}
              >
                {trend.label}
              </span>
            ) : null}
            {referencia ? <span>{referencia}</span> : null}
            {rodape}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
