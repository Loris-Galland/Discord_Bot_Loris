const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");

const isWindows = process.platform === "win32";
const binaryName = isWindows ? "yt-dlp.exe" : "yt-dlp";
const downloadUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${binaryName}`;
const binDir = path.join(__dirname, "..", "bin");
const binaryPath = path.join(binDir, binaryName);

// Follows GitHub's redirect chain (github.com -> objects.githubusercontent.com) manually,
// since we're using the built-in https module instead of a request library.
function download(url, destination, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          if (redirectsLeft <= 0) {
            reject(new Error("Too many redirects while downloading yt-dlp."));
            return;
          }
          response.resume();
          download(response.headers.location, destination, redirectsLeft - 1).then(resolve, reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download yt-dlp: HTTP ${response.statusCode}`));
          return;
        }

        const fileStream = fs.createWriteStream(destination);
        response.pipe(fileStream);
        fileStream.on("finish", () => fileStream.close(resolve));
        fileStream.on("error", reject);
      })
      .on("error", reject);
  });
}

async function main() {
  if (fs.existsSync(binaryPath)) {
    console.log(`yt-dlp already present at ${binaryPath}, skipping download.`);
    return;
  }

  fs.mkdirSync(binDir, { recursive: true });
  console.log(`Downloading yt-dlp for ${process.platform}...`);
  await download(downloadUrl, binaryPath);

  if (!isWindows) {
    fs.chmodSync(binaryPath, 0o755);
  }

  console.log(`yt-dlp downloaded to ${binaryPath}`);
}

main().catch((error) => {
  console.error("Failed to download yt-dlp:", error.message);
  console.error(
    "You can download it manually from https://github.com/yt-dlp/yt-dlp/releases/latest and place it in the bin/ folder.",
  );
  process.exitCode = 1;
});
