const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

async function readRequestBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > MAX_IMAGE_BYTES) throw new Error('参考图不能超过 10 MB');
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

/**
 * hfsy 视频 create 仅接受公网 URL（明确拒绝 base64）。
 * HFSY_REF_UPLOAD_V3：ToAPIs（可选）→ Telegraph → 临时图床 → 本站短链兜底。
 */
module.exports = async function handler(req, res) {
  res.setHeader('X-Hfsy-Ref-Upload', 'v3');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  try {
    const body = await readRequestBody(req);
    if (!body.length) throw new Error('参考图内容为空');
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

    // 本站短链兜底（同实例立刻拉取才可靠；仅作最后手段）
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
        url = `${origin}/api/hfsy-ref-asset?id=${encodeURIComponent(id)}`;
      }
    }

    if (!url) {
      throw new Error(
        `临时图片托管失败（上游仅接受公网 URL，不支持 base64）: ${failures.join('; ') || '无可用图床'}`
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

module.exports.config = {
  maxDuration: 60,
  api: { bodyParser: false },
};
