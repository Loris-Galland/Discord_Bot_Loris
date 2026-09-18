import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const binaryName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
const binaryPath = path.join(process.cwd(), "bin", binaryName);

function assertYtDlpInstalled(): void {
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`yt-dlp binary not found at ${binaryPath}. Run "npm install" again to download it.`);
  }
}

export function getYtDlpBinaryPath(): string {
  assertYtDlpInstalled();
  return binaryPath;
}

// JSON metadata for a search result or video can be a few hundred KB, so we raise
// the default 1MB stdout buffer to avoid truncation on large channel/video descriptions.
export async function runYtDlp(args: string[]): Promise<string> {
  assertYtDlpInstalled();
  const { stdout } = await execFileAsync(binaryPath, args, { maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}
