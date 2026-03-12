const { supabase } = require('../../lib/supabase');

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

  const { tg_id, wallet_addr } = req.body;
  if (!tg_id || !wallet_addr) return res.status(400).json({ error: 'Missing fields' });

  if (!isValidTonAddress(wallet_addr)) {
    return res.status(400).json({ error: 'Format wallet address tidak valid' });
  }

  const { data, error } = await supabase
    .from('players')
    .update({ wallet_addr })
    .eq('tg_id', String(tg_id))
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true, player: data });
};
