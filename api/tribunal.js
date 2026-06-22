
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
 
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
 
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  try {
    // Handle body parsing manually if needed
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }
 
    const prompt = body && body.prompt;
 
    if (!prompt) {
      return res.status(400).json({ error: 'No prompt provided' });
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
 
    const text = await anthropicRes.text();
    
    let data;
    try {
      data = JSON.parse(text);
    } catch(e) {
      return res.status(500).json({ error: 'Bad response from Anthropic: ' + text.slice(0, 200) });
    }
 
    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }
 
    if (!data.content || !data.content[0]) {
      return res.status(500).json({ error: 'No content in response: ' + JSON.stringify(data).slice(0, 200) });
    }
 
    return res.status(200).json({ verdict: data.content[0].text });
 
  } catch (err) {
    return res.status(500).json({ error: 'Tribunal error: ' + err.message });
  }
}
