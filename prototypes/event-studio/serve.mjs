import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const port = Number(process.env.PORT || 4340);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
http
  .createServer(async (req, res) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405).end();
        return;
      }
      let pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (pathname === "/") {
        res.writeHead(302, { Location: "/event-studio/" }).end();
        return;
      }
      if (pathname.endsWith("/")) pathname += "index.html";
      const file = path.resolve(root, "." + pathname);
      if (!file.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      res
        .writeHead(200, {
          "Content-Type": types[path.extname(file)] || "text/plain",
          "Cache-Control": "no-store",
        })
        .end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Event Studio: http://127.0.0.1:${port}/event-studio/`),
  );
