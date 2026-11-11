-- VERIFICAÇÃO da migração 20261111170000_mei_faturamento_mensal.sql JÁ APLICADA — NÃO ALTERA NADA.
-- Só os testes, numa transação que termina em erro de propósito ("RESULTADO ...") e é desfeita.
-- Como usar: cole tudo no SQL Editor do Supabase e clique em Run.
-- Esperado: erro "RESULTADO (tudo desfeito): 2 ok ... 10 ok" sem nenhum "FALHA".

begin;

do $$
declare
  membro uuid; cli_a uuid; cli_b uuid; antes numeric; v numeric; s numeric; n int; r text := '';
begin
  select user_id into membro from public.equipe where ativo limit 1;
  select cliente_id, faturamento into cli_a, antes from public.mei_faturamento where ano = 2026 limit 1;
  select c.id into cli_b from public.clientes c
    where not exists (select 1 from public.mei_faturamento f where f.cliente_id = c.id) limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', membro, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  insert into public.mei_faturamento_mensal (cliente_id, ano, mes, faturamento) values (cli_a, 2026, 11, 1000);
  select faturamento into v from public.mei_faturamento where cliente_id = cli_a and ano = 2026;
  r := r || case when v = antes + 1000 then '2 ok: mes soma no acumulado; ' else '2 FALHA '||v||'; ' end;

  update public.mei_faturamento_mensal set faturamento = 2500 where cliente_id = cli_a and ano = 2026 and mes = 11;
  select faturamento into v from public.mei_faturamento where cliente_id = cli_a and ano = 2026;
  r := r || case when v = antes + 2500 then '3 ok: editar mes recalcula; ' else '3 FALHA '||v||'; ' end;

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
