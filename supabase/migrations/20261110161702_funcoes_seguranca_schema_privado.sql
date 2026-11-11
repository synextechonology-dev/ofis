-- Tira as funções de segurança da área exposta pela API (/rest/v1/rpc).
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated;
alter function public.is_equipe() set schema privado;
alter function public.is_admin() set schema privado;
alter function public.registrar_auditoria() set schema privado;
alter function public.adicionar_convidado_na_equipe() set schema privado;
