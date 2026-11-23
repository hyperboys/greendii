const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
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

const handOverItems = loadUiModule('lib/handOverItems.ts')
const print = loadUiModule('components/HandoverPrint.tsx', '\nexport { buildItemDescription, buildRenderableItems, splitTextByMeasuredHeight, paginateItems, packByHeight }\n')

test('printed handover item is one description block and retains detail quantities and units', () => {
  const item = {
    seq: 0,
    desc: 'Window fix glass',
    qty: 0,
    unit: '',
    images: [],
    ...handOverItems.stringifyHandOverDetailRows([
      { desc: 'Size: W2,400 x H1,500mm. W125mm.', qty: 1, unit: 'Set' },
      { desc: 'Aluminum frame with temper glass 6mm.', qty: 3, unit: 'Sets' },
    ], {
      noteBlocks: [{ text: 'Customer note' }],
      detailBeforeNote: false,
    }),
  }
  const savedItem = handOverItems.normalizeHandOverItems([item])[0]
  const printedDescription = print.buildItemDescription(savedItem)

  assert.equal(printedDescription, [
    'Window fix glass',
    'Customer note',
    'Size: W2,400 x H1,500mm. W125mm. 1 Set',
    'Aluminum frame with temper glass 6mm. 3 Sets',
  ].join('\n'))
})

test('each handover item begins as one row regardless of detail count', () => {
  const detailRows = Array.from({ length: 24 }, (_, index) => ({
    desc: `Detail ${index + 1}`,
    qty: index + 1,
    unit: 'Set',
  }))
  const [item] = print.buildRenderableItems([{
    seq: 4,
    desc: 'Long item',
    detailRows,
    qty: 1,
    unit: 'Lot',
    images: [],
  }])

  assert.equal(item.displaySeq, 5)
  assert.equal(item.continuation, false)
  assert.equal(item.desc, 'Long item')
  assert.equal(item.detailRows.length, 24)
  assert.equal(item.detailRows[23].desc, 'Detail 24')
  assert.equal(item.detailRows[23].qty, 24)
  assert.equal(item.detailRows[23].unit, 'Set')
})

test('a description taller than one page is split by measured height without losing text', () => {
  const description = 'A long description with wrapped text. '.repeat(40)
  const measureHeight = text => Math.ceil(Array.from(text).length / 10) * 10
  const fragments = print.splitTextByMeasuredHeight(description, 50, measureHeight)

  assert.ok(fragments.length > 1)
  assert.equal(fragments.join(''), description)
  assert.ok(fragments.every(fragment => measureHeight(fragment) <= 50))
})

test('item six remains a separate numbered row after a long item five block', () => {
  const [itemFive, itemSix] = print.buildRenderableItems([{
    seq: 4,
    desc: 'Item five',
    detailRows: [
      { desc: 'First detail', qty: 1, unit: 'Set' },
      { desc: 'Continued detail', qty: 2, unit: 'Set' },
    ],
    images: [],
  }, {
    seq: 5,
    desc: 'Item six',
    detailRows: [],
    images: [],
  }])

  assert.deepEqual(
    [itemFive, itemSix].map(item => ({
      displaySeq: item.displaySeq,
      continuation: item.continuation,
    })),
    [
      { displaySeq: 5, continuation: false },
      { displaySeq: 6, continuation: false },
    ],
  )
  assert.ok(itemFive.detailRows.some(row => row.desc === 'Continued detail'))
  assert.ok(itemFive.detailRows.some(row => row.qty === 2 && row.unit === 'Set'))
  assert.equal(itemSix.desc, 'Item six')
})

test('fallback pagination moves trailing items onto the evaluation page', () => {
  const makeItem = (key) => ({
    key,
    desc: `${key} `.repeat(1300),
    images: [],
  })

  const pages = print.paginateItems([makeItem('first'), makeItem('last')])

  assert.equal(pages.length, 2)
  assert.deepEqual(pages.map(page => page.items.map(item => item.key)), [['first'], ['last']])
  assert.equal(pages[1].tail, true)
})

test('measured pagination includes rows exactly at the evaluation-page capacity', () => {
  const items = ['first', 'last'].map(key => ({
    key,
    desc: key,
    images: [],
  }))
  const pages = print.packByHeight(items, [150, 100], 500, 250)

  assert.equal(pages.length, 1)
  assert.deepEqual(pages[0].items.map(item => item.key), ['first', 'last'])
  assert.equal(pages[0].tail, true)
})

test('measured pagination moves trailing rows when they fit after a slight overflow', () => {
  const items = ['first', 'last'].map(key => ({
    key,
    desc: key,
    images: [],
  }))
  const pages = print.packByHeight(items, [151, 100], 500, 250)

  assert.equal(pages.length, 2)
  assert.deepEqual(pages.map(page => page.items.map(item => item.key)), [['first'], ['last']])
  assert.equal(pages[1].tail, true)
  assert.deepEqual(pages.flatMap(page => page.items.map(item => item.key)), ['first', 'last'])
})

test('a continuation can fill the current page and resume at the next page', () => {
  const items = [
    { key: 'before', desc: 'Before', images: [] },
    { key: 'item-five-first-part', desc: 'First part', images: [] },
    { key: 'item-five-continuation', desc: 'Continued part', images: [], forcePageBreakBefore: true },
    { key: 'item-six', desc: 'Item six', images: [] },
  ]
  const pages = print.packByHeight(items, [120, 30, 50, 40], 150, 150)

  assert.deepEqual(
    pages.map(page => page.items.map(item => item.key)),
    [
      ['before', 'item-five-first-part'],
      ['item-five-continuation', 'item-six'],
    ],
  )
})

test('smaller continuation fragments use remaining space before moving to the next page', () => {
  const keys = ['short-1', 'short-2', 'short-3', 'short-4', 'detail-1', 'detail-2', 'detail-3', 'detail-4', 'last-item']
  const items = keys.map(key => ({ key, desc: key, images: [] }))
  const pages = print.packByHeight(items, [30, 30, 30, 30, 110, 150, 150, 110, 50], 550, 230)

  assert.deepEqual(
    pages.map(page => page.items.map(item => item.key)),
    [
      ['short-1', 'short-2', 'short-3', 'short-4', 'detail-1', 'detail-2', 'detail-3'],
      ['detail-4', 'last-item'],
    ],
  )
  assert.equal(pages[1].tail, true)
  assert.deepEqual(pages.flatMap(page => page.items.map(item => item.key)), keys)
})
