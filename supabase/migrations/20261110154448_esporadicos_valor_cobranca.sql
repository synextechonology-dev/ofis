-- Valor cobrado por emissão de esporádico, gravado nota a nota (padrão R$ 50,00).
alter table public.notas_fiscais
  add column if not exists valor_cobranca numeric(10,2)
  check (valor_cobranca is null or valor_cobranca >= 0);
comment on column public.notas_fiscais.valor_cobranca is
  'Valor cobrado do cliente esporádico por esta emissão, gravado no lançamento. Padrão R$ 50,00.';

create or replace function public.definir_valor_cobranca_esporadico()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.cliente_esporadico_id is not null and new.valor_cobranca is null then
    new.valor_cobranca := 50.00;
  end if;
  return new;
end $$;
drop trigger if exists trg_valor_cobranca_esporadico on public.notas_fiscais;
create trigger trg_valor_cobranca_esporadico
  before insert or update of cliente_esporadico_id, valor_cobranca on public.notas_fiscais
  for each row execute function public.definir_valor_cobranca_esporadico();

-- Relatório do financeiro (respeita as permissões de quem consulta).
create or replace view public.relatorio_financeiro_esporadicos
with (security_invoker = true) as
 select n.id as nota_id, n.numero_nf, n.data_emissao, n.tipo_emissao, n.status,
        n.repassado_financeiro_em, e.id as cliente_esporadico_id, e.nome, e.documento,
        e.contato, e.observacao, n.valor_cobranca
   from public.notas_fiscais n
   join public.clientes_esporadicos e on e.id = n.cliente_esporadico_id;
