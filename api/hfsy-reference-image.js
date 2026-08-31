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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  try {
    const body = await readRequestBody(req);
    if (!body.length) throw new Error('参考图内容为空');
    const mime = String(req.headers['content-type'] || 'image/jpeg').split(';')[0];
    const form = new FormData();
    form.append('file', new Blob([body], { type: mime }), 'hfsy-reference.jpg');
    const upstream = await fetch('https://0x0.st', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    const url = (await upstream.text()).trim();
    if (!upstream.ok || !/^https?:\/\//i.test(url)) {
      throw new Error(`临时图片托管失败 (${upstream.status}): ${url.slice(0, 300)}`);
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ url }));
  } catch (error) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'reference_image_upload_failed', message: error instanceof Error ? error.message : String(error) }));
  }
};

module.exports.config = {
  maxDuration: 60,
  api: { bodyParser: false },
};
