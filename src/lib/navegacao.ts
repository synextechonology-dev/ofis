import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  FilePlus2,
  FileCheck,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
  MessageSquare,
  Receipt,
  TrendingUp,
  UserCog,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { FileRoutesByTo } from "@/routeTree.gen";

export type ItemNav = { to: keyof FileRoutesByTo; label: string; icon: LucideIcon };
export type GrupoNav = { titulo: string; itens: ItemNav[] };

/** Menu agrupado por tarefa do dia a dia (mesma organização da prévia). Usado no menu e na busca geral. */
export const GRUPOS: GrupoNav[] = [
  {
    titulo: "Operação",
    itens: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/notas-do-dia", label: "Notas do Dia", icon: FileText },
      { to: "/lancar-nota", label: "Lançar Nota", icon: FilePlus2 },
      { to: "/tarefas", label: "Tarefas do Dia", icon: ClipboardList },
      { to: "/comunicacoes", label: "Comunicações", icon: MessageSquare },
    ],
  },
  {
    titulo: "Clientes",
    itens: [
      { to: "/clientes", label: "Clientes", icon: Users },
      { to: "/mei", label: "Controle MEI", icon: TrendingUp },
      { to: "/esporadicos", label: "Esporádicos", icon: UserPlus },
    ],
  },
  {
    titulo: "Fiscal",
    itens: [
      { to: "/calendario", label: "Calendário", icon: CalendarDays },
      { to: "/obrigacoes", label: "Obrigações", icon: FileCheck },
      { to: "/historico", label: "Histórico", icon: History },
    ],
  },
  {
    titulo: "Análises",
    itens: [
      { to: "/analises", label: "Análises", icon: BarChart3 },
      { to: "/rentabilidade", label: "Rentabilidade", icon: Gauge },
      { to: "/relatorios", label: "Relatórios", icon: Receipt },
    ],
  },
];

/** Só aparece para administradores (a página também se protege sozinha). */
export const GRUPO_ADMIN: GrupoNav = {
  titulo: "Administração",
  itens: [{ to: "/equipe", label: "Equipe", icon: UserCog }],
};

/** Eventos de janela usados pelos atalhos de teclado (evita prender estado no layout). */
export const EVENTO_ABRIR_BUSCA = "ofis:abrir-busca";
export const EVENTO_ALTERNAR_MENU = "ofis:alternar-menu";
export const EVENTO_ABRIR_ATALHOS = "ofis:abrir-atalhos";

/** Normaliza para comparar sem acento e sem maiúsculas. */
export const normalizar = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** O foco está num campo de texto? (atalhos de uma letra não disparam nesses casos) */
export function digitando() {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable;
}

/** Há uma janela (diálogo) aberta? */
export const janelaAberta = () =>
  !!document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
  );
