import {
  CircleDashed,
  Timer,
  CheckCircle2,
  Flame,
  ArrowUp,
  Minus,
  ArrowDown,
  Scale,
  Users,
  Building2,
  Layers,
  type LucideIcon,
} from "lucide-react";

export type StatusTarefa = "pendente" | "em_andamento" | "concluida";
export type PrioridadeTarefa = "baixa" | "normal" | "alta" | "urgente";
export type CategoriaTarefa = "fiscal" | "cliente" | "interno" | "geral";

export type Tarefa = {
  id: string;
  titulo: string;
  descricao: string | null;
  status: StatusTarefa;
  prioridade: PrioridadeTarefa;
  categoria: CategoriaTarefa;
  data_tarefa: string;
  concluida_em: string | null;
  criado_em: string;
  atualizado_em: string;
};

export const STATUS_TAREFA: StatusTarefa[] = ["pendente", "em_andamento", "concluida"];
export const PRIORIDADES: PrioridadeTarefa[] = ["baixa", "normal", "alta", "urgente"];
export const CATEGORIAS: CategoriaTarefa[] = ["fiscal", "cliente", "interno", "geral"];

export const STATUS_TAREFA_META: Record<
  StatusTarefa,
  { label: string; icon: LucideIcon; badgeClass: string }
> = {
  pendente: {
    label: "Pendente",
    icon: CircleDashed,
    badgeClass: "bg-muted text-muted-foreground",
  },
  em_andamento: {
    label: "Em andamento",
    icon: Timer,
    badgeClass: "bg-primary/12 text-primary",
  },
  concluida: {
    label: "Concluída",
    icon: CheckCircle2,
    badgeClass: "bg-success/12 text-success",
  },
};

export const PRIORIDADE_META: Record<
  PrioridadeTarefa,
  { label: string; icon: LucideIcon; badgeClass: string; color: string }
> = {
  urgente: {
    label: "Urgente",
    icon: Flame,
    badgeClass: "bg-destructive text-destructive-foreground",
    color: "var(--destructive)",
  },
  alta: {
    label: "Alta",
    icon: ArrowUp,
    badgeClass: "bg-warning text-warning-foreground",
    color: "var(--warning)",
  },
  normal: {
    label: "Normal",
    icon: Minus,
    badgeClass: "bg-primary text-primary-foreground",
    color: "var(--primary)",
  },
  baixa: {
    label: "Baixa",
    icon: ArrowDown,
    badgeClass: "bg-muted text-muted-foreground",
    color: "var(--muted-foreground)",
  },
};

export const CATEGORIA_META: Record<
  CategoriaTarefa,
  { label: string; icon: LucideIcon; badgeClass: string; color: string }
> = {
  fiscal: {
    label: "Fiscal",
    icon: Scale,
    badgeClass: "bg-tipo-servico text-tipo-foreground",
    color: "var(--tipo-servico)",
  },
  cliente: {
    label: "Cliente",
    icon: Users,
    badgeClass: "bg-tipo-rural text-tipo-foreground",
    color: "var(--tipo-rural)",
  },
  interno: {
    label: "Interno",
    icon: Building2,
    badgeClass: "bg-warning text-warning-foreground",
    color: "var(--warning)",
  },
  geral: {
    label: "Geral",
    icon: Layers,
    badgeClass: "bg-muted text-muted-foreground",
    color: "var(--muted-foreground)",
  },
};

export function isAlta(t: Tarefa) {
  return t.prioridade === "urgente" || t.prioridade === "alta";
}

/** Percentual inteiro de conclusão (0–100). */
export function taxaConclusao(tarefas: Tarefa[]) {
  if (!tarefas.length) return 0;
  const concluidas = tarefas.filter((t) => t.status === "concluida").length;
  return Math.round((concluidas / tarefas.length) * 100);
}

/** Classe de cor conforme a faixa da taxa: ≥70% verde, 40–69% âmbar, <40% vermelho. */
export function faixaTaxa(taxa: number) {
  if (taxa >= 70) return { text: "text-success", bg: "bg-success", soft: "bg-success/12" };
  if (taxa >= 40) return { text: "text-warning", bg: "bg-warning", soft: "bg-warning/12" };
  return { text: "text-destructive", bg: "bg-destructive", soft: "bg-destructive/12" };
}

export function categoriaMaisPendente(tarefas: Tarefa[]): CategoriaTarefa | null {
  const abertas = tarefas.filter((t) => t.status !== "concluida");
  if (!abertas.length) return null;
  const contagem = new Map<CategoriaTarefa, number>();
  for (const t of abertas) contagem.set(t.categoria, (contagem.get(t.categoria) ?? 0) + 1);
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}
