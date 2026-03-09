// api/leaderboard/index.js
const supabase = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const type = req.query.type || 'global'; // global, weekly, daily
    const limit = parseInt(req.query.limit) || 50;
    const tg_id = req.query.tg_id;

    const scoreCol = type === 'weekly' ? 'weekly_score' : type === 'daily' ? 'daily_score' : 'best_score';

    // Get top players
    const { data: top } = await supabase
      .from('leaderboard')
      .select(`tg_id, username, best_score, weekly_score, daily_score, total_tokens,
        players!inner(photo_url, referral_count)`)
      .order(scoreCol, { ascending: false })
      .limit(limit);

    // Get my rank
    let myRank = null;
    if (tg_id) {
      const { data: myData } = await supabase
        .from('leaderboard')
        .select('*')
        .eq('tg_id', String(tg_id))
        .single();

      if (myData) {
        const { count } = await supabase
          .from('leaderboard')
          .select('*', { count: 'exact', head: true })
          .gt(scoreCol, myData[scoreCol] || 0);
        myRank = { ...myData, rank: (count || 0) + 1 };
      }
    }

    return res.status(200).json({
      success: true,
      type,
      leaderboard: (top || []).map((p, i) => ({
        rank: i + 1,
        tg_id: p.tg_id,
        username: p.username || 'Anonymous',
        score: p[scoreCol] || 0,
        total_tokens: p.total_tokens || 0,
        photo_url: p.players?.photo_url
      })),
      my_rank: myRank
    });

  } catch (err) {
    console.error('Leaderboard error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
