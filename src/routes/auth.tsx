import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, ReceiptText } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Ofis" },
      {
        name: "description",
        content:
          "Acesso restrito ao setor fiscal. Entre com seu e-mail e senha para gerenciar as notas fiscais.",
      },
      { property: "og:title", content: "Entrar — Ofis" },
      {
        property: "og:description",
        content: "Acesso restrito ao setor fiscal do sistema Ofis.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !senha) {
      toast.error("Informe e-mail e senha.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível entrar. Verifique suas credenciais.");
      return;
    }
    toast.success("Acesso liberado.");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ReceiptText className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Ofis</h1>
          <p className="text-sm text-muted-foreground">Gestão de notas fiscais emitidas</p>
        </div>

        <Card className="rounded-lg border-border shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Entrar</CardTitle>
            <CardDescription>Acesso restrito ao setor fiscal.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="nome@empresa.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={255}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="senha">Senha</Label>
                <Input
                  id="senha"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  maxLength={128}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="animate-spin" />}
                Entrar
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
