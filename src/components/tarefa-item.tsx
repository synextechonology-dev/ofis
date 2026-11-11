import { useState } from "react";
import { Trash2, Play, Pause, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  CATEGORIA_META,
  PRIORIDADE_META,
  STATUS_TAREFA_META,
  type CategoriaTarefa,
  type PrioridadeTarefa,
  type StatusTarefa,
  type Tarefa,
} from "@/lib/tarefas";

export function PrioridadeBadge({ prioridade }: { prioridade: PrioridadeTarefa }) {
  const meta = PRIORIDADE_META[prioridade];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold",
        meta.badgeClass,
      )}
    >
      <meta.icon className="size-3" />
      {meta.label}
    </span>
  );
}

export function CategoriaBadge({ categoria }: { categoria: CategoriaTarefa }) {
  const meta = CATEGORIA_META[categoria];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold",
        meta.badgeClass,
      )}
    >
      <meta.icon className="size-3" />
      {meta.label}
    </span>
  );
}

export function StatusTarefaBadge({ status }: { status: StatusTarefa }) {
  const meta = STATUS_TAREFA_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold",
        meta.badgeClass,
      )}
    >
      <meta.icon className="size-3" />
      {meta.label}
    </span>
  );
}

export function DeleteTarefaButton({
  titulo,
  onConfirm,
}: {
  titulo: string;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Excluir tarefa ${titulo}`}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
          <AlertDialogDescription>
            “{titulo}” será removida permanentemente. Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={async (e) => {
              e.preventDefault();
              setLoading(true);
              try {
                await onConfirm();
                setOpen(false);
              } finally {
                setLoading(false);
              }
            }}
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function TarefaItem({
  tarefa,
  onToggleConcluida,
  onToggleAndamento,
  onDelete,
}: {
  tarefa: Tarefa;
  onToggleConcluida: (tarefa: Tarefa) => void;
  onToggleAndamento: (tarefa: Tarefa) => void;
  onDelete: (tarefa: Tarefa) => Promise<void>;
}) {
  const concluida = tarefa.status === "concluida";

  return (
    <div className="group row-in flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:bg-row-hover">
      <Checkbox
        checked={concluida}
        onCheckedChange={() => onToggleConcluida(tarefa)}
        aria-label={concluida ? "Reabrir tarefa" : "Concluir tarefa"}
        className="mt-0.5 size-5 transition-transform active:scale-90 data-[state=checked]:scale-105 data-[state=checked]:border-success data-[state=checked]:bg-success"
      />

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "strike-anim text-sm font-medium text-foreground",
            concluida && "is-done text-muted-foreground",
          )}
        >
          {tarefa.titulo}
        </p>
        {tarefa.descricao ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{tarefa.descricao}</p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <PrioridadeBadge prioridade={tarefa.prioridade} />
          <CategoriaBadge categoria={tarefa.categoria} />
          {tarefa.status === "em_andamento" ? <StatusTarefaBadge status="em_andamento" /> : null}
          {concluida && tarefa.concluida_em ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3" />
              {format(parseISO(tarefa.concluida_em), "HH:mm")}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {!concluida ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => onToggleAndamento(tarefa)}
          >
            {tarefa.status === "em_andamento" ? (
              <>
                <Pause className="size-3.5" /> Pausar
              </>
            ) : (
              <>
                <Play className="size-3.5" /> Iniciar
              </>
            )}
          </Button>
        ) : null}
        <DeleteTarefaButton titulo={tarefa.titulo} onConfirm={() => onDelete(tarefa)} />
      </div>
    </div>
  );
}
