import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { spawn } from "node:child_process";

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

async function ensureWslDreaminaDetected() {
  if (!IS_WINDOWS) return false;
  wslChecked = false;
  return detectWslDreamina();
}

async function isOpencliAvailable() {
  try {
    const fsSync = await import("node:fs");
    if (!fsSync.existsSync(OPENCLI_CMD)) return false;
    const r = await execa(OPENCLI_CMD, ["--version"], { timeout: 5000, reject: false });
    return r.exitCode === 0;
  } catch {
    return false;
  }
}

/** opencli 模式：history 成功才视为已登录；失败时返回可读 detail（不抛异常） */
async function probeOpencliJimengLogin(timeout = 15000) {
  if (!(await isOpencliAvailable())) {
    return {
      ok: false,
      loggedIn: false,
      cliAvailable: false,
      platform: "opencli-windows",
      detail:
        "未找到 opencli。Windows 推荐先安装 WSL + dreamina CLI（登录弹窗「一键安装 WSL + 即梦环境」），或在终端执行 npm 全局安装 opencli。",
      needWsl: true,
    };
  }

  const r = await execa(
    OPENCLI_CMD,
    ["jimeng", "history", "-f", "json", "--site-session", "persistent", "--window", "background"],
    { timeout, reject: false },
  );

  if (r.exitCode === 0) {
    let data = {};
    try {
      data = JSON.parse(r.stdout || "{}");
    } catch {
      data = { raw: (r.stdout || "").slice(0, 500) };
    }
    return { ok: true, loggedIn: true, cliAvailable: true, data, platform: "opencli-windows" };
  }

  const errText = [r.stderr, r.stdout].filter(Boolean).join("\n").trim();
  return {
    ok: true,
    loggedIn: false,
    cliAvailable: true,
    platform: "opencli-windows",
    exitCode: r.exitCode,
    detail:
      errText ||
      "opencli 尚未登录。请点击「验证登录状态」前，先在弹出的浏览器窗口完成登录；或改用 WSL dreamina 的复制链接登录。",
  };
}

async function startOpencliBrowserLogin() {
  if (!(await isOpencliAvailable())) {
    return {
      ok: false,
      needWsl: true,
      platform: "opencli-windows",
      message: "未检测到 opencli，无法使用浏览器登录",
      detail: "请先安装 WSL + dreamina CLI，或全局安装 opencli 后重试。",
    };
  }

  void execa(
    OPENCLI_CMD,
    ["jimeng", "relogin", "-f", "json", "--site-session", "persistent", "--window", "foreground"],
    { timeout: 5 * 60 * 1000, reject: false },
  );

  return {
    ok: true,
    mode: "browser",
    platform: "opencli-windows",
    message: "已尝试打开浏览器，请在新窗口中登录即梦账号，完成后点击「验证登录状态」",
    verificationUrl: "https://jimeng.jianying.com/ai-tool/login",
    loginUrl: "https://jimeng.jianying.com/ai-tool/login",
    userCode: "",
    polling: true,
  };
}

async function checkOpencliJimengLogin(timeout = 5000) {
  const probe = await probeOpencliJimengLogin(timeout);
  if (!probe.cliAvailable) return probe;
  if (probe.loggedIn) return probe;
  try {
    const r = await execa(OPENCLI_CMD, ["jimeng", "--help", "-f", "json"], { timeout, reject: false });
    if (r.exitCode !== 0) return probe;
    const data = r.stdout ? JSON.parse(r.stdout) : {};
    return {
      ok: true,
      loggedIn: false,
      cliAvailable: true,
      platform: "opencli-windows",
      detail: probe.detail,
      data: { commands: data.commands?.map((c) => c.name) },
    };
  } catch (error) {
    return {
      ok: true,
      loggedIn: false,
      cliAvailable: true,
      platform: "opencli-windows",
      detail: probe.detail || error.shortMessage || error.message,
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

app.get("/", (_req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>即梦本地 API</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;line-height:1.6">
<h1>即梦本地 API 服务</h1>
<p>这是后端接口（端口 3107），不是画布页面。</p>
<p>请打开前端：<a href="http://localhost:5173/">http://localhost:5173/</a></p>
<p>健康检查：<a href="/api/jimeng/health">/api/jimeng/health</a></p>
</body></html>`);
});
app.get("/favicon.ico", (_req, res) => res.status(204).end());

// ============================================================
//  Codesonline Image API 代理
// ============================================================
app.use("/codesonline-image-api", async (req, res) => {
  const targetBase = "https://image.codesonline.dev";
  const pathname = req.originalUrl.replace(/^\/codesonline-image-api/, "") || "/";
  const targetUrl = `${targetBase}${pathname}`;

  console.log(`[codesonline-image-proxy] ${req.method} ${targetUrl}`);

  try {
    const options = {
      method: req.method,
      headers: {
        "Content-Type": req.get("Content-Type") || "application/json",
        "Authorization": req.get("Authorization") || "",
        "Accept": req.get("Accept") || "application/json",
      },
    };

    if (["POST", "PUT", "PATCH"].includes(req.method) && req.body) {
      options.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, options);
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await response.json();
      res.status(response.status).json(data);
    } else {
      const text = await response.text();
      res.status(response.status).send(text);
    }
  } catch (err) {
    console.error("[codesonline-image-proxy] 错误:", err.message);
    res.status(502).json({ ok: false, message: "代理错误: " + err.message });
  }
});

// ============================================================
//  Codesonline Chat API 代理
// ============================================================
app.use("/codesonline-chat-api", async (req, res) => {
  const targetBase = "https://ai.codesonline.dev";
  const pathname = req.originalUrl.replace(/^\/codesonline-chat-api/, "") || "/";
  const targetUrl = `${targetBase}${pathname}`;

  console.log(`[codesonline-chat-proxy] ${req.method} ${targetUrl}`);

  try {
    const options = {
      method: req.method,
      headers: {
        "Content-Type": req.get("Content-Type") || "application/json",
        "Authorization": req.get("Authorization") || "",
        "Accept": req.get("Accept") || "application/json",
      },
    };

    if (["POST", "PUT", "PATCH"].includes(req.method) && req.body) {
      options.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, options);
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await response.json();
      res.status(response.status).json(data);
    } else {
      const text = await response.text();
      res.status(response.status).send(text);
    }
  } catch (err) {
    console.error("[codesonline-chat-proxy] 错误:", err.message);
    res.status(502).json({ ok: false, message: "代理错误: " + err.message });
  }
});

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
  const wslReady = IS_WINDOWS ? await ensureWslDreaminaDetected() : false;

  if (IS_WINDOWS && wslReady) {
    try {
      const r = await execWslDreamina(["user_credit"], { timeout: 10000 });
      const data = JSON.parse(r.stdout);
      const loggedIn = data && (data.total_credit !== undefined || data.ok === true || data.credit !== undefined);
      return res.json({ ok: true, loggedIn, data, platform: "wsl-dreamina" });
    } catch (wslErr) {
      console.log("[session] WSL dreamina failed, trying opencli:", wslErr.shortMessage || wslErr.message);
    }
  }

  if (!IS_WINDOWS) {
    const session = await checkDreaminaLogin({ timeout: 15000 });
    return res.json({
      ok: true,
      loggedIn: session.loggedIn,
      data: session.data,
      detail: session.detail,
      platform: session.platform,
    });
  }

  const opencli = await probeOpencliJimengLogin();
  return res.json({
    ok: opencli.ok !== false,
    loggedIn: opencli.loggedIn,
    data: opencli.data,
    detail: opencli.detail,
    needWsl: opencli.needWsl,
    platform: opencli.platform || "opencli-windows",
  });
});

// 保存 OAuth device_code，供后台 headless 登录轮询
const loginDeviceCodes = new Map();

/** @type {null | { child: import('execa').ResultPromise, output: string, verificationUrl: string, userCode: string, deviceCode: string, platform: string, completed: boolean, success: boolean, error: string | null }} */
let activeHeadlessLogin = null;

const DEFAULT_CLI_AUTH_URL = "https://jimeng.jianying.com/ai-tool/cli-auth";

function parseDreaminaLoginOutput(output) {
  const verificationMatch = output.match(/verification_uri:\s*(.+)/i);
  const verificationUrlMatch = output.match(/verification_url:\s*(.+)/i);
  const loginUrlMatch = output.match(/login_url:\s*(.+)/i);
  const userCodeMatch = output.match(/user_code:\s*([a-f0-9-]+)/i);
  const deviceCodeMatch = output.match(/device_code:\s*([a-f0-9-]+)/i);
  const verificationUri = (
    verificationMatch?.[1] ||
    verificationUrlMatch?.[1] ||
    loginUrlMatch?.[1] ||
    ""
  ).trim();
  return {
    verificationUri,
    userCode: (userCodeMatch?.[1] || "").trim(),
    deviceCode: (deviceCodeMatch?.[1] || "").trim(),
  };
}

function buildDreaminaLoginUrls(verificationUri, userCode) {
  const scanUrl = userCode
    ? `https://jimeng.jianying.com/passport/open/scan_user_code/?user_code=${encodeURIComponent(userCode)}`
    : "";

  if (!verificationUri) {
    return {
      loginUrl: scanUrl || DEFAULT_CLI_AUTH_URL,
      browserLoginUrl: scanUrl || DEFAULT_CLI_AUTH_URL,
      appLoginUrl: scanUrl,
    };
  }

  try {
    const parsed = new URL(verificationUri.trim());
    const nestedRaw = parsed.searchParams.get("verification_uri");
    let nestedScan = scanUrl;
    if (nestedRaw) {
      try {
        nestedScan = decodeURIComponent(nestedRaw);
      } catch {
        nestedScan = nestedRaw;
      }
    }

    const browserLoginUrl = new URL(verificationUri.trim());
    if (userCode) {
      if (!browserLoginUrl.searchParams.has("usercode")) {
        browserLoginUrl.searchParams.set("usercode", userCode);
      }
      if (!browserLoginUrl.searchParams.has("user_code")) {
        browserLoginUrl.searchParams.set("user_code", userCode);
      }
      if (nestedRaw) {
        browserLoginUrl.searchParams.set(
          "verification_uri",
          nestedScan.includes("user_code=") ? nestedRaw : encodeURIComponent(scanUrl),
        );
      }
    }

    return {
      loginUrl: browserLoginUrl.toString(),
      browserLoginUrl: browserLoginUrl.toString(),
      appLoginUrl: nestedScan || scanUrl,
    };
  } catch {
    return {
      loginUrl: verificationUri || scanUrl,
      browserLoginUrl: verificationUri || scanUrl,
      appLoginUrl: scanUrl,
    };
  }
}

function canUseDreaminaHeadlessLogin(wslReady = HAS_WSL_DREAMINA) {
  return !IS_WINDOWS || wslReady;
}

function stopActiveHeadlessLogin() {
  if (!activeHeadlessLogin?.child) return;
  try {
    activeHeadlessLogin.child.kill();
  } catch {
    /* ignore */
  }
}

async function readDreaminaTokenSnapshot() {
  const tokenPaths = [
    "/root/.local/share/dreamina/byted_cli_user_token.json",
    "/root/.dreamina_cli/byted_cli_user_token.json",
    "$HOME/.local/share/dreamina/byted_cli_user_token.json",
  ];

  for (const tokenPath of tokenPaths) {
    try {
      let stdout = "";
      if (!IS_WINDOWS) {
        const r = await execa("bash", ["-lc", `cat ${tokenPath}`], { timeout: 5000 });
        stdout = r.stdout;
      } else {
        const r = await execa(
          WSL_EXE,
          ["-d", WSL_DISTRO, "-u", WSL_DREAMINA_USER, "--", "bash", "-lc", `cat ${tokenPath}`],
          { timeout: 5000 },
        );
        stdout = r.stdout;
      }
      const token = JSON.parse(stdout);
      const expiresAt = token.token_expires_at || token.expires_at;
      const hasAccessToken = !!token.access_token;
      const notExpired =
        !expiresAt ||
        expiresAt === "0001-01-01T00:00:00Z" ||
        Number.isNaN(Date.parse(expiresAt)) ||
        Date.parse(expiresAt) > Date.now();
      if (hasAccessToken && notExpired) {
        return { ok: true, token };
      }
    } catch {
      /* try next path */
    }
  }
  return { ok: false, token: null };
}

async function spawnDreaminaHeadlessLogin() {
  stopActiveHeadlessLogin();

  const spawnOptions = {
    timeout: 5 * 60 * 1000,
    reject: false,
    stdout: "pipe",
    stderr: "pipe",
  };

  let child;
  let platform;
  if (!IS_WINDOWS) {
    child = execa(DREAMINA_CMD, ["login", "--headless"], spawnOptions);
    platform = "native";
  } else {
    const cmdStr = buildWslCmd(["login", "--headless"]);
    const scriptCmd = `script -q -c '${cmdStr.replace(/'/g, "'\\''")}' /dev/null`;
    child = execa(
      WSL_EXE,
      ["-d", WSL_DISTRO, "-u", WSL_DREAMINA_USER, "--", "bash", "-c", scriptCmd],
      spawnOptions,
    );
    platform = "wsl-dreamina";
  }

  const state = {
    child,
    output: "",
    verificationUrl: "",
    userCode: "",
    deviceCode: "",
    platform,
    completed: false,
    success: false,
    error: null,
  };
  activeHeadlessLogin = state;

  const onData = (chunk) => {
    state.output += chunk.toString();
    const parsed = parseDreaminaLoginOutput(state.output);
    if (parsed.verificationUri) state.verificationUrl = parsed.verificationUri;
    if (parsed.userCode) state.userCode = parsed.userCode;
    if (parsed.deviceCode) {
      state.deviceCode = parsed.deviceCode;
      loginDeviceCodes.set(parsed.deviceCode, {
        userCode: parsed.userCode,
        expires: Date.now() + 5 * 60 * 1000,
      });
    }
  };

  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  void child
    .then((result) => {
      state.completed = true;
      state.success = result.exitCode === 0;
      if (result.stdout) state.output += result.stdout;
      if (result.stderr) state.output += result.stderr;
      const parsed = parseDreaminaLoginOutput(state.output);
      if (parsed.verificationUri) state.verificationUrl = parsed.verificationUri;
      if (parsed.userCode) state.userCode = parsed.userCode;
      if (parsed.deviceCode) state.deviceCode = parsed.deviceCode;
    })
    .catch((error) => {
      state.completed = true;
      state.error = error.shortMessage || error.message || String(error);
    });

  return state;
}

async function waitForHeadlessLoginBootstrap(state, maxWaitMs = 35000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const parsed = parseDreaminaLoginOutput(state.output);
    if (parsed.verificationUri) state.verificationUrl = parsed.verificationUri;
    if (parsed.userCode) state.userCode = parsed.userCode;
    if (parsed.deviceCode) state.deviceCode = parsed.deviceCode;
    if (state.userCode && (state.verificationUrl || state.deviceCode)) return true;
    if (state.completed) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const parsed = parseDreaminaLoginOutput(state.output);
  if (parsed.verificationUri) state.verificationUrl = parsed.verificationUri;
  if (parsed.userCode) state.userCode = parsed.userCode;
  if (parsed.deviceCode) state.deviceCode = parsed.deviceCode;
  return !!(state.userCode && (state.verificationUrl || state.deviceCode));
}

function getActiveHeadlessLoginPayload() {
  if (!activeHeadlessLogin) return null;
  const parsed = parseDreaminaLoginOutput(activeHeadlessLogin.output);
  const userCode = activeHeadlessLogin.userCode || parsed.userCode || "";
  const verificationUri =
    activeHeadlessLogin.verificationUrl || parsed.verificationUri || DEFAULT_CLI_AUTH_URL;
  const urls = buildDreaminaLoginUrls(verificationUri, userCode);
  return {
    ok: !!userCode,
    loginUrl: urls.loginUrl,
    browserLoginUrl: urls.browserLoginUrl,
    appLoginUrl: urls.appLoginUrl,
    verificationUrl: urls.loginUrl,
    userCode,
    deviceCode: activeHeadlessLogin.deviceCode || parsed.deviceCode || "",
    pending: !activeHeadlessLogin.completed,
    platform: activeHeadlessLogin.platform,
  };
}

// ============================================================
//  Login Start（获取 OAuth 设备码，后台持续轮询直至授权完成）
// ============================================================
app.post("/api/jimeng/login/start", async (_req, res) => {
  try {
    const wslReady = IS_WINDOWS ? await ensureWslDreaminaDetected() : false;

    if (canUseDreaminaHeadlessLogin(wslReady)) {
      const state = await spawnDreaminaHeadlessLogin();
      const ready = await waitForHeadlessLoginBootstrap(state);
      const parsed = parseDreaminaLoginOutput(state.output);
      const verificationUri =
        state.verificationUrl || parsed.verificationUri || DEFAULT_CLI_AUTH_URL;
      const userCode = state.userCode || parsed.userCode || "";
      const deviceCode = state.deviceCode || parsed.deviceCode || "";
      const urls = buildDreaminaLoginUrls(verificationUri, userCode);

      if (deviceCode) {
        loginDeviceCodes.set(deviceCode, {
          userCode,
          expires: Date.now() + 5 * 60 * 1000,
        });
      }

      if (!ready && !userCode) {
        const late = getActiveHeadlessLoginPayload();
        if (late?.userCode) {
          return res.json({
            ok: true,
            message: "电脑请用 Chrome 打开「浏览器登录链接」；手机请在即梦 App 内打开「App 登录链接」",
            verificationUrl: late.loginUrl,
            loginUrl: late.loginUrl,
            browserLoginUrl: late.browserLoginUrl,
            appLoginUrl: late.appLoginUrl,
            userCode: late.userCode,
            deviceCode: late.deviceCode,
            polling: late.pending,
            platform: state.platform,
          });
        }
      }

      if (!ready && state.error) {
        return res.status(500).json({
          ok: false,
          message: "获取登录链接失败",
          detail: state.error,
          platform: state.platform,
        });
      }

      return res.json({
        ok: true,
        message: "电脑请用 Chrome 打开「浏览器登录链接」；手机请在即梦 App 内打开「App 登录链接」（勿在外部浏览器打开 scan 链接）",
        verificationUrl: urls.loginUrl,
        loginUrl: urls.browserLoginUrl,
        browserLoginUrl: urls.browserLoginUrl,
        appLoginUrl: urls.appLoginUrl,
        userCode,
        deviceCode,
        polling: !state.completed,
        platform: state.platform,
      });
    }

    const opencliStart = await startOpencliBrowserLogin();
    if (!opencliStart.ok) {
      return res.status(503).json(opencliStart);
    }
    return res.json(opencliStart);
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "获取登录码失败",
      detail: error.shortMessage || error.message,
    });
  }
});

app.get("/api/jimeng/login/code", async (_req, res) => {
  try {
    const wslReady = IS_WINDOWS ? await ensureWslDreaminaDetected() : false;
    if (!canUseDreaminaHeadlessLogin(wslReady)) {
      return res.json({ ok: false, message: "当前非 App 扫码登录模式" });
    }
    const payload = getActiveHeadlessLoginPayload();
    if (!payload?.userCode) {
      return res.json({
        ok: false,
        pending: !!(activeHeadlessLogin && !activeHeadlessLogin.completed),
        message: "登录码尚未生成，请稍候或点击「重新获取登录链接」",
      });
    }
    return res.json({ ok: true, ...payload });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "获取登录码失败",
      detail: error.shortMessage || error.message,
    });
  }
});

// ============================================================
//  Login Screenshot（WSL 模式不需要截图）
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

const WSL_SETUP_SCRIPT = path.join(__dirname, "..", "scripts", "setup-jimeng-dreamina-wsl.ps1");
const WSL_SETUP_STATUS_FILE = path.join(__dirname, ".jimeng-wsl-setup-status.json");

async function readWslSetupStatus() {
  try {
    const raw = await fs.readFile(WSL_SETUP_STATUS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function isWindowsAdmin() {
  if (!IS_WINDOWS) return false;
  try {
    const r = await execa(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "[bool](([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))",
      ],
      { timeout: 10000, reject: false },
    );
    return (r.stdout || "").trim().toLowerCase() === "true";
  } catch {
    return false;
  }
}

async function launchWslSetupScript() {
  try {
    await fs.access(WSL_SETUP_SCRIPT);
  } catch {
    throw new Error(`安装脚本不存在: ${WSL_SETUP_SCRIPT}`);
  }
  await fs.writeFile(
    WSL_SETUP_STATUS_FILE,
    JSON.stringify({
      phase: "launching",
      status: "running",
      message: "正在启动安装程序...",
      steps: [],
      needReboot: false,
      needAdmin: true,
      ok: null,
      updatedAt: new Date().toISOString(),
    }),
    "utf8",
  );
  const ps = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    WSL_SETUP_SCRIPT,
    "-StatusFile",
    WSL_SETUP_STATUS_FILE,
  ];
  spawn("powershell.exe", ps, { detached: true, stdio: "ignore", windowsHide: false }).unref();
}

async function runExecStep(label, cmd, args, steps, options = {}) {
  const timeout = options.timeout ?? 120000;
  steps.push(label);
  const okExitCodes = options.okExitCodes ?? [0];
  const r = await execa(cmd, args, { timeout, reject: false });
  if (okExitCodes.includes(r.exitCode)) return { ok: true, result: r, exitCode: r.exitCode };
  const detail = [r.stderr, r.stdout].filter(Boolean).join("\n").trim().slice(0, 400);
  return { ok: false, exitCode: r.exitCode, detail };
}

async function runWslUpdateWithFallbacks(steps) {
  const attempts = [
    { label: "更新 WSL（web-download）...", args: ["--update", "--web-download"] },
    { label: "更新 WSL（inbox）...", args: ["--update", "--inbox"] },
    { label: "更新 WSL...", args: ["--update"] },
  ];
  for (const attempt of attempts) {
    const result = await runExecStep(attempt.label, "wsl.exe", attempt.args, steps, { timeout: 180000, okExitCodes: [0] });
    if (result.ok) {
      steps.push("WSL 更新完成");
      return true;
    }
    if (result.detail) steps.push(`跳过: ${result.detail}`);
  }
  steps.push("WSL 更新未成功（可稍后手动执行 wsl --update，或重启电脑后再试）");
  return false;
}

async function installUbuntuDistro(steps) {
  const list = await runExecStep("检查已安装发行版...", "wsl.exe", ["-l", "-v"], steps, { timeout: 30000 });
  const listText = list.result?.stdout || "";
  if (/Ubuntu/i.test(listText)) {
    steps.push("检测到 Ubuntu 已安装，跳过发行版安装");
    return true;
  }

  const attempts = [
    { label: "安装 Ubuntu（--no-launch）...", args: ["--install", "-d", "Ubuntu", "--no-launch"] },
    { label: "安装 Ubuntu...", args: ["--install", "-d", "Ubuntu"] },
    { label: "安装 Ubuntu（web-download）...", args: ["--install", "-d", "Ubuntu", "--web-download"] },
    { label: "安装默认 Linux 发行版...", args: ["--install"] },
  ];
  for (const attempt of attempts) {
    const result = await runExecStep(attempt.label, "wsl.exe", attempt.args, steps, { timeout: 300000, okExitCodes: [0, 3010] });
    if (result.ok) {
      steps.push("Ubuntu 安装命令已执行");
      return true;
    }
    if (result.detail) steps.push(`跳过: ${result.detail}`);
  }
  return false;
}

const WSL_MANUAL_GUIDE = [
  "1. 右键「开始」→ Windows PowerShell（管理员）",
  "2. 执行：wsl --install",
  "3. 重启电脑",
  "4. 执行：wsl -d Ubuntu -u root -- bash -lc \"curl -fsSL https://jimeng.jianying.com/cli | bash\"",
  "5. 在 server 目录重启：npm start，然后刷新页面重新登录",
  "",
  "若 wsl --install 失败，可从 Microsoft Store 安装「Ubuntu」，或访问 https://aka.ms/wslstore",
  "内核包：https://aka.ms/wsl2kernel",
];

// ============================================================
//  Setup Dreamina WSL Environment (Windows)
// ============================================================
app.get("/api/jimeng/setup-wsl/status", async (_req, res) => {
  if (!IS_WINDOWS) {
    return res.status(501).json({ ok: false, message: "仅支持 Windows 系统" });
  }

  const status = await readWslSetupStatus();
  wslChecked = false;
  const wslReady = await detectWslDreamina();
  if (wslReady) {
    HAS_WSL_DREAMINA = true;
    return res.json({
      ok: true,
      running: false,
      wslReady: true,
      phase: "done",
      status: "completed",
      message: "WSL + dreamina 已就绪",
      steps: status?.steps || [],
    });
  }

  if (!status) {
    return res.json({
      ok: true,
      running: false,
      wslReady: false,
      phase: "idle",
      status: "idle",
      message: "尚未开始安装",
    });
  }

  const running = status.status === "running";
  if (status.status === "completed" && status.ok) {
    HAS_WSL_DREAMINA = wslReady;
  }

  return res.json({
    ok: status.ok !== false,
    running,
    wslReady,
    ...status,
  });
});

app.post("/api/jimeng/setup-wsl", async (_req, res) => {
  if (!IS_WINDOWS) {
    return res.status(501).json({ ok: false, message: "仅支持 Windows 系统" });
  }

  wslChecked = false;
  if (await detectWslDreamina()) {
    HAS_WSL_DREAMINA = true;
    return res.json({
      ok: true,
      alreadyInstalled: true,
      message: "WSL + dreamina 已安装，可直接刷新页面登录",
      wslReady: true,
    });
  }

  const existing = await readWslSetupStatus();
  if (existing?.status === "running") {
    return res.json({
      ok: true,
      launched: true,
      polling: true,
      message: "安装程序正在运行，请稍候...",
      phase: existing.phase,
      steps: existing.steps || [],
    });
  }

  const steps = [];
  const isAdmin = await isWindowsAdmin();

  try {
    if (isAdmin) {
      const featureWsl = await runExecStep(
        "启用 WSL 功能...",
        "dism.exe",
        ["/online", "/enable-feature", "/featurename:Microsoft-Windows-Subsystem-Linux", "/all", "/norestart"],
        steps,
        { okExitCodes: [0, 3010] },
      );
      const featureVm = await runExecStep(
        "启用虚拟机平台...",
        "dism.exe",
        ["/online", "/enable-feature", "/featurename:VirtualMachinePlatform", "/all", "/norestart"],
        steps,
        { okExitCodes: [0, 3010] },
      );
      const needRebootFromFeatures =
        featureWsl.exitCode === 3010 || featureVm.exitCode === 3010 || !featureWsl.ok || !featureVm.ok;

      await runWslUpdateWithFallbacks(steps);
      const ubuntuReady = await installUbuntuDistro(steps);

      if (ubuntuReady && !needRebootFromFeatures) {
        const dreaminaInstall =
          "set -e; export DEBIAN_FRONTEND=noninteractive; if ! command -v curl >/dev/null 2>&1; then apt-get update -qq && apt-get install -y -qq curl ca-certificates; fi; curl -fsSL https://jimeng.jianying.com/cli | bash; /root/.local/bin/dreamina --version";
        const dreamina = await runExecStep(
          "在 Ubuntu 中安装 dreamina...",
          "wsl.exe",
          ["-d", "Ubuntu", "-u", "root", "--", "bash", "-lc", dreaminaInstall],
          steps,
          { timeout: 180000 },
        );

        if (dreamina.ok) {
          wslChecked = false;
          HAS_WSL_DREAMINA = await detectWslDreamina();
          steps.push("✅ 安装完成！请刷新页面并重新登录");
          await fs.writeFile(
            WSL_SETUP_STATUS_FILE,
            JSON.stringify({
              phase: "done",
              status: "completed",
              message: steps.join("\n"),
              steps,
              needReboot: false,
              ok: true,
              updatedAt: new Date().toISOString(),
            }),
            "utf8",
          );
          return res.json({
            ok: true,
            message: steps.join("\n"),
            steps,
            needReboot: false,
            wslReady: HAS_WSL_DREAMINA,
          });
        }
      }

      if (needRebootFromFeatures) {
        steps.push("Windows 功能已变更，可能需要重启后再完成 dreamina 安装");
      }
    }

    await launchWslSetupScript();
    return res.json({
      ok: true,
      launched: true,
      polling: true,
      needAdmin: !isAdmin,
      message: isAdmin
        ? "已启动安装脚本（部分步骤需在管理员窗口中完成），请等待..."
        : "已弹出 UAC 管理员窗口，请点击「是」并等待安装完成",
      steps,
      manualGuide: WSL_MANUAL_GUIDE,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "无法启动 WSL 安装",
      detail: error.shortMessage || error.message,
      steps,
      manualGuide: WSL_MANUAL_GUIDE,
      needReboot: true,
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
    console.log('[jimeng-video] execJimeng completed');

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
    const wslReady = IS_WINDOWS ? await ensureWslDreaminaDetected() : false;

    if (canUseDreaminaHeadlessLogin(wslReady)) {
      const session = await checkDreaminaLogin({ timeout: 15000 });
      if (session.loggedIn) {
        stopActiveHeadlessLogin();
        activeHeadlessLogin = null;
        loginDeviceCodes.clear();
        return res.json({
          ok: true,
          loggedIn: true,
          data: session.data,
          platform: session.platform,
        });
      }

      const tokenSnapshot = await readDreaminaTokenSnapshot();
      if (tokenSnapshot.ok) {
        const retry = await checkDreaminaLogin({ timeout: 15000 });
        if (retry.loggedIn) {
          stopActiveHeadlessLogin();
          activeHeadlessLogin = null;
          loginDeviceCodes.clear();
          return res.json({
            ok: true,
            loggedIn: true,
            data: retry.data,
            platform: retry.platform,
          });
        }
      }

      const pending = !!(activeHeadlessLogin && !activeHeadlessLogin.completed);
      return res.json({
        ok: true,
        loggedIn: false,
        pending,
        detail: pending
          ? "后台正在等待 App 授权，请完成扫码/确认后再次点击「验证登录状态」"
          : session.detail || "尚未完成登录，请重新复制链接授权",
        platform: session.platform || (IS_WINDOWS ? "wsl-dreamina" : "native"),
      });
    }

    const opencli = await probeOpencliJimengLogin();
    return res.json({
      ok: opencli.ok !== false,
      loggedIn: opencli.loggedIn,
      data: opencli.data,
      detail: opencli.detail,
      needWsl: opencli.needWsl,
      platform: opencli.platform || "opencli-windows",
    });
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
        } else if (imgUrl.startsWith('blob:')) {
          // 支持 blob URL（来自 Canvas 等）
          try {
            const resp = await fetch(imgUrl);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            tempImageBuffer = Buffer.from(await resp.arrayBuffer());
          } catch (blobErr) {
            console.error(`[jimeng-video] blob 图片下载失败: ${blobErr.message}`);
            continue;
          }
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
  // 涓嶆敮鎵?blob URL锛岀洿鎺ヤ娇鐢≒eferer涓嬭浇
      } else if (params.imageUrl.startsWith('blob:')) {
        // 支持 blob URL（来自 Canvas 等）
        try {
          const resp = await fetch(params.imageUrl);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          tempImageBuffer = Buffer.from(await resp.arrayBuffer());
        } catch (blobErr) {
          return res.status(400).json({ ok: false, message: "无法读取 blob 图片: " + (blobErr.message || "未知错误") });
        }
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
    console.log('[jimeng-video] execJimeng completed');

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

    let payload;
    try {
      payload = JSON.parse(result.stdout);
    } catch (parseErr) {
      console.error('[jimeng-video] CLI stdout length:', result.stdout?.length || 0);
      console.error('[jimeng-video] CLI stdout preview:', result.stdout?.substring(0, 500));
      console.error('[jimeng-video] CLI stderr:', result.stderr?.substring(0, 500));
      return res.status(500).json({
        ok: false,
        message: "CLI返回格式错误",
        detail: result.stdout.substring(0, 300) + (result.stdout.length > 300 ? "..." : ""),
        stderr: result.stderr || "",
      });
    }
    return handleJimengResult(res, payload, OUTPUT_DIR, PORT, "video");
  } catch (error) {
      const stderr = error.stderr || "";
      console.error('[jimeng-video] catch error:', error.message, 'stderr:', stderr.substring(0, 300));
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
            // Detect real image format from magic bytes
      const magic = buf.slice(0, 12);
      let realExt = '.png';
      if (magic[0] === 0xFF && magic[1] === 0xD8) { realExt = '.jpg'; }
      else if (magic[0] === 0x89 && magic[1] === 0x50) { realExt = '.png'; }
      else if (magic[0] === 0x47 && magic[1] === 0x49) { realExt = '.gif'; }
      else if (magic[0] === 0x52 && magic[1] === 0x49 && magic[2] === 0x46 && magic[3] === 0x46) { realExt = '.webp'; }

      filename = `jimeng_${mediaType}_${Date.now()}${realExt}`;
      localPath = path.join(outputDir, filename);
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
          // Detect real image format from magic bytes
      const magic = buf.slice(0, 12);
      let realExt = '.png';
      if (magic[0] === 0xFF && magic[1] === 0xD8) { realExt = '.jpg'; }
      else if (magic[0] === 0x89 && magic[1] === 0x50) { realExt = '.png'; }
      else if (magic[0] === 0x47 && magic[1] === 0x49) { realExt = '.gif'; }
      else if (magic[0] === 0x52 && magic[1] === 0x49 && magic[2] === 0x46 && magic[3] === 0x46) { realExt = '.webp'; }

      filename = `jimeng_${mediaType}_${Date.now()}${realExt}`;
      localPath = path.join(outputDir, filename);
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
    let filename = `jimeng_${mediaType}_${Date.now()}.png`;
    let localPath = path.join(outputDir, filename);
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
      // Detect real image format from magic bytes
      const magic = buf.slice(0, 12);
      let realExt = '.png';
      if (magic[0] === 0xFF && magic[1] === 0xD8) { realExt = '.jpg'; }
      else if (magic[0] === 0x89 && magic[1] === 0x50) { realExt = '.png'; }
      else if (magic[0] === 0x47 && magic[1] === 0x49) { realExt = '.gif'; }
      else if (magic[0] === 0x52 && magic[1] === 0x49 && magic[2] === 0x46 && magic[3] === 0x46) { realExt = '.webp'; }

      filename = `jimeng_${mediaType}_${Date.now()}${realExt}`;
      localPath = path.join(outputDir, filename);
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
          // Detect real image format from magic bytes
          const magic = buf.slice(0, 12);
          let realExt = '.png';
          if (magic[0] === 0xFF && magic[1] === 0xD8) { realExt = '.jpg'; }
          else if (magic[0] === 0x89 && magic[1] === 0x50) { realExt = '.png'; }
          else if (magic[0] === 0x47 && magic[1] === 0x49) { realExt = '.gif'; }
          else if (magic[0] === 0x52 && magic[1] === 0x49 && magic[2] === 0x46 && magic[3] === 0x46) { realExt = '.webp'; }

          filename = `jimeng_${mediaType}_${Date.now()}${realExt}`;
          localPath = path.join(outputDir, filename);
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
    // Detect real image format from magic bytes
      const magic = buf.slice(0, 12);
      let realExt = '.png';
      if (magic[0] === 0xFF && magic[1] === 0xD8) { realExt = '.jpg'; }
      else if (magic[0] === 0x89 && magic[1] === 0x50) { realExt = '.png'; }
      else if (magic[0] === 0x47 && magic[1] === 0x49) { realExt = '.gif'; }
      else if (magic[0] === 0x52 && magic[1] === 0x49 && magic[2] === 0x46 && magic[3] === 0x46) { realExt = '.webp'; }

      filename = `jimeng_${mediaType}_${Date.now()}${realExt}`;
      localPath = path.join(outputDir, filename);
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
let HAS_WSL_DREAMINA = await detectWslDreamina();
console.log("[detect] HAS_WSL_DREAMINA =", HAS_WSL_DREAMINA);

app.listen(PORT, () => {
  console.log(`Jimeng local server running: http://localhost:${PORT} [platform: ${process.platform}, cli: ${HAS_WSL_DREAMINA ? "dreamina" : "opencli"}]`);
});
