export const config = { runtime: 'edge' };

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });

  try {
    const body = await req.json();
    const { prompt, criminal_name, crime, tier, prosecutor, tier_cost } = body;
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!prompt) return new Response(JSON.stringify({ error: 'No prompt provided' }), { status: 400, headers: corsHeaders });

    // 1. Get user profile if logged in
    let userProfile = null;
    let userId = null;
    if (authHeader) {
      const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { 'apikey': supabaseKey, 'Authorization': authHeader }
      });
      const userData = await userRes.json();
      userId = userData?.id;

      if (userId) {
        const profileRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=*`,
          { headers: { 'apikey': supabaseKey, 'Authorization': authHeader } }
        );
        const profiles = await profileRes.json();
        userProfile = profiles[0] || null;
      }
    }

    // 2. Generate verdict
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const anthropicData = await anthropicRes.json();
    if (anthropicData.error) return new Response(JSON.stringify({ error: anthropicData.error.message }), { status: 500, headers: corsHeaders });

    const verdict = anthropicData.content[0].text;

    // 3. Save criminal record
    if (criminal_name) {
      const checkRes = await fetch(
        `${supabaseUrl}/rest/v1/criminals?name=eq.${encodeURIComponent(criminal_name.toLowerCase())}&select=id,count`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
      );
      const existing = await checkRes.json();

      if (existing && existing.length > 0) {
        await fetch(`${supabaseUrl}/rest/v1/criminals?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ count: existing[0].count + 1 })
        });
      } else {
        await fetch(`${supabaseUrl}/rest/v1/criminals`, {
          method: 'POST',
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: criminal_name.toLowerCase(), display_name: criminal_name, count: 1 })
        });
      }

      // Save verdict
      const prosecutorName = userProfile?.komrade_name || prosecutor || 'Anonymous Komrade';
      await fetch(`${supabaseUrl}/rest/v1/verdicts`, {
        method: 'POST',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ criminal_name: criminal_name.toLowerCase(), crime, tier, verdict, prosecutor: prosecutorName })
      });

      // Update user profile if logged in
      if (userId && userProfile && tier_cost) {
        const newBalance = Math.max(0, (userProfile.krublz_balance || 0) - tier_cost);
        const newSpent = (userProfile.krublz_spent || 0) + tier_cost;
        const newConvictions = (userProfile.convictions_secured || 0) + 1;

        // Calculate new rank
        let newRank = 'Citizen Informant';
        if (newSpent >= 6500) newRank = 'Комрад Сталин';
        else if (newSpent >= 2500) newRank = 'Grand Inquisitor';
        else if (newSpent >= 1000) newRank = 'People\'s Prosecutor';
        else if (newSpent >= 400) newRank = 'Senior Komrade';
        else if (newSpent >= 100) newRank = 'Junior Komrade';

        await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
          method: 'PATCH',
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            krublz_balance: newBalance,
            krublz_spent: newSpent,
            convictions_secured: newConvictions,
            rank: newRank
          })
        });

        userProfile = { ...userProfile, krublz_balance: newBalance, krublz_spent: newSpent, convictions_secured: newConvictions, rank: newRank };
      }
    }

    // 4. Fetch leaderboard
    const [criminalsRes, verdictsRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/criminals?select=display_name,count&order=count.desc&limit=8`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      }),
      fetch(`${supabaseUrl}/rest/v1/verdicts?select=criminal_name,crime,tier,created_at&order=created_at.desc&limit=8`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      })
    ]);

    const criminals = await criminalsRes.json();
    const recentVerdicts = await verdictsRes.json();

    return new Response(JSON.stringify({
      verdict,
      profile: userProfile,
      criminals: Array.isArray(criminals) ? criminals : [],
      recentVerdicts: Array.isArray(recentVerdicts) ? recentVerdicts : []
    }), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Tribunal error: ' + err.message }), { status: 500, headers: corsHeaders });
  }
}
