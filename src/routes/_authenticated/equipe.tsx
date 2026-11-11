import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Loader2, ShieldAlert, UserCog } from "lucide-react";

import { supabase, mensagemDeErro } from "@/lib/supabase";
import {
  listarEquipe,
  useMeuPapel,
  ROTULO_PAPEL,
  type MembroEquipe,
  type Papel,
} from "@/lib/equipe";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe — Ofis" },
      { name: "description", content: "Quem tem acesso ao Ofis e com qual papel." },
    ],
  }),
  component: EquipePage,
});

type Alteracao =
  | { tipo: "papel"; membro: MembroEquipe; papel: Papel }
  | { tipo: "ativo"; membro: MembroEquipe; ativo: boolean };

const quem = (m: MembroEquipe) => m.nome || m.email;
const dataHora = (iso: string | null) =>
  iso ? format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm") : "Nunca entrou";

function EquipePage() {
  const queryClient = useQueryClient();
  const { data: eu, isLoading: carregandoPapel } = useMeuPapel();
  const ehAdmin = eu?.papel === "admin";

  const { data: membros, isLoading } = useQuery({
    queryKey: ["equipe"],
    queryFn: listarEquipe,
    enabled: ehAdmin,
  });

  const [alteracao, setAlteracao] = useState<Alteracao | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    if (!alteracao) return;
    setSalvando(true);
    const valores =
      alteracao.tipo === "papel" ? { papel: alteracao.papel } : { ativo: alteracao.ativo };
    const { data, error } = await supabase
      .from("equipe")
      .update(valores)
      .eq("user_id", alteracao.membro.user_id)
      .select("user_id");
    setSalvando(false);
    if (error) {
      toast.error(mensagemDeErro(error, "Não foi possível alterar o acesso."));
      return;
    }
    // Com RLS, uma alteração barrada não dá erro: só não altera nenhuma linha.
    if (!data?.length) {
      toast.error("Sua conta não tem permissão para alterar a equipe.");
      return;
    }
    setAlteracao(null);
    toast.success(textoSucesso(alteracao));
    await queryClient.invalidateQueries({ queryKey: ["equipe"] });
  }

  if (carregandoPapel) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!ehAdmin) {
    return (
      <div className="mx-auto max-w-6xl">
        <EmptyState
          icon={ShieldAlert}
          title="Só administradores gerenciam a equipe"
          description="Se você precisa dar ou tirar acesso de alguém, fale com um administrador do escritório."
        />
      </div>
    );
  }

  const lista = membros ?? [];
  const ativos = lista.filter((m) => m.ativo);
  const adminsAtivos = ativos.filter((m) => m.papel === "admin").length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Equipe</h1>
        <p className="text-sm text-muted-foreground">
          Quem tem acesso ao Ofis.{" "}
          <span className="nums">
            {ativos.length} {ativos.length === 1 ? "pessoa ativa" : "pessoas ativas"}
          </span>
          {lista.length > ativos.length ? (
            <span className="nums"> · {lista.length - ativos.length} sem acesso</span>
          ) : null}
          .
        </p>
      </header>

      <Card className="rounded-lg border-border shadow-card">
        <CardContent className="space-y-4 pt-6">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : lista.length === 0 ? (
            <EmptyState icon={UserCog} title="Ninguém na equipe" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pessoa</TableHead>
                    <TableHead className="w-48">Papel</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Último acesso</TableHead>
                    <TableHead>Na equipe desde</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Ações</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((m) => {
                    const souEu = m.user_id === eu?.userId;
                    // O banco também impede ficar sem admin; aqui só evitamos o clique inútil.
                    const ultimoAdmin = m.papel === "admin" && m.ativo && adminsAtivos <= 1;
                    const travado = souEu || ultimoAdmin;
                    const motivo = souEu
                      ? "Seu próprio acesso só pode ser alterado por outro administrador."
                      : ultimoAdmin
                        ? "É o único administrador ativo. Promova outra pessoa antes."
                        : undefined;
                    return (
                      <TableRow key={m.user_id} className={cn(!m.ativo && "text-muted-foreground")}>
                        <TableCell>
                          <div
                            className={cn("font-medium", m.ativo ? "text-foreground" : undefined)}
                          >
                            {quem(m)}
                            {souEu ? (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                (você)
                              </span>
                            ) : null}
                          </div>
                          {m.nome ? (
                            <div className="text-xs text-muted-foreground">{m.email}</div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={m.papel}
                            disabled={travado || !m.ativo}
                            onValueChange={(v) =>
                              v !== m.papel &&
                              setAlteracao({ tipo: "papel", membro: m, papel: v as Papel })
                            }
                          >
                            <SelectTrigger
                              aria-label={`Papel de ${quem(m)}`}
                              title={motivo}
                              className="h-9"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="membro">{ROTULO_PAPEL.membro}</SelectItem>
                              <SelectItem value="admin">{ROTULO_PAPEL.admin}</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {m.ativo ? (
                            <StatusPill tom="success">Ativo</StatusPill>
                          ) : (
                            <StatusPill tom="neutro">Sem acesso</StatusPill>
                          )}
                        </TableCell>
                        <TableCell className="nums text-sm">{dataHora(m.ultimo_acesso)}</TableCell>
                        <TableCell className="nums text-sm">
                          {format(parseISO(m.criado_em), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell className="text-right">
                          {m.ativo ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={travado}
                              title={motivo}
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() =>
                                setAlteracao({ tipo: "ativo", membro: m, ativo: false })
                              }
                            >
                              Tirar acesso
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setAlteracao({ tipo: "ativo", membro: m, ativo: true })
                              }
                            >
                              Devolver acesso
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="border-t border-border pt-4 text-xs text-muted-foreground">
            Para incluir alguém novo, envie um convite pelo painel do Supabase (Authentication →
            Users → Invite user). Quem entra por convite já aparece aqui como membro. Tirar o acesso
            não apaga a conta nem o histórico: a pessoa só deixa de ver os dados.
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={!!alteracao} onOpenChange={(v) => !v && !salvando && setAlteracao(null)}>
        <AlertDialogContent>
          {alteracao ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{tituloConfirmacao(alteracao)}</AlertDialogTitle>
                <AlertDialogDescription>{descricaoConfirmacao(alteracao)}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={salvando}
                  className={cn(
                    alteracao.tipo === "ativo" &&
                      !alteracao.ativo &&
                      "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    void confirmar();
                  }}
                >
                  {salvando ? <Loader2 className="animate-spin" /> : null}
                  {rotuloAcao(alteracao)}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function tituloConfirmacao(a: Alteracao) {
  const nome = quem(a.membro);
  if (a.tipo === "papel")
    return a.papel === "admin" ? `Tornar ${nome} administrador?` : `Tornar ${nome} membro?`;
  return a.ativo ? `Devolver o acesso de ${nome}?` : `Tirar o acesso de ${nome}?`;
}

function descricaoConfirmacao(a: Alteracao) {
  if (a.tipo === "papel")
    return a.papel === "admin"
      ? "Administradores podem dar e tirar acesso de qualquer pessoa da equipe, inclusive de você."
      : "A pessoa continua usando o Ofis normalmente, mas deixa de gerenciar a equipe.";
  return a.ativo
    ? "A pessoa volta a ver e lançar dados no Ofis a partir do próximo carregamento da página."
    : "A pessoa deixa de ver qualquer dado do Ofis na hora. A conta e o histórico de quem lançou o quê continuam guardados, e o acesso pode ser devolvido depois.";
}

function rotuloAcao(a: Alteracao) {
  if (a.tipo === "papel") return a.papel === "admin" ? "Tornar administrador" : "Tornar membro";
  return a.ativo ? "Devolver acesso" : "Tirar acesso";
}

function textoSucesso(a: Alteracao) {
  const nome = quem(a.membro);
  if (a.tipo === "papel") return `${nome} agora é ${ROTULO_PAPEL[a.papel].toLowerCase()}.`;
  return a.ativo ? `${nome} voltou a ter acesso.` : `${nome} não tem mais acesso.`;
}
