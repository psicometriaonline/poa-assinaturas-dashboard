# Dashboard POA — Psicometria Online

## Visão Geral

Dashboard estratégico de analytics de assinaturas para a Psicometria Online.  
Integra **Hotmart** (assinaturas/receita), **ActiveCampaign** (contatos/conversão) e **Umami Cloud** (tráfego web).

Dark-themed, em português do Brasil, com React + Vite no frontend e Express no backend em um monorepo pnpm.

---

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24
- **TypeScript**: 5.9
- **Frontend**: React + Vite + Recharts + Tailwind (artifacts/poa-dashboard)
- **Backend**: Express 5 (artifacts/api-server)
- **Build API**: esbuild

---

## Estrutura

```text
artifacts/
├── api-server/          # Express API — integra Hotmart, AC, Umami
└── poa-dashboard/       # Frontend React — dashboard dark-theme
```

---

## Backend — artifacts/api-server

### Fontes de dados

| Fonte           | Arquivo                          | Status                                                    |
|-----------------|----------------------------------|-----------------------------------------------------------|
| Hotmart         | `src/sources/hotmart.ts`         | ACTIVE/DELAYED/INACTIVE ✓ · CANCELLED retorna 400 (tratado como []) |
| ActiveCampaign  | `src/sources/activecampaign.ts`  | ✓ Funcionando                                             |
| Umami Cloud     | `src/sources/umami.ts`           | ✓ API conectada — dados dependem de tracking no site      |

### Endpoints

- `GET /api/metrics/overview` — KPIs do mês atual (MRR, novos assinantes, cancelamentos, conversão) — dados mesclados API + webhooks
- `GET /api/metrics/revenue?start=&end=` — Receita histórica + breakdown por plano
- `GET /api/metrics/churn?start=&end=` — Métricas de churn por mês
- `GET /api/metrics/funnel?start=&end=` — Funil de conversão
- `GET /api/metrics/acquisition?start=&end=` — Aquisição de clientes
- `GET /api/metrics/traffic?start=&end=` — Tráfego web (Umami)
- `POST /api/webhooks/hotmart` — Recebe eventos de assinatura do Hotmart (nova, cancelada, renovação, etc.)
- `GET /api/webhooks/hotmart/status` — Status dos eventos recebidos + contagem de assinantes no banco

### Banco de Dados (PostgreSQL)

Tabelas criadas para sistema de webhooks:
- `hotmart_subscriptions` — estado atual de cada assinante (subscriber_code como PK)
- `hotmart_webhook_events` — log de todos os eventos recebidos via webhook

### Cache

In-memory com TTL de 1 hora.

### Sistema de mesclagem de dados

O overview mescla:
1. **API Hotmart** (`/subscriptions`): modelo novo — 22 assinantes visíveis
2. **Banco de dados via webhooks**: modelo antigo — cresce conforme eventos chegam

A lógica de deduplicação usa `subscriber_code` para evitar dupla contagem.

### Limitações conhecidas do Hotmart API

1. `status=CANCELLED` sempre retorna 400 para estas credenciais (bug/restrição da API). Tratado com `return []`.
2. `accession_date` filter **só funciona com `status=ACTIVE`**. Para DELAYED/INACTIVE, busca-se tudo sem filtro e filtra-se localmente por `accession_date`.
3. `getAllSubscriptionsByStatus("CANCELLED")` falha — dados de churn voluntário aparecem como 0.
4. API Hotmart com `max_results > 50` trunca silenciosamente — fixado para `max_results: "50"` com paginação.
5. A API retorna apenas 51 assinaturas totais (modelo novo). Os 765 assinantes do modelo antigo requerem configuração de webhooks.

### Configuração de Webhooks no Hotmart

No painel Hotmart: **Ferramentas → Webhooks → Adicionar URL de notificação**  
URL de destino: `https://<SEU-DOMÍNIO>/api/webhooks/hotmart`

Opcional: definir `HOTMART_WEBHOOK_TOKEN` nos secrets para validar o `hottok` enviado pelo Hotmart.

---

## Frontend — artifacts/poa-dashboard

### Páginas

| Rota        | Componente             | Descrição                                        |
|-------------|------------------------|--------------------------------------------------|
| `/`         | `Overview.tsx`         | Visão Geral — MRR, assinantes, evolução          |
| `/revenue`  | `Revenue.tsx`          | Receita & Churn — gráficos + tabela mensal       |
| `/funnel`   | `Funnel.tsx`           | Funil de conversão                               |
| `/traffic`  | `Traffic.tsx`          | Análise de Tráfego (Umami)                       |

### Contexto global de período

- `src/context/PeriodContext.tsx` — estado global do período selecionado
- `src/components/GlobalPeriodSelector.tsx` — seletor no header fixo
- 9 opções: Hoje, Ontem, 7d, 30d, 3m, 6m, 1a, **Todo período** (padrão), Personalizado
- `computeDateRange("all")` → start = "2015-01-01", end = hoje

### API client

`src/lib/api.ts` — todas as funções aceitam `(start: string, end: string)`.

---

## Secrets necessários

| Secret                     | Uso                                                    |
|----------------------------|--------------------------------------------------------|
| `HOTMART_CLIENT_ID`        | OAuth Hotmart                                          |
| `HOTMART_CLIENT_SECRET`    | OAuth Hotmart                                          |
| `AC_API_KEY`               | ActiveCampaign API key                                 |
| `AC_BASE_URL`              | ActiveCampaign base URL                                |
| `UMAMI_API_TOKEN`          | Umami Cloud API token                                  |
| `UMAMI_BASE_URL`           | Umami API base URL                                     |
| `UMAMI_WEBSITE_ID`         | ID do website no Umami                                 |
| `DATABASE_URL`             | PostgreSQL (auto-configurado pelo Replit)              |
| `HOTMART_WEBHOOK_TOKEN`    | (opcional) Token hottok para validar webhooks Hotmart  |

---

## Como rodar

```bash
# API server (porta 8080)
pnpm --filter @workspace/api-server run dev

# Dashboard frontend
pnpm --filter @workspace/poa-dashboard run dev
```

---

## TypeScript

```bash
pnpm --filter @workspace/api-server typecheck
pnpm --filter @workspace/poa-dashboard typecheck
```
