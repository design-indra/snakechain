// api/player/register.js
const supabase = require('../../lib/supabase');

function generateReferralCode(tgId) {
  return 'SC' + tgId.toString().slice(-6) + Math.random().toString(36).slice(-3).toUpperCase();
}

function isValidTonAddress(addr) {
  if (!addr) return false;
  if (/^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/.test(addr)) return true;
  if (/^0:[a-fA-F0-9]{64}$/.test(addr)) return true;
  return false;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { tg_id, username, first_name, photo_url, referral_code, wallet_addr } = req.body;
    if (!tg_id) return res.status(400).json({ error: 'tg_id required' });

    // Check existing player
    const { data: existing } = await supabase
      .from('players')
      .select('*')
      .eq('tg_id', String(tg_id))
      .single();

    if (existing) {
      // Update last login & streak
      const today = new Date().toISOString().split('T')[0];
      const lastLogin = existing.last_login_date;
      let streak = existing.streak_days || 0;

      if (lastLogin) {
        const diff = Math.floor((new Date(today) - new Date(lastLogin)) / 86400000);
        if (diff === 1) streak += 1;
        else if (diff > 1) streak = 1;
      } else {
        streak = 1;
      }

      // Update data, termasuk wallet_addr jika dikirim dan valid
      const updateData = {
        username, first_name, photo_url,
        last_login_date: today,
        streak_days: streak,
        updated_at: new Date().toISOString()
      };
      if (wallet_addr && isValidTonAddress(wallet_addr)) {
        updateData.wallet_addr = wallet_addr;
      }

      await supabase.from('players').update(updateData).eq('tg_id', String(tg_id));

      const updatedPlayer = { ...existing, ...updateData };
      return res.status(200).json({ success: true, player: updatedPlayer, is_new: false });
    }

    // New player
    const newReferralCode = generateReferralCode(tg_id);
    let referred_by = null;

    if (referral_code) {
      const { data: referrer } = await supabase
        .from('players')
        .select('tg_id, referral_count')
        .eq('referral_code', referral_code)
        .single();

      if (referrer && referrer.tg_id !== String(tg_id)) {
        referred_by = referrer.tg_id;
        await supabase.from('referrals').insert({
          referrer_tg_id: referrer.tg_id,
          referee_tg_id: String(tg_id),
          referrer_reward: 5,
          referee_reward: 2
        });
        await supabase.from('players').update({
          pending_tokens: supabase.rpc('increment', { x: 5 }),
          referral_count: (referrer.referral_count || 0) + 1,
          energy: supabase.rpc('increment', { x: 2 })
        }).eq('tg_id', referrer.tg_id);
        await supabase.from('transactions').insert({
          tg_id: referrer.tg_id,
          type: 'referral',
          amount: 5,
          description: `Referral bonus dari ${username || tg_id}`
        });
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const insertData = {
      tg_id: String(tg_id),
      username, first_name, photo_url,
      referral_code: newReferralCode,
      referred_by,
      energy: 10,
      max_energy: 10,
      last_login_date: today,
      streak_days: 1
    };
    if (wallet_addr && isValidTonAddress(wallet_addr)) {
      insertData.wallet_addr = wallet_addr;
    }

    const { data: newPlayer, error } = await supabase.from('players').insert(insertData).select().single();
    if (error) throw error;

    if (referred_by) {
      await supabase.from('rewards').insert({
        player_id: newPlayer.id,
        tg_id: String(tg_id),
        amount: 2,
        reward_type: 'referral',
        status: 'pending'
      });
      await supabase.from('players').update({ pending_tokens: 2 }).eq('tg_id', String(tg_id));
    }

    await supabase.from('leaderboard').insert({ tg_id: String(tg_id), username }).onConflict('tg_id').ignore();

    return res.status(201).json({ success: true, player: newPlayer, is_new: true });

  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
