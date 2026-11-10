const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function fixture(browser = true) {
  const calls = [];
  let token = "session-a";
  const module = { exports: {} };
  const filename = path.join(__dirname, "..", "src", "lib", "api.ts");
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, URLSearchParams,
    ...(browser ? { window: {}, localStorage: { getItem: () => token } } : {}),
    fetch: (endpoint, options) => new Promise((resolve, reject) => {
      calls.push({ endpoint, options, reject,
        finish: (data, ok = true) => resolve({ ok, status: ok ? 200 : 503, json: async () => data }) });
    }),
  });
  return { api: module.exports, calls, setToken: value => { token = value; } };
}

test("Concurrent identical Accounting reads make one request; completed reads always fetch again", async () => {
  const { api, calls } = fixture();
  const first = api.ArApi.getInvoices();
  const second = api.ArApi.getInvoices();
  assert.equal(calls.length, 1);
  calls[0].finish([{ id: "iv" }]);
  assert.deepEqual(await first, await second);
  const fresh = api.ArApi.getInvoices();
  assert.equal(calls.length, 2);
  calls[1].finish([{ id: "updated" }]);
  assert.equal((await fresh)[0].id, "updated");
});

test("Different queries and sessions never share reads", async () => {
  const { api, calls, setToken } = fixture();
  const reads = [api.ArApi.getInvoices({ q: "a" }), api.ArApi.getInvoices({ q: "b" })];
  setToken("session-b");
  reads.push(api.ArApi.getInvoices({ q: "a" }));
  assert.equal(calls.length, 3);
  assert.notDeepEqual(calls[0].options.headers, calls[2].options.headers);
  calls.forEach(call => call.finish([]));
  await Promise.all(reads);
});

test("Failed shared reads notify all callers and permit retry", async () => {
  for (const networkError of [false, true]) {
    const { api, calls } = fixture();
    const outcomes = Promise.allSettled([api.apiFetch("/api/test"), api.apiFetch("/api/test")]);
    assert.equal(calls.length, 1);
    if (networkError) calls[0].reject(new Error("Network unavailable"));
    else calls[0].finish({ message: "Database unavailable" }, false);
    for (const result of await outcomes) {
      assert.equal(result.status, "rejected");
      assert.match(result.reason.message, /unavailable/);
    }
    const retry = api.apiFetch("/api/test");
    assert.equal(calls.length, 2);
    calls[1].finish([]);
    await retry;
  }
});

test("Writes are never shared and separate reads before, during and after a save", async () => {
  const { api, calls } = fixture();
  const before = api.apiFetch("/api/test");
  const save = api.apiFetch("/api/test", { method: "POST", body: "{}" });
  const during = api.apiFetch("/api/test");
  const anotherSave = api.apiFetch("/api/test", { method: "POST", body: "{}" });
  assert.equal(calls.length, 4);
  calls[1].finish({ id: "saved" });
  await save;
  const after = api.apiFetch("/api/test");
  assert.equal(calls.length, 5);
  calls[0].finish({ version: "old" });
  await before;
  const sharedAfter = api.apiFetch("/api/test");
  assert.equal(calls.length, 5, "old reads must not remove newer in-flight reads");
  calls[2].finish({ version: "during" });
  calls[3].finish({});
  calls[4].finish({ version: "new" });
  await Promise.all([during, anotherSave, after, sharedAfter]);
});

test("Custom requests, abortable reads and server-side calls stay independent", async () => {
  for (const browser of [false, true]) {
    const { api, calls } = fixture(browser);
    const options = browser ? { signal: new AbortController().signal } : undefined;
    const first = api.apiFetch("/api/test", options);
    const second = api.apiFetch("/api/test", options);
    assert.equal(calls.length, 2);
    calls.forEach(call => call.finish([]));
    await Promise.all([first, second]);
  }
});

test("A failed write also releases reads started while it was pending", async () => {
  const { api, calls } = fixture();
  const save = api.apiFetch("/api/test", { method: "PUT", body: "{}" });
  const outcome = Promise.allSettled([save]);
  const during = api.apiFetch("/api/test");
  calls[0].finish({ message: "Save unavailable" }, false);
  assert.equal((await outcome)[0].status, "rejected");
  const retryRead = api.apiFetch("/api/test");
  assert.equal(calls.length, 3);
  calls[1].finish({ version: "during" });
  calls[2].finish({ version: "current" });
  await Promise.all([during, retryRead]);
});
