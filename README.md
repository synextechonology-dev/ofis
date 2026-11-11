# Ofis

Sistema interno do setor fiscal para lançar e acompanhar notas fiscais, clientes, MEI, obrigações, tarefas
e a cobrança de clientes esporádicos.

## Rodar localmente

```sh
bun install
bun run dev
```

Build de produção: `bun run build`. Hospedado na Vercel; banco no Supabase (`usytnvtkmlbmqcsmajsg`).

## Documentação

- [`CLAUDE.md`](CLAUDE.md): visão geral e regras do projeto
- [`docs/ROADMAP.md`](docs/ROADMAP.md): o que está pronto e o que falta
- [`docs/banco-de-dados.md`](docs/banco-de-dados.md): esquema, regras e segurança do banco
- [`docs/design-system/`](docs/design-system/): tokens e regras visuais
- [`docs/previa/ofis-previa.html`](docs/previa/ofis-previa.html): prévia navegável de todas as telas

Feito com TanStack Start, React, Tailwind CSS, shadcn/ui e Supabase. Nasceu no Lovable.
