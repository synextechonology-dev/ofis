import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfMonth, differenceInCalendarDays, parseISO } from "date-fns";
import { AlertTriangle, CheckCircle2, Clock, FileWarning, UserX } from "lucide-react";

import { supabase, type NotaFiscal } from "@/lib/supabase";
import type { Tarefa } from "@/lib/tarefas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Alerta = {
  id: string;
  texto: string;
  icon: typeof AlertTriangle;
  className: string;
};

const iso = (d: Date) => format(d, "yyyy-MM-dd");

export function DashboardAlertas() {
  const hoje = new Date();
  const hojeIso = iso(hoje);
  const ontemIso = iso(subDays(hoje, 1));
  const inicioMes = iso(startOfMonth(hoje));

  const { data: notas, isLoading: loadingNotas } = useQuery({
    queryKey: ["alertas-notas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("*")
        .order("data_emissao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NotaFiscal[];
    },
  });

  const { data: tarefasOntem, isLoading: loadingTarefas } = useQuery({
    queryKey: ["alertas-tarefas", ontemIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("*")
        .eq("data_tarefa", ontemIso)
        .eq("prioridade", "urgente")
        .neq("status", "concluida");
      if (error) throw error;
      return (data ?? []) as Tarefa[];
    },
  });

  const isLoading = loadingNotas || loadingTarefas;
  const lista = notas ?? [];
  const alertas: Alerta[] = [];

  // Clientes sem emissão há mais de 15 dias
  const ultimaPorCliente = new Map<string, { nome: string; data: string }>();
  for (const nota of lista) {
    const nome = nota.cliente?.trim();
    if (!nome) continue;
    // Agrupa por cliente_id quando disponível; fallback para o nome digitado.
    const chave = nota.cliente_id ?? nome;
    const atual = ultimaPorCliente.get(chave);
    if (!atual || nota.data_emissao > atual.data)
      ultimaPorCliente.set(chave, { nome, data: nota.data_emissao });
  }
  const inativos = [...ultimaPorCliente.values()]
    .map(({ nome, data }) => ({
      cliente: nome,
      dias: differenceInCalendarDays(hoje, parseISO(data)),
    }))
    .filter((c) => c.dias > 15)
    .sort((a, b) => b.dias - a.dias)
    .slice(0, 3);

  for (const item of inativos) {
    alertas.push({
      id: `inativo-${item.cliente}`,
      texto: `Cliente ${item.cliente} sem emissão há ${item.dias} dias`,
      icon: UserX,
      className: "bg-warning/10 text-warning",
    });
  }

  // Taxa de não autorização do mês
  const doMes = lista.filter((n) => n.data_emissao >= inicioMes);
  const naoAutorizadas = doMes.filter((n) => n.status !== "autorizada").length;
  const taxa = doMes.length ? (naoAutorizadas / doMes.length) * 100 : 0;
  if (taxa > 5) {
    alertas.push({
      id: "taxa",
      texto: `Taxa de não autorização em ${taxa.toFixed(1)}% este mês`,
      icon: FileWarning,
      className: "bg-destructive/10 text-destructive",
    });
  }

  // Tarefas urgentes pendentes de ontem
  const urgentes = tarefasOntem?.length ?? 0;
  if (urgentes > 0) {
    alertas.push({
      id: "tarefas",
      texto: `${urgentes} tarefa(s) urgente(s) não concluída(s) de ontem`,
      icon: AlertTriangle,
      className: "bg-destructive/10 text-destructive",
    });
  }

  // Nenhuma nota hoje após as 10h
  const totalHoje = lista.filter((n) => n.data_emissao === hojeIso).length;
  if (totalHoje === 0 && hoje.getHours() >= 10) {
    alertas.push({
      id: "sem-notas",
      texto: "Nenhuma nota lançada hoje ainda",
      icon: Clock,
      className: "bg-primary/10 text-primary",
    });
  }

  return (
    <Card className="rounded-lg border-border shadow-card">
      <CardHeader>
        <CardTitle className="text-base">⚠️ Alertas do sistema</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <>
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-4/5" />
          </>
        ) : alertas.length === 0 ? (
          <div className="row-in flex items-center gap-3 rounded-md bg-success/10 px-3 py-2.5 text-sm font-medium text-success">
            <CheckCircle2 className="size-4.5 shrink-0" />✅ Tudo em ordem por hoje!
          </div>
        ) : (
          alertas.map((alerta, index) => (
            <div
              key={alerta.id}
              className={cn(
                "row-in flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
                alerta.className,
              )}
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <alerta.icon className="size-4.5 shrink-0" />
              <span className="min-w-0">{alerta.texto}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
