const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const sourceRoot = path.resolve(__dirname, '..', 'src')
const modules = new Map()

function loadUiModule(relativePath) {
  if (modules.has(relativePath)) return modules.get(relativePath)
  const source = fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(
    name => name.startsWith('@/') ? loadUiModule(`${name.slice(2)}.ts`) : require(name),
    module, module.exports,
  )
  modules.set(relativePath, module.exports)
  return module.exports
}

function loadHandlers(relativePath, names, context, helpers = []) {
  const source = fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
  const file = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const component = file.statements.find(node =>
    ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword))
  assert.ok(component)
  const declarations = component.body.statements.filter(node =>
    ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => names.includes(declaration.name.getText(file))))
  assert.equal(declarations.length, names.length)
  const prelude = file.statements.filter(node => node !== component && !ts.isImportDeclaration(node))
  const code = [...prelude, ...declarations].map(node => node.getText(file)).join('\n')
  const compiled = ts.transpileModule(`${code}\nreturn { ${[...names, ...helpers].join(', ')} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText
  return new Function(...Object.keys(context), compiled)(...Object.values(context))
}

const colors = loadUiModule('lib/coloredText.ts')
const workOrders = loadUiModule('lib/workOrderItems.ts')
const detail = desc => ({ desc, qty: 2, unit: 'Set', materialPrice: 10, labourPrice: 5, price: 15, amount: 30 })

for (const page of ['app/(app)/quotations/new/page.tsx', 'app/(app)/quotations/[id]/edit/page.tsx']) {
  test(`${page}: insert notes and detail lines in the middle without changing following entries`, () => {
    let form = { items: [
      { desc: 'Other item', qty: 1, note: 'Unchanged', detailRows: [] },
      { desc: 'Indirect cost', qty: 1, note: '', detailRows: [detail('First'), detail('[color=#dc2626]Second')] },
    ] }
    const handlers = loadHandlers(page, ['addNoteBlock', 'addDetailRow'], {
      ...colors,
      setForm: update => { form = update(form) },
    }, ['parseNoteBlocks', 'stringifyNoteBlocks'])
    form.items[1].note = handlers.stringifyNoteBlocks([
      { text: 'Site Expenses\nTransportation' },
      { text: 'Exclude\nWall Opening', color: '#dc2626' },
    ])
    const original = structuredClone(form.items)
    handlers.addNoteBlock(1, 0)
    assert.deepEqual(handlers.parseNoteBlocks(form.items[1].note).map(block => block.text),
      ['Site Expenses\nTransportation', '', 'Exclude\nWall Opening'])
    assert.equal(handlers.parseNoteBlocks(form.items[1].note)[2].color, '#dc2626')
    handlers.addDetailRow(1, 0)
    assert.deepEqual(form.items[1].detailRows.map(row => row.desc), ['First', '', '[color=#dc2626]Second'])
    assert.deepEqual(form.items[1].detailRows[2], original[1].detailRows[1])
    assert.deepEqual(form.items[0], original[0])

    handlers.addNoteBlock(1)
    handlers.addDetailRow(1)
    const reopened = JSON.parse(JSON.stringify(form.items[1]))
    assert.deepEqual(handlers.parseNoteBlocks(reopened.note).map(block => block.text),
      ['Site Expenses\nTransportation', '', 'Exclude\nWall Opening', ''])
    assert.deepEqual(reopened.detailRows.map(row => row.desc), ['First', '', '[color=#dc2626]Second', ''])
  })
}

for (const detailBeforeNote of [false, true]) {
  test(`Work Order: insert middle/last entries and retain colors and section order (${detailBeforeNote})`, () => {
    let items = [
      { ...workOrders.createEmptyWorkOrderItem(0), desc: 'Other item' },
      {
        ...workOrders.createEmptyWorkOrderItem(1), desc: 'Indirect cost',
        ...workOrders.stringifyWorkOrderDetailRows([
          { desc: 'First', qty: 2, unit: 'Set' },
          { desc: '[color=#2563eb]Second', qty: 3, unit: 'Lot' },
        ], {
          noteBlocks: [{ text: 'Site Expenses\nTransportation' }, { text: 'Exclude', color: '#dc2626' }],
          detailBeforeNote,
        }),
      },
    ]
    const original = structuredClone(items)
    const handlers = () => loadHandlers('components/WorkOrderItemsEditor.tsx', ['addNoteBlock', 'addDescriptionLine', 'setDescriptionLineText'], {
      ...workOrders,
      ...colors,
      items,
      detailBeforeNoteByItem: [false, detailBeforeNote],
      onChange: value => { items = value },
    })
    handlers().addNoteBlock(1, 0)
    handlers().addDescriptionLine(1, 0)
    assert.deepEqual(workOrders.parseWorkOrderColoredNoteBlocks(items[1].note), [
      { text: 'Site Expenses\nTransportation', color: undefined },
      { text: '', color: undefined },
      { text: 'Exclude', color: '#dc2626' },
    ])
    assert.deepEqual(items[1].detailRows, [
      original[1].detailRows[0], { desc: '', qty: null, unit: '' }, original[1].detailRows[1],
    ])
    handlers().setDescriptionLineText(1, 1, 'Inserted detail')
    handlers().addNoteBlock(1)
    handlers().addDescriptionLine(1)
    const reopened = JSON.parse(JSON.stringify(items))
    assert.deepEqual(workOrders.parseWorkOrderNoteBlocks(reopened[1].note),
      ['Site Expenses\nTransportation', '', 'Exclude', ''])
    assert.equal(workOrders.parseWorkOrderColoredNoteBlocks(reopened[1].note)[2].color, '#dc2626')
    assert.equal(workOrders.parseWorkOrderDetailBeforeNote(reopened[1].note), detailBeforeNote)
    assert.deepEqual(reopened[0], original[0])
    assert.equal(reopened[1].detailRows.length, 4)
    assert.equal(reopened[1].detailRows[1].desc, 'Inserted detail')
  })
}
