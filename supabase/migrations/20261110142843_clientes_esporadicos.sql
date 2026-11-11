-- Base separada de clientes esporádicos (não são da carteira; cobrados por emissão).
create table if not exists public.clientes_esporadicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) > 0),
  documento text,
  contato text,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint clientes_esporadicos_documento_digitos check (documento is null or documento ~ '^[0-9]{11}$|^[0-9]{14}$')
);
create unique index if not exists clientes_esporadicos_documento_unico
  on public.clientes_esporadicos(documento) where documento is not null;
alter table public.clientes_esporadicos enable row level security;
-- (políticas finais: ver 20261110161600_seguranca_equipe_auditoria.sql)

alter table public.notas_fiscais add column if not exists cliente_esporadico_id uuid references public.clientes_esporadicos(id);
alter table public.notas_fiscais add column if not exists repassado_financeiro_em timestamptz;
alter table public.notas_fiscais alter column cliente_id drop not null;
alter table public.notas_fiscais drop constraint if exists notas_um_tipo_de_cliente;
alter table public.notas_fiscais add constraint notas_um_tipo_de_cliente
  check (num_nonnulls(cliente_id, cliente_esporadico_id) = 1);
create index if not exists notas_fiscais_cliente_esporadico_idx
  on public.notas_fiscais(cliente_esporadico_id) where cliente_esporadico_id is not null;

-- Versão final do vínculo de cliente: base OU esporádico; nome sempre vem do cadastro.
create or replace function public.vincular_cliente_da_nota()
returns trigger language plpgsql set search_path = public as $$
declare v_id uuid; v_nome text;
begin
  if new.cliente_esporadico_id is not null then
    new.cliente_id := null;
    select e.nome into v_nome from public.clientes_esporadicos e where e.id = new.cliente_esporadico_id;
    if v_nome is null then
      raise exception 'Cliente esporádico informado não existe.' using errcode = 'foreign_key_violation';
    end if;
    new.cliente := v_nome;
    return new;
  end if;
  if new.cliente_id is null then
    select c.id into v_id from public.clientes c
    where lower(btrim(c.nome)) = lower(btrim(new.cliente))
    order by (new.tipo_emissao = any(c.tipos_emissao)) desc, c.criado_em
    limit 1;
    if v_id is null then
      raise exception 'Cliente "%" não está cadastrado. Cadastre o cliente ou marque como cliente esporádico.', new.cliente
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
before insert or update of cliente, cliente_id, cliente_esporadico_id on public.notas_fiscais
for each row execute function public.vincular_cliente_da_nota();
