// api/referral/index.js
const supabase = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const tg_id = req.query.tg_id;
  if (!tg_id) return res.status(400).json({ error: 'tg_id required' });

  try {
    const { data: player } = await supabase
      .from('players')
      .select('referral_code, referral_count, tg_id')
      .eq('tg_id', String(tg_id))
      .single();

    if (!player) return res.status(404).json({ error: 'Player not found' });

    // Get referral list
    const { data: referrals } = await supabase
      .from('referrals')
      .select('*, referee:players!referee_tg_id(username, first_name, created_at)')
      .eq('referrer_tg_id', String(tg_id))
      .order('created_at', { ascending: false })
      .limit(20);

    // Calculate total earned from referrals
    const { data: refRewards } = await supabase
      .from('transactions')
      .select('amount')
      .eq('tg_id', String(tg_id))
      .eq('type', 'referral');

    const totalRefEarned = (refRewards || []).reduce((s, r) => s + parseFloat(r.amount), 0);

    const referralLink = `https://t.me/SnakeMini_AppBot/snakegame?startapp=ref_${player.tg_id}`;

    return res.status(200).json({
      success: true,
      referral_code: player.referral_code,
      referral_link: referralLink,
      total_referrals: player.referral_count || 0,
      total_earned: totalRefEarned,
      referrals: (referrals || []).map(r => ({
        username: r.referee?.username || r.referee?.first_name || 'Anonymous',
        joined_at: r.created_at,
        reward_paid: r.reward_paid
      }))
    });

  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
};
