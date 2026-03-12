// api/reward/claim.js
const supabase = require('../../lib/supabase');

// Validasi semua format TON address: EQ, UQ, kQ, 0Q, dan raw 0:xxxx
function isValidTonAddress(addr) {
  if (!addr) return false;
  // Format friendly: EQ..., UQ..., kQ..., 0Q...
  if (/^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/.test(addr)) return true;
  // Format raw: 0:hexstring (64 hex chars)
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
    const { tg_id, wallet_addr } = req.body;
    if (!tg_id || !wallet_addr) return res.status(400).json({ error: 'tg_id and wallet_addr required' });

    // Validate TON address format (support semua format)
    if (!isValidTonAddress(wallet_addr)) {
      return res.status(400).json({ error: 'Format wallet TON tidak valid' });
    }

    const { data: player } = await supabase
      .from('players').select('*').eq('tg_id', String(tg_id)).single();
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const pendingTokens = parseFloat(player.pending_tokens || 0);
    if (pendingTokens < 5000) {
      return res.status(400).json({
        error: `Minimum klaim 5000 $SNAKE. Kamu punya ${pendingTokens.toFixed(2)} $SNAKE.`
      });
    }

    // Save wallet address & update tokens
    await supabase.from('players').update({
      wallet_addr,
      pending_tokens: 0,
      claimed_tokens: parseFloat(player.claimed_tokens || 0) + pendingTokens,
      updated_at: new Date().toISOString()
    }).eq('tg_id', String(tg_id));

    // Mark all pending rewards as claimed
    await supabase.from('rewards').update({
      status: 'claimed',
      claimed_at: new Date().toISOString(),
      claim_tx: 'PENDING_BLOCKCHAIN_TX'
    }).eq('tg_id', String(tg_id)).eq('status', 'pending');

    // Log transaction
    await supabase.from('transactions').insert({
      tg_id: String(tg_id),
      type: 'claim',
      amount: pendingTokens,
      description: `Claim to wallet: ${wallet_addr.slice(0, 8)}...`
    });

    return res.status(200).json({
      success: true,
      claimed_amount: pendingTokens,
      wallet_addr,
      message: `${pendingTokens.toFixed(2)} $SNAKE sedang diproses ke wallet kamu!`,
      note: 'Smart contract akan mentransfer token dalam beberapa menit'
    });

  } catch (err) {
    console.error('Claim error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
