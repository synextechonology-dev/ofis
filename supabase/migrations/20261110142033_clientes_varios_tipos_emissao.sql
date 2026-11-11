-- Um cliente pode emitir mais de um tipo (ex.: comércio e serviço).
-- tipo_emissao continua existindo (o sistema atual usa) e fica sincronizado com tipos_emissao.
alter table public.clientes add column if not exists tipos_emissao text[];
update public.clientes set tipos_emissao = array[tipo_emissao] where tipos_emissao is null;
alter table public.clientes alter column tipos_emissao set default array['comercio']::text[];
alter table public.clientes alter column tipos_emissao set not null;
alter table public.clientes add constraint clientes_tipos_emissao_validos
  check (cardinality(tipos_emissao) >= 1 and tipos_emissao <@ array['comercio','servico','rural']::text[]);

create or replace function public.sincronizar_tipos_cliente()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tipos_emissao is null or cardinality(new.tipos_emissao) = 0 then
    new.tipos_emissao := array[new.tipo_emissao];
  elsif not (new.tipo_emissao = any(new.tipos_emissao)) then
    if tg_op = 'UPDATE' and new.tipo_emissao is distinct from old.tipo_emissao then
      new.tipos_emissao := array(select distinct unnest(new.tipos_emissao || new.tipo_emissao));
    else
      new.tipo_emissao := new.tipos_emissao[1];
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_sincronizar_tipos_cliente on public.clientes;
create trigger trg_sincronizar_tipos_cliente before insert or update on public.clientes
for each row execute function public.sincronizar_tipos_cliente();
