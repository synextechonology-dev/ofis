-- Marca do escritório nos relatórios (decisão do João em 11/11/2026: editável na tela, salva no banco).
-- Tabela de UMA linha só (coluna `unico` com unique + check). A equipe lê e altera; ninguém insere
-- ou apaga pelo app. O nome começa genérico: o João preenche na tela de relatório.
-- `id` é uuid porque a auditoria grava o id do registro como uuid.

create table public.configuracoes_escritorio (
  id uuid primary key default gen_random_uuid(),
  unico boolean not null default true unique check (unico),
  nome text not null default 'Escritório de contabilidade'
    check (length(trim(nome)) between 1 and 120),
  contato text not null default '' check (length(contato) <= 200),
  cor_marca text not null default '#2563EB' check (cor_marca ~ '^#[0-9A-Fa-f]{6}$'),
  atualizado_em timestamptz not null default now()
);
insert into public.configuracoes_escritorio (unico) values (true);

alter table public.configuracoes_escritorio enable row level security;
create policy equipe_ler on public.configuracoes_escritorio for select to authenticated
  using ((select privado.is_equipe()));
create policy equipe_atualizar on public.configuracoes_escritorio for update to authenticated
  using ((select privado.is_equipe())) with check ((select privado.is_equipe()));
revoke all on public.configuracoes_escritorio from anon;
revoke all on public.configuracoes_escritorio from authenticated;
grant select, update (nome, contato, cor_marca) on public.configuracoes_escritorio to authenticated;

create trigger trg_config_atualizado_em before update on public.configuracoes_escritorio
  for each row execute function public.set_mei_atualizado_em();
create trigger trg_auditoria after insert or update or delete on public.configuracoes_escritorio
  for each row execute function privado.registrar_auditoria();
