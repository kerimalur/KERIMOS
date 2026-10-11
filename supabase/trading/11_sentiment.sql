-- Retail-Sentiment (11.10.2026): Long/Short-Anteile der Privatanleger je Symbol (Myfxbook Community Outlook).
-- Bereits per Supabase-Migration „trading_sentiment_snapshots" angewendet; idempotent.
create table if not exists trading.sentiment_snapshots (
  symbol text not null,
  erfasst_am timestamptz not null default now(),
  quelle text not null default 'myfxbook',
  long_pct numeric not null,
  short_pct numeric not null,
  long_lots numeric,
  short_lots numeric,
  long_positionen integer,
  short_positionen integer,
  primary key (symbol, erfasst_am)
);
create index if not exists sentiment_snapshots_symbol_idx on trading.sentiment_snapshots (symbol, erfasst_am desc);
alter table trading.sentiment_snapshots enable row level security;
grant all on trading.sentiment_snapshots to service_role;
