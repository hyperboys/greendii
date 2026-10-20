const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function loadSource(relativePath, imports) {
  const filename = path.join(__dirname, "..", "src", ...relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  }).outputText;
  const result = { exports: {} };
  vm.runInNewContext(source, {
    exports: result.exports,
    module: result,
    require: name => Object.hasOwn(imports, name) ? imports[name] : require(name),
  }, { filename });
  return result.exports;
}

const policy = loadSource(["lib", "accounting-access.ts"], {
  "./api": { apiFetch: () => { throw new Error("Unexpected network call"); } },
});
const access = permissions => ({ allowed: true, isAdmin: false, role: { id: "ar", name: "AR" }, permissions });

test("Accounting viewers stay read-only and cannot open other modules or settings", () => {
  const viewer = access(["ar.view"]);
  assert.equal(policy.canOpenAccountingPath(viewer, "/ar/invoices"), true);
  assert.equal(policy.canOpenAccountingPath(viewer, "/ar/receipts"), true);
  assert.equal(policy.canOpenAccountingPath(viewer, "/ap/vouchers"), false);
  assert.equal(policy.canOpenAccountingPath(viewer, "/settings/access"), false);
  assert.equal(policy.canUseAccounting(viewer, "ar", "create"), false);
  assert.equal(policy.canUseAccounting(access(["ar.create"]), "ar", "create"), false);
  assert.equal(policy.canOpenAccountingPath({ ...viewer, allowed: false }, "/dashboard"), false);
});

test("Dashboard renders an authorized create link without exposing it to viewers", () => {
  let currentAccess = access(["ar.view"]);
  const { default: Dashboard } = loadSource(["app", "dashboard", "page.tsx"], {
    "@/components/app-shell": { AppShell: ({ children }) => children },
    "@/components/accounting-access-provider": { useAccountingAccess: () => currentAccess },
    "@/lib/accounting-access": policy,
    "next/link": { default: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children) },
  });
  const viewerHtml = renderToStaticMarkup(React.createElement(Dashboard));
  assert.ok(viewerHtml.includes("ภาพรวมบัญชี"));
  assert.equal(viewerHtml.includes("สร้างรายการใหม่"), false);
  currentAccess = access(["ar.view", "ar.create"]);
  const creatorHtml = renderToStaticMarkup(React.createElement(Dashboard));
  assert.ok(creatorHtml.includes('href="/ar/invoices"'));
  assert.ok(creatorHtml.includes("สร้างรายการใหม่"));
});

test("Login renders username/password fields with the installed React and icon packages", () => {
  const { default: Login } = loadSource(["app", "login", "page.tsx"], {
    "next/navigation": { useRouter: () => ({ replace: () => {} }) },
    "next/image": { default: ({ priority, ...props }) => React.createElement("img", props) },
    "@/lib/auth": { hasSession: () => false, login: () => { throw new Error("Unexpected login"); } },
  });
  const html = renderToStaticMarkup(React.createElement(Login));
  assert.ok(html.includes('autoComplete="username"'));
  assert.ok(html.includes('autoComplete="current-password"'));
  assert.ok(html.includes('type="password"'));
  assert.ok(html.includes("เข้าสู่ระบบ"));
  assert.ok(html.includes("<svg"));
});

test("Tailwind generates the existing sidebar, chart, content, and modal spacing", async () => {
  const { default: config } = loadSource(["..", "tailwind.config.ts"], {});
  const postcss = require("postcss");
  const tailwind = require("tailwindcss");
  const result = await postcss([tailwind({
    ...config,
    content: [{ raw: "w-63 h-58.75 min-h-87.5 max-w-370 max-w-4 !mt-5 size-9", extension: "html" }],
  })]).process("@tailwind utilities;", { from: undefined });
  const declarations = {};
  result.root.walkRules(rule => {
    declarations[rule.selector] = {};
    rule.walkDecls(declaration => { declarations[rule.selector][declaration.prop] = declaration.value; });
  });
  assert.equal(declarations[".w-63"].width, "252px");
  assert.equal(declarations[".h-58\\.75"].height, "235px");
  assert.equal(declarations[".min-h-87\\.5"]["min-height"], "350px");
  assert.equal(declarations[".max-w-370"]["max-width"], "1480px");
  assert.equal(declarations[".max-w-4"]["max-width"], "16px");
  assert.equal(declarations[".\\!mt-5"]["margin-top"], "1.25rem");
  assert.equal(declarations[".size-9"].width, "2.25rem");
});
