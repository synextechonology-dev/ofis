# Migrações do banco (Supabase, projeto `usytnvtkmlbmqcsmajsg`)

**Todas já estão aplicadas no banco de produção.** Estes arquivos são o registro do que foi feito,
não algo para rodar de novo.

- Migrações de 07/08 a 16/10/2026 foram criadas pelo Lovable e estão registradas no próprio banco
  (`supabase_migrations.schema_migrations`). Para trazê-las para cá: `supabase db pull`
  (Supabase CLI linkada ao projeto) ou peça ao Claude Code para ler pelo MCP do Supabase.
- As de 10/11/2026 (nesta pasta) foram escritas e testadas com dados reais, com backup antes.
  A função `vincular_cliente_da_nota` foi reescrita três vezes; vale a versão de `20261110142843`.

Regra para novas mudanças: nunca altere o banco direto pelo painel. Crie uma nova migração aqui,
teste numa transação com `rollback` e só então aplique.
