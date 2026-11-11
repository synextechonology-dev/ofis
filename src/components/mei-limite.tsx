import type { ReactNode } from "react";
import { AlertTriangle, TrendingUp } from "lucide-react";

import { FAIXA_ATENCAO, faixaMei, moeda, pctDoLimite, formatarPct } from "@/lib/mei";
import { cn } from "@/lib/utils";

/** Barra compacta da tabela MEI (até 100%). */
export function MeiMeterCompacto({ pct, rotulo }: { pct: number; rotulo: string }) {
  const faixa = faixaMei(pct);
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-secondary"
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={rotulo}
      >
        <span
          className={cn("block h-full rounded-full", faixa.barra)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="nums w-12 text-right text-foreground">{formatarPct(pct)}</span>
    </div>
  );
}

/**
 * Barra grande da página do cliente. A escala vai até 125% para o excesso continuar visível,
 * com marcas em 80% e no limite.
 */
export function MeiMeterGrande({ valor, limite }: { valor: number; limite: number }) {
  const pct = pctDoLimite(valor, limite);
  const faixa = faixaMei(pct);
  const pos = (p: number) => (Math.min(p, 125) / 125) * 100;
  return (
    <div className="pt-6">
      <div
        className="relative h-3.5 rounded-full border border-border bg-secondary"
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Uso do limite anual do MEI"
      >
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", faixa.barra)}
          style={{ width: `${pos(pct)}%` }}
        />
        {[
          { p: FAIXA_ATENCAO, texto: `${FAIXA_ATENCAO}%`, forte: false },
          { p: 100, texto: "Limite", forte: true },
        ].map((m) => (
          <span
            key={m.p}
            aria-hidden
            className="absolute -inset-y-1.5 w-0"
            style={{ left: `${pos(m.p)}%` }}
          >
            <i
              className={cn(
                "absolute inset-y-0 -left-px w-0.5 rounded-full",
                m.forte ? "bg-foreground" : "bg-muted-foreground",
              )}
            />
            <em
              className={cn(
                "absolute bottom-[calc(100%+4px)] left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-medium not-italic",
                m.forte ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {m.texto}
            </em>
          </span>
        ))}
      </div>
      <div className="nums relative mt-2 h-4 text-xs text-muted-foreground">
        <span className="absolute left-0">R$ 0</span>
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${pos(FAIXA_ATENCAO)}%` }}
        >
          {moeda((limite * FAIXA_ATENCAO) / 100).replace(/,00$/, "")}
        </span>
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${pos(100)}%` }}
        >
          {moeda(limite).replace(/,00$/, "")}
        </span>
      </div>
    </div>
  );
}

/** Aviso no padrão do design system (fundo suave do status, ícone na cor do status). */
export function Aviso({
  tom,
  titulo,
  children,
  className,
}: {
  tom: "neutro" | "warning" | "danger";
  titulo: ReactNode;
  children?: ReactNode;
  className?: string | undefined;
}) {
  const Icone = tom === "neutro" ? TrendingUp : AlertTriangle;
  return (
    <div
      role={tom === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-md px-4 py-3",
        tom === "neutro" && "border border-border bg-card",
        tom === "warning" && "bg-warning/12",
        tom === "danger" && "bg-destructive/12",
        className,
      )}
    >
      <Icone
        aria-hidden
        className={cn(
          "mt-0.5 size-4.5 shrink-0",
          tom === "warning" && "text-warning",
          tom === "danger" && "text-destructive",
          tom === "neutro" && "text-muted-foreground",
        )}
      />
      <div className="min-w-0">
        <strong className="block font-semibold text-foreground">{titulo}</strong>
        {children ? <span className="text-sm text-muted-foreground">{children}</span> : null}
      </div>
    </div>
  );
}

/** Aviso do formulário de registro: como o cliente fica depois de somar `adicional`. */
export function AvisoMei({
  nome,
  acumulado,
  adicional,
  limite,
}: {
  nome: string;
  acumulado: number;
  adicional: number;
  limite: number;
}) {
  const novo = acumulado + adicional;
  const pct = pctDoLimite(novo, limite);
  const faixa = faixaMei(pct);
  const verbo = adicional !== 0 ? "ficará em" : "está em";
  if (faixa.key === "excedido")
    return (
      <Aviso tom="danger" titulo={`${nome} passa do limite (${formatarPct(pct)})`}>
        Excede em {moeda(novo - limite)}. Avalie o desenquadramento do MEI.
      </Aviso>
    );
  return (
    <Aviso
      tom={faixa.key === "atencao" ? "warning" : "neutro"}
      titulo={`${nome} ${verbo} ${formatarPct(pct)}`}
    >
      Restam {moeda(limite - novo)} até o limite anual.
    </Aviso>
  );
}
