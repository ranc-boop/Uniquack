import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { marked } from "marked";
import puppeteer from "puppeteer-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

const mdPath = join(projectRoot, "docs", "visitor-country-analytics-design.md");
const htmlPath = join(projectRoot, "docs", "visitor-country-analytics-design.html");
const pdfPath = join(projectRoot, "docs", "visitor-country-analytics-design.pdf");

// 查找系统里可用的 Chromium-based 浏览器
const candidatePaths = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env["PROGRAMFILES(X86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
];

function findExecutable() {
  for (const p of candidatePaths) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

const CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    line-height: 1.75;
    color: #222;
    max-width: 880px;
    margin: 0 auto;
    padding: 40px 56px;
    background: #fff;
  }
  h1 {
    font-size: 28px;
    border-bottom: 3px solid #3b82f6;
    padding-bottom: 12px;
    margin-bottom: 20px;
    color: #111827;
  }
  h2 {
    font-size: 20px;
    margin-top: 36px;
    margin-bottom: 14px;
    padding: 6px 12px;
    background: #f1f5f9;
    border-left: 4px solid #3b82f6;
    color: #1e293b;
    page-break-inside: avoid;
  }
  h3 {
    font-size: 16px;
    margin-top: 24px;
    margin-bottom: 10px;
    color: #1e293b;
  }
  p { margin: 8px 0; font-size: 14px; }
  blockquote {
    border-left: 4px solid #e5e7eb;
    background: #fafafa;
    padding: 10px 16px;
    margin: 14px 0;
    color: #555;
    font-size: 13px;
  }
  blockquote > p { margin: 4px 0; }
  code {
    background: #f3f4f6;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: "SF Mono", Consolas, Monaco, monospace;
    font-size: 12.5px;
    color: #dc2626;
  }
  pre {
    background: #0f172a;
    color: #e2e8f0;
    padding: 14px 16px;
    border-radius: 8px;
    overflow-x: auto;
    font-size: 12px;
    line-height: 1.55;
    page-break-inside: avoid;
    margin: 12px 0;
  }
  pre code {
    background: transparent;
    color: #e2e8f0;
    padding: 0;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
    font-size: 13px;
    page-break-inside: avoid;
  }
  th {
    background: #1e40af;
    color: #fff;
    padding: 9px 12px;
    text-align: left;
    font-weight: 600;
  }
  td {
    padding: 7px 12px;
    border-bottom: 1px solid #e5e7eb;
  }
  tr:nth-child(even) td { background: #f8fafc; }
  ul, ol { padding-left: 24px; font-size: 14px; }
  li { margin: 4px 0; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
  a { color: #2563eb; text-decoration: none; }
  em { color: #555; }
  strong { color: #111827; }
`;

console.log("📖  Reading markdown...");
const mdContent = await readFile(mdPath, "utf-8");

console.log("🎨  Rendering HTML with custom styling...");
const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>访问来源国家统计系统 · 开发报告 by Coffey</title>
  <style>${CSS}</style>
</head>
<body>
${marked.parse(mdContent)}
</body>
</html>`;

await writeFile(htmlPath, htmlContent, "utf-8");
console.log(`✅  HTML saved: ${htmlPath}`);

const executable = findExecutable();
if (!executable) {
  console.log("\n⚠️  未找到 Chrome / Edge。已为您生成带样式的 HTML 文件：");
  console.log(`   → ${htmlPath}`);
  console.log("   请用浏览器打开后按 Ctrl+P → 选择「另存为 PDF」即可。");
  process.exit(0);
}

console.log(`🖥️  Using browser: ${executable}`);
console.log("🖨️  Launching headless browser to export PDF...");

const browser = await puppeteer.launch({
  executablePath: executable,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});

const page = await browser.newPage();
await page.setContent(htmlContent, { waitUntil: "domcontentloaded", timeout: 15000 });

await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  margin: { top: "12mm", right: "12mm", bottom: "16mm", left: "12mm" },
  displayHeaderFooter: true,
  headerTemplate: `<div style="font-size:10px;color:#94a3b8;font-family:sans-serif;width:100%;padding:0 40px;">O2I Content Platform · 开发报告 by Coffey</div>`,
  footerTemplate: `<div style="font-size:10px;color:#94a3b8;font-family:sans-serif;width:100%;text-align:center;padding:0 40px;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
});

await browser.close();

const stats = await import("node:fs");
const sizeKB = Math.round(stats.statSync(pdfPath).size / 1024);
console.log(`\n🎉  PDF generated: ${pdfPath}  (${sizeKB} KB)`);
console.log(`   HTML preview:   ${htmlPath}`);
