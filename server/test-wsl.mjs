import { execa } from "execa";
import path from "node:path";

const IS_WINDOWS = process.platform === "win32";
const WSL_EXE = IS_WINDOWS
  ? path.join(process.env.SYSTEMROOT || "C:\\Windows", "System32", "wsl.exe")
  : "wsl";

const WSL_DISTRO = "Ubuntu";

console.log("WSL_EXE:", WSL_EXE);

// 使用完整路径
try {
  const r = await execa(WSL_EXE, ["-d", WSL_DISTRO, "--", "bash", "-c", "/root/.local/bin/dreamina --version"], { timeout: 30000 });
  console.log("exitCode:", r.exitCode);
  console.log("SUCCESS:", r.stdout.substring(0, 300));
} catch (e) {
  console.log("FAILED:");
  console.log("  shortMessage:", e.shortMessage || e.message);
  console.log("  exitCode:", e.exitCode);
  console.log("  stderr:", (e.stderr || "").substring(0, 300));
}
