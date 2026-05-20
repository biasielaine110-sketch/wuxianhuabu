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
const IS_WINDOWS = process.platform === "win32";

function resolveOpencliCommand() {
  if (process.env.OPENCLI_CMD) return process.env.OPENCLI_CMD;
  if (!IS_WINDOWS) return "opencli";

  const npmOpencliCmd = process.env.APPDATA
    ? path.join(process.env.APPDATA, "npm", "opencli.cmd")
    : "";
  return npmOpencliCmd || "opencli.cmd";
}

// ============================================================
//  鐜妫€娴?//  macOS/Linux 鈫?dreamina CLI锛堝師鐢?CLI锛?//  Windows      鈫?wsl dreamina CLI锛堥€氳繃 WSL 璋冪敤锛?// ============================================================
const DREAMINA_CMD = process.env.DREAMINA_CMD || "dreamina";
const OPENCLI_CMD = resolveOpencliCommand();

// WSL 发行版名称
const WSL_DISTRO = process.env.WSL_DISTRO || "Ubuntu";
const WSL_DREAMINA_USER = process.env.WSL_DREAMINA_USER || "root";

// Windows 涓?wsl.exe 鐨勫畬鏁磋矾寰?
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
    // 鐩存帴鐢ㄥ畬鏁磋矾寰勮皟鐢紝閬垮厤 $PATH 琚?Windows 鐜鍙橀噺姹℃煋
    const r = await execa(WSL_EXE, ["-d", WSL_DISTRO, "-u", WSL_DREAMINA_USER, "--", "bash", "-lc", "/root/.local/bin/dreamina --version"], { timeout: 30000 });
    hasWslDreamina = r.exitCode === 0;
  } catch {
    hasWslDreamina = false;
  }
  return hasWslDreamina;
}

// 鏄惁浼樺厛浣跨敤 dreamina CLI锛坢acOS/Linux 鍘熺敓 鎴?Windows 涓婇€氳繃 WSL锛?
async function canUseDreaminaCli() {
  if (!IS_WINDOWS) return true;
  return await detectWslDreamina();
}

// ============================================================
//  Helper锛氭墽琛屽嵆姊?CLI 鍛戒护
//  macOS/Linux 鈫?dreamina 鐩存帴璋冪敤
//  Windows     鈫?wsl -d Ubuntu -- bash -l -c "... dreamina ..."
// ============================================================
function buildWslCmd(args) {
  // 浣跨敤瀹屾暣璺緞閬垮厤 Windows PATH 鐜鍙橀噺骞叉壈
  const cmdStr = `/root/.local/bin/dreamina ${args.map(a => {
    if (typeof a !== "string") return String(a);
    // 瀵逛簬鍖呭惈绌烘牸鎴栫壒娈婂瓧绗︾殑鍙傛暟锛岀敤寮曞彿鍖呰９
    if (a.includes("'") || a.includes(" ") || a.includes("$") || a.includes("\\") || a.includes('"')) {
      // 鍏堣浆涔夊崟寮曞彿锛岀劧鍚庡寘瑁瑰湪鍗曞紩鍙蜂腑
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
  // Windows 涓婇€氳繃 WSL 璋冪敤 dreamina CLI
  // 闇€瑕佸皢鎵€鏈夊弬鏁板悎骞舵垚涓€涓懡浠ゅ瓧绗︿覆浼犻€掔粰 bash -c
  const cmdStr = buildWslCmd(args);
  const scriptCmd = `script -q -c '${cmdStr.replace(/'/g, "'\\''")}' /dev/null`;
  return execa(WSL_EXE, ["-d", WSL_DISTRO, "-u", WSL_DREAMINA_USER, "--", "bash", "-c", scriptCmd], options);
}

async function execWslDreamina(args, options = {}) {
  // 使用 script 命令分配伪终端，解决 dreamina 需要 TTY 的问题
  const cmdStr = buildWslCmd(args);
  const scriptCmd = `script -q -c '${cmdStr.replace(/'/g, "'\\''")}' /dev/null`;
  return execa(WSL_EXE, ["-d", WSL_DISTRO, "-u", WSL_DREAMINA_USER, "--", "bash", "-c", scriptCmd], options);
}

async function checkOpencliJimengLogin(timeout = 5000) {
  try {
    const r = await execa(
      OPENCLI_CMD,
      ["jimeng", "--help", "-f", "json"],
      { timeout }
    );
    const data = r.stdout ? JSON.parse(r.stdout) : {};
    return {
      ok: true,
      loggedIn: true,
      data: {
        session: "persistent-browser-session",
        verified: false,
        reason: "opencli browser commands can block while waiting for login; generation will use the persistent browser session.",
        commands: data.commands?.map(c => c.name),
      },
      platform: "opencli-windows",
    };
  } catch (error) {
    return {
      ok: true,
      loggedIn: false,
      platform: "opencli-windows",
      message: "login_required",
      detail: error.shortMessage || error.message,
      stdout: error.stdout,
      stderr: error.stderr,
    };
  }
}

async function checkDreaminaLogin(options = {}) {
  const timeout = options.timeout ?? 15000;

  if (IS_WINDOWS && typeof HAS_WSL_DREAMINA !== "undefined" && !HAS_WSL_DREAMINA) {
    return {
      ok: true,
      loggedIn: false,
      platform: "wsl-dreamina",
      message: "dreamina_cli_unavailable",
      detail: `WSL dreamina not available or not logged in. Run: wsl -d Ubuntu -- bash -lc "/root/.local/bin/dreamina user_credit" to diagnose.`,
    };
  }

  try {
    const r = await execJimeng(["user_credit"], { timeout });
    const data = JSON.parse(r.stdout);
    const loggedIn = data.total_credit !== undefined || data.ok === true || data.credit !== undefined || data.credits !== undefined;
    return {
      ok: true,
      loggedIn,
      data,
      platform: IS_WINDOWS ? "wsl-dreamina" : "native",
    };
  } catch (error) {
    return {
      ok: true,
      loggedIn: false,
      platform: IS_WINDOWS ? "wsl-dreamina" : "native",
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
    text.includes("not logged in") ||
    text.includes("unauthorized") ||
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
    // Windows WSL 涓嶅彲鐢ㄦ椂锛屽洖閫€妫€鏌?opencli
    try {
      const r = await execa(OPENCLI_CMD, ["jimeng", "--help", "-f", "json"], { timeout: 8000 });
      const data = r.stdout ? JSON.parse(r.stdout) : {};
      return res.json({
        ok: true,
        cli: "opencli",
        version: data.version || "unknown",
        platform: "opencli-windows",
        commands: data.commands?.map(c => c.name) || [],
      });
    } catch (opencliErr) {
      return res.status(503).json({
        ok: false,
        cli: "opencli",
        platform: "opencli-windows",
        message: "opencli not available: " + (opencliErr.shortMessage || opencliErr.message),
      });
    }
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: IS_WINDOWS
        ? "Dreamina CLI (WSL) 涓嶅彲鐢ㄣ€傝纭繚宸插畨瑁?WSL Ubuntu锛屽苟鍦?WSL 涓繍琛? curl -fsSL https://jimeng.jianying.com/cli | bash"
        : "Dreamina CLI 涓嶅彲鐢ㄣ€俶acOS/Linux 璇疯繍琛? curl -fsSL https://jimeng.jianying.com/cli | bash",
      detail: error.shortMessage || error.message,
    });
  }
});

// ============================================================
//  Session（检测是否已登录）
// ============================================================
app.get("/api/jimeng/session", async (_req, res) => {
  // 优先尝试 WSL dreamina
  if (IS_WINDOWS && HAS_WSL_DREAMINA) {
    try {
      const r = await execWslDreamina(["user_credit"], { timeout: 10000 });
      const data = JSON.parse(r.stdout);
      const loggedIn = data && (data.total_credit !== undefined || data.ok === true || data.credit !== undefined);
      return res.json({ ok: true, loggedIn, data, platform: "wsl-dreamina" });
    } catch (wslErr) {
      // WSL dreamina 失败，继续尝试 opencli
      console.log('[session] WSL dreamina failed, trying opencli:', wslErr.shortMessage || wslErr.message);
    }
  }
  // opencli 降级
  try {
    const r = await execa(OPENCLI_CMD, ["jimeng", "history", "-f", "json", "--site-session", "persistent", "--window", "background"], { timeout: 10000 });
    const data = JSON.parse(r.stdout);
    return res.json({ ok: true, loggedIn: true, data, platform: "opencli" });
  } catch (error) {
    return res.json({ ok: true, loggedIn: false, detail: error.shortMessage || error.message, platform: "none" });
  }
});

// ============================================================
//  Login Start锛堣幏鍙?OAuth 璁惧鐮侊級
// ============================================================
app.post("/api/jimeng/login/start", async (_req, res) => {
  try {
    if (!IS_WINDOWS || HAS_WSL_DREAMINA) {
      // 鑾峰彇 OAuth device code
      const r = await execWslDreamina(["login", "--headless"], { timeout: 10000 });
      const output = r.stdout + r.stderr;

      // 瑙ｆ瀽杈撳嚭鑾峰彇 verification_uri, user_code, device_code
      const verificationMatch = output.match(/verification_uri:\s*(.+)/i);
      const userCodeMatch = output.match(/user_code:\s*([a-f0-9]+)/i);
      const deviceCodeMatch = output.match(/device_code:\s*([a-f0-9]+)/i);

      const verificationUri = verificationMatch ? verificationMatch[1].trim() : "https://jimeng.jianying.com/ai-tool/cli-auth";
      const userCode = userCodeMatch ? userCodeMatch[1].trim() : "";
      const deviceCode = deviceCodeMatch ? deviceCodeMatch[1].trim() : "";

      // 淇濆瓨 device_code 鐢ㄤ簬鍚庣画杞
      if (deviceCode) {
        loginDeviceCodes.set(deviceCode, { userCode, expires: Date.now() + 5 * 60 * 1000 });
      }

      return res.json({
        ok: true,
        message: "璇蜂娇鐢ㄦ姈闊?App 鎵爜鐧诲綍",
        verificationUrl: verificationUri,
        userCode: userCode,
        deviceCode: deviceCode,
        platform: "wsl-dreamina",
      });
    }

    return res.status(503).json({
      ok: false,
      message: "Dreamina CLI (WSL) is not available. Install WSL Ubuntu and run dreamina login first.",
      platform: "wsl-dreamina",
    });

    // 鍥為€€锛氳繑鍥為粯璁ょ櫥褰曢〉闈?
    res.json({
      ok: true,
      message: "璇锋壂鐮佹垨鎵撳紑閾炬帴鐧诲綍鍗虫ⅵ",
      verificationUrl: "https://jimeng.jianying.com/ai-tool/login",
      userCode: "",
      platform: IS_WINDOWS && !HAS_WSL_DREAMINA ? "opencli-windows" : "native",
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "获取登录码失败",
      detail: error.shortMessage || error.message,
    });
  }
});

// 淇濆瓨鐧诲綍 device_code 鐢ㄤ簬杞
const loginDeviceCodes = new Map();

// ============================================================
//  Login Screenshot锛圵SL 妯″紡涓嶉渶瑕佹埅鍥撅級
// ============================================================
app.get("/api/jimeng/login/screenshot", async (_req, res) => {
  res.json({ ok: true, message: "请查看终端输出或浏览器窗口完成登录" });
});

// ============================================================
//  Logout锛堝垏鎹㈣处鍙凤級
// ============================================================
app.post("/api/jimeng/logout", async (_req, res) => {
  try {
    if (!IS_WINDOWS || HAS_WSL_DREAMINA) {
      await execWslDreamina(["logout"], { timeout: 15000 });
      return res.json({ ok: true, message: "已退出登录" });
    }
    // Windows WSL 涓嶅彲鐢ㄦ椂鍥為€€ opencli
    await execa(OPENCLI_CMD, ["jimeng", "logout", "-f", "json"], { timeout: 15000 });
    return res.json({ ok: true, message: "已退出登录" });
  } catch (error) {
    res.json({ ok: true, loggedIn: false, detail: error.shortMessage || error.message });
  }
});

// ============================================================
//  Install opencli (Windows)
// ============================================================
app.post("/api/jimeng/install-opencli", async (_req, res) => {
  try {
    // Check if already installed
    try {
      const r = await execa(OPENCLI_CMD, ["--version"], { timeout: 5000 });
      return res.json({ ok: true, message: "opencli 已安装", version: r.stdout.trim(), alreadyInstalled: true });
    } catch {}

    // Install opencli
    const npmCmd = IS_WINDOWS ? "npm.cmd" : "npm";
    const r = await execa(npmCmd, ["install", "-g", "opencli"], { timeout: 120000 });
    return res.json({ ok: true, message: "opencli 安装成功", stdout: r.stdout, stderr: r.stderr });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "opencli 安装失败",
      detail: error.shortMessage || error.message,
      stderr: error.stderr,
    });
  }
});

// ============================================================
//  Setup Dreamina WSL Environment (Windows)
// ============================================================
app.post("/api/jimeng/setup-wsl", async (_req, res) => {
  if (!IS_WINDOWS) {
    return res.status(501).json({ ok: false, message: "仅支持 Windows 系统" });
  }

  try {
    const steps = [];

    // Step 1: Enable WSL
    steps.push("启用 WSL...");
    await execa("dism.exe", ["/online", "/enable-feature", "/featurename:Microsoft-Windows-Subsystem-Linux", "/all", "/norestart"], { timeout: 120000 });

    // Step 2: Enable Virtual Machine Platform
    steps.push("启用虚拟机平台...");
    await execa("dism.exe", ["/online", "/enable-feature", "/featurename:VirtualMachinePlatform", "/all", "/norestart"], { timeout: 120000 });

    // Step 3: Update WSL
    steps.push("更新 WSL...");
    await execa("wsl.exe", ["--update", "--web-download"], { timeout: 60000 });

    // Step 4: Install Ubuntu if not exists
    steps.push("安装 Ubuntu...");
    try {
      await execa("wsl.exe", ["--install", "-d", "Ubuntu", "--web-download"], { timeout: 180000 });
    } catch {}

    steps.push("安装 dreamina CLI...");
    const dreaminaInstall = 'set -e; curl -fsSL https://jimeng.jianying.com/cli | bash';
    await execa("wsl.exe", ["-d", "Ubuntu", "-u", "root", "--", "bash", "-lc", dreaminaInstall], { timeout: 120000 });

    steps.push("✅ 安装完成！请刷新页面并重新登录");
    return res.json({ ok: true, message: steps.join("\n"), steps });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "WSL 环境安装失败",
      detail: error.shortMessage || error.message,
    });
  }
});

// ============================================================
//  Re-login锛堥噸鏂扮櫥褰曪級
// ============================================================
app.post("/api/jimeng/relogin", async (_req, res) => {
  try {
    if (!IS_WINDOWS || HAS_WSL_DREAMINA) {
      await execWslDreamina(["relogin"], { timeout: 30000 });
      return res.json({ ok: true, message: "宸插彂璧烽噸鏂扮櫥褰曪紝璇峰埛鏂伴〉闈㈣幏鍙栨柊鐨勭櫥褰曠爜" });
    }
    await execa(OPENCLI_CMD, ["jimeng", "relogin", "-f", "json"], { timeout: 30000 });
    return res.json({ ok: true, message: "已发起重新登录" });
  } catch (error) {
    res.json({ ok: false, message: "閲嶆柊鐧诲綍澶辫触", detail: error.shortMessage || error.message });
  }
});

// ============================================================
//  Image Upscale锛堟櫤鑳借秴娓咃級
// ============================================================
app.post("/api/jimeng/image/upscale", async (req, res) => {
  const { imageUrl, scale = 2 } = req.body;
  if (!imageUrl) {
    return res.status(400).json({ ok: false, message: "缂哄皯 imageUrl 鍙傛暟" });
  }

  try {
    if (!IS_WINDOWS || HAS_WSL_DREAMINA) {
      // 涓嬭浇鍥剧墖鍒颁复鏃舵枃浠?
      let tempImageBuffer = null;
      if (imageUrl.startsWith('data:')) {
        const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');
        tempImageBuffer = Buffer.from(base64Data, 'base64');
      } else if (imageUrl.startsWith('blob:')) {
        // 支持 blob URL（来自 Canvas 等）
        try {
          const resp = await fetch(imageUrl);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          tempImageBuffer = Buffer.from(await resp.arrayBuffer());
        } catch (blobErr) {
          return res.status(400).json({ ok: false, message: "无法读取 blob 图片: " + (blobErr.message || "未知错误") });
        }
      } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        const resp = await fetch(imageUrl, { headers: { 'Referer': 'https://jimeng.jianying.com/' } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        tempImageBuffer = Buffer.from(await resp.arrayBuffer());
      }

      if (!tempImageBuffer) {
        return res.status(400).json({ ok: false, message: "图片格式无效或无法识别" });
      }

      const ext = imageUrl.includes('png') ? 'png' : 'jpg';
      const imageFilePath = path.join(OUTPUT_DIR, `upscale_input_${Date.now()}.${ext}`);
      await fs.writeFile(imageFilePath, tempImageBuffer);

      // Windows WSL 鐜闇€瑕佽浆鎹负 /mnt/d/... 璺緞鏍煎紡
      let wslPath = imageFilePath;
      if (IS_WINDOWS) {
        wslPath = imageFilePath.replace(/^([A-Z]):/, (match, letter) => `/mnt/${letter.toLowerCase()}`).replace(/\\/g, '/');
      }

      // 调用 image_upscale 命令
      // scale: 2 -> 2k, 4 -> 4k, 8 -> 8k
      const resolutionMap = { 2: "2k", 4: "4k", 8: "8k" };
      const resolutionType = resolutionMap[scale] || "2k";
      const args = ["image_upscale", `--image=${wslPath}`, `--resolution_type=${resolutionType}`, "--poll", "120"];
      const result = await execJimeng(args, { timeout: 300000 });

      // 娓呯悊涓存椂鏂囦欢
      try { await fs.unlink(imageFilePath); } catch {}

      const payload = JSON.parse(result.stdout);
      return handleJimengResult(res, payload, OUTPUT_DIR, PORT, "image");
    }

    return res.status(503).json({ ok: false, message: "opencli 模式暂不支持智能超清，请在 WSL 环境下使用此功能" });


  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "鏅鸿兘瓒呮竻澶辫触",
      detail: error.shortMessage || error.message,
      stderr: error.stderr,
    });
  }
});

// ============================================================
//  Login Status（轮询 OAuth 完成状态）
// ============================================================
app.get("/api/jimeng/login/status", async (_req, res) => {
  try {
    // 使用 login checklogin 验证 OAuth 是否真正完成
    if (IS_WINDOWS && HAS_WSL_DREAMINA) {
      // 通过 WSL 读取 token 文件检查是否有有效 access_token
      let hasToken = false;
      let tokenData = "";
      try {
        const { stdout } = await execa(WSL_EXE, ["-d", WSL_DISTRO, "-u", WSL_DREAMINA_USER, "--", "bash", "-c", "cat /root/.local/share/dreamina/byted_cli_user_token.json"]);
        tokenData = stdout;
        const token = JSON.parse(stdout);
        // 有 access_token 说明 OAuth 已完成
        hasToken = !!(token.access_token && token.token_expires_at && token.token_expires_at !== "0001-01-01T00:00:00Z");
      } catch {}

      if (!hasToken) {
        return res.json({ ok: true, loggedIn: false, detail: "未完成 OAuth 授权" });
      }

      // 用 user_credit 验证登录（需要 TTY）
      const r = await execWslDreamina(["user_credit"], { timeout: 15000 });
      const output = r.stdout + r.stderr;
      let data = {};
      try {
        data = JSON.parse(r.stdout);
      } catch {}
      const loggedIn = data && (data.total_credit !== undefined || data.ok === true);
      return res.json({ ok: true, loggedIn, data });
    }
    // opencli 模式
    const r = await execa(OPENCLI_CMD, ["jimeng", "history", "-f", "json", "--site-session", "persistent", "--window", "background"], { timeout: 10000 });
    const data = JSON.parse(r.stdout);
    return res.json({ ok: true, loggedIn: true, data });
  } catch (error) {
    return res.json({ ok: true, loggedIn: false, detail: error.shortMessage || error.message });
  }
});

// ============================================================
//  Image Generate锛堟枃鐢熷浘 / 鍥剧敓鍥撅級
// ============================================================
app.post("/api/jimeng/image/generate", async (req, res) => {
  const params = req.body;
  if (!params.prompt || typeof params.prompt !== "string") {
    return res.status(400).json({ ok: false, message: "缂哄皯 prompt" });
  }

  try {
    if (!IS_WINDOWS || HAS_WSL_DREAMINA) {
      // dreamina text2image / image2image (閫氳繃 WSL 鎴栧師鐢?
      const session = await checkDreaminaLogin();
      if (!session.loggedIn) {
        return sendDreaminaLoginRequired(res, session);
      }

      // 澶勭悊鍥剧墖锛氬鏋滄槸 base64 鎴?HTTP URL锛岄兘涓嬭浇/淇濆瓨鍒颁复鏃舵枃浠?
      let imageFilePath = params.imageUrl;
      if (params.imageUrl) {
        try {
          let tempImageBuffer = null;
          // 濡傛灉鏄?base64
          if (params.imageUrl.startsWith('data:')) {
            const base64Data = params.imageUrl.replace(/^data:image\/\w+;base64,/, '');
            tempImageBuffer = Buffer.from(base64Data, 'base64');
          }
          // 濡傛灉鏄?HTTP URL锛屼笅杞藉埌鏈湴
          else if (params.imageUrl.startsWith('http://') || params.imageUrl.startsWith('https://')) {
            console.log(`[jimeng-image] 涓嬭浇鍙傝€冨浘鐗? ${params.imageUrl.substring(0, 80)}...`);
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
            console.log(`[jimeng-image] 涓存椂鍥剧墖淇濆瓨鍒? ${imageFilePath}`);
            // Windows WSL 鐜闇€瑕佽浆鎹负 /mnt/d/... 璺緞鏍煎紡
            if (IS_WINDOWS) {
              imageFilePath = imageFilePath.replace(/^([A-Z]):/, (match, letter) => `/mnt/${letter.toLowerCase()}`).replace(/\\/g, '/');
              console.log(`[jimeng-image] WSL 璺緞: ${imageFilePath}`);
            }
          }
        } catch (err) {
          return res.status(500).json({ ok: false, message: "澶勭悊杈撳叆鍥剧墖澶辫触", detail: err.message });
        }
      }

      const args = buildDreaminaImageArgs({ ...params, imageUrl: imageFilePath });
      const result = await execJimeng(args, { timeout: 240000 });

      // 娓呯悊涓存椂鏂囦欢
      if (imageFilePath && imageFilePath.includes('temp_input_')) {
        try {
          await fs.unlink(imageFilePath);
          console.log(`[jimeng-image] 涓存椂鏂囦欢宸插垹闄? ${imageFilePath}`);
        } catch {}
      }

      const payload = JSON.parse(result.stdout);
      return handleJimengResult(res, payload, OUTPUT_DIR, PORT, "image");
    }

    if (IS_WINDOWS && !HAS_WSL_DREAMINA) {
      return res.status(503).json({
        ok: false,
        message: "Dreamina CLI (WSL) is not available. Install WSL Ubuntu and /root/.local/bin/dreamina first.",
        platform: "wsl-dreamina",
      });
    }

    // Windows WSL 涓嶅彲鐢ㄦ椂鍥為€€ opencli
    const cmdArgs = buildOpencliImageArgs(params);
    const result = await execa(OPENCLI_CMD, cmdArgs, { timeout: 180000 });
    return handleOpencliImageResult(res, result, OUTPUT_DIR, PORT);
  } catch (error) {
    const stderr = error.stderr || "";
    const stdout = error.stdout || "";
    const loginRequired = isDreaminaLoginError(error);
    const browserBridgeMissing = [stdout, stderr, error.shortMessage, error.message]
      .filter(Boolean)
      .join("\n")
      .includes("BROWSER_CONNECT");
    if (loginRequired) {
      return sendDreaminaLoginRequired(res, {
        detail: error.shortMessage || error.message,
        stdout,
        stderr,
      });
    }
    return res.status(500).json({
      ok: false,
      message: loginRequired ? "即梦登录已过期，请重新登录" : "即梦图片生成失败",
      detail: error.shortMessage || error.message,
      stdout,
      stderr,
      loginRequired,
      browserBridgeMissing,
    });
  }
});

// ============================================================
//  Video Generate锛堟枃鐢熻棰?/ 鍥剧敓瑙嗛锛?
// ============================================================
app.post("/api/jimeng/video/generate", async (req, res) => {
  const params = req.body;
  console.log('[jimeng-video-generate] 鏀跺埌璇锋眰鍙傛暟:', JSON.stringify({
    model: params.model,
    videoMode: params.videoMode,
    promptLength: params.prompt?.length,
    hasImage: !!params.imageUrl,
    duration: params.duration,
    ratio: params.ratio
  }, null, 2));

  if (!params.prompt || typeof params.prompt !== "string") {
    return res.status(400).json({ ok: false, message: "缂哄皯 prompt" });
  }

  // 澶勭悊鍙傝€冨浘鐗囷細濡傛灉鏄?HTTP URL锛岄渶瑕佸厛涓嬭浇鍒版湰鍦颁复鏃舵枃浠?
  // 鏀寔鍗曚釜 imageUrl 鍜屽涓?images锛堢敤浜庡叏鑳藉弬鑰冦€佹櫤鑳藉甯х瓑锛?
  let imageFilePath = params.imageUrl;
  const imageFilePaths = [];

  // 澶勭悊 params.images 鏁扮粍锛堢敤浜庡鍥炬ā寮忥級
  if (params.images && Array.isArray(params.images)) {
    for (const imgUrl of params.images) {
      if (!imgUrl) continue;
      try {
        let tempImageBuffer = null;
        if (imgUrl.startsWith('data:')) {
          const base64Data = imgUrl.replace(/^data:image\/\w+;base64,/, '');
          tempImageBuffer = Buffer.from(base64Data, 'base64');
        } else if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
          console.log(`[jimeng-video] 涓嬭浇鍙傝€冨浘鐗? ${imgUrl.substring(0, 80)}...`);
          const resp = await fetch(imgUrl, {
            headers: { 'Referer': 'https://jimeng.jianying.com/' }
          });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          tempImageBuffer = Buffer.from(await resp.arrayBuffer());
        }

        if (tempImageBuffer) {
          const ext = imgUrl.includes('png') ? 'png' : 'jpg';
          const tempPath = path.join(OUTPUT_DIR, `temp_video_input_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.${ext}`);
          await fs.writeFile(tempPath, tempImageBuffer);
          console.log(`[jimeng-video] 涓存椂鍥剧墖淇濆瓨鍒? ${tempPath}`);
          let wslPath = tempPath;
          if (IS_WINDOWS) {
            wslPath = tempPath.replace(/^([A-Z]):/, (match, letter) => `/mnt/${letter.toLowerCase()}`).replace(/\\/g, '/');
            console.log(`[jimeng-video] WSL 璺緞: ${wslPath}`);
          }
          imageFilePaths.push(wslPath);
        }
      } catch (err) {
        console.error(`[jimeng-video] 澶勭悊鍥剧墖澶辫触: ${err.message}`);
        // 缁х画澶勭悊鍏朵粬鍥剧墖
      }
      // 閬垮厤璇锋眰杩囧揩
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // 澶勭悊鍗曚釜 imageUrl
  if (params.imageUrl) {
    try {
      let tempImageBuffer = null;
      if (params.imageUrl.startsWith('data:')) {
        const base64Data = params.imageUrl.replace(/^data:image\/\w+;base64,/, '');
        tempImageBuffer = Buffer.from(base64Data, 'base64');
      } else if (params.imageUrl.startsWith('http://') || params.imageUrl.startsWith('https://')) {
        console.log(`[jimeng-video] 涓嬭浇鍙傝€冨浘鐗? ${params.imageUrl.substring(0, 80)}...`);
        const resp = await fetch(params.imageUrl, {
          headers: { 'Referer': 'https://jimeng.jianying.com/' }
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        tempImageBuffer = Buffer.from(await resp.arrayBuffer());
      }

      if (tempImageBuffer) {
        const ext = params.imageUrl.includes('png') ? 'png' : 'jpg';
        imageFilePath = path.join(OUTPUT_DIR, `temp_video_input_${Date.now()}.${ext}`);
        await fs.writeFile(imageFilePath, tempImageBuffer);
        console.log(`[jimeng-video] 涓存椂鍥剧墖淇濆瓨鍒? ${imageFilePath}`);
        if (IS_WINDOWS) {
          imageFilePath = imageFilePath.replace(/^([A-Z]):/, (match, letter) => `/mnt/${letter.toLowerCase()}`).replace(/\\/g, '/');
          console.log(`[jimeng-video] WSL 璺緞: ${imageFilePath}`);
        }
      }
    } catch (err) {
      return res.status(500).json({ ok: false, message: "澶勭悊杈撳叆鍥剧墖澶辫触", detail: err.message });
    }
  }

  if (IS_WINDOWS && !HAS_WSL_DREAMINA) {
    return res.status(503).json({
      ok: false,
      message: "Dreamina CLI (WSL) is not available. Install WSL Ubuntu and /root/.local/bin/dreamina first.",
      platform: "wsl-dreamina",
    });

    // Windows 涓?WSL dreamina 涓嶅彲鐢ㄦ椂鍥為€€涓?opencli 鐢熷浘
    try {
      const cmdArgs = buildOpencliImageArgs(params);
      const result = await execa(OPENCLI_CMD, cmdArgs, { timeout: 180000 });
      return handleOpencliImageResult(res, result, OUTPUT_DIR, PORT, true);
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: "Dreamina CLI (WSL) is not available. Install WSL Ubuntu and /root/.local/bin/dreamina first.",
        detail: error.shortMessage || error.message,
      });
    }
  }

  try {
    const session = await checkDreaminaLogin();
    if (!session.loggedIn) {
      return sendDreaminaLoginRequired(res, session);
    }
    
    // 璋冭瘯锛氳褰曟ā鍨嬫槧灏勮繃绋?
    console.log('[jimeng-video-generate] 鍘熷妯″瀷鍙傛暟:', params.model);
    const args = buildDreaminaVideoArgs({ ...params, imageUrl: imageFilePath, images: imageFilePaths });
    console.log('[jimeng-video-generate] 鏋勫缓鐨勫懡浠よ鍙傛暟:', args);

    const result = await execJimeng(args, { timeout: 300000 });

    // 娓呯悊鎵€鏈変复鏃舵枃浠?
    const allTempFiles = [imageFilePath, ...imageFilePaths];
    for (const tempFile of allTempFiles) {
      if (tempFile && tempFile.includes('temp_video_input_')) {
        try {
          await fs.unlink(tempFile);
          console.log(`[jimeng-video] 涓存椂鏂囦欢宸插垹闄? ${tempFile}`);
        } catch {}
      }
    }

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
  if (!submitId) return res.status(400).json({ ok: false, message: "缂哄皯 submitId" });
  try {
    const r = await execJimeng(["query_result", "--submit_id", submitId], { timeout: 30000 });
    const payload = JSON.parse(r.stdout);
    const data = payload.data || payload;

    // 濡傛灉宸插畬鎴愪笖鍖呭惈 URL锛屼笅杞藉埌鏈湴骞惰繑鍥炴湰鍦癠RL
    const genStatus = data.gen_status || data.status || "";
    if (genStatus === "completed" || genStatus === "done" || genStatus === "success") {
      let videoUrl = data.video_url || data.url || "";
      const results = data.results || [];
      if (!videoUrl) {
        videoUrl = (results[0]?.video_url) || (results[0]?.url) || "";
      }
      
      // 妫€鏌?result_json.videos[0].video_url锛堝嵆姊PI杩斿洖鏍煎紡锛?
      if (!videoUrl && data.result_json?.videos?.length > 0) {
        videoUrl = data.result_json.videos[0].video_url || data.result_json.videos[0].url || "";
      }
      
      if (videoUrl) {
        // 灏濊瘯涓嬭浇瑙嗛鍒版湰鍦?
        try {
          const ext = ".mp4";
          const filename = `jimeng_video_${Date.now()}${ext}`;
          const localPath = path.join(OUTPUT_DIR, filename);
          
          console.log(`[jimeng-query] 涓嬭浇瑙嗛: ${videoUrl.substring(0, 100)}...`);
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
            console.log(`[jimeng-query] 瑙嗛涓嬭浇鎴愬姛: ${localVideoUrl}`);
            
            return res.json({ 
              ok: true, 
              data: { 
                ...data, 
                video_url: localVideoUrl, 
                original_video_url: videoUrl, // 淇濆瓨鍘熷URL鐢ㄤ簬璋冭瘯
                gen_status: "completed" 
              } 
            });
          } else {
            console.warn(`[jimeng-query] 瑙嗛涓嬭浇澶辫触 HTTP ${resp.status}`);
          }
        } catch (downloadError) {
          console.error(`[jimeng-query] 瑙嗛涓嬭浇閿欒:`, downloadError.message);
        }
        
        // 濡傛灉涓嬭浇澶辫触锛岃嚦灏戣繑鍥炲師濮婾RL锛堝墠绔細鏄剧ず閿欒锛?
        return res.json({ 
          ok: true, 
          data: { 
            ...data, 
            video_url: videoUrl, 
            gen_status: "completed",
            download_warning: "视频下载失败，使用原始 URL",
          } 
        });
      }
    }

    return res.json({ ok: true, data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "鏌ヨ澶辫触", detail: error.shortMessage || error.message });
  }
});

// ============================================================
//  Handle Jimeng Result锛坉reamina CLI JSON 缁撴灉瑙ｆ瀽锛?
// ============================================================
async function handleJimengResult(res, payload, outputDir, port, mediaType) {
  if (payload.ok === false) {
    return res.status(500).json({ ok: false, message: payload.error || "鐢熸垚澶辫触", details: payload.details });
  }
  const data = payload.data || payload;
  const submitId = data.submit_id || "";
  const genStatus = data.gen_status || data.status || "";
  if (genStatus === "fail") {
    return res.status(500).json({ ok: false, message: data.fail_reason || "浠诲姟澶辫触", submitId });
  }

  const urlKey = mediaType === "video" ? "video_url" : "image_url";
  let mediaUrl = data[urlKey] || data.url || "";
  
  // 妫€鏌?result_json.videos[0].video_url锛堝嵆姊PI杩斿洖鏍煎紡锛?
  if (!mediaUrl && data.result_json?.videos?.length > 0) {
    mediaUrl = data.result_json.videos[0][urlKey] || data.result_json.videos[0].url || "";
  }
  // 妫€鏌?result_json.images锛堟敮鎸佸寮犲浘鐗囩敓鎴愶級
  const allImageUrls = [];
  if (mediaType === "image" && data.result_json?.images?.length > 0) {
    for (const img of data.result_json.images) {
      const url = img.image_url || img.url || "";
      if (url) allImageUrls.push(url);
    }
  }

  // 濡傛灉鏈夊寮犲浘鐗囷紝杩斿洖澶氬紶鍥剧墖鐨刄RLs
  if (allImageUrls.length > 1) {
    console.log(`[jimeng] detected ${allImageUrls.length} generated images`);
    const downloadedUrls = [];
    for (let i = 0; i < allImageUrls.length; i++) {
      const imgUrl = allImageUrls[i];
      const filename = `jimeng_${mediaType}_${Date.now()}_${i}.png`;
      const localPath = path.join(outputDir, filename);
      try {
        const resp = await fetch(imgUrl, {
          headers: { 'Referer': 'https://jimeng.jianying.com/' }
        });
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer());
          await fs.writeFile(localPath, buf);
          const localUrl = `http://localhost:${port}/outputs/${encodeURIComponent(filename)}`;
          downloadedUrls.push(localUrl);
          console.log(`[jimeng] 澶氬浘涓嬭浇鎴愬姛 ${i + 1}/${allImageUrls.length}: ${localUrl}`);
        }
      } catch (err) {
        console.error(`[jimeng] 澶氬浘涓嬭浇澶辫触 ${i}: ${err.message}`);
      }
    }
    if (downloadedUrls.length > 0) {
      return res.json({ ok: true, imageUrls: downloadedUrls, count: downloadedUrls.length, submitId });
    }
  }

  // 鍗曞紶鍥剧墖閫昏緫锛堝師鏈夐€昏緫锛?
  if (!mediaUrl && mediaType === "image" && data.result_json?.images?.length > 0) {
    mediaUrl = data.result_json.images[0].image_url || data.result_json.images[0].url || "";
  }
  
  if (!mediaUrl && data.result) {
    mediaUrl = data.result[urlKey] || data.result.url || "";
  }
  if (!mediaUrl && data.results?.length > 0) {
    mediaUrl = data.results[0][urlKey] || data.results[0].url || "";
  }

  // 鏀寔 success 鐘舵€侊紙鍗虫ⅵ杩斿洖鐨勬垚鍔熺姸鎬侊級
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
      console.log(`[jimeng] 寮€濮嬩笅杞?${mediaType}: ${mediaUrl.substring(0, 100)}...`);
      const resp = await fetch(mediaUrl);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      console.log(`[jimeng] 涓嬭浇瀹屾垚锛屽ぇ灏? ${buf.length} bytes`);
      await fs.writeFile(localPath, buf);
      localMediaUrl = `http://localhost:${port}/outputs/${encodeURIComponent(filename)}`;
      downloadedSuccessfully = true;
      console.log(`[jimeng] 鏂囦欢淇濆瓨鍒? ${localPath}, 鏈湴URL: ${localMediaUrl}`);
    } catch (error) {
      console.error(`[jimeng] 涓嬭浇澶辫触:`, error.message);
      // 灏濊瘯娣诲姞referer鍜寀ser-agent澶撮噸璇?
      console.log(`[jimeng] 灏濊瘯浣跨敤referer閲嶈瘯...`);
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
          console.log("[jimeng] retry download succeeded");
        } else {
          throw new Error(`閲嶈瘯涔熷け璐? HTTP ${resp.status}`);
        }
      } catch (retryError) {
        console.error(`[jimeng] 閲嶈瘯涔熷け璐?`, retryError.message);
        // 濡傛灉涓嬭浇澶辫触锛屾垜浠笉鑳借繑鍥炰笉鍙敤鐨凜DN URL
        return res.status(500).json({ 
          ok: false, 
          message: `瑙嗛涓嬭浇澶辫触: ${error.message}. 鍗虫ⅵCDN鎷掔粷浜嗚闂?403 Forbidden).`,
          detail: "CDN URL has access restrictions and cannot be played directly in the frontend.",
          mediaUrl: mediaUrl, // 浠呬緵璋冭瘯
          downloadFailed: true
        });
      }
    }

    // 鍙湁涓嬭浇鎴愬姛鎵嶈繑鍥炴湰鍦癠RL
    if (downloadedSuccessfully) {
      return res.json({ ok: true, [`${mediaType}Url`]: localMediaUrl, filename, submitId, originalUrl: mediaUrl });
    }
  }

  return res.status(500).json({ ok: false, message: "未找到生成结果", data: payload });
}

// ============================================================
//  Handle OpenCLI Image Result锛坥pencli jimeng generate JSON 瑙ｆ瀽锛?
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
      message: "OpenCLI 鏈繑鍥炲浘鐗?URL",
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
  } catch { /* 鍥為€€ */ }

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
//  Dreamina CLI args锛坢acOS/Linux 鍘熺敓锛?
// ============================================================
function buildDreaminaVideoArgs(params) {
  const videoMode = params.videoMode || 'image2video';
  const hasImage = Boolean(params.imageUrl);

  // 鏍规嵁 videoMode 閫夋嫨鍛戒护
  let command;
  switch (videoMode) {
    case 'frames2video':
      command = 'frames2video';
      break;
    case 'multiframe2video':
      command = 'multiframe2video';
      break;
    case 'multimodal2video':
      command = 'multimodal2video';
      break;
    case 'image2video':
    default:
      command = hasImage ? 'image2video' : 'text2video';
      break;
  }

  const args = [command];

  // 鏍规嵁涓嶅悓鍛戒护娣诲姞鍙傛暟
  if (videoMode === 'frames2video') {
    // 棣栧熬甯фā寮? --first, --last, --prompt
    args.push(`--first=${params.firstImage || ''}`);
    args.push(`--last=${params.lastImage || ''}`);
    args.push(`--prompt=${params.prompt}`);
  } else if (videoMode === 'multiframe2video') {
    // 鏅鸿兘澶氬抚妯″紡: --images (澶氫釜), --prompt 鎴?--transition-prompt
    if (params.images && Array.isArray(params.images)) {
      params.images.forEach(img => args.push('--images', img));
    } else if (hasImage) {
      args.push('--images', params.imageUrl);
    }
    args.push(`--prompt=${params.prompt}`);
  } else if (videoMode === 'multimodal2video') {
    // 鍏ㄨ兘鍙傝€冩ā寮? --image(s), --prompt
    if (params.images && Array.isArray(params.images)) {
      params.images.forEach(img => args.push('--image', img));
    } else if (hasImage) {
      args.push('--image', params.imageUrl);
    }
    if (params.audio) args.push('--audio', params.audio);
    args.push(`--prompt=${params.prompt}`);
  } else {
    // 鍥剧敓瑙嗛/鏂囩敓瑙嗛
    args.push(`--prompt=${params.prompt}`);
    if (hasImage) args.push('--image', params.imageUrl);
  }

  if (params.duration) args.push('--duration', String(params.duration));
  if (params.ratio && videoMode !== 'image2video') args.push('--ratio', String(params.ratio));

  // 璋冭瘯锛氳褰曟ā鍨嬫槧灏勮繃绋?
  const originalModel = params.model;
  const mappedModel = mapDreaminaVideoModel(originalModel);
  console.log('[buildDreaminaVideoArgs] 妯″瀷鏄犲皠:', {
    original: originalModel,
    mapped: mappedModel,
    videoMode,
    command
  });

  if (mappedModel) args.push('--model_version', mappedModel);
  args.push('--video_resolution', '720p');
  args.push('--poll', '180');

  console.log('[buildDreaminaVideoArgs] 鏈€缁堝弬鏁?', args);
  return args;
}

function buildDreaminaImageArgs(params) {
  const hasImage = Boolean(params.imageUrl);
  const command = hasImage ? "image2image" : "text2image";
  const args = [command, `--prompt=${params.prompt}`];
  if (hasImage) {
    // 濡傛灉鏄?base64 data URL锛岄渶瑕佸厛淇濆瓨鍒颁复鏃舵枃浠?
    if (params.imageUrl.startsWith('data:')) {
      // 寤惰繜鍒拌繍琛屾椂閫氳繃 execJimengWithImage 鍥炶皟澶勭悊
      args.push("--images", params.imageUrl); // 涓存椂鏍囪锛屼細鍦?exec 鏃惰浆鎹?
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

  // 璋冭瘯鏃ュ織
  console.log('[mapDreaminaVideoModel] 杈撳叆澶勭悊:', {
    original: model,
    raw: raw,
    normalized: normalized
  });

  // 绮剧‘鏄犲皠锛堥伩鍏?includes 涓插尮閰嶅鑷磋鍖归厤锛?
  // 娉ㄦ剰锛欳LI 鏀寔鐨?model_version: 3.0, 3.0fast, 3.0pro, 3.0_fast, 3.0_pro, 3.5pro, 3.5_pro, seedance2.0, seedance2.0fast, seedance2.0_vip, seedance2.0fast_vip
  const exactMap = {
    // 鍗虫ⅵ瑙嗛妯″瀷 -> CLI model_version
    "jimeng-seedance2.0fast-vip": "seedance2.0fast_vip",
    "jimeng-seedance2.0-vip": "seedance2.0_vip",
    "jimeng-seedance2.0fast": "seedance2.0fast",
    "jimeng-seedance2.0": "seedance2.0",
    "jimeng-seedance1.5pro": "seedance2.0", // 1.5pro 鏄犲皠鍒?seedance2.0锛圕LI 涓嶆敮鎸?1.5 妯″瀷锛?
    "jimeng-seedance3.0": "3.0",
    "jimeng-seedance3.0fast": "3.0fast",
    "jimeng-seedance3.0pro": "3.0pro",
    "jimeng-seedance3.5pro": "3.5pro",
    // 鍏煎鏃у€?
    "jimeng-video-v3": "seedance2.0fast",
    "jimeng-image-to-video": "seedance2.0fast",
  };

  if (exactMap[normalized]) {
    console.log('[mapDreaminaVideoModel] 绮剧‘鍖归厤:', {
      normalized: normalized,
      mappedTo: exactMap[normalized]
    });
    return exactMap[normalized];
  } else {
    console.log('[mapDreaminaVideoModel] 鏈壘鍒扮簿纭尮閰?', normalized);
  }

  // 瀹归敊鍖归厤锛堟寜浼樺厛绾э級
  if (normalized.includes("2.0fast") && normalized.includes("vip")) {
    console.log('[mapDreaminaVideoModel] 瀹归敊鍖归厤 2.0fast+vip -> seedance2.0fast_vip');
    return "seedance2.0fast_vip";
  }
  if (normalized.includes("2.0") && normalized.includes("vip")) {
    console.log('[mapDreaminaVideoModel] 瀹归敊鍖归厤 2.0+vip -> seedance2.0_vip');
    return "seedance2.0_vip";
  }
  if (normalized.includes("2.0fast")) {
    console.log('[mapDreaminaVideoModel] 瀹归敊鍖归厤 2.0fast -> seedance2.0fast');
    return "seedance2.0fast";
  }
  if (normalized.includes("2.0")) {
    console.log('[mapDreaminaVideoModel] 瀹归敊鍖归厤 2.0 -> seedance2.0');
    return "seedance2.0";
  }
  if (normalized.includes("3.5pro")) {
    console.log('[mapDreaminaVideoModel] 瀹归敊鍖归厤 3.5pro -> 3.5pro');
    return "3.5pro";
  }
  if (normalized.includes("3.0pro")) {
    console.log('[mapDreaminaVideoModel] 瀹归敊鍖归厤 3.0pro -> 3.0pro');
    return "3.0pro";
  }
  if (normalized.includes("3.0fast")) {
    console.log('[mapDreaminaVideoModel] 瀹归敊鍖归厤 3.0fast -> 3.0fast');
    return "3.0fast";
  }
  if (normalized.includes("3.0")) {
    console.log('[mapDreaminaVideoModel] 瀹归敊鍖归厤 3.0 -> 3.0');
    return "3.0";
  }
  if (normalized.includes("1.5")) {
    console.log('[mapDreaminaVideoModel] 瀹归敊鍖归厤 1.5 -> seedance2.0锛?.5 绯诲垪 CLI 涓嶆敮鎸侊級');
    return "seedance2.0";
  }

  console.log('[mapDreaminaVideoModel] 榛樿杩斿洖 -> seedance2.0fast');
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

// 鍦ㄦ湇鍔″惎鍔ㄥ墠妫€娴?WSL dreamina 鍙敤鎬?
console.log("[detect] Checking WSL dreamina...");
const HAS_WSL_DREAMINA = await detectWslDreamina();
console.log("[detect] HAS_WSL_DREAMINA =", HAS_WSL_DREAMINA);

app.listen(PORT, () => {
  console.log(`Jimeng local server running: http://localhost:${PORT} [platform: ${process.platform}, cli: ${HAS_WSL_DREAMINA ? "dreamina" : "opencli"}]`);
});
