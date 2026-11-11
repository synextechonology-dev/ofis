import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TIPO_META } from "@/lib/nf";
import type { TipoEmissao } from "@/lib/supabase";

export type ClienteOption = {
  cliente: string;
  tipoPrincipal: TipoEmissao;
  quantidade: number;
  id?: string;
};

export function ClienteCombobox({
  value,
  onChange,
  onSelect,
  options,
  id = "cliente",
  loading = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (option: ClienteOption) => void;
  options: ClienteOption[];
  id?: string;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtradas = useMemo(() => {
    const termo = value.trim().toLowerCase();
    const base = termo
      ? options.filter((o) => o.cliente.toLowerCase().includes(termo))
      : options;
    return base.slice(0, 8);
  }, [options, value]);

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          value={value}
          autoComplete="off"
          className="pl-9"
          placeholder="Buscar cliente..."
          maxLength={200}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {open && loading ? (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover p-3 text-sm text-muted-foreground shadow-elevated">
          Carregando clientes...
        </div>
      ) : null}

      {open && !loading && filtradas.length > 0 ? (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-elevated">
          {filtradas.map((option) => {
            const meta = TIPO_META[option.tipoPrincipal];
            const selecionado = option.cliente === value;
            return (
              <li key={option.cliente}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelect(option);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors hover:bg-accent"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {selecionado ? (
                      <Check className="size-3.5 shrink-0 text-primary" />
                    ) : (
                      <span className="size-3.5 shrink-0" />
                    )}
                    <span className="truncate">{option.cliente}</span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium",
                      meta.softClass,
                    )}
                  >
                    {meta.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
