-- MEI mês a mês (decisão do João em 11/11/2026, opção B).
--
-- mei_faturamento continua sendo o "cabeçalho" do ano (limite e acumulado). O acumulado agora é
--   faturamento = faturamento_sem_mes + soma dos meses em mei_faturamento_mensal
-- e quem calcula é o banco.
--
-- faturamento_sem_mes: o que entrou antes do controle mensal (ou quando só se sabe o acumulado).
-- O registro que já existe vai inteiro para cá, sem perder nada.
--
-- Compatibilidade: quem gravar o acumulado direto em mei_faturamento.faturamento (a versão do app
-- que ainda está no ar) continua funcionando: o banco ajusta faturamento_sem_mes para bater.
-- Valor da NOTA continua não sendo guardado: os meses são lançados pela equipe, sem ligação com notas.

-- 1) CABEÇALHO: parte sem mês
alter table public.mei_faturamento
  add column if not exists faturamento_sem_mes numeric(12,2) not null default 0;
update public.mei_faturamento set faturamento_sem_mes = faturamento;
alter table public.mei_faturamento
  add constraint mei_faturamento_sem_mes_nao_negativo check (faturamento_sem_mes >= 0);

-- 2) MESES
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

-- 3) ACUMULADO CALCULADO PELO BANCO
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
    -- acumulado gravado direto: a diferença vira a parte sem mês
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

-- Mudou um mês: cria o cabeçalho do ano se faltar e recalcula o acumulado.
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
      -- só atualiza se o cabeçalho ainda existe (não recria ao apagar)
      update public.mei_faturamento f set faturamento_sem_mes = f.faturamento_sem_mes
      where f.cliente_id = cli and f.ano = a;
    end if;
  end if;
  return null;
end $$;
revoke all on function privado.mei_mensal_sincronizar() from public, anon, authenticated;

create trigger trg_mei_mensal_sincronizar after insert or update or delete on public.mei_faturamento_mensal
  for each row execute function privado.mei_mensal_sincronizar();

-- Apagou o ano de um cliente: os meses daquele ano vão junto.
create or replace function privado.mei_apagar_meses_do_ano()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.mei_faturamento_mensal m where m.cliente_id = old.cliente_id and m.ano = old.ano;
  return null;
end $$;
revoke all on function privado.mei_apagar_meses_do_ano() from public, anon, authenticated;

create trigger trg_mei_apagar_meses_do_ano after delete on public.mei_faturamento
  for each row execute function privado.mei_apagar_meses_do_ano();
