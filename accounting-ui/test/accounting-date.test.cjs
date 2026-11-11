const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const filename = path.join(__dirname, "..", "src", "lib", "accounting-date.ts");
const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const loaded = { exports: {} };
vm.runInNewContext(source, { exports: loaded.exports, module: loaded }, { filename });
const dates = loaded.exports;

test("Current accounting period uses the Thai month and Buddhist year at Bangkok month boundaries", () => {
  for (const [value, expected] of [
    ["2026-11-11T02:31:00Z", "พฤศจิกายน 2569"],
    ["2026-11-30T16:59:59Z", "พฤศจิกายน 2569"],
    ["2026-11-30T17:00:00Z", "ธันวาคม 2569"],
    ["2026-12-31T17:00:00Z", "มกราคม 2570"],
  ]) {
    assert.equal(dates.formatAccountingPeriod(new Date(value)), expected);
  }
});

test("Accounting dates have two-digit day/month, Gregorian year and Bangkok timezone", () => {
  assert.equal(dates.formatAccountingDate("2026-10-25"), "25/10/2026");
  assert.equal(dates.formatAccountingDate("2026-01-01T18:00:00Z"), "02/01/2026");
  assert.equal(dates.formatAccountingDate(null), "-");
  assert.equal(dates.formatAccountingDateTime("2026-01-01T18:00:00Z"), "02/01/2026 01:00:00");
});

test("Date input parses calendar-valid dd/mm/yyyy to ISO without changing API dates", () => {
  assert.equal(dates.parseAccountingDate("25/10/2026"), "2026-10-25");
  assert.equal(dates.parseAccountingDate("29/02/2024"), "2024-02-29");
  for (const invalid of ["29/02/2025", "31/04/2026", "32/01/2026", "01/13/2026", "1/1/2026", "2026-10-25", ""]) {
    assert.equal(dates.parseAccountingDate(invalid), null, invalid);
  }
});

test("Printed document dates use Buddhist years, Latin digits and Bangkok timezone only", () => {
  for (const [value, expected] of [
    ["2026-11-11", "11/11/2569"],
    ["2024-02-29", "29/02/2567"],
    ["2026-01-01T18:00:00Z", "02/01/2569"],
    ["2026-12-31T18:00:00Z", "01/01/2570"],
  ]) {
    assert.equal(dates.formatAccountingDocumentDate(value), expected);
  }
  for (const empty of [null, undefined, ""]) {
    assert.equal(dates.formatAccountingDocumentDate(empty), "-");
  }
  assert.equal(dates.formatAccountingDocumentDateTime("2026-12-31T18:00:00Z"), "01/01/2570 01:00:00");
  assert.equal(dates.formatAccountingDate("2026-11-11"), "11/11/2026");
  assert.equal(dates.formatAccountingDateTime("2026-12-31T18:00:00Z"), "01/01/2027 01:00:00");
  assert.equal(dates.parseAccountingDate("11/11/2026"), "2026-11-11");
});
