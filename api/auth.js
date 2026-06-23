export const config = { runtime: 'edge' };

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, email, password, komrade_name } = body;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (action === 'signup') {
      // 1. Create auth user
      const signupRes = await fetch(`${supabaseUrl}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey },
        body: JSON.stringify({ email, password })
      });
      const signupData = await signupRes.json();

      if (signupData.error) {
        return new Response(JSON.stringify({ error: signupData.error.message }), { status: 400, headers: corsHeaders });
      }

      const userId = signupData.user?.id;
      const accessToken = signupData.access_token;

      if (userId) {
        // 2. Create profile
        await fetch(`${supabaseUrl}/rest/v1/profiles`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${accessToken || supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            id: userId,
            komrade_name: komrade_name || 'Anonymous Komrade',
            krublz_balance: 50,
            krublz_spent: 0,
            rank: 'Citizen Informant',
            convictions_secured: 0
          })
        });
      }

      return new Response(JSON.stringify({
        success: true,
        user: { id: userId, email: signupData.user?.email },
        session: { access_token: accessToken },
        profile: {
          komrade_name: komrade_name || 'Anonymous Komrade',
          krublz_balance: 50,
          rank: 'Citizen Informant',
          convictions_secured: 0,
          krublz_spent: 0
        }
      }), { status: 200, headers: corsHeaders });
    }

    if (action === 'login') {
      const loginRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey },
        body: JSON.stringify({ email, password })
      });
      const loginData = await loginRes.json();

      if (loginData.error) {
        return new Response(JSON.stringify({ error: loginData.error.message }), { status: 400, headers: corsHeaders });
      }

      const accessToken = loginData.access_token;
      const userId = loginData.user?.id;

      // Fetch profile
      const profileRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=*`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${accessToken}` } }
      );
      const profiles = await profileRes.json();
      const profile = profiles[0] || null;

      return new Response(JSON.stringify({
        success: true,
        user: { id: userId, email: loginData.user?.email },
        session: { access_token: accessToken },
        profile
      }), { status: 200, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
