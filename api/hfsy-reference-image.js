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
    const providers = [
      async () => {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', new Blob([body], { type: mime }), 'hfsy-reference.jpg');
        const response = await fetch('https://catbox.moe/user/api.php', {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(30_000),
        });
        return { response, url: (await response.text()).trim(), name: 'Catbox' };
      },
      async () => {
        const form = new FormData();
        form.append('file', new Blob([body], { type: mime }), 'hfsy-reference.jpg');
        const response = await fetch('https://tmpfiles.org/api/v1/upload', {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(30_000),
        });
        const result = await response.json().catch(() => null);
        const pageUrl = result?.data?.url || '';
        const url = pageUrl.replace('://tmpfiles.org/', '://tmpfiles.org/dl/');
        return { response, url, name: 'TmpFiles' };
      },
    ];
    const failures = [];
    let url = '';
    for (const upload of providers) {
      try {
        const result = await upload();
        if (result.response.ok && /^https?:\/\//i.test(result.url)) {
          url = result.url;
          break;
        }
        failures.push(`${result.name} (${result.response.status})`);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (!url) throw new Error(`临时图片托管失败: ${failures.join('; ')}`);
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
