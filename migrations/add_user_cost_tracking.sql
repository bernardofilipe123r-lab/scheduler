-- User cost tracking tables
-- Tracks per-user spending on DeepSeek and DeAPI services

-- Daily granular tracking (kept for 30 days, then aggregated to monthly)
CREATE TABLE IF NOT EXISTS user_cost_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    date DATE NOT NULL,
    deepseek_calls INTEGER DEFAULT 0,
    deepseek_input_tokens INTEGER DEFAULT 0,
    deepseek_output_tokens INTEGER DEFAULT 0,
    deepseek_cost_usd DOUBLE PRECISION DEFAULT 0.0,
    deapi_calls INTEGER DEFAULT 0,
    deapi_cost_usd DOUBLE PRECISION DEFAULT 0.0,
    reels_generated INTEGER DEFAULT 0,
    carousels_generated INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_user_cost_daily_user_id ON user_cost_daily(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cost_daily_date ON user_cost_daily(date);

-- Monthly aggregated tracking (permanent storage for historical data)
CREATE TABLE IF NOT EXISTS user_cost_monthly (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    month DATE NOT NULL,  -- first day of month
    deepseek_calls INTEGER DEFAULT 0,
    deepseek_input_tokens INTEGER DEFAULT 0,
    deepseek_output_tokens INTEGER DEFAULT 0,
    deepseek_cost_usd DOUBLE PRECISION DEFAULT 0.0,
    deapi_calls INTEGER DEFAULT 0,
    deapi_cost_usd DOUBLE PRECISION DEFAULT 0.0,
    reels_generated INTEGER DEFAULT 0,
    carousels_generated INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_user_cost_monthly_user_id ON user_cost_monthly(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cost_monthly_month ON user_cost_monthly(month);
