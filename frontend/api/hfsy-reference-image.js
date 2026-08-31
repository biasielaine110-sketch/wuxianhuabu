const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

async function readRequestBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > MAX_IMAGE_BYTES) throw new Error('鍙傝€冨浘涓嶈兘瓒呰繃 10 MB');
    chunks.push(part);
  }
  return Buffer.concat(chunks);
}

function publicOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host) return '';
  return `${proto}://${host}`;
}

function isHttpUrl(s) {
  return typeof s === 'string' && /^https?:\/\//i.test(s.trim()) && !s.includes('<') && !s.startsWith('data:');
}

async function tryCompatUpload(baseUrl, apiKey, body, mime, filename) {
  const base = String(baseUrl || '')
    .trim()
    .replace(/\/+$/, '');
  if (!base || !apiKey) return null;
  const withV1 = /\/v1$/i.test(base) ? base : `${base}/v1`;
  for (const rp of ['uploads/images', 'upload/image', 'files']) {
    try {
      const form = new FormData();
      form.append('file', new Blob([body], { type: mime }), filename);
      const response = await fetch(`${withV1}/${rp}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(45_000),
      });
      const text = await response.text();
      if (!response.ok) continue;
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        if (isHttpUrl(text.trim())) return text.trim();
        continue;
      }
      const data = json?.data && typeof json.data === 'object' ? json.data : {};
      const url = data.url || json.url || data.download_url || '';
      if (isHttpUrl(url)) return url;
    } catch {
      /* next */
    }
  }
  return null;
}

async function serveLocalAsset(req, res) {
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

/**
 * Hobby 璁″垝鍚堝苟涓哄崟鍑芥暟锛? * POST /api/hfsy-reference-image 鈫?鎵樼鍏綉 URL
 * GET  /api/hfsy-reference-image?id= 鈫?鏈珯鐭摼鍙栧浘
 * HFSY_REF_UPLOAD_V4
 */
export default async function handler(req, res) {
  res.setHeader('X-Hfsy-Ref-Upload', 'v4');

  if (req.method === 'GET') {
    await serveLocalAsset(req, res);
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, POST');
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  try {
    const body = await readRequestBody(req);
    if (!body.length) throw new Error('鍙傝€冨浘鍐呭涓虹┖');
    const mime = String(req.headers['content-type'] || 'image/jpeg').split(';')[0] || 'image/jpeg';
    const filename = mime.includes('png') ? 'hfsy-reference.png' : 'hfsy-reference.jpg';

    const uploadKey =
      String(req.headers['x-upload-key'] || '')
        .trim()
        .replace(/^Bearer\s+/i, '') ||
      String(req.headers.authorization || '')
        .trim()
        .replace(/^Bearer\s+/i, '');
    const uploadBase = String(req.headers['x-upload-base'] || '').trim();

    if (uploadKey) {
      const bases = [
        uploadBase,
        process.env.TOAPIS_BASE_URL || 'https://toapis.com/v1',
        process.env.OPENAI_COMPAT_UPLOAD_BASE || '',
      ].filter(Boolean);
      for (const b of bases) {
        const url = await tryCompatUpload(b, uploadKey, body, mime, filename);
        if (url) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ url, provider: 'openai-compat' }));
          return;
        }
      }
    }

    const providers = [
      async () => {
        const form = new FormData();
        form.append('file', new Blob([body], { type: mime }), filename);
        const response = await fetch('https://telegra.ph/upload', {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(30_000),
        });
        const json = await response.json().catch(() => null);
        const src = Array.isArray(json) ? json[0]?.src : json?.src;
        const url =
          typeof src === 'string' && src.startsWith('/')
            ? `https://telegra.ph${src}`
            : typeof src === 'string' && /^https?:\/\//i.test(src)
              ? src
              : '';
        return { response, url, name: 'Telegraph' };
      },
      async () => {
        const form = new FormData();
        form.append('file', new Blob([body], { type: mime }), filename);
        const response = await fetch('https://0x0.st', {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(30_000),
        });
        return { response, url: (await response.text()).trim(), name: '0x0' };
      },
      async () => {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('time', '24h');
        form.append('fileToUpload', new Blob([body], { type: mime }), filename);
        const response = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(30_000),
        });
        return { response, url: (await response.text()).trim(), name: 'Litterbox' };
      },
      async () => {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', new Blob([body], { type: mime }), filename);
        const response = await fetch('https://catbox.moe/user/api.php', {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(30_000),
        });
        return { response, url: (await response.text()).trim(), name: 'Catbox' };
      },
      async () => {
        const form = new FormData();
        form.append('file', new Blob([body], { type: mime }), filename);
        const response = await fetch('https://tmpfiles.org/api/v1/upload', {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(30_000),
        });
        const result = await response.json().catch(() => null);
        const pageUrl = result?.data?.url || '';
        const url = String(pageUrl).replace('://tmpfiles.org/', '://tmpfiles.org/dl/');
        return { response, url, name: 'TmpFiles' };
      },
    ];

    const failures = [];
    let url = '';
    for (const upload of providers) {
      try {
        const result = await upload();
        if (result.response.ok && isHttpUrl(result.url)) {
          url = result.url.trim();
          break;
        }
        failures.push(`${result.name} (${result.response.status || 'err'})`);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    if (!url) {
      const origin = publicOrigin(req);
      if (origin) {
        const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        const g = globalThis;
        if (!g.__hfsyRefAssets) g.__hfsyRefAssets = new Map();
        g.__hfsyRefAssets.set(id, { buf: body, mime, expires: Date.now() + 30 * 60_000 });
        try {
          const fs = await import('node:fs/promises');
          await fs.writeFile(`/tmp/hfsy-ref-${id}`, body);
          await fs.writeFile(`/tmp/hfsy-ref-${id}.mime`, mime);
        } catch {
          /* ignore */
        }
        // 鍚屽嚱鏁?GET ?id= 鍙栧浘锛岄伩鍏嶅啀鍗犱竴涓?Serverless 鍚嶉
        url = `${origin}/api/hfsy-reference-image?id=${encodeURIComponent(id)}`;
      }
    }

    if (!url) {
      throw new Error(
        `涓存椂鍥剧墖鎵樼澶辫触锛堜笂娓镐粎鎺ュ彈鍏綉 URL锛屼笉鏀寔 base64锛? ${failures.join('; ') || '鏃犲彲鐢ㄥ浘搴?}`
      );
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ url, note: failures.length ? `tried: ${failures.join('; ')}` : undefined }));
  } catch (error) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: 'reference_image_upload_failed',
        message: error instanceof Error ? error.message : String(error),
      })
    );
  }
};

export const config = {
  maxDuration: 60,
  api: { bodyParser: false },
};
