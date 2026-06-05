import { spawn } from "node:child_process";
import { existsSync, rmSync, mkdtempSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const adminUsername = process.env.TEST_ADMIN_USERNAME;
const adminPassword = process.env.TEST_ADMIN_PASSWORD;
const nodePath =
  process.execPath ||
  "C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe";
const edgePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const appPort = 3100 + Math.floor(Math.random() * 400);
const cdpPort = 9300 + Math.floor(Math.random() * 400);
const baseUrls = [
  `http://localhost:${appPort}`,
  `http://127.0.0.1:${appPort}`,
];

const markdownSample = [
  "## Circuit Power Test",
  "",
  "A resistor with resistance $4\\,\\Omega$ is connected to a $12\\,\\mathrm{V}$ battery.",
  "",
  "Find the current and power.",
  "",
  "| Quantity   | Value           |",
  "| ---------- | --------------- |",
  "| Voltage    | $12\\,\\mathrm{V}$ |",
  "| Resistance | $4\\,\\Omega$      |",
  "",
  "| Quantity   | Value           |",
  "| ---------- | --------------- |",
  "| Voltage    | `$12\\,\\mathrm{V}$` |",
  "| Resistance | `$4\\,\\Omega$`      |",
  "",
  "Use Ohm's Law:",
  "",
  "$$",
  "I = \\frac{V}{R}",
  "$$",
].join("\n");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }

  console.log(`PASS ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(url, method = "GET") {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method }, (response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error(`${method} ${url} returned ${body.slice(0, 120)}`));
        }
      });
    });
    request.on("error", reject);
    request.end();
  });
}

async function waitForHttp(url, timeoutMs = 30000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const request = http.get(url, (response) => {
          response.resume();
          response.on("end", resolve);
        });
        request.on("error", reject);
        request.setTimeout(2000, () => {
          request.destroy(new Error("timeout"));
        });
      });
      return;
    } catch {
      await sleep(500);
    }
  }

  throw new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocket = new WebSocket(webSocketUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.exceptions = [];
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.webSocket.addEventListener("open", resolve, { once: true });
      this.webSocket.addEventListener("error", reject, { once: true });
      this.webSocket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);

        if (message.id && this.pending.has(message.id)) {
          const { resolve, reject } = this.pending.get(message.id);
          this.pending.delete(message.id);

          if (message.error) {
            reject(new Error(message.error.message));
          } else {
            resolve(message.result);
          }
          return;
        }

        if (message.method === "Runtime.exceptionThrown") {
          this.exceptions.push(message.params);
        }
      });
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.webSocket.send(JSON.stringify({ id, method, params }));

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close() {
    this.webSocket.close();
  }
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });

  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.text ||
        result.exceptionDetails.exception?.description ||
        "Runtime evaluation failed",
    );
  }

  return result.result.value;
}

async function waitFor(client, expression, timeoutMs = 20000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const result = await evaluate(client, expression);
    if (result) {
      return result;
    }
    await sleep(300);
  }

  throw new Error(`Timed out waiting for browser condition: ${expression}`);
}

async function runEditorCase(client, baseUrl) {
  await client.send("Page.navigate", {
    url: `${baseUrl}/auth/login?next=/admin/questions`,
  });
  await waitFor(client, "!!document.querySelector('#username')");
  await evaluate(
    client,
    `(() => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setValue.call(document.querySelector("#username"), ${JSON.stringify(adminUsername)});
      document.querySelector("#username").dispatchEvent(new Event("input", { bubbles: true }));
      setValue.call(document.querySelector("#password"), ${JSON.stringify(adminPassword)});
      document.querySelector("#password").dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector("form").requestSubmit();
      return true;
    })()`,
  );
  await waitFor(client, "location.pathname === '/admin/questions'", 25000);
  await waitFor(
    client,
    "Array.from(document.querySelectorAll('textarea')).filter((el) => !el.className.includes('sr-only')).length >= 2",
    25000,
  );
  await sleep(1500);

  await evaluate(
    client,
    `(() => {
      const editor = Array.from(document.querySelectorAll("textarea"))
        .filter((el) => !String(el.className).includes("sr-only"))[0];
      editor.focus();
      return true;
    })()`,
  );
  await client.send("Input.insertText", { text: markdownSample });
  await waitFor(
    client,
    "Array.from(document.querySelectorAll('.rich-html')).some((item) => item.textContent.includes('Circuit Power Test'))",
    15000,
  );
  await sleep(800);

  const previewBefore = await getPreviewState(client);
  assert(
    previewBefore.mathNodes.length >= 7,
    `${baseUrl} editor preview includes paragraph, table, and block math nodes`,
  );
  assert(
    previewBefore.mathNodes.every((node) => node.hasKatex || node.text.trim()),
    `${baseUrl} editor preview math never renders as blank nodes`,
  );
  assert(
    previewBefore.mathNodes
      .filter((node) => node.type === "inline-math")
      .every((node) => node.hasKatex && node.rect.width > 0),
    `${baseUrl} editor preview inline math renders with visible KaTeX`,
  );

  await evaluate(
    client,
    `(() => {
      const button = Array.from(document.querySelectorAll("button"))
        .find((item) => item.textContent.includes("Expand editor"));
      button.click();
      return true;
    })()`,
  );
  await waitFor(client, "!!document.querySelector('[role=\"dialog\"]')");
  const expandedValue = await evaluate(
    client,
    `(() => document.querySelector('[role="dialog"] textarea:not(.sr-only)')?.value || "")()`,
  );
  assert(
    expandedValue.includes("Circuit Power Test") &&
      expandedValue.includes("$4\\,\\Omega$"),
    `${baseUrl} expanded editor preserves Markdown source`,
  );

  await evaluate(
    client,
    `(() => {
      const button = Array.from(document.querySelectorAll('[role="dialog"] button'))
        .find((item) => item.textContent.includes("Shrink editor"));
      button.click();
      return true;
    })()`,
  );
  await waitFor(client, "!document.querySelector('[role=\"dialog\"][data-state=\"open\"]')");
  await sleep(800);

  const shrunkValue = await evaluate(
    client,
    `(() => Array.from(document.querySelectorAll("textarea"))
      .filter((el) => !String(el.className).includes("sr-only"))[0]?.value || "")()`,
  );
  const previewAfter = await getPreviewState(client);
  assert(
    shrunkValue.includes("Circuit Power Test") &&
      shrunkValue.includes("$12\\,\\mathrm{V}$"),
    `${baseUrl} normal editor preserves Markdown source after shrink`,
  );
  assert(
    previewAfter.mathNodes
      .filter((node) => node.type === "inline-math")
      .every((node) => node.hasKatex && node.rect.width > 0),
    `${baseUrl} preview keeps visible inline KaTeX after expand/shrink rerender`,
  );
}

async function getPreviewState(client) {
  return evaluate(
    client,
    `(() => {
      const root = Array.from(document.querySelectorAll(".rich-html"))
        .find((item) => item.textContent.includes("Circuit Power Test"));
      const mathNodes = Array.from(root.querySelectorAll('[data-type="inline-math"], [data-type="block-math"]'));
      return {
        text: root.innerText,
        mathNodes: mathNodes.map((node) => ({
          type: node.getAttribute("data-type"),
          latex: node.getAttribute("data-latex"),
          text: node.textContent,
          hasKatex: !!node.querySelector(".katex"),
          rect: (() => {
            const rect = node.getBoundingClientRect();
            return { width: rect.width, height: rect.height };
          })(),
        })),
      };
    })()`,
  );
}

if (!adminUsername || !adminPassword) {
  throw new Error("TEST_ADMIN_USERNAME and TEST_ADMIN_PASSWORD are required.");
}

if (!existsSync(edgePath)) {
  throw new Error(`Microsoft Edge was not found at ${edgePath}.`);
}

const nextProcess = spawn(
  nodePath,
  ["node_modules/next/dist/bin/next", "dev", "--webpack", "-p", String(appPort)],
  {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  },
);
const userDataDir = mkdtempSync(join(tmpdir(), "o2i-edge-"));
let edgeProcess;

try {
  await waitForHttp(baseUrls[0]);
  edgeProcess = spawn(
    edgePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  await waitForHttp(`http://127.0.0.1:${cdpPort}/json/version`);
  const target = await requestJson(
    `http://127.0.0.1:${cdpPort}/json/new?about:blank`,
    "PUT",
  );
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.open();
  await client.send("Runtime.enable");
  await client.send("Page.enable");

  for (const baseUrl of baseUrls) {
    await runEditorCase(client, baseUrl);
  }

  assert(client.exceptions.length === 0, "browser runtime has no exceptions");
  client.close();
  console.log("Markdown LaTeX editor browser smoke completed.");
} finally {
  edgeProcess?.kill("SIGKILL");
  nextProcess.kill("SIGKILL");
  await sleep(500);
  try {
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    // Edge can keep profile files locked briefly on Windows. The temp profile is
    // not part of the repo, so cleanup should not mask the browser test result.
  }
}
