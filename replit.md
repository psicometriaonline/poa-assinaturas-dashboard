# Dashboard POA — Psicometria Online

## Visão Geral

Dashboard de métricas de **assinaturas pagas** da Psicometria Online Academy.

A Academy não aceita mais cadastros gratuitos. O dashboard foi reescrito para o modelo
100% pagante: não há mais funil de free-trial, contagem de leads gratuitos ou taxa de
conversão de cadastro. Todo indicador aqui é assinatura, receita ou retenção.

Fontes: **Hotmart** (assinaturas e receita — fonte da verdade), **ActiveCampaign**
(apenas os campos UTM, para atribuir a origem das assinaturas) e **Umami Cloud** (tráfego web).

Dark-themed, em português do Brasil, React + Vite no frontend e Express no backend,
monorepo pnpm.

---

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24 · **TypeScript**: 5.9
- **Frontend**: React + Vite + Recharts + Tailwind (`artifacts/poa-dashboard`)
- **Backend**: Express 5 (`artifacts/api-server`)
- **Banco**: PostgreSQL

---

## Modelo de dados e o CTE compartilhado

Toda métrica de assinatura é derivada de `src/lib/subscription-sql.ts`. **Não reimplemente
essas expressões inline** — foi exatamente isso que fez o dashboard antigo mostrar três
taxas de churn diferentes em três páginas.

| CTE | O que é |
|-----|---------|
| `churn_ev` | primeiro evento de churn por assinante, usando o `creation_date` do próprio evento (e não `received_at`, que joga webhooks reprocessados no mês errado) |
| `subs` | uma linha por assinante com intervalo de vida `[started_at, ended_at)` |
| `timeline` | subconjunto de `subs` cuja vida é conhecível — **única tabela que consultas point-in-time podem ler** |

`ended_at` **não** usa `last_event_at` como fallback: essa coluna recebe `NOW()` a cada
upsert, o que empurrava todo assinante encerrado sem data para o mês corrente e criava um
degrau falso no MRR. Quem não tem data de saída confiável fica de fora da série temporal e
é reportado em `dataQuality.undatedExits`.

Consequência importante: **"ativo em D" é uma medição direta**, não um acumulado. O último
ponto da série de MRR é igual ao MRR do snapshot por construção.

### Métricas disponíveis

| Módulo | Entrega |
|--------|---------|
| `metrics/overview.ts` | compõe os três abaixo — nunca recalcula nada por conta própria |
| `metrics/revenue.ts` | MRR/ARR point-in-time, ARPU, novo/cancelado MRR, net new, quick ratio, GRR, caixa (billings), mix por plano e periodicidade |
| `metrics/churn.ts` | churn de clientes e de receita com denominador correto, voluntário × inadimplência, NRR, GRR, LTV, vida média, churn por plano |
| `metrics/retention.ts` | matriz de coortes (retenção de clientes e de receita), marcos de 1/3/6/12 meses, base fiel |
| `metrics/subscriptions.ts` | composição da base, tempo de casa, renovações previstas 30/60/90 dias e por mês, inadimplência |
| `metrics/acquisition.ts` | origem UTM das **assinaturas pagas** (Hotmart × ActiveCampaign por e-mail) |
| `metrics/leadmap.ts` | perfil demográfico/acadêmico dos membros (planilha Google Sheets) |

---

## Endpoints

Todos aceitam `?start=YYYY-MM-DD&end=YYYY-MM-DD` e **respeitam de fato o período** — o
seletor global antes era ignorado pela página de receita.

- `GET /api/metrics/overview`
- `GET /api/metrics/revenue`
- `GET /api/metrics/churn`
- `GET /api/metrics/retention`
- `GET /api/metrics/subscriptions`
- `GET /api/metrics/acquisition`
- `GET /api/metrics/traffic`
- `GET /api/metrics/leadmap`
- `POST /api/webhooks/hotmart` — eventos de assinatura
- `GET /api/webhooks/hotmart/status`
- `POST /api/admin/import-subscribers` — importação de planilha (requer `x-admin-token`)
- `POST /api/admin/clear-cache` · `POST /api/admin/refresh-ac-cache`

### Banco de dados

- `hotmart_subscriptions` — estado atual de cada assinante (`subscriber_code` como PK)
- `hotmart_webhook_events` — log de todos os eventos recebidos

Migrações idempotentes rodam no boot (`src/lib/migrations.ts`): adicionam
`original_event` e `date_next_charge`, normalizam `PAST_DUE` → `DELAYED` e criam os
índices que as consultas point-in-time exigem.

### Cache

In-memory com TTL de 1 hora (tráfego: 5 min; contatos do ActiveCampaign: 15 min).

---

## Frontend — `artifacts/poa-dashboard`

| Rota | Página | Conteúdo |
|------|--------|----------|
| `/` | Visão Geral | KPIs agrupados em receita, base, retenção e risco |
| `/revenue` | Receita | MRR/ARR, movimentação de MRR, caixa, mix por plano, tabela mensal |
| `/subscriptions` | Assinaturas | base ao longo do tempo, mix de aquisição, tempo de casa, renovações |
| `/retention` | Churn & Retenção | churn, motivo, coortes, NRR mensal, churn por plano |
| `/acquisition` | Aquisição | origem UTM das assinaturas pagas (source → medium → campaign) |
| `/traffic` | Tráfego | Umami — mapa, heatmap horário 7×24 BRT |
| `/leadmap` | Perfil dos Assinantes | perfil demográfico/acadêmico dos membros |
| `/admin` | Admin | importação de planilha e gestão de cache (não listado na navegação) |

### Paleta de gráficos

`src/lib/chart-theme.ts` centraliza cores e chrome. As cores categóricas são atribuídas
em ordem fixa (um plano mantém sua cor quando um filtro muda a quantidade de séries) e
passam nas verificações de daltonismo contra a superfície `--card` do tema. A paleta
anterior reprovava: verde × amarelo mediam ΔE 4,2 sob protanopia. Verde/vermelho são
reservados para polaridade (entrou × saiu) e sempre vêm com rótulo.

---

## Limitações conhecidas

1. **Expansão e contração de MRR não são calculadas.** O MRR point-in-time usa o preço
   *atual* de cada assinante, porque não guardamos histórico de preço. Incluir uma série
   de expansão hoje seria dupla contagem. Para habilitar: gravar cada mudança de
   `mrr_contribution` numa tabela de histórico e passar a compor o MRR a partir dela.
2. **Reativações** aparecem como uma assinatura contínua: o schema guarda um único
   intervalo de vida por `subscriber_code`.
3. **Caixa (billings)** só existe a partir dos eventos `PURCHASE_APPROVED` recebidos por
   webhook — meses anteriores à configuração do webhook aparecem zerados.
4. **`date_next_charge`** nem sempre vem do Hotmart; quando falta, a próxima renovação é
   projetada a partir da data de adesão e do ciclo do plano.
5. **Atribuição de origem** cobre apenas assinantes que existem no ActiveCampaign com UTM
   preenchido — a página mostra a taxa de cobertura explicitamente.
6. `status=CANCELLED` na API do Hotmart retorna 400 para estas credenciais; os dados de
   cancelamento vêm dos webhooks e da planilha importada.

---

## Secrets necessários

| Secret | Uso |
|--------|-----|
| `DATABASE_URL` | PostgreSQL |
| `HOTMART_CLIENT_ID` / `HOTMART_CLIENT_SECRET` | OAuth Hotmart |
| `HOTMART_WEBHOOK_TOKEN` | (opcional) valida o `hottok` dos webhooks |
| `AC_API_KEY` / `AC_BASE_URL` | ActiveCampaign (atribuição de origem) |
| `AC_MEMBERS_LIST_ID` | (opcional) lista de assinantes no AC — padrão `30` |
| `UMAMI_API_TOKEN` / `UMAMI_BASE_URL` / `UMAMI_WEBSITE_ID` | tráfego web |
| `ADMIN_SECRET` | endpoints administrativos |

---

## Como rodar

```bash
pnpm --filter @workspace/api-server run dev      # API (porta 8080)
pnpm --filter @workspace/poa-dashboard run dev   # Dashboard

pnpm run typecheck                               # todo o monorepo
```
