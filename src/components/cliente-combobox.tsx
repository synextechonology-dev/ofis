import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TIPO_META } from "@/lib/nf";
import { normalizar } from "@/lib/navegacao";
import type { TipoEmissao } from "@/lib/supabase";

export type ClienteOption = {
  cliente: string;
  tipoPrincipal: TipoEmissao;
  quantidade: number;
  id?: string;
};

/**
 * Campo de busca de cliente com lista. Teclado: ↑/↓ escolhem, Enter seleciona (sem enviar o
 * formulário enquanto a lista está aberta), Esc fecha. Busca sem diferenciar acento.
 */
export function ClienteCombobox({
  value,
  onChange,
  onSelect,
  options,
  id = "cliente",
  loading = false,
  invalido = false,
  descricaoId,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (option: ClienteOption) => void;
  options: ClienteOption[];
  id?: string;
  loading?: boolean;
  invalido?: boolean;
  descricaoId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listaId = `${id}-lista`;

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtradas = useMemo(() => {
    const termo = normalizar(value.trim());
    const base = termo ? options.filter((o) => normalizar(o.cliente).includes(termo)) : options;
    return base.slice(0, 8);
  }, [options, value]);

  useEffect(() => setAtivo(0), [value]);

  const listaVisivel = open && !loading && filtradas.length > 0;

  function escolher(option: ClienteOption) {
    onSelect(option);
    setOpen(false);
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          value={value}
          autoComplete="off"
          className="pl-9"
          placeholder="Digite o nome do cliente…"
          maxLength={200}
          role="combobox"
          aria-expanded={listaVisivel}
          aria-controls={listaId}
          aria-autocomplete="list"
          aria-activedescendant={listaVisivel ? `${listaId}-${ativo}` : undefined}
          aria-invalid={invalido || undefined}
          aria-describedby={descricaoId}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (!open) {
                setOpen(true);
                return;
              }
              const n = Math.max(1, filtradas.length);
              setAtivo((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
            } else if (e.key === "Enter" && listaVisivel) {
              e.preventDefault();
              const op = filtradas[ativo];
              if (op) escolher(op);
            } else if (e.key === "Escape" && listaVisivel) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
          }}
        />
      </div>

      {open && loading ? (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover p-3 text-sm text-muted-foreground shadow-elevated">
          Carregando clientes…
        </div>
      ) : null}

      {listaVisivel ? (
        <ul
          id={listaId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-elevated"
        >
          {filtradas.map((option, i) => {
            const meta = TIPO_META[option.tipoPrincipal];
            const selecionado = option.cliente === value;
            return (
              <li
                key={option.id ?? option.cliente}
                id={`${listaId}-${i}`}
                role="option"
                aria-selected={i === ativo}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setAtivo(i)}
                onClick={() => escolher(option)}
                className={cn(
                  "flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-2 text-left text-sm",
                  i === ativo && "bg-secondary",
                )}
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
                    "shrink-0 rounded-[4px] px-1.5 py-0.5 text-xs font-medium",
                    meta.softClass,
                  )}
                >
                  {meta.label}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
