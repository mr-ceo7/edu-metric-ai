/**
 * Vercel Serverless Proxy — /api/proxy/generate
 *
 * Forwards JSON requests to the custom HTTP API server-side,
 * avoiding Mixed Content errors in the browser.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const baseUrl = (process.env.CUSTOM_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
  const targetUrl = `${baseUrl}/api/generate`;

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('[proxy/generate] Error:', error);
    return res.status(502).json({ error: 'Proxy request to custom API failed', details: String(error) });
  }
}
