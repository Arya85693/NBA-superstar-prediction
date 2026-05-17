-- Phase 1: persistent trade history + weighted-average cost basis.
-- Run once in Supabase → SQL Editor (after init_paper_market.sql and per_user_portfolios.sql).
--
-- Adds:
--   - positions.avg_cost_per_share
--   - public.trades (append-only fill log)
--   - public.execute_paper_trade(...) RPC (atomic buy/sell)
--
-- Does NOT wire web/app/api/trade/route.ts yet — the app keeps using portfolioStore.ts
-- until Phase 2 switches the route to supabase.rpc('execute_paper_trade', ...).

-- ---------------------------------------------------------------------------
-- 1) Cost basis column on open positions
-- ---------------------------------------------------------------------------
alter table public.positions
  add column if not exists avg_cost_per_share numeric(14, 4);

comment on column public.positions.avg_cost_per_share is
  'Weighted-average cost per share for the open lot; NULL until first post-migration buy.';

-- ---------------------------------------------------------------------------
-- 2) Append-only trade log
-- ---------------------------------------------------------------------------
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  player_id bigint not null,
  side text not null check (side in ('buy', 'sell')),
  shares bigint not null check (shares > 0),
  price_per_share numeric(14, 4) not null check (price_per_share > 0),
  gross_amount numeric(14, 2) not null check (gross_amount > 0),
  avg_cost_before numeric(14, 4),
  avg_cost_after numeric(14, 4),
  realized_pnl numeric(14, 2),
  cash_after numeric(14, 2) not null,
  position_shares_after bigint not null check (position_shares_after >= 0),
  created_at timestamptz not null default now()
);

comment on table public.trades is
  'Immutable paper-trade fills; one row per buy or sell via execute_paper_trade.';

-- Portfolio activity feed (newest first)
create index if not exists trades_portfolio_created_idx
  on public.trades (portfolio_id, created_at desc);

-- Optional per-player history within a portfolio
create index if not exists trades_portfolio_player_created_idx
  on public.trades (portfolio_id, player_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3) RLS + privileges (mirror portfolios / positions lockdown)
-- ---------------------------------------------------------------------------
alter table public.trades enable row level security;

revoke all on public.trades from anon, authenticated;

grant select, insert on public.trades to service_role;

drop policy if exists "paper_trades_anon" on public.trades;

-- ---------------------------------------------------------------------------
-- 4) Transactional paper trade RPC
-- ---------------------------------------------------------------------------
-- Weighted-average cost on buys; realized P&L on sells when avg_cost exists.
-- Money rounding: 2 decimals (matches web/lib/portfolioStore.ts roundMoney).
-- Avg-cost rounding: 4 decimals.

create or replace function public.execute_paper_trade(
  p_portfolio_id uuid,
  p_player_id bigint,
  p_side text,
  p_shares bigint,
  p_price numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cash numeric(14, 2);
  v_held bigint := 0;
  v_avg_cost numeric(14, 4);
  v_gross numeric(14, 2);
  v_new_held bigint;
  v_new_avg numeric(14, 4);
  v_realized numeric(14, 2);
  v_avg_before numeric(14, 4);
  v_avg_after numeric(14, 4);
  v_trade_id uuid;
begin
  if p_portfolio_id is null then
    raise exception 'portfolio_id required';
  end if;

  if p_player_id is null or p_player_id <= 0 then
    raise exception 'Invalid player_id';
  end if;

  if p_side is null or p_side not in ('buy', 'sell') then
    raise exception 'side must be buy or sell';
  end if;

  if p_shares is null or p_shares < 1 then
    raise exception 'shares must be a positive whole number';
  end if;

  if p_price is null or p_price <= 0 then
    raise exception 'price must be positive';
  end if;

  v_gross := round(p_price * p_shares, 2);

  select cash
  into v_cash
  from public.portfolios
  where id = p_portfolio_id
  for update;

  if not found then
    raise exception 'Portfolio not found';
  end if;

  select shares, avg_cost_per_share
  into v_held, v_avg_cost
  from public.positions
  where portfolio_id = p_portfolio_id
    and player_id = p_player_id;

  v_held := coalesce(v_held, 0);

  if p_side = 'buy' then
    if v_cash < v_gross then
      raise exception 'Insufficient cash'
        using hint = format('cash=%s required=%s', v_cash, v_gross);
    end if;

    v_avg_before := v_avg_cost;

    if v_held > 0 and v_avg_cost is not null then
      -- Weighted average with known cost basis.
      v_new_avg := round(
        (v_held::numeric * v_avg_cost + p_shares::numeric * p_price)
        / (v_held + p_shares)::numeric,
        4
      );
    elsif v_held > 0 and v_avg_cost is null then
      -- Legacy position (pre-migration): no history; treat existing shares as this fill price.
      v_new_avg := round(
        (v_held::numeric * p_price + p_shares::numeric * p_price)
        / (v_held + p_shares)::numeric,
        4
      );
    else
      v_new_avg := round(p_price, 4);
    end if;

    v_avg_after := v_new_avg;
    v_new_held := v_held + p_shares;
    v_realized := null;
    v_cash := round(v_cash - v_gross, 2);

    insert into public.positions (portfolio_id, player_id, shares, avg_cost_per_share)
    values (p_portfolio_id, p_player_id, v_new_held, v_new_avg)
    on conflict (portfolio_id, player_id) do update
      set shares = excluded.shares,
          avg_cost_per_share = excluded.avg_cost_per_share;

  else
    -- sell
    if v_held < p_shares then
      raise exception 'Insufficient shares'
        using hint = format('held=%s', v_held);
    end if;

    v_avg_before := v_avg_cost;

    if v_avg_cost is not null then
      v_realized := round((p_price - v_avg_cost) * p_shares, 2);
    else
      v_realized := null;
    end if;

    v_new_held := v_held - p_shares;
    v_avg_after := case when v_new_held > 0 then v_avg_cost else null end;
    v_cash := round(v_cash + v_gross, 2);

    if v_new_held <= 0 then
      delete from public.positions
      where portfolio_id = p_portfolio_id
        and player_id = p_player_id;
      v_new_held := 0;
    else
      update public.positions
      set shares = v_new_held
      where portfolio_id = p_portfolio_id
        and player_id = p_player_id;
    end if;
  end if;

  update public.portfolios
  set cash = v_cash,
      updated_at = now()
  where id = p_portfolio_id;

  insert into public.trades (
    portfolio_id,
    player_id,
    side,
    shares,
    price_per_share,
    gross_amount,
    avg_cost_before,
    avg_cost_after,
    realized_pnl,
    cash_after,
    position_shares_after
  )
  values (
    p_portfolio_id,
    p_player_id,
    p_side,
    p_shares,
    p_price,
    v_gross,
    v_avg_before,
    v_avg_after,
    v_realized,
    v_cash,
    v_new_held
  )
  returning id into v_trade_id;

  return jsonb_build_object(
    'ok', true,
    'trade_id', v_trade_id,
    'side', p_side,
    'player_id', p_player_id,
    'shares', p_shares,
    'filled_at_price', p_price,
    'gross_amount', v_gross,
    'realized_pnl', v_realized,
    'avg_cost_before', v_avg_before,
    'avg_cost_after', v_avg_after,
    'cash_after', v_cash,
    'position_after', v_new_held
  );
end;
$$;

comment on function public.execute_paper_trade(uuid, bigint, text, bigint, numeric) is
  'Atomic paper buy/sell: lock portfolio, update cash/positions, append trades row.';

revoke all on function public.execute_paper_trade(uuid, bigint, text, bigint, numeric)
  from public, anon, authenticated;

grant execute on function public.execute_paper_trade(uuid, bigint, text, bigint, numeric)
  to service_role;
