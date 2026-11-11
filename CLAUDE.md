# Ofis — instruções para o Claude Code

Sistema interno do setor fiscal de um escritório de contabilidade (Santa Cruz do Rio Pardo, SP) para lançar e
acompanhar notas fiscais, clientes, MEI, obrigações e tarefas. Antes se chamava **NF Gestão**. Dono: João.
Usuários: 4 pessoas do escritório. Tudo em **português do Brasil** (interface, mensagens, commits).

## Comece por aqui
1. `docs/ROADMAP.md` — o que já está pronto, o que falta e o **primeiro passo obrigatório** (instalar e rodar o build:
   este pacote foi gerado sem acesso ao npm).
2. `docs/banco-de-dados.md` — regras que o banco garante, segurança, tabelas.
3. `docs/previa/ofis-previa.html` — prévia aprovada de todas as telas. É a referência de layout e comportamento.
4. `docs/design-system/` — tokens (`tokens.json` é a fonte da verdade), regras de uso e componentes de referência.

## Stack
TanStack Start + TanStack Router (rotas por arquivo em `src/routes`, `routeTree.gen.ts` é gerado), React 19,
Vite 8, Tailwind CSS 4, shadcn/ui (`src/components/ui`), TanStack Query, Supabase JS, jsPDF, date-fns, zod, sonner.
Gerenciador: **bun** (`bun.lock`, `bunfig.toml` com trava de 24h para pacotes novos). Hospedagem: Vercel.
Projeto nasceu no Lovable (ver `AGENTS.md`): não reescreva histórico já enviado ao Git.

## Banco: produção, com dados reais
- Supabase `usytnvtkmlbmqcsmajsg`. **Não existe ambiente de teste.** Todo SQL roda nos dados do escritório.
- Mudança de esquema: nova migração em `supabase/migrations/`, testada dentro de uma transação que termina em
  `raise exception`/`rollback`, **com backup no schema `backup` antes**, e só aplicada depois do "pode aplicar" do João.
- Nunca desligue RLS, nunca dê permissão a `anon`, nunca coloque a chave `service_role` no front.
- Acesso aos dados depende da tabela `equipe`. Se uma consulta voltar vazia sem erro, primeiro confirme se o usuário está na equipe.
- O banco devolve mensagens em português nos gatilhos; mostre-as com `mensagemDeErro()` (`src/lib/supabase.ts`).

## Design system (resumo do que mais se erra)
- Tema **escuro é o padrão** (classe `.dark` no `<html>`); o claro é off-white, nunca branco puro.
- Três camadas de cor que não se misturam: **status** (`success`/`warning`/`destructive`, pílula com ponto redondo:
  `StatusBadge`), **categoria** (`tipo-comercio`/`tipo-servico`/`tipo-rural`, canto reto com ponto quadrado: `TipoBadge`),
  **marca** (`primary`/`accent`: botão principal, item ativo, destaque de gráfico).
- Sem gradientes, sem ícone colorido no menu, sem card que "sobe" no hover, sem texto branco sobre cor chapada de status.
- Números: `nums` (tabular) e `font-mono` para número de NF e CPF/CNPJ.
- Um botão primário por tela. Verbo no infinitivo ("Lançar nota", "Gerar relatório").
- Contraste mínimo 4,5:1 em texto, 3:1 em bordas de campos e foco.

## Convenções do código
- Consultas com TanStack Query; chaves já usadas: `["clientes"]`, `["clientes-esporadicos"]`, `["notas-do-dia", data]`,
  `["relatorio-esporadicos"]`. Depois de gravar, `invalidateQueries`.
- Utilidades de esporádicos (máscara/validação de CPF/CNPJ, reais): `src/lib/esporadicos.ts`. Reaproveite para clientes.
- PDFs com jsPDF: as fontes padrão não têm todos os acentos, por isso os textos do PDF passam por `semAcento()`.
- Nova rota: crie o arquivo em `src/routes/_authenticated/` e adicione ao menu em `GRUPOS` (`app-sidebar.tsx`).

## Como trabalhar com o João
Ele prefere respostas diretas, sem bajulação, com o ponto fraco apontado primeiro. Chame-o pelo nome.
Pergunte antes de qualquer mudança no banco que seja destrutiva ou mude comportamento; mudanças de tela pode fazer e mostrar.
