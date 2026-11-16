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
const print = loadUiModule('components/HandoverPrint.tsx', '\nexport { splitItemIntoFragments }\n')

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
