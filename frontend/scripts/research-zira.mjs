import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, relative, extname } from 'node:path'
import ts from 'typescript'

const root = resolve('/home/my/workspace/ainfra/zira/frontend')
const sourceRoot = resolve(root, 'src')
const date = process.env.ZIRA_RESEARCH_DATE ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date())
const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const output = resolve(process.env.ZIRA_RESEARCH_OUTPUT ?? `../docs/research/zira-frontend-${date}.json`)
const files = []
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['node_modules', 'dist', 'build', 'coverage'].includes(entry.name)) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) await walk(path)
    else if (entry.isFile() && ['.ts', '.tsx', '.css'].includes(extname(path))) files.push(path)
  }
}
await walk(sourceRoot)
const modules = []
const routes = []
for (const path of files.sort()) {
  const text = await readFile(path, 'utf8')
  const name = relative(root, path)
  const record = { path: name, lines: text.split(/\r?\n/).length, sha256: createHash('sha256').update(text).digest('hex'), imports: [], declarations: [], hooks: [], jsx: [], parseErrors: 0 }
  if (extname(path) !== '.css') {
    const ast = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, extname(path) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const imports = new Set()
    const declarations = new Set()
    const hooks = new Set()
    const jsx = new Set()
    function visit(node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.add(node.moduleSpecifier.text)
      if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) declarations.add(node.name.text)
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^use[A-Z]/.test(node.expression.text)) hooks.add(node.expression.text)
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(ast)
        jsx.add(tag)
        if (tag === 'Route') {
          const attribute = node.attributes.properties.find(property => ts.isJsxAttribute(property) && property.name.getText(ast) === 'path')
          if (attribute?.initializer && ts.isStringLiteral(attribute.initializer)) routes.push({ file: name, path: attribute.initializer.text })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
    record.imports = [...imports].sort()
    record.declarations = [...declarations].sort()
    record.hooks = [...hooks].sort()
    record.jsx = [...jsx].sort()
    record.parseErrors = ast.parseDiagnostics.length
  }
  modules.push(record)
}
const domains = {}
for (const module of modules) {
  const parts = module.path.split('/')
  const area = parts[1] === 'features' ? `features/${parts[2]}` : parts[1] === 'components' ? `components/${parts[2]}` : parts[1]
  const record = domains[area] ??= { files: 0, lines: 0 }
  record.files++; record.lines += module.lines
}
const report = {
  date, source: root, head,
  scope: 'Read-only structural AST inventory of all src TS/TSX and metadata of CSS. Not line-by-line behavioral review, runtime execution or security certification. No .env, credential, database or log files, node_modules or assets are read.',
  totals: { sourceFiles: modules.length, lines: modules.reduce((sum, module) => sum + module.lines, 0), routes: routes.length, syntaxErrors: modules.reduce((sum, module) => sum + module.parseErrors, 0) },
  domains, routes, modules,
}
await mkdir(resolve(output, '..'), { recursive: true })
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ output, totals: report.totals, domains }, null, 2))
