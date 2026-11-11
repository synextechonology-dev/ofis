import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type KpiTrend = {
  direction: "up" | "down" | "flat";
  label: string;
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  trend,
  loading,
  accent = "primary",
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: KpiTrend;
  loading?: boolean;
  accent?: "primary" | "success" | "warning" | "destructive";
}) {
  const accentMap = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    destructive: "bg-destructive/10 text-destructive",
  } as const;

  const TrendIcon =
    trend?.direction === "up" ? ArrowUpRight : trend?.direction === "down" ? ArrowDownRight : Minus;

  return (
    <Card className="hover-lift rounded-lg border-border shadow-kpi">
      <CardContent className="flex items-start justify-between gap-4 py-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-16" />
          ) : (
            <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">{value}</p>
          )}
          {loading ? (
            <Skeleton className="mt-2 h-4 w-24" />
          ) : trend ? (
            <p
              className={cn(
                "mt-1.5 inline-flex items-center gap-1 text-xs font-medium",
                trend.direction === "up" && "text-success",
                trend.direction === "down" && "text-destructive",
                trend.direction === "flat" && "text-muted-foreground",
              )}
            >
              <TrendIcon className="size-3.5" />
              {trend.label}
            </p>
          ) : null}
        </div>
        <div
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-xl",
            accentMap[accent],
          )}
        >
          <Icon className="size-6" />
        </div>
      </CardContent>
    </Card>
  );
}
