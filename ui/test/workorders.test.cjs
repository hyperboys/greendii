const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.resolve(__dirname, '..', '..')
const sourceRoot = path.join(root, 'ui', 'src')
const modules = new Map()

function loadUiModule(relativePath, extraSource = '') {
  if (modules.has(relativePath)) return modules.get(relativePath)
  const filename = path.join(sourceRoot, relativePath)
  const source = fs.readFileSync(filename, 'utf8') + extraSource
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText
  const module = { exports: {} }
  const localRequire = name => {
    if (name === '@/lib/api') return { resolveFileUrl: value => value }
    if (name.startsWith('@/')) return loadUiModule(`${name.slice(2)}.ts`)
    return require(name)
  }
  new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports)
  modules.set(relativePath, module.exports)
  return module.exports
}

const timezone = loadUiModule('lib/timezone.ts')
const items = loadUiModule('lib/workOrderItems.ts')
const print = loadUiModule('components/WorkOrderPrint.tsx', '\nexport { splitItemIntoFragments }\n')
const { parseBangkokDate } = require('../../api/src/lib/timezone')
const routeSource = fs.readFileSync(path.join(root, 'api', 'src', 'routes', 'workorders.js'), 'utf8')

function loadRouteFunction(name) {
  const start = routeSource.indexOf(`function ${name}(`)
  assert.ok(start >= 0, name)
  const remaining = routeSource.slice(start)
  const end = remaining.search(/\n(?:async )?function /)
  assert.ok(end > 0, name)
  return vm.runInNewContext(`(${remaining.slice(0, end).trim()})`, {
    stripQuotationNoteMeta: loadStripQuotationNoteMeta,
  })
}

const loadStripQuotationNoteMeta = note => {
  const tokenIndex = note.indexOf('__QO_NOTE_META__')
  return tokenIndex < 0 ? note : note.slice(0, tokenIndex).trimEnd()
}
const saveItems = loadRouteFunction('normalizeWorkOrderItems')

test('QC, installation and due dates survive repeated edit/save cycles in any browser timezone', () => {
  const originalTz = process.env.TZ
  try {
    for (const zone of ['UTC', 'Asia/Bangkok', 'America/Los_Angeles']) {
      process.env.TZ = zone
      for (const day of ['2026-11-06', '2026-11-07', '2026-11-10', '2027-01-01', '2028-02-29']) {
        let stored = parseBangkokDate(day).toISOString()
        for (let cycle = 0; cycle < 5; cycle += 1) {
          const input = timezone.toBangkokDateInput(stored)
          assert.equal(input, day)
          const [year, month, date] = day.split('-')
          assert.equal(timezone.formatBangkokDate(stored), `${date}/${month}/${year}`)
          stored = parseBangkokDate(input).toISOString()
        }
      }
    }
  } finally {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  }
  assert.equal(timezone.toBangkokDateInput('2026-11-06'), '2026-11-06')
  assert.equal(timezone.toBangkokDateInput(null), '')
  assert.equal(timezone.toBangkokDateInput('invalid'), '')
})

test('revision fallback preserves stored QC and installation timestamps', () => {
  const fallback = routeSource.slice(
    routeSource.indexOf('          qcDateValue = qcDate ||'),
    routeSource.indexOf('          remarkValue = remark ?? prevActiveWo.remark'),
  )
  const qcExpression = routeSource.match(/qcDate: ([^\n]+qcDateValue[^\n]+),/)[1]
  const installExpression = routeSource.match(/installDate: ([^\n]+installDateValue[^\n]+),/)[1]
  const revise = new Function('prevActiveWo', 'qcDate', 'installDate', 'parseBangkokDate', `
    let qcDateValue, installDateValue;
    ${fallback}
    return { qcDate: ${qcExpression}, installDate: ${installExpression} };
  `)
  const stored = { qcDate: parseBangkokDate('2026-11-06'), installDate: parseBangkokDate('2026-11-07') }
  const unchanged = revise(stored, undefined, undefined, parseBangkokDate)
  assert.equal(unchanged.qcDate.getTime(), stored.qcDate.getTime())
  assert.equal(unchanged.installDate.getTime(), stored.installDate.getTime())
  const changed = revise(stored, '2026-11-08', '2026-11-09', parseBangkokDate)
  assert.equal(timezone.toBangkokDateInput(changed.qcDate), '2026-11-08')
  assert.equal(timezone.toBangkokDateInput(changed.installDate), '2026-11-09')
})

for (const detailBeforeNote of [false, true]) {
  test(`save/reopen/preview preserves notes ${detailBeforeNote ? 'below' : 'above'} detail rows`, () => {
    const rows = ['Site Expenses', 'Transportation', 'Exclude', '- Temporary Partition']
      .map(desc => ({ desc, qty: null, unit: '' }))
    let item = {
      seq: 1, desc: 'Indirect Cost', qty: 1, unit: 'Lot', images: [],
      ...items.stringifyWorkOrderDetailRows(rows, {
        detailBeforeNote,
        noteBlocks: [{ text: 'Door note\nSecond note line' }],
      }),
    }
    for (let cycle = 0; cycle < 3; cycle += 1) {
      item = items.mapWorkOrderItems(JSON.parse(JSON.stringify(saveItems(items.normalizeWorkOrderItems([item])))))[0]
      assert.equal(items.parseWorkOrderDetailBeforeNote(item.note), detailBeforeNote)
      const previewRows = print.splitItemIntoFragments(item, 0).flatMap(fragment => fragment.detailRows.map(row => row.desc))
      const notes = ['Door note', 'Second note line']
      assert.deepEqual(previewRows, detailBeforeNote ? [...rows.map(row => row.desc), ...notes] : [...notes, ...rows.map(row => row.desc)])
      assert.equal(item.qty, 1)
      assert.equal(item.unit, 'Lot')
    }
  })
}

test('section order survives saving before the first note is added', () => {
  let item = {
    seq: 0, desc: 'Indirect Cost', qty: 1, unit: 'Lot', images: [],
    ...items.stringifyWorkOrderDetailRows([{ desc: 'Site Expenses', qty: null, unit: '' }], { detailBeforeNote: true }),
  }
  item = items.mapWorkOrderItems(JSON.parse(JSON.stringify(saveItems([item]))))[0]
  assert.equal(items.parseWorkOrderDetailBeforeNote(item.note), true)
  item = {
    ...item,
    ...items.stringifyWorkOrderDetailRows(item.detailRows, {
      detailBeforeNote: items.parseWorkOrderDetailBeforeNote(item.note),
      noteBlocks: ['Added later'],
    }),
  }
  item = JSON.parse(JSON.stringify(saveItems([item])))[0]
  const previewRows = print.splitItemIntoFragments(item, 0).flatMap(fragment => fragment.detailRows.map(row => row.desc))
  assert.deepEqual(previewRows, ['Site Expenses', 'Added later'])
})

test('legacy items without metadata retain their detail lines', () => {
  const item = { desc: 'Legacy', note: 'Detail one\nDetail two', qty: 1, unit: 'Lot' }
  const saved = JSON.parse(JSON.stringify(saveItems([item])))[0]
  const previewRows = print.splitItemIntoFragments(saved, 0).flatMap(fragment => fragment.detailRows.map(row => row.desc))
  assert.deepEqual(previewRows, ['Detail one', 'Detail two'])
  assert.equal(items.parseWorkOrderDetailBeforeNote(saved.note), false)
})

test('inserting a work order item keeps the selected position and resequences saved items', () => {
  const original = Array.from({ length: 20 }, (_, index) => ({
    ...items.createEmptyWorkOrderItem(index),
    desc: `Item ${index + 1}`,
  }))

  const inserted = items.insertWorkOrderItem(original, 16)
  inserted[16] = { ...inserted[16], desc: 'Inserted item' }

  assert.equal(inserted[16].desc, 'Inserted item')
  assert.equal(inserted[17].desc, 'Item 17')
  assert.equal(inserted[20].desc, 'Item 20')
  assert.equal(original.length, 20)

  const saved = items.normalizeWorkOrderItems(inserted)
  assert.equal(saved[16].desc, 'Inserted item')
  assert.equal(saved[16].seq, 16)
  assert.equal(saved[17].desc, 'Item 17')
  assert.equal(saved[17].seq, 17)
  assert.equal(saved[20].desc, 'Item 20')
  assert.equal(saved[20].seq, 20)
})
