# Banco de dados — Ofis

Supabase (Postgres), projeto **`usytnvtkmlbmqcsmajsg`** (`https://usytnvtkmlbmqcsmajsg.supabase.co`),
plano gratuito. Este é o banco **de produção já em uso** pela equipe. Situação em 11/11/2026:
533 clientes, cerca de 500 notas, 4 pessoas na equipe.

## Regras que o banco garante (não reimplemente no front, só trate os erros)

| Regra | Como | Erro devolvido |
|---|---|---|
| Toda nota pertence a **um** cliente da base **ou** a **um** esporádico | `check notas_um_tipo_de_cliente` (`num_nonnulls(cliente_id, cliente_esporadico_id) = 1`) | `23514` |
| Nota sem `cliente_id` é ligada pelo **nome exato** (sem diferenciar maiúsculas) | gatilho `vincular_cliente_da_nota` | `23514` "Cliente "X" não está cadastrado. Cadastre o cliente ou marque como cliente esporádico." |
| O campo `cliente` (texto) é **sempre sobrescrito** com o nome do cadastro | mesmo gatilho | — |
| Esporádico sem `valor_cobranca` recebe **R$ 50,00** | gatilho `definir_valor_cobranca_esporadico` | — |
| CPF/CNPJ de esporádico: só dígitos (11 ou 14) e **único** | check + índice único parcial | `23514` / `23505` |
| `clientes.tipo_emissao` (legado) fica dentro de `clientes.tipos_emissao` | gatilho `sincronizar_tipos_cliente` | — |
| Cliente **com notas não pode ser excluído** (a FK é `ON DELETE SET NULL`, que violaria o check) | combinação FK + check | `23514` citando `notas_um_tipo_de_cliente` |

Use `mensagemDeErro()` de `src/lib/supabase.ts` para mostrar esses erros em português.

## Tabelas

**Dados do escritório**
- `clientes`: `id`, `nome`, `tipo_emissao` (legado: um tipo), `tipos_emissao text[]` (um ou mais de `comercio|servico|rural`), datas.
  Ainda **sem CPF/CNPJ**. Pares "Rural" são cadastros separados de propósito (ex.: "Fulano" e "Fulano Rural").
- `clientes_esporadicos`: `id`, `nome`, `documento` (só dígitos), `contato`, `observacao`, datas.
- `notas_fiscais`: `numero_nf`, `data_emissao`, `cliente` (nome, preenchido pelo banco), `cliente_id` **ou** `cliente_esporadico_id`,
  `status` (`autorizada|cancelada|denegada`), `tipo_emissao`, `valor_cobranca` (só esporádicos), `repassado_financeiro_em`, datas.
  **Não existe valor da nota**: o escritório decidiu não guardar por enquanto.
- `mei_faturamento` (`cliente_id`, `ano`, `faturamento`, `faturamento_sem_mes`, `limite_anual` = 81.000): cabeçalho do ano.
  Desde 11/11/2026 o **acumulado é calculado pelo banco**: `faturamento = faturamento_sem_mes + soma dos meses`.
  Gravar `faturamento` direto (versão antiga do app) ajusta `faturamento_sem_mes`; o acumulado não pode ficar menor que
  a soma dos meses (`23514`). Apagar o ano apaga os meses.
- `mei_faturamento_mensal` (`cliente_id`, `ano`, `mes` 1–12, `faturamento`, `observacao`; único por cliente/ano/mês):
  faturamento mês a mês lançado pela equipe, **sem ligação com o valor das notas**. Lançar um mês cria o cabeçalho do ano
  se faltar. Migração `20261111170000_mei_faturamento_mensal.sql`.
- `obrigacoes_acessorias`, `recorrencias`,
  `eventos_calendario`, `tarefas`, `comunicacoes`, `rentabilidade_clientes`.

**View**
- `relatorio_financeiro_esporadicos` (`security_invoker = true`): nota + dados do esporádico + `valor_cobranca`. Somente leitura.

**Segurança**
- `equipe` (`user_id`, `papel` = `admin|membro`, `ativo`): **só quem está aqui vê ou altera qualquer dado.**
- `auditoria`: toda inclusão, alteração e exclusão nas tabelas acima, com `usuario_email`, `antes` e `depois` (jsonb).
  A equipe pode ler; ninguém pelo app consegue alterar ou apagar.

## Modelo de segurança

- RLS ligada em todas as tabelas. Política única por ação: `(select privado.is_equipe())`.
- `privado.is_equipe()` / `privado.is_admin()`: `security definer`, fora do schema exposto pela API.
- Só administradores mexem em `equipe`.
- **Convite = acesso**: usuário criado por "Invite user" no painel entra na equipe automaticamente (gatilho em `auth.users`).
  Conta criada por cadastro aberto consegue logar, mas vê tudo vazio.
- Cadastro aberto foi **desligado** no painel do Supabase. A proteção contra senhas vazadas exige plano Pro (por isso o aviso
  do verificador de segurança continua).
- `anon` não tem nenhuma permissão nas tabelas. Ninguém tem `TRUNCATE`.
- A chave em `src/lib/supabase.ts` é a **chave pública (anon)**; é normal estar no front. Nunca coloque a `service_role` no código.

### Tela de equipe (`/equipe`, só administradores) — desde 11/11/2026
- `public.listar_equipe()` (`security definer`): membros com e-mail, nome e último acesso (vêm de `auth.users`).
  Só admin consegue chamar; os outros recebem `42501`.
- Gatilho `trg_manter_um_admin` (função `privado.manter_um_admin`): recusa qualquer alteração ou exclusão em `equipe`
  que deixe o escritório sem administrador ativo (`23514`). Vale também para apagar a conta do admin no painel.
- A tela muda papel e ativa/desativa. **Convite continua pelo painel** (exige `service_role`).

Quem já tem conta mas está fora da equipe (não aparece na tela) ainda entra pelo SQL Editor:
```sql
insert into public.equipe (user_id) select id from auth.users where email = 'pessoa@exemplo.com';
```

**A confirmar no próximo convite:** se a pessoa convidada aparece sozinha na tela. Há indício de que o Supabase grava
`invited_at` logo depois de criar a conta, e o gatilho `trg_convidado_equipe` roda só no insert.

## Backups feitos em 10/11/2026 (schema `backup`, sem acesso pela API)
`clientes_20261110`, `clientes_20261110_antes_juncao`, `notas_fiscais_20261110`, `notas_fiscais_20261110_antes_juncao`,
`politicas_20261110`, `grants_20261110`. Podem ser apagados depois de 30 dias se nada der errado.

## Pendências de dados (aguardando decisão do João)
- 7 grupos de notas possivelmente duplicadas (mesmo número + cliente) ainda não revisados.
- Juntar ou não "Adamex" com "67.750.474 ADAMEX AMARAL MELLO".
- Notas canceladas/denegadas de esporádicos são cobradas? Hoje: **não**, com opção na tela para incluir.
