// api/energy/index.js
const supabase = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const tg_id = req.query.tg_id || req.body?.tg_id;
  if (!tg_id) return res.status(400).json({ error: 'tg_id required' });

  try {
    const { data: player } = await supabase
      .from('players').select('*').eq('tg_id', String(tg_id)).single();
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const maxEnergy = player.max_energy || 10;
    const lastUpdate = new Date(player.energy_updated_at || player.created_at);
    const hoursElapsed = (Date.now() - lastUpdate.getTime()) / 3600000;
    const refilledEnergy = Math.floor(hoursElapsed / 2.4);
    const currentEnergy = Math.min(maxEnergy, (player.energy || 0) + refilledEnergy);

    // Save refilled energy if changed
    if (refilledEnergy > 0 && currentEnergy !== player.energy) {
      await supabase.from('players').update({
        energy: currentEnergy,
        energy_updated_at: new Date().toISOString()
      }).eq('tg_id', String(tg_id));
    }

    // Next refill time
    const nextRefillAt = new Date(lastUpdate.getTime() + 2.4 * 3600000);
    const msUntilRefill = Math.max(0, nextRefillAt.getTime() - Date.now());

    return res.status(200).json({
      success: true,
      energy: currentEnergy,
      max_energy: maxEnergy,
      next_refill_ms: msUntilRefill,
      next_refill_at: nextRefillAt.toISOString()
    });

  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
};
