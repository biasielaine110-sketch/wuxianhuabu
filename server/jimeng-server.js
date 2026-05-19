import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3107);
const OUTPUT_DIR = path.join(__dirname, "outputs");
await fs.mkdir(OUTPUT_DIR, { recursive: true });

// ============================================================
//  环境检测
//  macOS/Linux → dreamina CLI（原生 CLI）
//  Windows      → wsl dreamina CLI（通过 WSL 调用）
// ============================================================
const IS_WINDOWS = process.platform === "win32";
const DREAMINA_CMD = process.env.DREAMINA_CMD || "dreamina";
const OPENCLI_CMD = process.env.OPENCLI_CMD || "opencli";

// WSL 发行版名称
const WSL_DISTRO = process.env.WSL_DISTRO || "Ubuntu";

// Windows 上 wsl.exe 的完整路径
const WSL_EXE = IS_WINDOWS
  ? path.join(process.env.SYSTEMROOT || "C:\\Windows", "System32", "wsl.exe")
  : "wsl";

let hasWslDreamina = false;
let wslChecked = false;

async function detectWslDreamina() {
  if (wslChecked) return hasWslDreamina;
  wslChecked = true;
  if (!IS_WINDOWS) {
    hasWslDreamina = false;
    return false;
  }
  try {
    // 直接用完整路径调用，避免 $PATH 被 Windows 环境变量污染
    const r = await execa(WSL_EXE, ["-d", WSL_DISTRO, "--", "bash", "-c", "/root/.local/bin/dreamina --version"], { timeout: 30000 });
    hasWslDreamina = r.exitCode === 0;
  } catch {
    hasWslDreamina = false;
  }
  return hasWslDreamina;
}

// 是否优先使用 dreamina CLI（macOS/Linux 原生 或 Windows 上通过 WSL）
async function canUseDreaminaCli() {
  if (!IS_WINDOWS) return true;
  return await detectWslDreamina();
}

// ============================================================
//  Helper：执行即梦 CLI 命令
//  macOS/Linux → dreamina 直接调用
//  Windows     → wsl -d Ubuntu -- bash -l -c "... dreamina ..."
// ============================================================
function buildWslCmd(args) {
  // 使用完整路径避免 Windows PATH 环境变量干扰
  const cmdStr = `/root/.local/bin/dreamina ${args.map(a => {
    if (typeof a !== "string") return String(a);
    if (a.includes("'") || a.includes(" ") || a.includes("$") || a.includes("\\") || a.includes('"')) {
      return `'${a.replace(/'/g, "'\\''")}'`;
    }
    return a;
  }).join(" ")}`;
  return cmdStr;
}

async function execJimeng(args, options = {}) {
  if (!IS_WINDOWS) {
    return execa(DREAMINA_CMD, args, options);
  }
  // Windows 上通过 WSL 调用 dreamina CLI
  const cmdStr = buildWslCmd(args);
  return execa(WSL_EXE, ["-d", WSL_DISTRO, "--", "bash", "-c", cmdStr], options);
}

async function execWslDreamina(args, options = {}) {
  const cmdStr = buildWslCmd(args);
  return execa(WSL_EXE, ["-d", WSL_DISTRO, "--", "bash", "-c", cmdStr], options);
}

async function checkDreaminaLogin() {
  try {
    const r = await execJimeng(["user_credit"], { timeout: 15000 });
    const data = JSON.parse(r.stdout);
    const loggedIn = data.total_credit !== undefined || data.ok === true || data.credit !== undefined || data.credits !== undefined;
    return { loggedIn, data };
  } catch (error) {
    return {
      loggedIn: false,
      detail: error.shortMessage || error.message,
      stdout: error.stdout,
      stderr: error.stderr,
    };
  }
}

function isDreaminaLoginError(error) {
  const text = [
    error?.stderr,
    error?.stdout,
    error?.shortMessage,
    error?.message,
  ].filter(Boolean).join("\n").toLowerCase();

  return (
    text.includes("dreamina login") ||
    text.includes("login") ||
    text.includes("未检测") ||
    text.includes("登录")
  );
}

function sendDreaminaLoginRequired(res, detail = {}) {
  return res.status(401).json({
    ok: false,
    message: "即梦登录已过期，请重新登录",
    loginRequired: true,
    ...detail,
  });
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "20mb" }));
app.use("/outputs", express.static(OUTPUT_DIR));

// ============================================================
//  Health
// ============================================================
app.get("/api/jimeng/health", async (_req, res) => {
  try {
    if (!IS_WINDOWS || HAS_WSL_DREAMINA) {
      const r = await execWslDreamina(["--version"], { timeout: 10000 });
      const version = (r.stdout || r.stderr || "").trim();
      return res.json({
        ok: true,
        cli: IS_WINDOWS ? "wsl dreamina" : "dreamina",
        version,
        platform: IS_WINDOWS ? "wsl-dreamina" : "native",
      });
    }
    // Windows WSL 不可用时，回退检查 opencli
    const r = await execa(OPENCLI_CMD, ["jimeng", "--help", "-f", "json"], { timeout: 15000 });
    const data = JSON.parse(r.stdout);
    return res.json({
      ok: true,
      cli: OPENCLI_CMD,
      platform: "opencli-windows",
      commands: data.commands?.map(c => c.name),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: IS_WINDOWS
        ? "Dreamina CLI (WSL) 不可用。请确保已安装 WSL Ubuntu，并在 WSL 中运行: curl -fsSL https://jimeng.jianying.com/cli | bash"
        : "Dreamina CLI 不可用。macOS/Linux 请运行: curl -fsSL https://jimeng.jianying.com/cli | bash",
      detail: error.shortMessage || error.message,
    });
  }
});

// ============================================================
//  Session（检测是否已登录）
// ============================================================
app.get("/api/jimeng/session", async (_req, res) => {
  try {
    if (!IS_WINDOWS || HAS_WSL_DREAMINA) {
      const r = await execWslDreamina(["user_credit"], { timeout: 15000 });
      const data = JSON.parse(r.stdout);
      const loggedIn = data.total_credit !== undefined || data.ok === true || data.credit !== undefined || data.credits !== undefined;
      return res.json({ ok: true, loggedIn, data });
    }
    // Windows WSL 不可用时，回退 opencli
    try {
      const r = await execa(OPENCLI_CMD, ["jimeng", "history", "-f", "json", "--site-session", "persistent", "--window", "background"], { timeout: 15000 });
      const data = JSON.parse(r.stdout);
      return res.json({ ok: true, loggedIn: true, data });
    } catch {
      return res.json({ ok: true, loggedIn: false, platform: "opencli", message: "未登录" });
    }
  } catch (error) {
    res.json({ ok: true, loggedIn: false, detail: error.shortMessage || error.message });
  }
});

// ============================================================
//  Login Start
// ============================================================
app.post("/api/jimeng/login/start", async (_req, res) => {
  // 直接返回即梦登录页面 URL（毫秒级响应，不调用 CLI）
  res.json({
    ok: true,
    message: "请扫码或打开链接登录即梦",
    verificationUrl: "https://jimeng.jianying.com/ai-tool/login",
    userCode: "",
    platform: IS_WINDOWS ? "wsl-dreamina" : "native",
  });
});

// ============================================================
//  Login Screenshot（WSL 模式不需要截图）
// ============================================================
app.get("/api/jimeng/login/screenshot", async (_req, res) => {
  res.json({ ok: true, message: "请查看终端输出或浏览器窗口完成登录" });
});

// ============================================================
//  Login Status
// ============================================================
app.get("/api/jimeng/login/status", async (_req, res) => {
  try {
    if (!IS_WINDOWS || HAS_WSL_DREAMINA) {
      const r = await execWslDreamina(["user_credit"], { timeout: 15000 });
      const data = JSON.parse(r.stdout);
      const loggedIn = data.total_credit !== undefined || data.ok === true || data.credit !== undefined;
      return res.json({ ok: true, loggedIn, data });
    }
    // Windows WSL 不可用时回退 opencli
    try {
      const r = await execa(OPENCLI_CMD, ["jimeng", "history", "-f", "json", "--site-session", "persistent", "--window", "background"], { timeout: 15000 });
      const data = JSON.parse(r.stdout);
      return res.json({ ok: true, loggedIn: true, data });
    } catch {
      return res.json({ ok: true, loggedIn: false, platform: "opencli" });
    }
  } catch {
    res.json({ ok: true, loggedIn: false });
  }
});

// ============================================================
//  Image Generate（文生图 / 图生图）
// ============================================================
app.post("/api/jimeng/image/generate", async (req, res) => {
  const params = req.body;
  if (!params.prompt || typeof params.prompt !== "string") {
    return res.status(400).json({ ok: false, message: "缺少 prompt" });
  }

  try {
    if (!IS_WINDOWS || HAS_WSL_DREAMINA) {
      // dreamina text2image / image2image (通过 WSL 或原生)
      const session = await checkDreaminaLogin();
      if (!session.loggedIn) {
        return sendDreaminaLoginRequired(res, session);
      }

      // 处理图片：如果是 base64 或 HTTP URL，都下载/保存到临时文件
      let imageFilePath = params.imageUrl;
      if (params.imageUrl) {
        try {
          let tempImageBuffer = null;
          // 如果是 base64
          if (params.imageUrl.startsWith('data:')) {
            const base64Data = params.imageUrl.replace(/^data:image\/\w+;base64,/, '');
            tempImageBuffer = Buffer.from(base64Data, 'base64');
          }
          // 如果是 HTTP URL，下载到本地
          else if (params.imageUrl.startsWith('http://') || params.imageUrl.startsWith('https://')) {
            console.log(`[jimeng-image] 下载参考图片: ${params.imageUrl.substring(0, 80)}...`);
            const resp = await fetch(params.imageUrl, {
              headers: { 'Referer': 'https://jimeng.jianying.com/' }
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            tempImageBuffer = Buffer.from(await resp.arrayBuffer());
          }

          if (tempImageBuffer) {
            const ext = params.imageUrl.includes('png') ? 'png' : 'jpg';
            imageFilePath = path.join(OUTPUT_DIR, `temp_input_${Date.now()}.${ext}`);
            await fs.writeFile(imageFilePath, tempImageBuffer);
            console.log(`[jimeng-image] 临时图片保存到: ${imageFilePath}`);
            // Windows WSL 环境需要转换为 /mnt/d/... 路径格式
            if (IS_WINDOWS) {
              imageFilePath = imageFilePath.replace(/^([A-Z]):/, (match, letter) => `/mnt/${letter.toLowerCase()}`).replace(/\\/g, '/');
              console.log(`[jimeng-image] WSL 路径: ${imageFilePath}`);
            }
          }
        } catch (err) {
          return res.status(500).json({ ok: false, message: "处理输入图片失败", detail: err.message });
        }
      }

      const args = buildDreaminaImageArgs({ ...params, imageUrl: imageFilePath });
      const result = await execJimeng(args, { timeout: 240000 });

      // 清理临时文件
      if (imageFilePath && imageFilePath.includes('temp_input_')) {
        try {
          await fs.unlink(imageFilePath);
          console.log(`[jimeng-image] 临时文件已删除: ${imageFilePath}`);
        } catch {}
      }

      const payload = JSON.parse(result.stdout);
      return handleJimengResult(res, payload, OUTPUT_DIR, PORT, "image");
    }

    // Windows WSL 不可用时回退 opencli
    const cmdArgs = buildOpencliImageArgs(params);
    const result = await execa(OPENCLI_CMD, cmdArgs, { timeout: 180000 });
    return handleOpencliImageResult(res, result, OUTPUT_DIR, PORT);
  } catch (error) {
    const stderr = error.stderr || "";
    const loginRequired = isDreaminaLoginError(error);
    if (loginRequired) {
      return sendDreaminaLoginRequired(res, {
        detail: error.shortMessage || error.message,
        stdout: error.stdout,
        stderr,
      });
    }
    return res.status(500).json({
      ok: false,
      message: loginRequired ? "即梦登录已过期，请重新登录" : "即梦图片生成失败",
      detail: error.shortMessage || error.message,
      stdout: error.stdout,
      stderr,
      loginRequired,
    });
  }
});

// ============================================================
//  Video Generate（文生视频 / 图生视频）
// ============================================================
app.post("/api/jimeng/video/generate", async (req, res) => {
  const params = req.body;
  console.log('[jimeng-video-generate] 收到请求参数:', JSON.stringify({
    model: params.model,
    promptLength: params.prompt?.length,
    hasImage: !!params.imageUrl,
    duration: params.duration,
    ratio: params.ratio
  }, null, 2));
  
  if (!params.prompt || typeof params.prompt !== "string") {
    return res.status(400).json({ ok: false, message: "缺少 prompt" });
  }

    if (IS_WINDOWS && !HAS_WSL_DREAMINA) {
    // Windows 且 WSL dreamina 不可用时回退为 opencli 生图
    try {
      const cmdArgs = buildOpencliImageArgs(params);
      const result = await execa(OPENCLI_CMD, cmdArgs, { timeout: 180000 });
      return handleOpencliImageResult(res, result, OUTPUT_DIR, PORT, true);
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: "Windows 暂不支持即梦视频生成。请确保 WSL Ubuntu 已安装 dreamina CLI（curl -fsSL https://jimeng.jianying.com/cli | bash）",
        detail: error.shortMessage || error.message,
      });
    }
  }

  try {
    const session = await checkDreaminaLogin();
    if (!session.loggedIn) {
      return sendDreaminaLoginRequired(res, session);
    }
    
    // 调试：记录模型映射过程
    console.log('[jimeng-video-generate] 原始模型参数:', params.model);
    const args = buildDreaminaVideoArgs(params);
    console.log('[jimeng-video-generate] 构建的命令行参数:', args);
    
    const result = await execJimeng(args, { timeout: 300000 });
    const payload = JSON.parse(result.stdout);
    return handleJimengResult(res, payload, OUTPUT_DIR, PORT, "video");
  } catch (error) {
    const stderr = error.stderr || "";
    const loginRequired = isDreaminaLoginError(error);
    if (loginRequired) {
      return sendDreaminaLoginRequired(res, {
        detail: error.shortMessage || error.message,
        stdout: error.stdout,
        stderr,
      });
    }
    return res.status(500).json({
      ok: false,
      message: loginRequired ? "即梦登录已过期，请重新登录" : "即梦视频生成失败",
      detail: error.shortMessage || error.message,
      stdout: error.stdout,
      stderr,
      loginRequired,
    });
  }
});

// ============================================================
//  Query Result
// ============================================================
app.post("/api/jimeng/query", async (req, res) => {
  const { submitId } = req.body;
  if (!submitId) return res.status(400).json({ ok: false, message: "缺少 submitId" });
  try {
    const r = await execJimeng(["query_result", "--submit_id", submitId], { timeout: 30000 });
    const payload = JSON.parse(r.stdout);
    const data = payload.data || payload;

    // 如果已完成且包含 URL，下载到本地并返回本地URL
    const genStatus = data.gen_status || data.status || "";
    if (genStatus === "completed" || genStatus === "done" || genStatus === "success") {
      let videoUrl = data.video_url || data.url || "";
      const results = data.results || [];
      if (!videoUrl) {
        videoUrl = (results[0]?.video_url) || (results[0]?.url) || "";
      }
      
      // 检查 result_json.videos[0].video_url（即梦API返回格式）
      if (!videoUrl && data.result_json?.videos?.length > 0) {
        videoUrl = data.result_json.videos[0].video_url || data.result_json.videos[0].url || "";
      }
      
      if (videoUrl) {
        // 尝试下载视频到本地
        try {
          const ext = ".mp4";
          const filename = `jimeng_video_${Date.now()}${ext}`;
          const localPath = path.join(OUTPUT_DIR, filename);
          
          console.log(`[jimeng-query] 下载视频: ${videoUrl.substring(0, 100)}...`);
          const resp = await fetch(videoUrl, {
            headers: {
              'Referer': 'https://jimeng.jianying.com/',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            }
          });
          
          if (resp.ok) {
            const buf = Buffer.from(await resp.arrayBuffer());
            await fs.writeFile(localPath, buf);
            const localVideoUrl = `http://localhost:${PORT}/outputs/${encodeURIComponent(filename)}`;
            console.log(`[jimeng-query] 视频下载成功: ${localVideoUrl}`);
            
            return res.json({ 
              ok: true, 
              data: { 
                ...data, 
                video_url: localVideoUrl, 
                original_video_url: videoUrl, // 保存原始URL用于调试
                gen_status: "completed" 
              } 
            });
          } else {
            console.warn(`[jimeng-query] 视频下载失败 HTTP ${resp.status}`);
          }
        } catch (downloadError) {
          console.error(`[jimeng-query] 视频下载错误:`, downloadError.message);
        }
        
        // 如果下载失败，至少返回原始URL（前端会显示错误）
        return res.json({ 
          ok: true, 
          data: { 
            ...data, 
            video_url: videoUrl, 
            gen_status: "completed",
            download_warning: "视频下载失败，使用原始URL（可能403 Forbidden）"
          } 
        });
      }
    }

    return res.json({ ok: true, data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "查询失败", detail: error.shortMessage || error.message });
  }
});

// ============================================================
//  Handle Jimeng Result（dreamina CLI JSON 结果解析）
// ============================================================
async function handleJimengResult(res, payload, outputDir, port, mediaType) {
  if (payload.ok === false) {
    return res.status(500).json({ ok: false, message: payload.error || "生成失败", details: payload.details });
  }
  const data = payload.data || payload;
  const submitId = data.submit_id || "";
  const genStatus = data.gen_status || data.status || "";
  if (genStatus === "fail") {
    return res.status(500).json({ ok: false, message: data.fail_reason || "任务失败", submitId });
  }

  const urlKey = mediaType === "video" ? "video_url" : "image_url";
  let mediaUrl = data[urlKey] || data.url || "";
  
  // 检查 result_json.videos[0].video_url（即梦API返回格式）
  if (!mediaUrl && data.result_json?.videos?.length > 0) {
    mediaUrl = data.result_json.videos[0][urlKey] || data.result_json.videos[0].url || "";
  }
  // 检查 result_json.images[0].image_url
  if (!mediaUrl && mediaType === "image" && data.result_json?.images?.length > 0) {
    mediaUrl = data.result_json.images[0].image_url || data.result_json.images[0].url || "";
  }
  
  if (!mediaUrl && data.result) {
    mediaUrl = data.result[urlKey] || data.result.url || "";
  }
  if (!mediaUrl && data.results?.length > 0) {
    mediaUrl = data.results[0][urlKey] || data.results[0].url || "";
  }

  // 支持 success 状态（即梦返回的成功状态）
  const isCompleted = ["completed", "done", "success"].includes(genStatus);
  
  if (!mediaUrl && submitId && !isCompleted && ["querying", "pending", "running"].includes(genStatus)) {
    return res.json({ ok: false, message: "任务仍在生成中", submitId, genStatus, platform: "native" });
  }

  if (mediaUrl) {
    const ext = mediaType === "video" ? ".mp4" : ".png";
    const filename = `jimeng_${mediaType}_${Date.now()}${ext}`;
    const localPath = path.join(outputDir, filename);
    let downloadedSuccessfully = false;
    let localMediaUrl = mediaUrl;
    
    try {
      console.log(`[jimeng] 开始下载 ${mediaType}: ${mediaUrl.substring(0, 100)}...`);
      const resp = await fetch(mediaUrl);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      console.log(`[jimeng] 下载完成，大小: ${buf.length} bytes`);
      await fs.writeFile(localPath, buf);
      localMediaUrl = `http://localhost:${port}/outputs/${encodeURIComponent(filename)}`;
      downloadedSuccessfully = true;
      console.log(`[jimeng] 文件保存到: ${localPath}, 本地URL: ${localMediaUrl}`);
    } catch (error) {
      console.error(`[jimeng] 下载失败:`, error.message);
      // 尝试添加referer和user-agent头重试
      console.log(`[jimeng] 尝试使用referer重试...`);
      try {
        const resp = await fetch(mediaUrl, {
          headers: {
            'Referer': 'https://jimeng.jianying.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          }
        });
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer());
          await fs.writeFile(localPath, buf);
          localMediaUrl = `http://localhost:${port}/outputs/${encodeURIComponent(filename)}`;
          downloadedSuccessfully = true;
          console.log(`[jimeng] 重试下载成功！`);
        } else {
          throw new Error(`重试也失败: HTTP ${resp.status}`);
        }
      } catch (retryError) {
        console.error(`[jimeng] 重试也失败:`, retryError.message);
        // 如果下载失败，我们不能返回不可用的CDN URL
        return res.status(500).json({ 
          ok: false, 
          message: `视频下载失败: ${error.message}. 即梦CDN拒绝了访问(403 Forbidden).`,
          detail: 'CDN视频URL有访问限制，无法直接在前端播放。',
          mediaUrl: mediaUrl, // 仅供调试
          downloadFailed: true
        });
      }
    }

    // 只有下载成功才返回本地URL
    if (downloadedSuccessfully) {
      return res.json({ ok: true, [`${mediaType}Url`]: localMediaUrl, filename, submitId, originalUrl: mediaUrl });
    }
  }

  return res.status(500).json({ ok: false, message: "未找到生成结果", data: payload });
}

// ============================================================
//  Handle OpenCLI Image Result（opencli jimeng generate JSON 解析）
// ============================================================
async function handleOpencliImageResult(res, result, outputDir, port, returnAsVideo = false) {
  const stdout = (result.stdout || "").trim();
  let imageUrl = "";
  let status = "";

  try {
    const parsed = JSON.parse(stdout);
    if (parsed.image_urls?.length > 0) {
      imageUrl = parsed.image_urls[0];
    } else if (parsed.image_url) {
      imageUrl = parsed.image_url;
    }
    status = parsed.status || "";
  } catch {
    const urlMatch = stdout.match(/https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|webp)/i);
    if (urlMatch) imageUrl = urlMatch[0];
  }

  if (!imageUrl) {
    return res.status(500).json({
      ok: false,
      message: "OpenCLI 未返回图片 URL",
      stdout,
    });
  }

  const ext = returnAsVideo ? ".mp4" : ".png";
  const filename = `jimeng_${returnAsVideo ? 'video' : 'image'}_${Date.now()}${ext}`;
  const localPath = path.join(outputDir, filename);
  try {
    const resp = await fetch(imageUrl);
    const buf = Buffer.from(await resp.arrayBuffer());
    await fs.writeFile(localPath, buf);
    imageUrl = `http://localhost:${port}/outputs/${encodeURIComponent(filename)}`;
  } catch { /* 回退 */ }

  if (returnAsVideo) {
    return res.json({ ok: true, videoUrl: imageUrl, filename, status });
  }
  return res.json({ ok: true, imageUrl, filename, status });
}

// ============================================================
//  OpenCLI args for opencli jimeng generate
// ============================================================
function buildOpencliImageArgs(params) {
  const args = ["jimeng", "generate", params.prompt, "-f", "json"];
  if (params.wait) args.push("--wait", String(params.wait));
  if (params.model) {
    const m = mapOpencliModel(params.model);
    if (m) args.push("--model", m);
  }
  args.push("--site-session", "persistent");
  args.push("--window", "background");
  return args;
}

function mapOpencliModel(model) {
  const m = (model || "").toLowerCase();
  if (m.includes("5.0")) return "high_aes_general_v50";
  if (m.includes("4.6")) return "high_aes_general_v42";
  if (m.includes("4.0")) return "high_aes_general_v40";
  return "high_aes_general_v50";
}

// ============================================================
//  Dreamina CLI args（macOS/Linux 原生）
// ============================================================
function buildDreaminaVideoArgs(params) {
  const hasImage = Boolean(params.imageUrl);
  const command = hasImage ? "image2video" : "text2video";
  const args = [command, `--prompt=${params.prompt}`];
  if (hasImage) args.push("--image", params.imageUrl);
  if (params.duration) args.push("--duration", String(params.duration));
  if (params.ratio) args.push("--ratio", String(params.ratio));
  
  // 调试：记录模型映射过程
  const originalModel = params.model;
  const mappedModel = mapDreaminaVideoModel(originalModel);
  console.log('[buildDreaminaVideoArgs] 模型映射:', {
    original: originalModel,
    mapped: mappedModel,
    hasImage,
    command
  });
  
  if (mappedModel) args.push("--model_version", mappedModel);
  args.push("--video_resolution", "720p");
  args.push("--poll", "180");
  
  console.log('[buildDreaminaVideoArgs] 最终参数:', args);
  return args;
}

function buildDreaminaImageArgs(params) {
  const hasImage = Boolean(params.imageUrl);
  const command = hasImage ? "image2image" : "text2image";
  const args = [command, `--prompt=${params.prompt}`];
  if (hasImage) {
    // 如果是 base64 data URL，需要先保存到临时文件
    if (params.imageUrl.startsWith('data:')) {
      // 延迟到运行时通过 execJimengWithImage 回调处理
      args.push("--images", params.imageUrl); // 临时标记，会在 exec 时转换
    } else {
      args.push("--images", params.imageUrl);
    }
  }
  if (params.ratio) args.push("--ratio", String(params.ratio));
  args.push("--resolution_type", params.resolution || "2k");
  const model = mapDreaminaImageModel(params.model);
  if (model) args.push("--model_version", model);
  args.push("--poll", "120");
  return args;
}

function mapDreaminaVideoModel(model) {
  const raw = String(model || "").trim().toLowerCase();
  const normalized = raw.replace(/[\s_]/g, "-");
  
  // 调试日志
  console.log('[mapDreaminaVideoModel] 输入处理:', {
    original: model,
    raw: raw,
    normalized: normalized
  });

  // 精确映射（避免 includes 串匹配导致 fast-vip 被映射成 2.0-vip）
  const exactMap = {
    "jimeng-seedance2.0fast-vip": "seedance2.0fast_vip",
    "jimeng-seedance2.0-vip": "seedance2.0_vip",
    "jimeng-seedance2.0fast": "seedance2.0fast",
    "jimeng-seedance2.0": "seedance2.0",
    "jimeng-seedance1.5pro": "1.5pro",
    "seedance2.0fast-vip": "seedance2.0fast_vip",
    "seedance2.0-vip": "seedance2.0_vip",
    "seedance2.0fast": "seedance2.0fast",
    "seedance2.0": "seedance2.0",
    "1.5pro": "1.5pro",
  };
  
  if (exactMap[normalized]) {
    console.log('[mapDreaminaVideoModel] 精确匹配:', {
      normalized: normalized,
      mappedTo: exactMap[normalized]
    });
    return exactMap[normalized];
  } else {
    console.log('[mapDreaminaVideoModel] 未找到精确匹配:', normalized);
  }

  // 兼容旧值
  if (normalized === "jimeng-video-v3" || normalized === "jimeng-image-to-video") {
    console.log('[mapDreaminaVideoModel] 兼容旧值匹配 -> seedance2.0fast');
    return "seedance2.0fast";
  }

  // 容错（未知格式时的保守判断）
  if (normalized.includes("1.5")) {
    console.log('[mapDreaminaVideoModel] 容错匹配 1.5 -> 1.5pro');
    return "1.5pro";
  }
  if (normalized.includes("fast") && normalized.includes("vip")) {
    console.log('[mapDreaminaVideoModel] 容错匹配 fast+vip -> seedance2.0fast_vip');
    return "seedance2.0fast_vip";
  }
  if (normalized.includes("vip")) {
    console.log('[mapDreaminaVideoModel] 容错匹配 vip -> seedance2.0_vip');
    return "seedance2.0_vip";
  }
  if (normalized.includes("fast")) {
    console.log('[mapDreaminaVideoModel] 容错匹配 fast -> seedance2.0fast');
    return "seedance2.0fast";
  }
  if (normalized.includes("seedance2.0")) {
    console.log('[mapDreaminaVideoModel] 容错匹配 seedance2.0 -> seedance2.0');
    return "seedance2.0";
  }

  console.log('[mapDreaminaVideoModel] 默认返回 -> seedance2.0fast');
  return "seedance2.0fast";
}

function mapDreaminaImageModel(model) {
  const m = (model || "").toLowerCase();
  if (m.includes("5.0")) return "5.0";
  if (m.includes("4.6")) return "4.6";
  if (m.includes("4.5")) return "4.5";
  if (m.includes("4.1")) return "4.1";
  if (m.includes("4.0")) return "4.0";
  if (m.includes("3.1")) return "3.1";
  return "5.0";
}

// 在服务启动前检测 WSL dreamina 可用性
console.log("[detect] Checking WSL dreamina...");
const HAS_WSL_DREAMINA = await detectWslDreamina();
console.log("[detect] HAS_WSL_DREAMINA =", HAS_WSL_DREAMINA);

app.listen(PORT, () => {
  console.log(`Jimeng local server running: http://localhost:${PORT} [platform: ${process.platform}, cli: ${HAS_WSL_DREAMINA ? "dreamina" : "opencli"}]`);
});
