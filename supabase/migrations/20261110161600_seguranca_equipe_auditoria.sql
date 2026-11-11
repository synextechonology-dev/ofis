-- Segurança: só quem está na tabela EQUIPE acessa os dados; tudo fica registrado em AUDITORIA.
-- (As funções foram depois movidas para o schema "privado": ver 20261110161702.)

-- 1) EQUIPE
create table if not exists public.equipe (
  user_id uuid primary key references auth.users(id) on delete cascade,
  papel text not null default 'membro' check (papel in ('admin','membro')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table public.equipe enable row level security;

create or replace function public.is_equipe()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.equipe e where e.user_id = auth.uid() and e.ativo)
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.equipe e where e.user_id = auth.uid() and e.ativo and e.papel = 'admin')
$$;
revoke all on function public.is_equipe(), public.is_admin() from public, anon;
grant execute on function public.is_equipe(), public.is_admin() to authenticated;

-- Membros existentes na data; o primeiro usuário vira admin.
insert into public.equipe (user_id, papel)
select id, case when created_at = (select min(created_at) from auth.users) then 'admin' else 'membro' end
from auth.users
on conflict (user_id) do nothing;

-- Quem entra por CONVITE vira equipe automaticamente; cadastro aberto não ganha acesso.
create or replace function public.adicionar_convidado_na_equipe()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.invited_at is not null then
    insert into public.equipe (user_id) values (new.id) on conflict (user_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.adicionar_convidado_na_equipe() from public, anon, authenticated;
drop trigger if exists trg_convidado_equipe on auth.users;
create trigger trg_convidado_equipe after insert on auth.users
  for each row execute function public.adicionar_convidado_na_equipe();

create policy equipe_ler on public.equipe for select to authenticated using ((select public.is_equipe()));
create policy equipe_admin_inserir on public.equipe for insert to authenticated with check ((select public.is_admin()));
create policy equipe_admin_atualizar on public.equipe for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy equipe_admin_deletar on public.equipe for delete to authenticated using ((select public.is_admin()));

-- 2) REGRAS DE ACESSO: só equipe, nas 10 tabelas de dados
do $$
declare t text; p record;
begin
  foreach t in array array['clientes','clientes_esporadicos','comunicacoes','eventos_calendario','mei_faturamento',
                           'notas_fiscais','obrigacoes_acessorias','recorrencias','rentabilidade_clientes','tarefas'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy equipe_ler on public.%I for select to authenticated using ((select public.is_equipe()))', t);
    execute format('create policy equipe_inserir on public.%I for insert to authenticated with check ((select public.is_equipe()))', t);
    execute format('create policy equipe_atualizar on public.%I for update to authenticated using ((select public.is_equipe())) with check ((select public.is_equipe()))', t);
    execute format('create policy equipe_deletar on public.%I for delete to authenticated using ((select public.is_equipe()))', t);
  end loop;
end $$;

-- 3) AUDITORIA (somente leitura para a equipe; ninguém altera pelo app)
create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(),
  tabela text not null,
  registro_id uuid,
  acao text not null check (acao in ('INSERT','UPDATE','DELETE')),
  usuario_id uuid,
  usuario_email text,
  antes jsonb,
  depois jsonb
);
create index if not exists auditoria_tabela_registro on public.auditoria (tabela, registro_id);
create index if not exists auditoria_quando on public.auditoria (quando desc);
alter table public.auditoria enable row level security;
create policy auditoria_ler on public.auditoria for select to authenticated using ((select public.is_equipe()));

create or replace function public.registrar_auditoria()
returns trigger language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); linha jsonb;
begin
  linha := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.auditoria (tabela, registro_id, acao, usuario_id, usuario_email, antes, depois)
  values (tg_table_name,
          nullif(coalesce(linha->>'id', linha->>'user_id'),'')::uuid,
          tg_op, uid,
          (select email from auth.users where id = uid),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return null;
end $$;
revoke all on function public.registrar_auditoria() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['clientes','clientes_esporadicos','comunicacoes','eventos_calendario','mei_faturamento',
                           'notas_fiscais','obrigacoes_acessorias','recorrencias','rentabilidade_clientes','tarefas','equipe'] loop
    execute format('drop trigger if exists trg_auditoria on public.%I', t);
    execute format('create trigger trg_auditoria after insert or update or delete on public.%I for each row execute function public.registrar_auditoria()', t);
  end loop;
end $$;

-- 4) PERMISSÕES: visitante não logado sem acesso; ninguém faz TRUNCATE
revoke all on all tables in schema public from anon;
revoke truncate, trigger, references on all tables in schema public from authenticated;
revoke insert, update, delete on public.auditoria from authenticated;
revoke insert, update, delete, truncate on public.relatorio_financeiro_esporadicos from authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated;
