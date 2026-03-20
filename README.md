# EquiNOVA

A self-learning horse racing prediction and betting platform. Uses multiple ML models trained on historical UK/IRE race data, a Benter-style two-stage probability model with live market integration, and a dynamic signal scanner that discovers profitable betting patterns.

## Tech Stack

**Frontend:** React 18 · TypeScript · Vite · TailwindCSS · TanStack Query · Recharts
**Backend:** Supabase (PostgreSQL) · Edge Functions (Deno/TypeScript)
**Auth:** Supabase Auth
**ML Pipeline:** Python 3 (scikit-learn, LightGBM, XGBoost, pandas, numpy, scipy) — separate repo at `~/EquiNOVA/scripts/`
**Hosting:** Vercel (frontend) · Supabase (database + edge functions)
**CI:** GitHub Actions (cron jobs for results/market monitoring)

## Local Development

### Prerequisites

- Node.js 18+
- pnpm

### Setup

```bash
# Clone the repo
git clone https://github.com/WalletPush/Equinova.git
cd Equinova

# Install dependencies
pnpm install

# Create .env from the example
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# Start dev server
pnpm dev
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous (public) API key |

Both are **required** — the app will throw on startup if either is missing.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Frontend (React + Vite)                            │
│  Vercel → reads from Supabase                       │
├─────────────────────────────────────────────────────┤
│  Supabase Edge Functions (Deno)                     │
│  race-data · combo-scanner · recalc-stage2          │
│  place-bet · get-user-bankroll · etc.               │
├─────────────────────────────────────────────────────┤
│  Supabase PostgreSQL                                │
│  races · race_entries · race_results · bets         │
│  user_bankroll · dynamic_signal_combos              │
├─────────────────────────────────────────────────────┤
│  ML Pipeline (Python — separate codebase)           │
│  TheRacingAPI → SQLite → feature eng → predictions  │
│  → push_to_supabase.py → race_entries               │
└─────────────────────────────────────────────────────┘
```

### ML Models

| Model | DB Column | Role |
|-------|-----------|------|
| Benter (Conditional Logit + Market Integration) | `ensemble_proba` | **Main model** — drives picks, Kelly sizing, Top Picks |
| LightGBM | `benter_proba` | Independent base model (observation only) |
| XGBoost | `xgboost_proba` | Independent base model (observation only) |
| Random Forest | `rf_proba` | Independent base model (observation only) |

The Benter model is a two-stage system: Stage 1 produces raw conditional logit probabilities (`stage1_proba`), Stage 2 blends them with market-implied odds via racewise softmax to produce `ensemble_proba`. Stage 2 is recalculated live when odds move.

### Frontend Pages

| Page | Route | Purpose |
|------|-------|---------|
| Landing | `/` | Marketing / sign-up |
| Today's Races | `/races` | Daily races with AI predictions and market movement |
| Top Picks | `/auto-bets` | AI-discovered profitable patterns matched to today's runners |
| Results | `/previous` | Historical race results with model accuracy tracking |
| Performance | `/performance` | Betting performance, equity curve, bankroll management |
| ML Tracker | `/ml-tracker` | Model accuracy metrics by segment |
| Settings | `/settings` | User preferences |

## Deployment

The frontend deploys automatically to **Vercel** on push to `main` via GitHub integration.

Edge functions are deployed to **Supabase** via the Supabase MCP tool.

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Start local dev server |
| `pnpm build` | Production build (TypeScript check + Vite build) |
| `pnpm lint` | Run ESLint |
