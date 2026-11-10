const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "src", "app", "globals.css"), "utf8");

test("Accounting embeds the exact Sale font assets with regular and bold faces", () => {
  for (const name of ["CordiaNew.ttf", "CordiaNew-Bold.ttf", "GOTHIC.TTF", "GOTHICB.TTF", "BROADW.TTF", "BRUSHSCI.TTF"]) {
    const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    assert.equal(hash(path.join(root, "public", "fonts", name)), hash(path.join(root, "..", "ui", "public", "fonts", name)), name);
    assert.ok(css.includes(`url("/fonts/${name}")`));
  }
  assert.match(css, /--font-body: "Cordia New"/);
  assert.match(css, /--font-signature: "Brush Script MT"/);
  assert.match(css, /font-family: "Cordia New";[\s\S]*?font-weight: 700;/);
});

test("All Accounting print roots share Sale body typography without changing screen body or stationery geometry", () => {
  const rule = css.match(/#po-print-doc,[\s\S]*?\{\s*font-family: var\(--font-body\) !important;\s*\}/)?.[0];
  assert.ok(rule);
  for (const selector of ["#so-print-doc", "#bi-print-doc", "#rv-print-doc", "#cn-print-doc",
    "#ps-print-doc", "#pv-print-doc", ".gr-paper", ".is-paper", ".cq-paper", ".opening-print", ".stock-card-print-only"]) {
    assert.ok(rule.includes(selector), selector);
  }
  assert.match(css, /#iv-print-doc\s*\{\s*font-family: Calibri, Tahoma, var\(--font-noto-thai\), sans-serif !important;/);
  assert.ok(css.includes("font-family: var(--font-public-sans), var(--font-noto-thai), sans-serif;"));
  assert.equal(rule.includes("font-size"), false);
  assert.equal(rule.includes("height"), false);
  const layout = fs.readFileSync(path.join(root, "src", "app", "layout.tsx"), "utf8");
  for (const name of ["CordiaNew.ttf", "CordiaNew-Bold.ttf", "BRUSHSCI.TTF"]) {
    assert.ok(layout.includes(`rel="preload" href="/fonts/${name}" as="font"`));
  }
});

test("Invoice uses Calibri with comparable Thai fallbacks without changing other documents or embedding system fonts", () => {
  const invoiceRule = css.match(/#iv-print-doc\s*\{([^}]+)\}/)?.[1];
  assert.ok(invoiceRule);
  assert.doesNotMatch(invoiceRule, /Cordia|Century Gothic|--font-body|--font-en|font-size|line-height/);
  assert.doesNotMatch(css, /url\([^)]*(?:calibri|tahoma)/i);
  const invoice = fs.readFileSync(path.join(root, "src", "components", "invoice-document.tsx"), "utf8");
  assert.ok(invoice.includes("text-[12pt]"));
  assert.ok(invoice.includes("document.fonts.ready"));
  assert.ok(invoice.includes("let size = 12;"));
  assert.ok(invoice.includes('top: "30mm"'));
});
