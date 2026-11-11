# Design system — Ofis

Sistema interno do setor fiscal para lançar, conferir e acompanhar notas fiscais, obrigações e clientes. Quem usa passa o dia inteiro nele lendo tabelas, então tudo aqui serve a três coisas: **ler rápido, conferir sem erro e cansar pouco a vista**.

A direção visual vem de três referências de dashboard escuro (grafite neutro, um acento, cards com borda fina, números grandes). O que elas tinham de decorativo ficou de fora: card de upgrade, fundo com blob ou vidro, saudação com emoji e texto cinza de baixo contraste.

## Direção visual

- **Personalidade:** sóbria, precisa, calma. Uma planilha bem diagramada, não um app de investimentos.
- **Minimalista na forma, densa no conteúdo.** Pouca decoração, muita informação bem alinhada. Espaço negativo entre blocos, não dentro de tabelas.
- **Profundidade por camadas de cor, não por sombra:** `bg-sunken` (menu) → `bg-base` (página) → `surface` (card) → `surface-raised` (elemento dentro do card). Cada camada fica um degrau mais clara no tema escuro.
- **Um acento só.** O azul `accent` aparece em três lugares: o botão primário, o item ativo do menu e a barra destacada do gráfico. Se ele aparecer em mais de 5% da tela, tem acento demais.
- **Contraste guiado pelo texto:** títulos e números em `text-primary`, dados em `text-secondary`, rótulos em `text-muted`. A hierarquia vem do peso e do tom, não do tamanho.
- **Sem decoração:** sem gradientes, ilustrações, emojis, ícones coloridos no menu, borda colorida na lateral de card, animação de pulsar ou cards que sobem no hover.
- **CTAs:** verbo no infinitivo, curto ("Lançar nota", "Exportar PDF"), um primário por tela.

## Cores

Três camadas de significado que **nunca se misturam**:

| Camada | Tokens | Diz | Forma |
|---|---|---|---|
| Marca e interação | `accent`, `accent-text`, `accent-soft`, `focus-ring` | "isto é clicável / está selecionado" | botão, link, item ativo |
| Status | `success`, `warning`, `danger` (+ `-soft`) | "como isto está" | `StatusBadge`: pílula, ponto redondo |
| Categoria | `cat-comercio`, `cat-servico`, `cat-rural` (+ `-soft`) | "que tipo de coisa é" | `CategoryTag`: canto reto, ponto quadrado |

Regras de uso:
- `success` = concluído/regular, `warning` = atenção que ainda tem conserto, `danger` = problema. O mesmo significado em todas as telas (nota, obrigação, tarefa, MEI, rentabilidade).
- Cor nunca fala sozinha: todo status tem texto; toda série de gráfico tem legenda escrita.
- Texto sobre fundo suave usa a cor do mesmo par (`success` sobre `success-soft`). Nunca texto branco sobre cor chapada de status.
- Superfícies: o card é sempre `surface`. `surface-raised` só **dentro** de um card (tile, cabeçalho de tabela, botão secundário).
- Bordas: `border-subtle` para separar; `border-control` para contornar o que se preenche ou clica.

### Hierarquia de uso (proporção aproximada da tela)
1. Neutros (`bg-*`, `surface*`, `border-*`, `text-*`): ~90%
2. Status e categorias, em badges e tags: ~7%
3. `accent`: ~3%

### Contraste
Todos os pares de texto passam de 4.5:1 nos dois temas; `border-control` e `focus-ring` passam de 3:1 em todas as superfícies. `text-muted` foi clareado em relação às referências justamente para passar.

## Tipografia

**Geist** (Google Fonts) para tudo, **Geist Mono** para dados que se conferem dígito a dígito. É uma grotesca geométrica de contraste baixo, como a das referências, e legível em 12–14px. No Lovable: `@fontsource-variable/geist` e `@fontsource-variable/geist-mono`. Alternativa equivalente, se preferir manter a atual: Inter.

| Estilo | Tamanho / altura | Peso | Espaçamento | Uso |
|---|---|---|---|---|
| `display` | 32 / 40 | 600 | −0.02em | valor de KPI |
| `h1` | 24 / 32 | 600 | −0.015em | título da página |
| `h2` | 18 / 26 | 600 | −0.01em | título de card |
| `h3` | 15 / 22 | 600 | −0.005em | bloco dentro de card, modal |
| `h4` | 13 / 18 | 600 | 0 | grupo de campos |
| `highlight` | 16 / 24 | 500 | −0.005em | frase de destaque |
| `body` | 14 / 20 | 400 | 0 | corpo, tabela, formulário |
| `body-secondary` | 13 / 18 | 400 | 0 | descrição, apoio |
| `label` | 12 / 16 | 500 | +0.01em | label, badge, cabeçalho de coluna |
| `overline` | 11 / 16 | 500 | +0.08em, maiúsculas | só grupos do menu |
| `button` | 14 / 20 | 500 | 0 | botões |
| `link` | 14 / 20 | 500 | 0 | links, `accent-text` |
| `numeric` | 13 / 18 mono | 400 | 0 | chave de acesso, CNPJ, nº da nota |

- **Nada abaixo de 12px.** O calendário usa 10px hoje; passa para 12px, e o que não couber vira contador ("+3").
- Todo número em tabela, KPI ou gráfico usa `font-variant-numeric: tabular-nums` (classe `nf-num`), para os dígitos alinharem coluna a coluna.
- Formato brasileiro sempre: `R$ 1.250,00`, `03/11/2026`, `97,4%`.
- Títulos em caixa normal ("Notas do dia"), não em Caixa Alta Em Cada Palavra. A exceção são os nomes próprios das telas no menu.

## Estética e layout

- **Raios:** `radius-sm` 6 (tag, checkbox) · `radius-md` 10 (botão, input, tile, item de menu) · `radius-lg` 16 (card, modal) · `radius-xl` 20 (moldura do app) · `radius-full` (badge, avatar). Um elemento interno sempre tem raio menor que o seu contêiner.
- **Bordas:** 1px em tudo. Card = `border-subtle`; controle = `border-control`; tracejada só no `EmptyState`.
- **Sombras:** `shadow-inset` (brilho de 1px no topo) em cards e botões secundários; `shadow-float` só no que flutua (popover, dropdown, tooltip, modal).
- **Espaçamento** em grade de 4px: `space-1` 4 · `space-2` 8 · `space-3` 12 · `space-4` 16 · `space-5` 20 · `space-6` 24 · `space-8` 32 · `space-12` 48.
  - padding de card `space-6` (mobile `space-5`), gap entre cards `space-4`, entre seções `space-8`.
- **Container:** conteúdo com largura máxima `content-max` (1280px) em **todas** as páginas, centralizado, margem lateral `space-6`. Formulários de página inteira: `form-max` (720px).
- **Grade:** 12 colunas, gap `space-4`. KPIs em 4 colunas; gráfico + lista em 8/4; tabela em 12.
- **Alinhamento:** texto à esquerda; números à direita em tabelas; ações à direita no cabeçalho de página e de card.
- **Densidade:** cards respiram (24px de padding); tabelas são compactas (linha de 48px). Cada página começa pela informação do dia, nunca por uma saudação.

## Iconografia

- **Lucide** (já instalado no projeto como `lucide-react`): traço de 1.75, cantos e pontas arredondados, nunca preenchido.
- Tamanhos: 16px em botão, 18px no menu e no cabeçalho de card, 20px no `EmptyState`.
- Cor herdada do texto (`currentColor`): `text-muted` no menu inativo, `accent-text` no ativo e a cor do status em alertas. Nunca colorido por decoração.
- Um ícone por conceito em todo o sistema: Lançar Nota = `FilePlus2`, Obrigações = `FileCheck`, Calendário = `CalendarDays`, Histórico = `Clock`, Análises = `BarChart3`, Rentabilidade = `PieChart`.
- Sem emoji na interface.
- Não há logo nos arquivos de origem: a marca é o ícone `ReceiptText` numa caixa `accent` mais o nome em texto.

## Componentes

| Grupo | Componentes |
|---|---|
| Ações | `Button` (primário, secundário, ghost, perigo, ícone) e link |
| Formulários | `Field` (input, select, textarea, ajuda, erro) |
| Layout | `Card`, `PageHeader` |
| Dados | `KpiCard`, `DataTable`, `BarChart`, `ProgressMeter` |
| Navegação | `Sidebar`, `SegmentedControl` |
| Feedback | `StatusBadge`, `CategoryTag`, `Alert`, `EmptyState` |

Estados comuns a todos os controles:
- **hover:** clareia o fundo ou a borda.
- **active:** botão primário desce 1px.
- **focus:** anel `focus-ring` de 2px, afastado 2px, só com teclado (`:focus-visible`).
- **disabled:** fundo `surface-raised`, texto `text-disabled`, cursor bloqueado.

As classes vivem em `components/bundle.css` com prefixo `nf-` e leem só os tokens.

**Não se aplica a este sistema:** depoimentos, prova social, seções de landing page e CTAs de conversão. O sistema é de uso interno; esses componentes estavam no prompt de origem, que era genérico para landing page.

## Responsividade

| | Mobile (< 640px) | Tablet (640–1023px) | Desktop (≥ 1024px) |
|---|---|---|---|
| Navegação | barra no topo `bg-sunken` + gaveta | barra no topo + gaveta | `Sidebar` fixa de 248px |
| Grade | 1 coluna | 2 colunas (KPIs 2×2) | 12 colunas (KPIs 4 lado a lado) |
| Padding de card | `space-5` | `space-6` | `space-6` |
| `h1` / `display` | 20px / 28px | 24px / 32px | 24px / 32px |
| Cabeçalho de página | ações abaixo do título, primário largura total | ações ao lado, quebrando linha | ações à direita |
| Tabelas | rolagem horizontal com a 1ª coluna fixa, ou lista de cards em telas de consulta | rolagem horizontal | completa |
| Formulários | 1 coluna, botões largura total no rodapé | 2 colunas | 2 colunas até `form-max` |
| Gráficos | período em select; rótulos a cada 2 meses | completo | completo |
| Botões | altura 40px (área de toque mínima de 40px) | igual | igual |

O texto do corpo nunca diminui no mobile; o que reduz são os títulos e os espaços entre seções (`space-8` → `space-6`).

## Usabilidade

Objetivo: **uso interno de funcionários do setor fiscal**, horas seguidas por dia, com conferência de dados.

- **Leitura em varredura:** a coluna que identifica a linha (cliente) em `text-primary`; o resto em `text-secondary`; o status sempre na mesma coluna e com a mesma forma.
- **Conferência sem erro:** chaves, CNPJs e números em mono; valores alinhados à direita com tabular-nums; datas em `dd/mm/aaaa`.
- **Prioridade do dia primeiro:** o Dashboard abre com o que vence e o que deu problema (`Alert`), depois os KPIs.
- **Ações destrutivas** sempre com confirmação (`nf-btn--danger` → diálogo → `nf-btn--danger-solid`), dizendo o que será perdido.
- **Teclado:** foco visível em tudo; `/` foca a busca; Enter salva o formulário de lançamento.
- **Vista cansada:** tema escuro como padrão, sem animações contínuas e com o claro disponível (mesmos tokens) para quem preferir ou para ambientes muito iluminados.

## Na implementação (Lovable / shadcn)

O projeto usa shadcn/ui. Mapeie as variáveis dele para estes tokens em `src/styles.css`:

| shadcn | Token |
|---|---|
| `--background` | `bg-base` |
| `--card`, `--popover` | `surface` |
| `--secondary`, `--muted`, `--accent` (shadcn) | `surface-raised` |
| `--primary` / `--primary-foreground` | `accent` / `on-accent` |
| `--foreground` | `text-primary` |
| `--muted-foreground` | `text-muted` |
| `--border` | `border-subtle` |
| `--input` | `border-control` |
| `--ring` | `focus-ring` |
| `--destructive` | `danger-fill` |
| `--sidebar` | `bg-sunken` |

Remova `--nav-1` a `--nav-8`, `--gradient-sidebar`, as utilities `hover-lift` e `sidebar-gradient` e o `animate-pulse` dos badges. Troque `tipo-*` por `cat-*`. Ative o tema escuro como padrão (`class="dark"` no `<html>`) e ofereça o claro como opção.
