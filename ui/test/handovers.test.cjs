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
const print = loadUiModule('components/HandoverPrint.tsx', '\nexport { splitItemIntoFragments, splitTextByMeasuredHeight, paginateItems, packByHeight }\n')

test('printed handover detail rows keep their quantities and units', () => {
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
  const printedRows = print.splitItemIntoFragments(savedItem, 0)
    .flatMap(fragment => fragment.detailRows)

  assert.deepEqual(printedRows, [
    { desc: 'Customer note', qty: null, unit: '' },
    { desc: 'Size: W2,400 x H1,500mm. W125mm.', qty: 1, unit: 'Set' },
    { desc: 'Aluminum frame with temper glass 6mm.', qty: 3, unit: 'Sets' },
  ])
})

test('long handover details split into individually measured continuation rows', () => {
  const detailRows = Array.from({ length: 24 }, (_, index) => ({
    desc: `Detail ${index + 1}`,
    qty: index + 1,
    unit: 'Set',
  }))
  const fragments = print.splitItemIntoFragments({
    seq: 4,
    desc: 'Long item',
    detailRows,
    qty: 1,
    unit: 'Lot',
    images: [],
  }, 4)

  assert.equal(fragments.length, 24)
  assert.equal(fragments[0].displaySeq, 5)
  assert.equal(fragments[1].displaySeq, undefined)
  assert.equal(fragments[0].continuation, false)
  assert.ok(fragments.slice(1).every(fragment => fragment.continuation))
  assert.deepEqual(fragments.flatMap(fragment => fragment.detailRows), detailRows)
  assert.ok(fragments.every(fragment => fragment.detailRows.length <= 1))
})

test('a description taller than one page is split by measured height without losing text', () => {
  const description = 'A long description with wrapped text. '.repeat(40)
  const measureHeight = text => Math.ceil(Array.from(text).length / 10) * 10
  const fragments = print.splitTextByMeasuredHeight(description, 50, measureHeight)

  assert.ok(fragments.length > 1)
  assert.equal(fragments.join(''), description)
  assert.ok(fragments.every(fragment => measureHeight(fragment) <= 50))
})

test('the next handover item remains a numbered row after a continuation', () => {
  const itemFive = print.splitItemIntoFragments({
    seq: 4,
    desc: 'Item five',
    detailRows: [
      { desc: 'First detail', qty: 1, unit: 'Set' },
      { desc: 'Continued detail', qty: 2, unit: 'Set' },
    ],
    images: [],
  }, 4)
  const itemSix = print.splitItemIntoFragments({
    seq: 5,
    desc: 'Item six',
    detailRows: [],
    images: [],
  }, 5)

  assert.deepEqual(
    [...itemFive, ...itemSix].map(fragment => ({
      displaySeq: fragment.displaySeq,
      continuation: fragment.continuation,
    })),
    [
      { displaySeq: 5, continuation: false },
      { displaySeq: undefined, continuation: true },
      { displaySeq: 6, continuation: false },
    ],
  )
})

test('fallback pagination moves trailing items onto the evaluation page', () => {
  const makeItem = (key) => ({
    key,
    desc: key,
    detailRows: Array.from({ length: 12 }, (_, index) => ({ desc: `${key} detail ${index + 1}`, qty: null, unit: '' })),
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
    detailRows: [],
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
    detailRows: [],
    images: [],
  }))
  const pages = print.packByHeight(items, [151, 100], 500, 250)

  assert.equal(pages.length, 2)
  assert.deepEqual(pages.map(page => page.items.map(item => item.key)), [['first'], ['last']])
  assert.equal(pages[1].tail, true)
  assert.deepEqual(pages.flatMap(page => page.items.map(item => item.key)), ['first', 'last'])
})

test('smaller continuation fragments use remaining space before moving to the next page', () => {
  const keys = ['short-1', 'short-2', 'short-3', 'short-4', 'detail-1', 'detail-2', 'detail-3', 'detail-4', 'last-item']
  const items = keys.map(key => ({ key, desc: key, detailRows: [], images: [] }))
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
