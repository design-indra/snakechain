// api/session/submit.js
const supabase = require('../../lib/supabase');

const TOKENS_PER_FOOD = 0.5;
const BONUS_TOKEN = 2.0;
const DIAMOND_TOKEN = 4.0;
const DAILY_MAX_TOKENS = 100;
const MAX_SCORE = 500;

function calculateReward(score, bonusFoods, diamondFoods) {
  let base = score * TOKENS_PER_FOOD;
  let bonus = (bonusFoods || 0) * BONUS_TOKEN;
  let diamond = (diamondFoods || 0) * DIAMOND_TOKEN;
  let total = base + bonus + diamond;

  // Milestone multiplier
  if (score >= 200) total *= 2.0;
  else if (score >= 100) total *= 1.5;
  else if (score >= 50) total *= 1.2;

  return Math.round(total * 1000) / 1000;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { tg_id, session_token, score, bonus_foods, diamond_foods } = req.body;
    if (!tg_id || !session_token) return res.status(400).json({ error: 'Missing required fields' });

    // Get session
    const { data: session } = await supabase
      .from('sessions')
      .select('*')
      .eq('session_token', session_token)
      .eq('tg_id', String(tg_id))
      .eq('status', 'active')
      .single();

    if (!session) return res.status(404).json({ error: 'Session tidak valid atau sudah expire.' });

    // Get player
    const { data: player } = await supabase
      .from('players')
      .select('*')
      .eq('tg_id', String(tg_id))
      .single();

    if (!player) return res.status(404).json({ error: 'Player not found.' });

    // ===== ANTI-CHEAT =====
    const now = Date.now();
    const sessionStart = new Date(session.created_at).getTime();
    const durationSeconds = Math.floor((now - sessionStart) / 1000);

    // 1. Max score check
    if (score > MAX_SCORE) {
      await flagCheater(tg_id, session.id, 'score_too_high');
      return res.status(400).json({ error: 'Score tidak valid.', code: 'CHEAT_DETECTED' });
    }

    // 2. Time-based validation
    const maxPossibleScore = Math.floor(durationSeconds / 2) + 20;
    if (score > maxPossibleScore) {
      await flagCheater(tg_id, session.id, 'score_time_mismatch');
      return res.status(400).json({ error: 'Score tidak sesuai durasi bermain.', code: 'CHEAT_DETECTED' });
    }

    // 3. Minimum play time (at least 10 seconds)
    if (score > 5 && durationSeconds < 10) {
      await flagCheater(tg_id, session.id, 'too_fast');
      return res.status(400).json({ error: 'Terlalu cepat.', code: 'CHEAT_DETECTED' });
    }

    // Calculate reward
    const reward = calculateReward(score, bonus_foods, diamond_foods);

    // 4. Daily limit check
    const today = new Date().toISOString().split('T')[0];
    const { data: todayRewards } = await supabase
      .from('rewards')
      .select('amount')
      .eq('tg_id', String(tg_id))
      .gte('created_at', today + 'T00:00:00.000Z');

    const todayTotal = (todayRewards || []).reduce((sum, r) => sum + parseFloat(r.amount), 0);
    const actualReward = Math.min(reward, DAILY_MAX_TOKENS - todayTotal);

    if (actualReward <= 0 && reward > 0) {
      // Complete session tapi tidak ada reward (limit tercapai)
      await supabase.from('sessions').update({
        status: 'completed',
        end_time: new Date().toISOString(),
        score,
        bonus_foods: bonus_foods || 0,
        duration_seconds: durationSeconds,
        reward_earned: 0
      }).eq('id', session.id);

      return res.status(200).json({
        success: true,
        score,
        reward: 0,
        message: 'Limit harian 100 SNAKE tercapai. Coba lagi besok!',
        daily_limit_reached: true
      });
    }

    // Complete session
    await supabase.from('sessions').update({
      status: 'completed',
      end_time: new Date().toISOString(),
      score,
      bonus_foods: bonus_foods || 0,
      duration_seconds: durationSeconds,
      reward_earned: actualReward
    }).eq('id', session.id);

    // Add reward
    const { data: rewardRow } = await supabase.from('rewards').insert({
      player_id: player.id,
      tg_id: String(tg_id),
      session_id: session.id,
      amount: actualReward,
      reward_type: 'game',
      status: 'pending'
    }).select().single();

    // Update player stats
    const newBest = Math.max(player.best_score || 0, score);
    await supabase.from('players').update({
      total_games: (player.total_games || 0) + 1,
      best_score: newBest,
      total_score: (player.total_score || 0) + score,
      pending_tokens: parseFloat(player.pending_tokens || 0) + actualReward,
      updated_at: new Date().toISOString()
    }).eq('tg_id', String(tg_id));

    // Log transaction
    await supabase.from('transactions').insert({
      tg_id: String(tg_id),
      type: 'earn',
      amount: actualReward,
      description: `Game reward - Score: ${score}`
    });

    // Update missions progress
    await updateMissions(tg_id, score, player);

    return res.status(200).json({
      success: true,
      score,
      duration_seconds: durationSeconds,
      reward: actualReward,
      is_new_best: score > (player.best_score || 0),
      message: `+${actualReward} $SNAKE earned!`
    });

  } catch (err) {
    console.error('Submit error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

async function flagCheater(tgId, sessionId, reason) {
  await supabase.from('sessions').update({
    status: 'rejected',
    reject_reason: reason,
    end_time: new Date().toISOString()
  }).eq('id', sessionId);

  const { data: player } = await supabase
    .from('players').select('ban_count').eq('tg_id', String(tgId)).single();

  const banCount = (player?.ban_count || 0) + 1;
  await supabase.from('players').update({
    ban_count: banCount,
    is_banned: banCount >= 5
  }).eq('tg_id', String(tgId));
}

async function updateMissions(tgId, score, player) {
  const today = new Date().toISOString().split('T')[0];

  // Mission: Play 5 games today
  await supabase.rpc('increment_mission', {
    p_tg_id: tgId,
    p_mission_id: 'play_5_games',
    p_mission_type: 'daily',
    p_target: 5,
    p_reward_tokens: 1.0,
    p_reward_energy: 1,
    p_reset_date: today
  }).catch(() => {});

  // Mission: Score 100 in one game
  if (score >= 100) {
    await supabase.rpc('complete_mission', {
      p_tg_id: tgId,
      p_mission_id: 'score_100',
      p_mission_type: 'daily',
      p_reward_tokens: 2.0,
      p_reward_energy: 0,
      p_reset_date: today
    }).catch(() => {});
  }
}
