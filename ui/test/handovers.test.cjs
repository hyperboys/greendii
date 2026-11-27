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
const print = loadUiModule('components/HandoverPrint.tsx', '\nexport { buildItemDescription, buildRenderableItems, splitTextByMeasuredHeight, splitItemForHeight, reflowItemsToPageSpace, paginateItems, packByHeight }\n')

function measuredRow(item) {
  const details = item.detailRows.flatMap((row, index) =>
    Array.from({ length: 3 }, (_, column) => ({
      dataset: { handoverDetail: String(index) },
      style: { display: 'block' },
      textContent: column === 0 ? row.desc : '',
      column,
    })),
  )
  const probe = {
    querySelector(selector) {
      if (selector === '[data-handover-images]') return null
      const match = selector.match(/data-handover-detail="(\d+)"/)
      return match ? details.find(detail => detail.column === 0 && detail.dataset.handoverDetail === match[1]) : null
    },
    querySelectorAll() { return details },
    getBoundingClientRect() {
      const base = !item.continuation || item.desc ? 20 : 0
      const height = details.filter(detail => detail.column === 0 && detail.style.display !== 'none')
        .reduce((sum, detail) => sum + Math.max(10, Math.ceil(detail.textContent.length / 20) * 10), base)
      return { height }
    },
    remove() {},
  }
  return {
    parentElement: { appendChild() {} },
    cloneNode() { return probe },
    querySelector() { return null },
  }
}

test('initial layout measures committed rows instead of falling back to estimated pagination', async () => {
  const refs = []
  const effects = []
  const pageUpdates = []
  let stateIndex = 0
  const hooks = {
    useState(initial) {
      const index = stateIndex++
      return [initial, value => { if (index === 0) pageUpdates.push(value) }]
    },
    useRef(initial) {
      const ref = { current: initial }
      refs.push(ref)
      return ref
    },
    useMemo(callback) { return callback() },
    useEffect(callback) { effects.push(callback) },
  }
  const filename = path.join(sourceRoot, 'components/HandoverPrint.tsx')
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
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
    if (name === 'react') return hooks
    if (name === '@/lib/api') return { resolveFileUrl: value => value }
    if (name.startsWith('@/')) return loadUiModule(`${name.slice(2)}.ts`)
    return require(name)
  }
  new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports)

  const items = Array.from({ length: 14 }, (_, seq) => ({
    seq, desc: `Item ${seq + 1}`, detailRows: [], images: [],
  }))
  module.exports.default({ doc: { items }, settings: null })
  const element = height => ({
    getBoundingClientRect: () => ({ height }),
    querySelectorAll: () => [],
  })
  refs[0].current = element(0)
  refs[1].current = element(1062)
  refs[2].current = element(200)
  refs[3].current = element(20)
  refs[4].current = element(400)
  refs[5].current = items.map(() => element(20))

  const previousDocument = global.document
  const previousAnimationFrame = global.requestAnimationFrame
  global.document = { fonts: { ready: Promise.resolve() } }
  global.requestAnimationFrame = callback => callback()
  try {
    effects[0]()
    effects[1]()
    await new Promise(resolve => setImmediate(resolve))
  } finally {
    global.document = previousDocument
    global.requestAnimationFrame = previousAnimationFrame
  }

  const pages = pageUpdates.find(Array.isArray)
  assert.equal(pages.length, 1)
  assert.equal(pages[0].items.length, 14)
})

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

test('a long item uses the remaining page space and carries its details forward in order', () => {
  const item = print.buildRenderableItems([{
    seq: 7,
    desc: 'Rack accessories',
    detailRows: Array.from({ length: 11 }, (_, index) => ({
      desc: `Detail ${index + 1}`,
      qty: index + 1,
      unit: 'Set',
    })),
    qty: 2,
    unit: 'Lot',
    images: ['rack.png'],
  }])[0]
  const [first, continued] = print.splitItemForHeight(item, measuredRow(item), 70)

  assert.equal(first.detailRows.length, 5)
  assert.equal(first.displaySeq, 8)
  assert.equal(first.qty, 2)
  assert.deepEqual(first.images, [])
  assert.equal(continued.continuationNo, 8)
  assert.equal(continued.forcePageBreakBefore, true)
  assert.equal(continued.qty, undefined)
  assert.deepEqual(continued.images, ['rack.png'])
  assert.deepEqual([...first.detailRows, ...continued.detailRows], item.detailRows)
})

test('splitting a long item can reduce a three-page handover to two pages', () => {
  const items = print.buildRenderableItems(Array.from({ length: 14 }, (_, index) => ({
    seq: index,
    desc: `Item ${index + 1}`,
    detailRows: index === 7
      ? Array.from({ length: 11 }, (_, i) => ({ desc: `Detail ${i + 1}`, qty: null, unit: '' }))
      : [],
    images: [],
  })))
  const heights = [40, 40, 30, 30, 30, 30, 30, 130, 15, 15, 15, 15, 15, 15]
  assert.equal(print.packByHeight(items, heights, 300, 160).length, 3)

  const rows = items.map(item => measuredRow(item))
  const fragments = print.reflowItemsToPageSpace(items, rows, heights, 300)
  const fragmentHeights = [...heights.slice(0, 7), 70, 60, ...heights.slice(8)]
  const pages = print.packByHeight(fragments, fragmentHeights, 300, 160)

  assert.equal(pages.length, 2)
  assert.equal(pages[0].items.at(-1).detailRows.length, 5)
  assert.equal(pages[1].items[0].detailRows.length, 6)
  assert.equal(pages[1].tail, true)
})

test('an oversized detail can continue without repeating its quantity or losing text', () => {
  const item = print.buildRenderableItems([{
    seq: 0,
    desc: 'Equipment',
    detailRows: [{ desc: 'Long detail '.repeat(20), qty: 3, unit: 'Set' }],
    qty: 1,
    unit: 'Lot',
    images: [],
  }])[0]
  const [first, continued] = print.splitItemForHeight(item, measuredRow(item), 60)

  assert.equal(first.detailRows[0].desc + continued.detailRows[0].desc, item.detailRows[0].desc)
  assert.equal(first.detailRows[0].qty, 3)
  assert.equal(first.detailRows[0].unit, 'Set')
  assert.equal(continued.detailRows[0].qty, null)
  assert.equal(continued.detailRows[0].unit, '')
})

test('a split detail does not separate Thai combining marks from their base characters', () => {
  const item = print.buildRenderableItems([{
    desc: 'Equipment',
    detailRows: [{ desc: `X${'ก้'.repeat(30)}`, qty: null, unit: '' }],
    images: [],
  }])[0]
  const [first, continued] = print.splitItemForHeight(item, measuredRow(item), 30)

  assert.equal(first.detailRows[0].desc + continued.detailRows[0].desc, item.detailRows[0].desc)
  assert.doesNotMatch(continued.detailRows[0].desc, /^\p{M}/u)
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
    desc: 'x'.repeat(1200),
    images: [],
  })

  const pages = print.paginateItems([makeItem('first'), makeItem('last')])

  assert.equal(pages.length, 2)
  assert.deepEqual(pages.map(page => page.items.map(item => item.key)), [['first'], ['last']])
  assert.equal(pages[1].tail, true)
})

test('pagination keeps as many of fourteen items as possible on the first page', () => {
  const items = Array.from({ length: 14 }, (_, index) => ({
    key: String(index + 1),
    desc: index < 12 ? 'x'.repeat(100) : '',
    images: [],
  }))
  const expected = [items.slice(0, 13).map(item => item.key), ['14']]

  const measured = print.packByHeight(items, items.map(() => 30), 500, 360)
  const fallback = print.paginateItems(items)

  for (const pages of [measured, fallback]) {
    assert.deepEqual(pages.map(page => page.items.map(item => item.key)), expected)
    assert.equal(pages[1].tail, true)
  }
})

test('an item too tall for the evaluation page remains on the content page', () => {
  const items = [{ key: 'tall', desc: 'Tall item', images: [] }]
  const pages = print.packByHeight(items, [300], 500, 200)

  assert.deepEqual(pages.map(page => page.items.map(item => item.key)), [['tall'], []])
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
