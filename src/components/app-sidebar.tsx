import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  LogOut,
  Menu,
  X,
  ReceiptText,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useMeuPapel } from "@/lib/equipe";
import { useTema } from "@/lib/tema";
import { cn } from "@/lib/utils";
import { EVENTO_ABRIR_BUSCA, EVENTO_ALTERNAR_MENU, GRUPOS, GRUPO_ADMIN } from "@/lib/navegacao";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const abrirBusca = () => window.dispatchEvent(new Event(EVENTO_ABRIR_BUSCA));

const CHAVE_RECOLHIDO = "ofis-menu-recolhido";

function iniciais(email: string) {
  const nome = email.split("@")[0] ?? "";
  const partes = nome.split(/[._-]+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0]![0]! + partes[1]![0]!).toUpperCase();
  return nome.slice(0, 2).toUpperCase() || "OF";
}

export function AppSidebar() {
  const [open, setOpen] = useState(false);
  const [recolhido, setRecolhido] = useState(false);
  const [email, setEmail] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tema, setTema } = useTema();
  const { data: eu } = useMeuPapel();
  const grupos = eu?.papel === "admin" ? [...GRUPOS, GRUPO_ADMIN] : GRUPOS;

  useEffect(() => {
    setOpen(false);
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    try {
      setRecolhido(localStorage.getItem(CHAVE_RECOLHIDO) === "1");
    } catch {
      // sem armazenamento: menu começa aberto
    }
  }, []);

  // Atalhos: Ctrl/Cmd + B (ou "[" pelos atalhos globais) recolhe ou abre o menu.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        alternarRecolhido();
      }
    }
    const onAlternar = () => alternarRecolhido();
    window.addEventListener("keydown", onKey);
    window.addEventListener(EVENTO_ALTERNAR_MENU, onAlternar);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(EVENTO_ALTERNAR_MENU, onAlternar);
    };
  });

  function alternarRecolhido() {
    setRecolhido((v) => {
      const novo = !v;
      try {
        localStorage.setItem(CHAVE_RECOLHIDO, novo ? "1" : "0");
      } catch {
        // ignora
      }
      return novo;
    });
  }

  async function handleLogout() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const conteudo = (compacto: boolean) => (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div
          className={cn(
            "flex h-16 items-center gap-2 px-4",
            compacto ? "justify-center" : "justify-between",
          )}
        >
          {!compacto && (
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ReceiptText className="size-4" />
              </div>
              <span className="text-lg font-semibold tracking-tight">Ofis</span>
            </div>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hidden size-8 text-sidebar-foreground/70 hover:bg-sidebar-accent md:inline-flex"
                onClick={alternarRecolhido}
                aria-label={compacto ? "Expandir menu" : "Recolher menu"}
                aria-expanded={!compacto}
              >
                {compacto ? (
                  <PanelLeftOpen className="size-4" />
                ) : (
                  <PanelLeftClose className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {compacto ? "Expandir menu" : "Recolher menu"} (Ctrl+B)
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="px-3 pb-1">
          {compacto ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mx-auto flex size-9 text-sidebar-foreground/75 hover:bg-sidebar-accent"
                  onClick={abrirBusca}
                  aria-label="Busca geral"
                >
                  <Search className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Buscar (Ctrl K)</TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={abrirBusca}
              aria-label="Busca geral"
              className="flex h-9 w-full items-center gap-2.5 rounded-md border border-sidebar-border px-3 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <Search className="size-4 shrink-0" />
              <span className="flex-1 text-left">Buscar…</span>
              <span className="flex gap-1 text-xs">
                <kbd className="rounded border border-sidebar-border px-1 font-sans">Ctrl</kbd>
                <kbd className="rounded border border-sidebar-border px-1 font-sans">K</kbd>
              </span>
            </button>
          )}
        </div>

        <nav className="scroll-oculto flex-1 overflow-y-auto px-3 pb-3" aria-label="Menu principal">
          {grupos.map((grupo) => (
            <div key={grupo.titulo} className="mt-3 first:mt-1">
              {compacto ? (
                <div className="mx-2 my-2 h-px bg-sidebar-border first:hidden" />
              ) : (
                <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
                  {grupo.titulo}
                </p>
              )}
              <ul className="space-y-0.5">
                {grupo.itens.map((item) => {
                  const link = (
                    <Link
                      to={item.to}
                      onClick={() => setOpen(false)}
                      aria-label={compacto ? item.label : undefined}
                      className={cn(
                        "relative flex h-9 items-center gap-3 rounded-md text-sm font-medium text-sidebar-foreground/75 transition-colors",
                        "hover:bg-sidebar-accent hover:text-sidebar-foreground",
                        "data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-foreground",
                        "data-[status=active]:after:absolute data-[status=active]:after:inset-y-2 data-[status=active]:after:right-0 data-[status=active]:after:w-0.5 data-[status=active]:after:rounded-full data-[status=active]:after:bg-sidebar-primary",
                        compacto ? "justify-center px-0" : "px-3",
                      )}
                    >
                      <item.icon className="size-4 shrink-0" />
                      {!compacto && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                  return (
                    <li key={item.to}>
                      {compacto ? (
                        <Tooltip>
                          <TooltipTrigger asChild>{link}</TooltipTrigger>
                          <TooltipContent side="right">{item.label}</TooltipContent>
                        </Tooltip>
                      ) : (
                        link
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="space-y-2 border-t border-sidebar-border p-3">
          {compacto ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mx-auto flex size-9 text-sidebar-foreground/75 hover:bg-sidebar-accent"
                  onClick={() => setTema(tema === "escuro" ? "claro" : "escuro")}
                  aria-label={tema === "escuro" ? "Usar tema claro" : "Usar tema escuro"}
                >
                  {tema === "escuro" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {tema === "escuro" ? "Tema claro" : "Tema escuro"}
              </TooltipContent>
            </Tooltip>
          ) : (
            <div
              className="grid grid-cols-2 gap-1 rounded-lg border border-sidebar-border p-1"
              role="group"
              aria-label="Tema"
            >
              {(["escuro", "claro"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={tema === t}
                  onClick={() => setTema(t)}
                  className={cn(
                    "flex h-7 items-center justify-center gap-1.5 rounded-md text-xs font-medium text-sidebar-foreground/60 transition-colors",
                    "aria-pressed:bg-sidebar-accent aria-pressed:text-sidebar-foreground",
                  )}
                >
                  {t === "escuro" ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
                  {t === "escuro" ? "Escuro" : "Claro"}
                </button>
              ))}
            </div>
          )}

          <div className={cn("flex items-center gap-2.5", compacto ? "flex-col" : "px-1")}>
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold"
              title={email}
            >
              {email ? iniciais(email) : "··"}
            </div>
            {!compacto && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {email ? email.split("@")[0] : "Usuário"}
                </p>
                <p className="truncate text-xs text-sidebar-foreground/55">
                  {email || "Setor fiscal"}
                </p>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-destructive"
                  onClick={handleLogout}
                  aria-label="Sair"
                >
                  <LogOut className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Sair</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );

  return (
    <>
      {/* Desktop */}
      <aside
        className={cn(
          "hidden shrink-0 transition-[width] duration-200 md:block",
          recolhido ? "w-[72px]" : "w-[248px]",
        )}
      >
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-20 transition-[width] duration-200",
            recolhido ? "w-[72px]" : "w-[248px]",
          )}
        >
          {conteudo(recolhido)}
        </div>
      </aside>

      {/* Mobile */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
        >
          {open ? <X /> : <Menu />}
        </Button>
        <span className="font-semibold">Ofis</span>
      </header>
      <div
        className={cn(
          "fixed inset-0 z-40 md:hidden",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <div
          className={cn(
            "absolute inset-0 bg-black/50 transition-opacity",
            open ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setOpen(false)}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-[248px] shadow-elevated transition-transform",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {conteudo(false)}
        </div>
      </div>
    </>
  );
}
