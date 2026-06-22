module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const prompt = req.body && req.body.prompt;

    if (!prompt) {
      res.status(400).json({ error: 'No prompt provided' });
      return;
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
      res.status(500).json({ error: data.error.message });
      return;
    }

    res.status(200).json({ verdict: data.content[0].text });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
