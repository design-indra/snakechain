// api/daily/checkin.js
const supabase = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tg_id } = req.body;
  if (!tg_id) return res.status(400).json({ error: 'tg_id required' });

  const { data: player } = await supabase
    .from('players').select('*').eq('tg_id', String(tg_id)).single();
  if (!player) return res.status(404).json({ error: 'Player not found' });

  const today = new Date().toISOString().split('T')[0];
  if (player.last_checkin_date === today) {
    return res.status(400).json({ error: 'Already checked in today' });
  }

  const streak = (player.streak_days || 0) + 1;
  const bonus = streak >= 7 ? 10 : 5;

  await supabase.from('players').update({
    last_checkin_date: today,
    streak_days: streak,
    pending_tokens: parseFloat(player.pending_tokens || 0) + bonus,
    updated_at: new Date().toISOString()
  }).eq('tg_id', String(tg_id));

  await supabase.from('transactions').insert({
    tg_id: String(tg_id), type: 'daily_checkin',
    amount: bonus, description: `Day ${streak} check-in bonus`
  });

  return res.status(200).json({ success: true, bonus, streak });
};
