-- TESTE da migração 20261111170000_mei_faturamento_mensal.sql — NÃO ALTERA NADA.
-- Roda a migração e os testes numa transação que termina em erro de propósito ("RESULTADO ...").
-- Como usar: cole tudo no SQL Editor do Supabase e clique em Run.
-- Esperado: um erro "RESULTADO (tudo desfeito): ..." com todos os itens "ok" e nenhum "FALHA".

begin;

-- ===== migração (cópia exata de supabase/migrations/20261111170000_mei_faturamento_mensal.sql) =====
alter table public.mei_faturamento
  add column if not exists faturamento_sem_mes numeric(12,2) not null default 0;
update public.mei_faturamento set faturamento_sem_mes = faturamento;
alter table public.mei_faturamento
  add constraint mei_faturamento_sem_mes_nao_negativo check (faturamento_sem_mes >= 0);

create table public.mei_faturamento_mensal (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  ano integer not null check (ano between 2000 and 2100),
  mes integer not null check (mes between 1 and 12),
  faturamento numeric(12,2) not null check (faturamento >= 0),
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cliente_id, ano, mes)
);
create index mei_faturamento_mensal_cliente_ano on public.mei_faturamento_mensal (cliente_id, ano);

alter table public.mei_faturamento_mensal enable row level security;
create policy equipe_ler on public.mei_faturamento_mensal for select to authenticated using ((select privado.is_equipe()));
create policy equipe_inserir on public.mei_faturamento_mensal for insert to authenticated with check ((select privado.is_equipe()));
create policy equipe_atualizar on public.mei_faturamento_mensal for update to authenticated using ((select privado.is_equipe())) with check ((select privado.is_equipe()));
create policy equipe_deletar on public.mei_faturamento_mensal for delete to authenticated using ((select privado.is_equipe()));
revoke all on public.mei_faturamento_mensal from anon;
revoke truncate, trigger, references on public.mei_faturamento_mensal from authenticated;
grant select, insert, update, delete on public.mei_faturamento_mensal to authenticated;

create trigger trg_mei_mensal_atualizado_em before update on public.mei_faturamento_mensal
  for each row execute function public.set_mei_atualizado_em();
create trigger trg_auditoria after insert or update or delete on public.mei_faturamento_mensal
  for each row execute function privado.registrar_auditoria();

create or replace function privado.mei_recalcular_acumulado()
returns trigger language plpgsql security definer set search_path = '' as $$
declare soma numeric(12,2);
begin
  select coalesce(sum(m.faturamento), 0) into soma
  from public.mei_faturamento_mensal m
  where m.cliente_id = new.cliente_id and m.ano = new.ano;
  if tg_op = 'UPDATE'
     and new.faturamento is distinct from old.faturamento
     and new.faturamento_sem_mes is not distinct from old.faturamento_sem_mes then
    new.faturamento_sem_mes := new.faturamento - soma;
  elsif tg_op = 'INSERT' and new.faturamento_sem_mes = 0 and new.faturamento > soma then
    new.faturamento_sem_mes := new.faturamento - soma;
  end if;
  if new.faturamento_sem_mes < 0 then
    raise exception 'O acumulado do ano não pode ser menor que a soma dos meses já lançados (R$ %).',
      replace(to_char(soma, 'FM999999990.00'), '.', ',')
      using errcode = '23514';
  end if;
  new.faturamento := new.faturamento_sem_mes + soma;
  return new;
end $$;
revoke all on function privado.mei_recalcular_acumulado() from public, anon, authenticated;
create trigger trg_mei_recalcular_acumulado before insert or update on public.mei_faturamento
  for each row execute function privado.mei_recalcular_acumulado();

create or replace function privado.mei_mensal_sincronizar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cli uuid; a integer;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if exists (select 1 from public.clientes c where c.id = new.cliente_id) then
      insert into public.mei_faturamento (cliente_id, ano) values (new.cliente_id, new.ano)
      on conflict (cliente_id, ano) do update
        set faturamento_sem_mes = public.mei_faturamento.faturamento_sem_mes;
    end if;
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    cli := old.cliente_id; a := old.ano;
    if tg_op = 'DELETE' or cli is distinct from new.cliente_id or a is distinct from new.ano then
      update public.mei_faturamento f set faturamento_sem_mes = f.faturamento_sem_mes
      where f.cliente_id = cli and f.ano = a;
    end if;
  end if;
  return null;
end $$;
revoke all on function privado.mei_mensal_sincronizar() from public, anon, authenticated;
create trigger trg_mei_mensal_sincronizar after insert or update or delete on public.mei_faturamento_mensal
  for each row execute function privado.mei_mensal_sincronizar();

create or replace function privado.mei_apagar_meses_do_ano()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.mei_faturamento_mensal m where m.cliente_id = old.cliente_id and m.ano = old.ano;
  return null;
end $$;
revoke all on function privado.mei_apagar_meses_do_ano() from public, anon, authenticated;
create trigger trg_mei_apagar_meses_do_ano after delete on public.mei_faturamento
  for each row execute function privado.mei_apagar_meses_do_ano();
-- ===== fim da migração =====

do $$
declare
  membro uuid; cli_a uuid; cli_b uuid; antes numeric; v numeric; s numeric; n int; r text := '';
begin
  select user_id into membro from public.equipe where ativo limit 1;
  select cliente_id, faturamento into cli_a, antes from public.mei_faturamento where ano = 2026 limit 1;
  select c.id into cli_b from public.clientes c
    where not exists (select 1 from public.mei_faturamento f where f.cliente_id = c.id) limit 1;

  select faturamento_sem_mes into s from public.mei_faturamento where cliente_id = cli_a and ano = 2026;
  r := r || case when s = antes then '1 ok: registro atual inteiro em sem_mes; ' else '1 FALHA sem_mes='||s||'; ' end;

  perform set_config('request.jwt.claims', json_build_object('sub', membro, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  insert into public.mei_faturamento_mensal (cliente_id, ano, mes, faturamento) values (cli_a, 2026, 11, 1000);
  select faturamento into v from public.mei_faturamento where cliente_id = cli_a and ano = 2026;
  r := r || case when v = antes + 1000 then '2 ok: mes soma no acumulado; ' else '2 FALHA '||v||'; ' end;

  update public.mei_faturamento_mensal set faturamento = 2500 where cliente_id = cli_a and ano = 2026 and mes = 11;
  select faturamento into v from public.mei_faturamento where cliente_id = cli_a and ano = 2026;
  r := r || case when v = antes + 2500 then '3 ok: editar mes recalcula; ' else '3 FALHA '||v||'; ' end;

  -- app antigo grava o acumulado direto
  update public.mei_faturamento set faturamento = 40000 where cliente_id = cli_a and ano = 2026;
  select faturamento, faturamento_sem_mes into v, s from public.mei_faturamento where cliente_id = cli_a and ano = 2026;
  r := r || case when v = 40000 and s = 37500 then '4 ok: acumulado direto ajusta sem_mes; ' else '4 FALHA '||v||'/'||s||'; ' end;

  begin
    update public.mei_faturamento set faturamento = 100 where cliente_id = cli_a and ano = 2026;
    r := r || '5 FALHA: aceitou acumulado menor que os meses; ';
  exception when check_violation then r := r || '5 ok: barrou acumulado menor que os meses; ';
  end;

  delete from public.mei_faturamento_mensal where cliente_id = cli_a and ano = 2026 and mes = 11;
  select faturamento into v from public.mei_faturamento where cliente_id = cli_a and ano = 2026;
  r := r || case when v = 37500 then '6 ok: apagar mes recalcula; ' else '6 FALHA '||v||'; ' end;

  insert into public.mei_faturamento_mensal (cliente_id, ano, mes, faturamento) values (cli_b, 2026, 10, 3000), (cli_b, 2026, 11, 500);
  select faturamento, faturamento_sem_mes into v, s from public.mei_faturamento where cliente_id = cli_b and ano = 2026;
  r := r || case when v = 3500 and s = 0 then '7 ok: cliente novo ganha cabecalho; ' else '7 FALHA '||coalesce(v::text,'sem cabecalho')||'; ' end;

  delete from public.mei_faturamento where cliente_id = cli_b and ano = 2026;
  select count(*) into n from public.mei_faturamento_mensal where cliente_id = cli_b;
  r := r || case when n = 0 then '8 ok: apagar o ano leva os meses; ' else '8 FALHA restaram '||n||'; ' end;
  select count(*) into n from public.mei_faturamento where cliente_id = cli_b;
  r := r || case when n = 0 then '9 ok: cabecalho nao foi recriado; ' else '9 FALHA; ' end;

  perform set_config('role', 'anon', true);
  begin
    perform 1 from public.mei_faturamento_mensal;
    r := r || '10 FALHA: anon leu; ';
  exception when insufficient_privilege then r := r || '10 ok: anon barrado; ';
  end;

  raise exception 'RESULTADO (tudo desfeito): %', r;
end $$;

rollback;
