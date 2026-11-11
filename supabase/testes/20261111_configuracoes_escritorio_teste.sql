-- TESTE da migração 20261111200000_configuracoes_escritorio.sql — NÃO ALTERA NADA.
-- Roda a migração e os testes numa transação que termina em erro de propósito ("RESULTADO ...").
-- Como usar: cole tudo no SQL Editor do Supabase e clique em Run.
-- Esperado: erro "RESULTADO (tudo desfeito): 1 ok ... 8 ok" sem nenhum "FALHA".

begin;

-- ===== migração (cópia exata de supabase/migrations/20261111200000_configuracoes_escritorio.sql) =====
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
-- ===== fim da migração =====

do $$
declare membro uuid; n int; t text; r text := '';
begin
  select count(*) into n from public.configuracoes_escritorio;
  r := r || case when n = 1 then '1 ok: uma linha criada; ' else '1 FALHA '||n||' linhas; ' end;

  select user_id into membro from public.equipe where ativo and papel = 'membro' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', membro, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  update public.configuracoes_escritorio set nome = 'Teste Contabilidade', contato = '(14) 0000-0000', cor_marca = '#0F766E';
  select nome into t from public.configuracoes_escritorio;
  r := r || case when t = 'Teste Contabilidade' then '2 ok: membro edita a marca; ' else '2 FALHA; ' end;

  begin
    insert into public.configuracoes_escritorio (nome) values ('Outro');
    r := r || '3 FALHA: inseriu segunda linha; ';
  exception when insufficient_privilege then r := r || '3 ok: nao insere; ';
  end;

  begin
    delete from public.configuracoes_escritorio;
    r := r || '4 FALHA: apagou; ';
  exception when insufficient_privilege then r := r || '4 ok: nao apaga; ';
  end;

  begin
    update public.configuracoes_escritorio set cor_marca = 'vermelho';
    r := r || '5 FALHA: aceitou cor invalida; ';
  exception when check_violation then r := r || '5 ok: barrou cor invalida; ';
  end;

  begin
    update public.configuracoes_escritorio set nome = '   ';
    r := r || '6 FALHA: aceitou nome vazio; ';
  exception when check_violation then r := r || '6 ok: barrou nome vazio; ';
  end;

  begin
    update public.configuracoes_escritorio set unico = true;
    r := r || '7 FALHA: alterou coluna interna; ';
  exception when insufficient_privilege then r := r || '7 ok: coluna interna protegida; ';
  end;

  perform set_config('role', 'anon', true);
  begin
    perform 1 from public.configuracoes_escritorio;
    r := r || '8 FALHA: anon leu; ';
  exception when insufficient_privilege then r := r || '8 ok: anon barrado; ';
  end;

  raise exception 'RESULTADO (tudo desfeito): %', r;
end $$;

rollback;
