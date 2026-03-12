// api/player/wallet.js
const supabase = require('../../lib/supabase');

// TON Connect mengirim address dalam format:
// - Raw: 0:abc123...  (64 hex chars setelah "0:")
// - Friendly: EQ..., UQ..., kQ..., 0Q... (48 chars)
function isValidTonAddress(addr) {
  if (!addr) return false;
  // Friendly format (dari TON Connect UI)
  if (/^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/.test(addr)) return true;
  // Raw format (0:hexstring) — yang dikirim TON Connect SDK
  if (/^0:[a-fA-F0-9]{64}$/.test(addr)) return true;
  // Hex only (tanpa prefix "0:") — beberapa wallet kirim format ini
  if (/^[a-fA-F0-9]{64}$/.test(addr)) return true;
  return false;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tg_id, wallet_addr } = req.body;
  if (!tg_id || !wallet_addr) {
    return res.status(400).json({ error: 'Missing tg_id or wallet_addr' });
  }

  if (!isValidTonAddress(wallet_addr)) {
    return res.status(400).json({
      error: 'Invalid TON wallet address format',
      received: wallet_addr?.slice(0, 20) + '...'
    });
  }

  const { data, error } = await supabase
    .from('players')
    .update({
      wallet_addr,
      updated_at: new Date().toISOString()
    })
    .eq('tg_id', String(tg_id))
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true, player: data });
};
