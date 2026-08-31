const ALLOWED_HOSTS = new Set(['file.hfsyapi.cn', 'hfsyapi.cn', 'www.hfsyapi.cn']);

module.exports = async function handler(req, res) {
  const rawUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).searchParams.get('url');
  let target;
  try {
    target = new URL(rawUrl || '');
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'invalid_image_url' }));
    return;
  }
  if (req.method !== 'GET' || target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname.toLowerCase())) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'unsupported_image_url' }));
    return;
  }
  try {
    const upstream = await fetch(target, { signal: AbortSignal.timeout(30_000) });
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (!upstream.body) return res.end();
    for await (const chunk of upstream.body) res.write(Buffer.from(chunk));
    res.end();
  } catch (error) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: 'image_fetch_failed', message: error instanceof Error ? error.message : String(error) }));
  }
};

module.exports.config = { maxDuration: 60 };
