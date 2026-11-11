import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-secondary/40 px-6 py-10 text-center",
        className,
      )}
    >
      <div className="relative flex size-16 items-center justify-center rounded-full bg-primary/10">
        <span className="absolute inset-0 animate-pulse rounded-full bg-primary/5" />
        <Icon className="size-7 text-primary" />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
