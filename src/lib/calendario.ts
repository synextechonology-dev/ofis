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

export const TIPOS_EVENTO: TipoEvento[] = [
  "vencimento_das",
  "obrigacao",
  "lembrete",
  "reuniao",
];

export const TIPO_EVENTO_META: Record<
  TipoEvento,
  { label: string; icon: LucideIcon; badgeClass: string; dotClass: string }
> = {
  vencimento_das: {
    label: "Vencimento DAS",
    icon: AlarmClock,
    badgeClass: "bg-destructive text-destructive-foreground",
    dotClass: "bg-destructive",
  },
  obrigacao: {
    label: "Obrigação",
    icon: FileCheck2,
    badgeClass: "bg-warning text-warning-foreground",
    dotClass: "bg-warning",
  },
  lembrete: {
    label: "Lembrete",
    icon: Bell,
    badgeClass: "bg-tipo-comercio text-tipo-foreground",
    dotClass: "bg-tipo-comercio",
  },
  reuniao: {
    label: "Reunião",
    icon: Users,
    badgeClass: "bg-tipo-servico text-tipo-foreground",
    dotClass: "bg-tipo-servico",
  },
};
