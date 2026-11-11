-- Tela de equipe (/equipe).
-- 1) listar_equipe(): a tela precisa do e-mail de cada membro, que fica em auth.users (fora do alcance do app).
--    Só administradores conseguem chamar; quem não é admin recebe erro 42501.
-- 2) Proteção: o escritório nunca fica sem administrador ativo. Hoje só existe 1 admin; se ele se
--    rebaixasse ou desativasse pela tela, ninguém mais conseguiria gerir a equipe pelo app.
--    Vale também para exclusão (inclusive a exclusão em cascata ao apagar a conta no painel).

-- 1) LISTA PARA A TELA
create or replace function public.listar_equipe()
returns table (
  user_id uuid,
  email text,
  nome text,
  papel text,
  ativo boolean,
  criado_em timestamptz,
  ultimo_acesso timestamptz
)
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

-- 2) SEMPRE PELO MENOS UM ADMIN ATIVO
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
