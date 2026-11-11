-- Toda nota precisa estar ligada a um cliente da base (vínculo por nome exato, sem diferenciar maiúsculas).
-- (Versão final da função está na migração 20261110142843.)
create or replace function public.vincular_cliente_da_nota()
returns trigger language plpgsql set search_path = public as $$
declare v_id uuid; v_nome text;
begin
  if new.cliente_id is null then
    select c.id into v_id from public.clientes c
    where lower(btrim(c.nome)) = lower(btrim(new.cliente))
    order by (c.tipo_emissao = new.tipo_emissao) desc, c.criado_em
    limit 1;
    if v_id is null then
      raise exception 'Cliente "%" não está cadastrado. Cadastre o cliente antes de lançar a nota.', new.cliente
        using errcode = 'check_violation';
    end if;
    new.cliente_id := v_id;
  end if;
  select c.nome into v_nome from public.clientes c where c.id = new.cliente_id;
  if v_nome is null then
    raise exception 'Cliente informado não existe na base de clientes.' using errcode = 'foreign_key_violation';
  end if;
  new.cliente := v_nome;
  return new;
end $$;

drop trigger if exists trg_vincular_cliente_da_nota on public.notas_fiscais;
create trigger trg_vincular_cliente_da_nota
before insert or update of cliente, cliente_id on public.notas_fiscais
for each row execute function public.vincular_cliente_da_nota();

alter table public.notas_fiscais alter column cliente_id set not null;
