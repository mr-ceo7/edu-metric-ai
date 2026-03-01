/**
 * Vercel Serverless Proxy — /api/proxy/upload
 *
 * Forwards multipart file uploads to the custom HTTP API server-side,
 * avoiding Mixed Content errors in the browser.
 *
 * We disable Vercel's default body parser so we can stream the raw
 * multipart body directly to the upstream server.
 */

export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Collect all chunks from a readable stream into a single Buffer.
 */
function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const baseUrl = (process.env.CUSTOM_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
  const targetUrl = `${baseUrl}/api/upload`;

  try {
    const body = await collectBody(req);

    // Forward the raw multipart body with its original Content-Type header
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'],
      },
      body,
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('[proxy/upload] Error:', error);
    return res.status(502).json({ error: 'Proxy request to custom API failed', details: String(error) });
  }
}
