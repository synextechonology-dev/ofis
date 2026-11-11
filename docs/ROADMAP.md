# Roadmap — o que já está no código e o que falta

A referência visual e de comportamento de **todas** as telas é `docs/previa/ofis-previa.html`
(abra no navegador; é a prévia aprovada pelo João). O código real ainda não tem tudo que a prévia mostra.

## ✅ Feito neste pacote (11/11/2026)

1. **Design system aplicado** (`src/styles.css`): tokens novos, tema escuro como padrão, tema claro em off-white,
   fontes Geist e Geist Mono (Google Fonts, em `__root.tsx`), selos de status e de tipo no padrão do design system.
2. **Troca de tema** sem "piscar" (`src/lib/tema.ts` + script em `__root.tsx`), salva no navegador.
3. **Menu lateral novo** (`src/components/app-sidebar.tsx`): nome Ofis, grupos (Operação, Clientes, Fiscal, Análises),
   recolher/expandir (Ctrl+B, salvo no navegador), seletor de tema, sem barra de rolagem.
4. **Lançar Nota** com "Cliente da base / Cliente esporádico": cadastro automático do esporádico (CPF/CNPJ com máscara
   e validação, reaproveita cadastro existente pelo documento), cobrança por emissão (padrão R$ 50), aviso quando o nome
   parece de um cliente da base, erros do banco em português.
5. **Página Esporádicos** (`/esporadicos`): filtros por período, busca, a repassar/repassadas/todas, seleção,
   "marcar como repassadas" com desfazer, relatório em PDF e mensagem pronta para o financeiro, base de esporádicos.
6. Nome **Ofis** em todos os títulos e no PDF mensal.
7. Excluir cliente com notas mostra uma mensagem clara em vez de erro genérico.

## ⚠️ Primeiro passo obrigatório no Claude Code

O pacote foi montado **sem conseguir instalar as dependências** (rede bloqueada no ambiente onde foi gerado).
A sintaxe de todos os arquivos alterados foi verificada, mas **o build e a checagem de tipos não rodaram**. Antes de qualquer coisa:

```sh
bun install        # ou npm install
bun run build      # tem que passar sem erros
bun run lint
bun run dev        # e testar: login, Lançar Nota (os dois modos), Esporádicos, troca de tema, menu recolhido
```
Se o `routeTree.gen.ts` reclamar, rode `bun run dev` uma vez: o plugin do TanStack Router o regenera.

**Este pacote parte do código de 03/11/2026.** Se o repositório no GitHub tiver mudanças depois dessa data,
não copie os arquivos por cima: aplique `docs/mudancas-desde-03-11.patch` (`git apply --3way docs/mudancas-desde-03-11.patch`)
na versão atual e resolva os conflitos.

## 🔜 Próximos (na ordem sugerida)

1. ~~**Tela de equipe**~~ ✅ feita em 11/11/2026 (`/equipe`, migração `20261111140000_tela_equipe.sql`).
2. **Telas da prévia ainda não portadas** — comparar cada uma com `docs/previa/ofis-previa.html`:
   - ~~Página do cliente MEI~~ ✅ feita em 11/11/2026 (`/mei/$clienteId`, faturamento mês a mês). Pendente: CNPJ e
     atividade no cabeçalho (depende do item 4) e os botões de PDF/relatório (dependem do relatório mensal).
   - ~~Relatório mensal do cliente~~ ✅ feito em 11/11/2026 (`/relatorios`). Clientes que não são MEI aparecem em
     quantidade de notas (valor de nota não é guardado). Obrigações e pendências por cliente ainda vazias no banco.
   - ~~Busca global / paleta de comandos (Ctrl+K) e atalhos de teclado~~ ✅ feita em 11/11/2026
     (`components/busca-geral.tsx`; lista de telas em `lib/navegacao.ts`, usada pelo menu e pela busca).
   - ~~Lançar Nota "em sequência"~~ ✅ feito em 11/11/2026 (sem campo de valor; número sugerido e aviso de repetida).
   - ~~Restyle das demais páginas~~ ✅ feito em 11/11/2026 (Dashboard no layout da prévia; demais telas com os
     padrões do design system: pílulas de status, etiquetas neutras, sem animações/emoji/borda lateral).
     Ainda não portado da prévia: painel lateral de detalhes da nota (Notas do Dia) e foco automático nos
     formulários a partir da busca geral.
3. **Clientes com vários tipos de emissão** na tela de Clientes (`tipos_emissao` já existe no banco; a tela usa só `tipo_emissao`).
4. **CPF/CNPJ em clientes** da base (coluna nova + máscara/validação reaproveitando `lib/esporadicos.ts`).
5. Trocar todas as mensagens `error.message` cruas (inglês do Postgres) por `mensagemDeErro()`.
6. Mover URL/chave do Supabase para variáveis de ambiente (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) na Vercel.
7. Tela de auditoria (quem alterou o quê), lendo `public.auditoria`.
8. Logo definitiva (prompt pronto com o João; trocar o ícone `ReceiptText` do menu, do login e o favicon).

## Decisões já tomadas pelo João (não reabrir)
- Toda nota precisa estar ligada a um cliente da base ou a um esporádico. Nome solto não existe.
- Valor da nota **não** é guardado. Só a cobrança de esporádicos.
- Esporádico é cobrado por emissão; padrão R$ 50, às vezes R$ 100 (por isso o valor é por nota).
- Pares "Rural" são clientes separados. Os demais duplicados foram juntados.
- Sistema é **interno**: cadastro aberto desligado, acesso só por convite.
- MEI: faixas **80/100%** (abaixo de 80% regular, 80–100% atenção, acima de 100% excedido). (11/11/2026)
- MEI: faturamento lançado **mês a mês** pela equipe (`mei_faturamento_mensal`), sem guardar valor de nota. (11/11/2026)
- Nome, contato e cor do escritório nos relatórios: **editáveis na tela**, salvos no banco. (11/11/2026)
- Mudanças de banco: Claude escreve a migração e o teste; João roda no SQL Editor (o conector não consegue escrever
  a partir do Claude Code); Claude confere com leitura. (11/11/2026)
