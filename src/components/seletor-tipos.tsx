import { cn } from "@/lib/utils";
import type { TipoEmissao } from "@/lib/supabase";
import { TIPOS, TIPO_META } from "@/lib/nf";

const COR: Record<TipoEmissao, string> = {
  comercio: "bg-tipo-comercio/12 text-tipo-comercio",
  servico: "bg-tipo-servico/12 text-tipo-servico",
  rural: "bg-tipo-rural/12 text-tipo-rural",
};

/**
 * Escolha de um ou mais tipos de emissão. O primeiro da lista é o principal
 * (sugerido no Lançar Nota); "Tornar principal" muda a ordem.
 */
export function SeletorTipos({
  value,
  onChange,
  id,
}: {
  value: TipoEmissao[];
  onChange: (tipos: TipoEmissao[]) => void;
  id?: string | undefined;
}) {
  const alternar = (t: TipoEmissao) => {
    if (value.includes(t)) {
      if (value.length === 1) return; // ao menos um tipo
      onChange(value.filter((x) => x !== t));
    } else {
      onChange([...value, t]);
    }
  };

  return (
    <div className="space-y-2">
      <div id={id} role="group" aria-label="Tipos de emissão" className="flex flex-wrap gap-2">
        {TIPOS.map((t) => {
          const marcado = value.includes(t);
          return (
            <button
              key={t}
              type="button"
              aria-pressed={marcado}
              onClick={() => alternar(t)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-[4px] border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                marcado
                  ? cn("border-transparent", COR[t])
                  : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 rounded-[1px]",
                  marcado ? "bg-current" : "border border-current bg-transparent",
                )}
              />
              {TIPO_META[t].label}
            </button>
          );
        })}
      </div>
      {value.length > 1 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>
            Principal:{" "}
            <span className="font-medium text-foreground">{TIPO_META[value[0]!].label}</span>
          </span>
          {value.slice(1).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChange([t, ...value.filter((x) => x !== t)])}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Tornar {TIPO_META[t].label} principal
            </button>
          ))}
        </p>
      )}
    </div>
  );
}
