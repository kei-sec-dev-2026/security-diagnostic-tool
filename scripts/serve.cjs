"use strict";
// Local preview only. Production can use any static HTTPS hosting service.
const http = require("node:http");
const fs = require("node:fs/promises");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 8787);
const routes = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/css/style.css", ["css/style.css", "text/css; charset=utf-8"]],
  ["/js/app.js", ["js/app.js", "text/javascript; charset=utf-8"]],
  ["/js/diagnostic.js", ["js/diagnostic.js", "text/javascript; charset=utf-8"]],
  ["/data/questions.json", ["data/questions.json", "application/json; charset=utf-8"]],
  ["/data/sources.json", ["data/sources.json", "application/json; charset=utf-8"]],
  ["/css/challenge.css", ["css/challenge.css", "text/css; charset=utf-8"]],
  ["/js/challenge-engine.js", ["js/challenge-engine.js", "text/javascript; charset=utf-8"]],
  ["/js/challenge.js", ["js/challenge.js", "text/javascript; charset=utf-8"]],
  ["/data/challenge.json", ["data/challenge.json", "application/json; charset=utf-8"]],
  ["/assets/social-card-v1.png", ["assets/social-card-v1.png", "image/png"]],
  ["/assets/favicon.svg", ["assets/favicon.svg", "image/svg+xml"]],
  ["/robots.txt", ["robots.txt", "text/plain; charset=utf-8"]],
]);
// Match production's common static-asset policy; HSTS is HTTPS-only.
const securityHeaders = new Map();
let commonRule = false;
for (const line of readFileSync(path.join(root, "_headers"), "utf8").split(/\r?\n/)) {
  if (!line.trim() || line.trimStart().startsWith("#")) continue;
  if (!/^\s/.test(line)) {
    if (commonRule || line.trim() !== "/*") throw new Error("Local preview supports one common /* headers rule.");
    commonRule = true;
    continue;
  }
  const match = line.match(/^\s+([A-Za-z0-9-]+):\s*(\S.*)$/);
  if (!commonRule || !match || securityHeaders.has(match[1].toLowerCase())) throw new Error("Invalid or duplicate preview security header.");
  securityHeaders.set(match[1].toLowerCase(), match[2]);
}
if (!securityHeaders.has("content-security-policy")) throw new Error("Missing security header policy.");
securityHeaders.delete("strict-transport-security");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535");
const server = http.createServer(async (request, response) => {
  for (const [name, value] of securityHeaders) response.setHeader(name, value);
  response.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }
  let route;
  try { route = routes.get(new URL(request.url, "http://127.0.0.1").pathname); }
  catch { response.writeHead(400); response.end(); return; }
  if (!route) { response.writeHead(404); response.end("Not found"); return; }
  try {
    const body = await fs.readFile(path.join(root, route[0]));
    response.writeHead(200, { "Content-Type": route[1] });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(500);
    response.end("Could not load the local app file");
  }
});
server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => console.log("Local: http://127.0.0.1:" + port));
