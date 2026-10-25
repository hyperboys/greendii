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
