-- TESTE da migração 20261111140000_tela_equipe.sql — NÃO ALTERA NADA.
-- Tudo roda numa transação que termina em erro de propósito ("RESULTADO ...") e é desfeita.
-- Como usar: cole tudo no SQL Editor do Supabase e clique em Run.
-- Esperado: um erro com a mensagem
--   RESULTADO (tudo desfeito): 1) admin lista 4 pessoas; 2) bloqueou rebaixar unico admin;
--   3) bloqueou desativar unico admin; 4) troca de admin passou; 5) membro barrado na lista;
--   6) membro alterou 0 linhas;
-- Qualquer "FALHA" ou número diferente: não aplique e mande o resultado.

begin;

create or replace function public.listar_equipe()
returns table (user_id uuid, email text, nome text, papel text, ativo boolean, criado_em timestamptz, ultimo_acesso timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not privado.is_admin() then
    raise exception 'Só administradores podem ver e alterar a equipe.' using errcode = '42501';
  end if;
  return query
    select e.user_id, u.email::text, nullif(trim(u.raw_user_meta_data->>'name'), ''),
           e.papel, e.ativo, e.criado_em, u.last_sign_in_at
    from public.equipe e
    join auth.users u on u.id = e.user_id
    order by e.ativo desc, (e.papel = 'admin') desc, u.email;
end $$;
revoke all on function public.listar_equipe() from public, anon;
grant execute on function public.listar_equipe() to authenticated;

create or replace function privado.manter_um_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.equipe where papel = 'admin' and ativo) then
    raise exception 'O escritório precisa ter pelo menos um administrador ativo. Promova outra pessoa antes de tirar este acesso.'
      using errcode = '23514';
  end if;
  return null;
end $$;
revoke all on function privado.manter_um_admin() from public, anon, authenticated;

drop trigger if exists trg_manter_um_admin on public.equipe;
create trigger trg_manter_um_admin
  after update or delete on public.equipe
  for each statement execute function privado.manter_um_admin();

do $$
declare admin_id uuid; membro_id uuid; n int; r text := '';
begin
  select user_id into admin_id from public.equipe where papel='admin' and ativo limit 1;
  select user_id into membro_id from public.equipe where papel='membro' and ativo limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub',admin_id,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  select count(*) into n from public.listar_equipe();
  r := r || '1) admin lista ' || n || ' pessoas; ';

  begin
    update public.equipe set papel='membro' where user_id=admin_id;
    r := r || '2) FALHA: rebaixou o unico admin; ';
  exception when check_violation then r := r || '2) bloqueou rebaixar unico admin; ';
  end;

  begin
    update public.equipe set ativo=false where user_id=admin_id;
    r := r || '3) FALHA: desativou o unico admin; ';
  exception when check_violation then r := r || '3) bloqueou desativar unico admin; ';
  end;

  update public.equipe set papel='admin' where user_id=membro_id;
  update public.equipe set papel='membro' where user_id=admin_id;
  r := r || '4) troca de admin passou; ';

  begin
    perform 1 from public.listar_equipe();
    r := r || '5) FALHA: membro listou; ';
  exception when insufficient_privilege then r := r || '5) membro barrado na lista; ';
  end;

  update public.equipe set ativo=false where user_id=membro_id;
  get diagnostics n = row_count;
  r := r || '6) membro alterou ' || n || ' linhas; ';

  raise exception 'RESULTADO (tudo desfeito): %', r;
end $$;

rollback;
