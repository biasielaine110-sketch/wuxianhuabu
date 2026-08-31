/**
 * 提供 hfsy 视频参考图公网拉取地址（配合 /api/hfsy-reference-image 本站短链兜底）。
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }
  const id = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).searchParams.get('id') || '';
  if (!/^[a-z0-9]+$/i.test(id)) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'invalid_id' }));
    return;
  }

  const g = globalThis;
  const mem = g.__hfsyRefAssets?.get(id);
  if (mem && mem.expires > Date.now()) {
    res.statusCode = 200;
    res.setHeader('Content-Type', mem.mime || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=1800');
    res.end(Buffer.from(mem.buf));
    return;
  }

  try {
    const fs = await import('node:fs/promises');
    const buf = await fs.readFile(`/tmp/hfsy-ref-${id}`);
    let mime = 'image/jpeg';
    try {
      mime = (await fs.readFile(`/tmp/hfsy-ref-${id}.mime`, 'utf8')).trim() || mime;
    } catch {
      /* ignore */
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=1800');
    res.end(buf);
  } catch {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'not_found' }));
  }
}

export const config = { maxDuration: 30 };
