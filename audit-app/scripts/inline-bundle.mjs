import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dist = "dist";
let html = readFileSync(join(dist, "index.html"), "utf8");
const before = html.length;

html = html.replace(
  /<script([^>]*)src=["']?([^\s"'>]+\.js)["']?([^>]*)>\s*<\/script>/g,
  (_m, pre, f) => {
    const code = readFileSync(join(dist, f), "utf8").replace(
      /<\/script>/g,
      "<\\/script>"
    );
    return '<script type="module">' + code + "</script>";
  }
);

html = html.replace(
  /<link([^>]*)href=["']?([^\s"'>]+\.css)["']?([^>]*)>/g,
  (_m, _pre, f) => "<style>" + readFileSync(join(dist, f), "utf8") + "</style>"
);

if (/(src|href)=["']?[^\s"'>]+\.(js|css)/.test(html)) {
  console.error("WARNING: unresolved external asset reference remains");
  process.exit(1);
}

// charset must live in the first 1024 bytes -> hoist right after <html>
html = html.replace(/<meta\s+charset=["']?utf-8["']?\s*>/gi, "");
html = html.replace(
  /^(<!DOCTYPE html>\s*<html[^>]*>)/i,
  '$1<meta charset="UTF-8">'
);

// restore explicit document close
if (!/<\/html>/i.test(html)) {
  html = html.replace(/\s*$/, "") + "</body></html>";
}

writeFileSync("bundle.html", html, "utf8");
console.log(`bundle.html written: ${before} -> ${html.length} bytes`);
