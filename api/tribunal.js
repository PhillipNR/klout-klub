export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // DEBUG: Check if env var exists at all
  const keyExists = !!process.env.ANTHROPIC_API_KEY;
  const keyPrefix = process.env.ANTHROPIC_API_KEY 
    ? process.env.ANTHROPIC_API_KEY.substring(0, 15) 
    : 'MISSING';

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ 
      error: 'Method not allowed',
      debug: { keyExists, keyPrefix }
    }), { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const prompt = body.prompt;

    if (!prompt) {
      return new Response(JSON.stringify({ 
        error: 'No prompt',
        debug: { keyExists, keyPrefix }
      }), { status: 400, headers: corsHeaders });
    }

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

    const data = await anthropicRes.json();

    if (data.error) {
      return new Response(JSON.stringify({ 
        error: data.error.message,
        debug: { keyExists, keyPrefix }
      }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ verdict: data.content[0].text }), {
      status: 200,
      headers: corsHeaders
    });

  } catch (err) {
    return new Response(JSON.stringify({ 
      error: err.message,
      debug: { keyExists, keyPrefix }
    }), { status: 500, headers: corsHeaders });
  }
}
