const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(relativePath, imports = {}, globals = {}) {
  const filename = path.join(__dirname, "..", "src", ...relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
  }).outputText;
  const result = { exports: {} };
  vm.runInNewContext(source, {
    exports: result.exports, module: result, ...globals,
    require: name => Object.hasOwn(imports, name) ? imports[name] : require(name),
  }, { filename });
  return result.exports;
}

const navigation = load(["lib", "accounting-navigation.ts"]);
const policy = load(["lib", "accounting-access.ts"], { "./api": {} });
const fullAccess = {
  allowed: true, isAdmin: true, role: { id: "test", name: "Test" },
  permissions: ["ar", "ap", "inventory", "master", "reports"].map(module => `${module}.view`),
};

test("Every sidebar tab supports direct URLs and defaults to the first section", () => {
  for (const tabs of [navigation.invoiceTabs, navigation.payableTabs, navigation.inventoryTabs, navigation.masterTabs, navigation.reportTabs]) {
    for (const tab of tabs) assert.equal(navigation.selectedTab(tabs, tab.id), tab.id);
    assert.equal(navigation.selectedTab(tabs), tabs[0].id);
    assert.equal(navigation.selectedTab(tabs, "unknown"), tabs[0].id);
    assert.equal(navigation.selectedTab(tabs, ["suppliers", "customers"]), tabs[0].id);
  }
});

test("Sidebar groups are accessible, highlight query/detail routes and respect permissions", () => {
  let pathname = "/master";
  let query = "tab=suppliers";
  let access = fullAccess;
  const { AppShell } = load(["components", "app-shell.tsx"], {
    "next/navigation": { usePathname: () => pathname, useSearchParams: () => new URLSearchParams(query), useRouter: () => ({}) },
    "next/link": { default: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children) },
    "next/image": { default: props => React.createElement("img", props) },
    "@/components/auth-guard": { AuthGuard: ({ children }) => children },
    "@/lib/auth": { getStoredUser: () => ({ username: "Test" }) },
    "@/components/accounting-access-provider": { useAccountingAccess: () => access },
    "@/lib/accounting-access": policy,
    "@/lib/accounting-navigation": navigation,
  });
  const render = () => renderToStaticMarkup(React.createElement(AppShell, null, "Page content"));
  let html = render();
  assert.match(html, /aria-expanded="true" aria-controls="nav--master"/);
  assert.match(html, /href="\/master\?tab=suppliers" aria-current="page"/);
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  pathname = "/master/customers/customer-1/edit";
  html = render();
  assert.match(html, /href="\/master\?tab=customers" aria-current="page"/);
  pathname = "/ar/receipts";
  html = render();
  assert.match(html, /href="\/ar\/receipts" aria-current="page"/);
  access = { ...fullAccess, isAdmin: false, permissions: ["ar.view"] };
  html = render();
  assert.equal(html.includes('href="/master?tab=suppliers"'), false);
  assert.equal(html.includes('href="/settings/access"'), false);
  pathname = "/login";
  assert.equal(render(), "Page content");
});

test("Desktop sidebar toggles an icon rail, reopens parent groups, and restores the mobile drawer", () => {
  const states = [];
  let cursor = 0;
  const { AppShell } = load(["components", "app-shell.tsx"], {
    react: {
      ...React,
      useEffect: () => {},
      useRef: () => ({ current: null }),
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      },
    },
    "next/navigation": { usePathname: () => "/master", useSearchParams: () => new URLSearchParams(), useRouter: () => ({}) },
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "next/image": { default: props => React.createElement("img", props) },
    "@/components/auth-guard": { AuthGuard: ({ children }) => children },
    "@/lib/auth": { getStoredUser: () => ({ username: "Test" }) },
    "@/components/accounting-access-provider": { useAccountingAccess: () => fullAccess },
    "@/lib/accounting-access": policy,
    "@/lib/accounting-navigation": navigation,
  });
  function render() { cursor = 0; return AppShell({ children: "Page content" }); }
  function find(tree, label) {
    if (!React.isValidElement(tree)) return undefined;
    if (tree.type === "button" && tree.props["aria-label"] === label) return tree;
    for (const child of React.Children.toArray(tree.props.children)) {
      const match = find(child, label);
      if (match) return match;
    }
  }
  let tree = render();
  find(tree, "ย่อเมนูด้านซ้าย").props.onClick();
  tree = render();
  let html = renderToStaticMarkup(tree);
  assert.match(html, /lg:grid-cols-\[72px_minmax\(0,1fr\)\]/);
  assert.match(html, /title="ข้อมูลหลัก &amp; ผังบัญชี" aria-expanded="false"/);
  assert.match(html, /aria-label="ภาพรวมบัญชี" title="ภาพรวมบัญชี"/);
  assert.equal(find(tree, "ขยายเมนูด้านซ้าย").props["aria-expanded"], false);
  find(tree, "ข้อมูลหลัก & ผังบัญชี").props.onClick();
  tree = render();
  assert.match(renderToStaticMarkup(tree), /lg:grid-cols-\[252px_minmax\(0,1fr\)\]/);
  assert.equal(find(tree, "ข้อมูลหลัก & ผังบัญชี").props["aria-expanded"], true);
  find(tree, "ย่อเมนูด้านซ้าย").props.onClick();
  tree = render();
  find(tree, "ขยายเมนูด้านซ้าย").props.onClick();
  tree = render();
  assert.equal(find(tree, "ย่อเมนูด้านซ้าย").props["aria-expanded"], true);
  find(tree, "ย่อเมนูด้านซ้าย").props.onClick();
  tree = render();
  find(tree, "เปิดเมนู").props.onClick();
  html = renderToStaticMarkup(render());
  assert.match(html, /lg:grid-cols-\[252px_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(html, /-translate-x-full/);
});

test("Access refresh keeps same-session children mounted, rejects revocation/errors, and ignores stale responses", async () => {
  let pathname = "/dashboard";
  let token = "session-1";
  const states = [];
  const effects = [];
  const pendingEffects = [];
  const requests = [];
  const listeners = new Map();
  let cursor = 0;
  const router = { replace() {} };
  const { AccountingAccessProvider } = load(["components", "accounting-access-provider.tsx"], {
    react: {
      ...React,
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      },
      useEffect(callback, deps) {
        const index = cursor++;
        const previous = effects[index];
        if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
          pendingEffects.push(() => {
            previous?.cleanup?.();
            effects[index] = { deps, cleanup: callback() };
          });
        }
      },
    },
    "next/navigation": { usePathname: () => pathname, useRouter: () => router },
    "@/lib/accounting-access": {
      ...policy, AccountingAccessApi: { me: () => new Promise((resolve, reject) => requests.push({ resolve, reject })) },
    },
    "@/lib/accounting-navigation": navigation,
    "@/lib/auth": { getSessionToken: () => token, getStoredUser: () => ({}) },
  }, {
    window: {
      addEventListener: (name, callback) => listeners.set(name, callback),
      removeEventListener: name => listeners.delete(name),
    },
    Error,
  });
  const children = React.createElement("div", null, "Protected content");
  function render() {
    cursor = 0;
    const tree = AccountingAccessProvider({ children });
    pendingEffects.splice(0).forEach(effect => effect());
    return tree;
  }
  const settle = async (index, access) => { requests[index].resolve(access); await new Promise(resolve => setImmediate(resolve)); };
  assert.match(renderToStaticMarkup(render()), /กำลังตรวจสอบสิทธิ์ Accounting/);
  await settle(0, fullAccess);
  const first = render();
  assert.equal(first.props.children, children);
  pathname = "/master";
  const navigating = render();
  assert.equal(navigating.type, first.type);
  assert.equal(navigating.props.children, children);
  assert.equal(requests.length, 2);
  listeners.get("focus")();
  await settle(2, { ...fullAccess, allowed: false });
  assert.match(renderToStaticMarkup(render()), /ยังไม่ได้รับสิทธิ์ Accounting/);
  await settle(1, fullAccess);
  assert.match(renderToStaticMarkup(render()), /ยังไม่ได้รับสิทธิ์ Accounting/);
  pathname = "/reports";
  render();
  requests[3].reject(new Error("Access service unavailable"));
  await new Promise(resolve => setImmediate(resolve));
  assert.match(renderToStaticMarkup(render()), /Access service unavailable/);
  pathname = "/login";
  assert.equal(render(), children);
  pathname = "/dashboard";
  token = "session-2";
  assert.match(renderToStaticMarkup(render()), /กำลังตรวจสอบสิทธิ์ Accounting/);
  await settle(4, fullAccess);
  assert.equal(render().props.children, children);
  pathname = "/settings/access";
  states[0] = { sessionToken: token, access: { ...fullAccess, isAdmin: false } };
  assert.match(renderToStaticMarkup(render()), /ไม่มีสิทธิ์เข้าเมนูนี้/);
});

test("Only the root layout owns AppShell, not individual pages", () => {
  const app = path.join(__dirname, "..", "src", "app");
  assert.match(fs.readFileSync(path.join(app, "layout.tsx"), "utf8"), /<AppShell>/);
  function check(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) check(filename);
      else if (entry.name === "page.tsx") assert.doesNotMatch(fs.readFileSync(filename, "utf8"), /AppShell/);
    }
  }
  check(app);
});

test("Responsive styles bound modal height and retain touch-friendly controls and scrollable tables", () => {
  const postcss = require("postcss");
  const css = postcss.parse(fs.readFileSync(path.join(__dirname, "..", "src", "app", "globals.css"), "utf8"));
  const rules = [];
  css.walkRules(rule => {
    const declarations = {};
    rule.walkDecls(declaration => { declarations[declaration.prop] = declaration.value; });
    rules.push({ selector: rule.selector, media: rule.parent.params, declarations });
  });
  const modal = rules.find(rule => rule.selector === ".accounting-modal > div" && !rule.media);
  assert.equal(modal.declarations["max-height"], "calc(100dvh - 2rem)");
  assert.equal(modal.declarations["overflow-y"], "auto");
  const touch = rules.find(rule => rule.selector.includes("body input[class]"));
  assert.equal(touch.media, "(max-width: 1023px)");
  assert.equal(touch.declarations["font-size"], "16px");
  assert.equal(touch.declarations["min-height"], "44px");
  const table = rules.find(rule => rule.selector === ".accounting-shell table");
  assert.equal(table.media, "(max-width: 1023px)");
  assert.equal(table.declarations["min-width"], "640px");
  for (const segments of [
    ["app", "ar", "invoices", "page.tsx"], ["app", "ar", "receipts", "page.tsx"],
    ["app", "ap", "vouchers", "page.tsx"], ["app", "inventory", "page.tsx"],
    ["app", "master", "page.tsx"], ["components", "customer-master.tsx"],
  ]) {
    const source = fs.readFileSync(path.join(__dirname, "..", "src", ...segments), "utf8");
    assert.match(source, /accounting-modal fixed inset-0/);
  }
});
