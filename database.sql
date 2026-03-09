-- ============================================================
-- SnakeChain Database Schema
-- Jalankan ini di Supabase SQL Editor
-- ============================================================

-- ===== PLAYERS =====
CREATE TABLE IF NOT EXISTS players (
  id BIGSERIAL PRIMARY KEY,
  tg_id TEXT UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  photo_url TEXT,
  wallet_addr TEXT,
  energy INT DEFAULT 10,
  max_energy INT DEFAULT 10,
  energy_updated_at TIMESTAMPTZ DEFAULT NOW(),
  total_games INT DEFAULT 0,
  best_score INT DEFAULT 0,
  total_score BIGINT DEFAULT 0,
  pending_tokens DECIMAL(18,9) DEFAULT 0,
  claimed_tokens DECIMAL(18,9) DEFAULT 0,
  referral_code TEXT UNIQUE,
  referred_by TEXT,
  referral_count INT DEFAULT 0,
  streak_days INT DEFAULT 0,
  last_login_date DATE,
  is_banned BOOLEAN DEFAULT FALSE,
  ban_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== SESSIONS =====
CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  session_token TEXT UNIQUE NOT NULL,
  player_id BIGINT REFERENCES players(id),
  tg_id TEXT NOT NULL,
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  score INT DEFAULT 0,
  bonus_foods INT DEFAULT 0,
  duration_seconds INT,
  reward_earned DECIMAL(18,9) DEFAULT 0,
  status TEXT DEFAULT 'active', -- active, completed, expired, rejected
  reject_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== REWARDS =====
CREATE TABLE IF NOT EXISTS rewards (
  id BIGSERIAL PRIMARY KEY,
  player_id BIGINT REFERENCES players(id),
  tg_id TEXT NOT NULL,
  session_id BIGINT REFERENCES sessions(id),
  amount DECIMAL(18,9) NOT NULL,
  reward_type TEXT DEFAULT 'game', -- game, referral, mission, event, airdrop
  status TEXT DEFAULT 'pending', -- pending, claimed, expired
  claim_tx TEXT,
  claimed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== REFERRALS =====
CREATE TABLE IF NOT EXISTS referrals (
  id BIGSERIAL PRIMARY KEY,
  referrer_tg_id TEXT NOT NULL,
  referee_tg_id TEXT NOT NULL UNIQUE,
  referrer_reward DECIMAL(18,9) DEFAULT 5,
  referee_reward DECIMAL(18,9) DEFAULT 2,
  reward_paid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== LEADERBOARD =====
CREATE TABLE IF NOT EXISTS leaderboard (
  id BIGSERIAL PRIMARY KEY,
  tg_id TEXT UNIQUE NOT NULL,
  username TEXT,
  best_score INT DEFAULT 0,
  weekly_score INT DEFAULT 0,
  daily_score INT DEFAULT 0,
  total_tokens DECIMAL(18,9) DEFAULT 0,
  week_start DATE DEFAULT DATE_TRUNC('week', NOW()),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== MISSIONS =====
CREATE TABLE IF NOT EXISTS missions (
  id BIGSERIAL PRIMARY KEY,
  tg_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  mission_type TEXT NOT NULL, -- daily, weekly
  progress INT DEFAULT 0,
  target INT NOT NULL,
  reward_tokens DECIMAL(18,9) DEFAULT 0,
  reward_energy INT DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  reset_date DATE DEFAULT CURRENT_DATE,
  UNIQUE(tg_id, mission_id, reset_date)
);

-- ===== ENERGY LOGS =====
CREATE TABLE IF NOT EXISTS energy_logs (
  id BIGSERIAL PRIMARY KEY,
  tg_id TEXT NOT NULL,
  change_amount INT NOT NULL,
  reason TEXT,
  balance_after INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== TRANSACTIONS =====
CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  tg_id TEXT NOT NULL,
  type TEXT NOT NULL, -- earn, claim, spend, referral, mission
  amount DECIMAL(18,9) NOT NULL,
  description TEXT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== INDEXES =====
CREATE INDEX idx_players_tg_id ON players(tg_id);
CREATE INDEX idx_sessions_tg_id ON sessions(tg_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_rewards_tg_id ON rewards(tg_id);
CREATE INDEX idx_rewards_status ON rewards(status);
CREATE INDEX idx_leaderboard_best ON leaderboard(best_score DESC);
CREATE INDEX idx_leaderboard_weekly ON leaderboard(weekly_score DESC);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_tg_id);

-- ===== ROW LEVEL SECURITY =====
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;

-- Allow all from service role (backend)
CREATE POLICY "service_all" ON players FOR ALL USING (true);
CREATE POLICY "service_all" ON sessions FOR ALL USING (true);
CREATE POLICY "service_all" ON rewards FOR ALL USING (true);
CREATE POLICY "service_all" ON referrals FOR ALL USING (true);
CREATE POLICY "service_all" ON leaderboard FOR ALL USING (true);
CREATE POLICY "service_all" ON missions FOR ALL USING (true);
CREATE POLICY "service_all" ON energy_logs FOR ALL USING (true);
CREATE POLICY "service_all" ON transactions FOR ALL USING (true);

-- ===== FUNCTIONS =====

-- Auto update leaderboard when session completed
CREATE OR REPLACE FUNCTION update_leaderboard()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.score > 0 THEN
    INSERT INTO leaderboard (tg_id, username, best_score, weekly_score, daily_score)
    SELECT NEW.tg_id, p.username, NEW.score, NEW.score, NEW.score
    FROM players p WHERE p.tg_id = NEW.tg_id
    ON CONFLICT (tg_id) DO UPDATE SET
      best_score = GREATEST(leaderboard.best_score, NEW.score),
      weekly_score = leaderboard.weekly_score + NEW.score,
      daily_score = leaderboard.daily_score + NEW.score,
      updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_leaderboard
  AFTER UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_leaderboard();

-- Reset weekly scores (jalankan manual setiap Senin)
CREATE OR REPLACE FUNCTION reset_weekly_scores()
RETURNS void AS $$
BEGIN
  UPDATE leaderboard SET weekly_score = 0, week_start = DATE_TRUNC('week', NOW());
END;
$$ LANGUAGE plpgsql;

-- Reset daily scores (jalankan manual setiap hari)
CREATE OR REPLACE FUNCTION reset_daily_scores()
RETURNS void AS $$
BEGIN
  UPDATE leaderboard SET daily_score = 0;
END;
$$ LANGUAGE plpgsql;

SELECT 'Database schema berhasil dibuat! ✅' AS status;
