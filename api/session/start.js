// api/session/start.js
const supabase = require('../../lib/supabase');
const crypto = require('crypto');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { tg_id } = req.body;
    if (!tg_id) return res.status(400).json({ error: 'tg_id required' });

    // Get player
    const { data: player } = await supabase
      .from('players')
      .select('*')
      .eq('tg_id', String(tg_id))
      .single();

    if (!player) return res.status(404).json({ error: 'Player not found. Register first.' });
    if (player.is_banned) return res.status(403).json({ error: 'Account suspended.' });

    // Check energy
    const energy = await getCurrentEnergy(player);
    if (energy <= 0) return res.status(400).json({ error: 'No energy! Wait for refill.', next_refill: getNextRefill(player) });

    // Check cooldown (30 detik)
    const { data: lastSession } = await supabase
      .from('sessions')
      .select('created_at')
      .eq('tg_id', String(tg_id))
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (lastSession) {
      const elapsed = (Date.now() - new Date(lastSession.created_at).getTime()) / 1000;
      if (elapsed < 30) {
        return res.status(429).json({ error: `Cooldown aktif. Tunggu ${Math.ceil(30 - elapsed)} detik.` });
      }
    }

    // Expire old active sessions
    await supabase.from('sessions')
      .update({ status: 'expired' })
      .eq('tg_id', String(tg_id))
      .eq('status', 'active');

    // Generate session token
    const sessionToken = crypto.randomBytes(32).toString('hex');

    // Create session
    const { data: session, error } = await supabase.from('sessions').insert({
      session_token: sessionToken,
      player_id: player.id,
      tg_id: String(tg_id),
      status: 'active'
    }).select().single();

    if (error) throw error;

    // Deduct energy
    const newEnergy = Math.max(0, energy - 1);
    await supabase.from('players').update({
      energy: newEnergy,
      energy_updated_at: new Date().toISOString()
    }).eq('tg_id', String(tg_id));

    await supabase.from('energy_logs').insert({
      tg_id: String(tg_id),
      change_amount: -1,
      reason: 'game_start',
      balance_after: newEnergy
    });

    return res.status(200).json({
      success: true,
      session_token: sessionToken,
      session_id: session.id,
      energy_remaining: newEnergy
    });

  } catch (err) {
    console.error('Session start error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

async function getCurrentEnergy(player) {
  const maxEnergy = player.max_energy || 10;
  const lastUpdate = new Date(player.energy_updated_at || player.created_at);
  const hoursElapsed = (Date.now() - lastUpdate.getTime()) / 3600000;
  const refilledEnergy = Math.floor(hoursElapsed / 2.4); // 1 energy per 2.4 jam
  return Math.min(maxEnergy, (player.energy || 0) + refilledEnergy);
}

function getNextRefill(player) {
  const lastUpdate = new Date(player.energy_updated_at || player.created_at);
  const nextRefill = new Date(lastUpdate.getTime() + 2.4 * 3600000);
  return nextRefill.toISOString();
}
