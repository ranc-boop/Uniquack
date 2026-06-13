import { marked } from 'marked';
import puppeteer from 'puppeteer-core';
import fs from 'fs';

const md = fs.readFileSync('docs/diange-audit-report.md', 'utf-8');
const html = marked.parse(md);

const style = `
<style>
  body {
    font-family: "PingFang SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.6;
    color: #333;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
  }
  h1, h2, h3 { 
    border-bottom: 1px solid #eaecef; 
    padding-bottom: 0.3em; 
    margin-top: 24px; 
    margin-bottom: 16px; 
    font-weight: 600; 
    line-height: 1.25; 
  }
  p { margin-top: 0; margin-bottom: 16px; }
  ul { padding-left: 2em; margin-top: 0; margin-bottom: 16px; }
  li { margin-top: 0.25em; }
  code { 
    padding: 0.2em 0.4em; 
    margin: 0; 
    font-size: 85%; 
    background-color: rgba(27,31,35,0.05); 
    border-radius: 3px; 
    font-family: SFMono-Regular,Consolas,"Liberation Mono",Menlo,monospace; 
  }
</style>
`;

const content = `<!DOCTYPE html><html><head><meta charset="utf-8">${style}</head><body>${html}</body></html>`;

const paths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];

let executablePath = paths.find(p => fs.existsSync(p));

if (!executablePath) {
  console.error("No Chrome/Edge executable found!");
  process.exit(1);
}

console.log("Using browser at:", executablePath);

try {
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new'
  });

  const page = await browser.newPage();
  await page.setContent(content, { waitUntil: 'networkidle0' });
  await page.pdf({ 
    path: 'docs/diange-audit-report.pdf', 
    format: 'A4',
    margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
    printBackground: true
  });

  await browser.close();
  console.log("PDF generated successfully.");
} catch (error) {
  console.error("Error generating PDF:", error);
  process.exit(1);
}
