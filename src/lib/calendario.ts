import { AlarmClock, Bell, FileCheck2, Users, type LucideIcon } from "lucide-react";

export type TipoEvento = "vencimento_das" | "obrigacao" | "lembrete" | "reuniao";

export type EventoCalendario = {
  id: string;
  titulo: string;
  descricao: string | null;
  data_evento: string;
  tipo: TipoEvento;
  criado_em: string;
  atualizado_em: string;
};

export const TIPOS_EVENTO: TipoEvento[] = ["vencimento_das", "obrigacao", "lembrete", "reuniao"];

export const TIPO_EVENTO_META: Record<
  TipoEvento,
  { label: string; icon: LucideIcon; badgeClass: string; dotClass: string }
> = {
  vencimento_das: {
    label: "Vencimento DAS",
    icon: AlarmClock,
    badgeClass: "border border-border bg-transparent text-muted-foreground",
    dotClass: "bg-warning",
  },
  obrigacao: {
    label: "Obrigação",
    icon: FileCheck2,
    badgeClass: "border border-border bg-transparent text-muted-foreground",
    dotClass: "bg-accent-foreground",
  },
  lembrete: {
    label: "Lembrete",
    icon: Bell,
    badgeClass: "border border-border bg-transparent text-muted-foreground",
    dotClass: "bg-muted-foreground",
  },
  reuniao: {
    label: "Reunião",
    icon: Users,
    badgeClass: "border border-border bg-transparent text-muted-foreground",
    dotClass: "bg-transparent ring-2 ring-inset ring-muted-foreground",
  },
};
