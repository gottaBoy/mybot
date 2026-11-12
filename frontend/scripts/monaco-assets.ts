// Adapted from Astryx's generate-playground-types.mjs.
// Copyright (c) Meta Platforms, Inc. and affiliates.
import {createReadStream} from 'node:fs'
import {readdir, readFile, stat} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {dirname, extname, isAbsolute, join, relative, resolve, sep} from 'node:path'
import * as ts from 'typescript'
import type {Plugin, ViteDevServer} from 'vite'

export type PlaygroundTypeBundle = {
  schemaVersion: 1
  packages: Record<string, string>
  files: Record<string, string>
}

type PackageJson = {
  name: string
  version: string
  types?: string
  typings?: string
  exports?: unknown
}

type PackageLocation = {root: string; typeRoot: string; manifest: PackageJson}

const PREVIEW_PACKAGES = [
  '@astryxdesign/core',
  '@stylexjs/stylex',
  '@heroicons/react',
  'lucide-react',
  'recharts',
  '@astryxdesign/theme-neutral',
  '@astryxdesign/theme-butter',
  '@astryxdesign/theme-chocolate',
  '@astryxdesign/theme-gothic',
  '@astryxdesign/theme-matcha',
  '@astryxdesign/theme-stone',
  '@astryxdesign/theme-y2k',
]

function packageName(moduleId: string) {
  return moduleId.startsWith('@')
    ? moduleId.split('/').slice(0, 2).join('/')
    : moduleId.split('/')[0]
}

async function locatePackage(name: string, from: string): Promise<PackageLocation> {
  const require = createRequire(join(from, 'package.json'))
  let entry: string
  try {
    entry = require.resolve(`${name}/package.json`)
  } catch {
    entry = require.resolve(name)
  }
  let directory = dirname(entry)
  for (;;) {
    try {
      const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as PackageJson
      if (manifest.name === name) {
        const declared = manifest.types ?? manifest.typings
        const typeRoot = declared
          ? dirname(resolve(directory, declared))
          : directory
        return {root: directory, typeRoot, manifest}
      }
    } catch {
      // An export can resolve beneath dist/; walk to its owning package.
    }
    const parent = dirname(directory)
    if (parent === directory) throw new Error(`Cannot locate ${name} from ${from}`)
    directory = parent
  }
}

async function declarations(directory: string, base = directory): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  const entries = await readdir(directory, {withFileTypes: true})
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === 'node_modules' || entry.name === 'ts5.0' ||
        entry.name === '__tests__' || entry.name === 'test' || entry.name === 'tests') continue
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) Object.assign(files, await declarations(fullPath, base))
    else if (entry.name.endsWith('.d.ts')) {
      files[relative(base, fullPath).split(sep).join('/')] = await readFile(fullPath, 'utf8')
    }
  }
  return files
}

async function filesUnder(directory: string, base = directory): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(directory, {withFileTypes: true})
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(fullPath, base))
    else files.push(relative(base, fullPath).split(sep).join('/'))
  }
  return files
}

function typeExport(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return
  const conditions = value as Record<string, unknown>
  if (typeof conditions.types === 'string') return conditions.types
  for (const condition of Object.values(conditions)) {
    const found = typeExport(condition)
    if (found) return found
  }
}

function exportAliases(
  name: string,
  packageRoot: string,
  typeRoot: string,
  manifest: PackageJson,
  files: Record<string, string>,
) {
  const root = `/node_modules/${name}/`
  const entries = manifest.exports && typeof manifest.exports === 'object'
    ? Object.entries(manifest.exports)
    : []
  if (!entries.some(([id]) => id === '.')) {
    entries.push(['.', {types: manifest.types ?? manifest.typings}])
  }
  for (const [id, conditions] of entries) {
    if (!id.startsWith('.') || id.includes('*')) continue
    const target = typeExport(conditions)
    if (!target) continue
    const publicPath = id === '.' ? 'index.d.ts' : `${id.slice(2)}.d.ts`
    if (files[root + publicPath]) continue
    const targetPath = relative(typeRoot, resolve(packageRoot, target)).split(sep).join('/')
    const specifier = relative(dirname(publicPath), targetPath).split(sep).join('/')
      .replace(/\.d\.ts$/, '.js')
    files[root + publicPath] = `export * from '${specifier.startsWith('.') ? specifier : `./${specifier}`}';\n`
  }
}

/**
 * Build declarations from installed packages, so autocomplete uses the same
 * versions as the preview rather than stale, handwritten prop stubs.
 */
export async function generatePlaygroundTypes(frontendRoot: string): Promise<PlaygroundTypeBundle> {
  const output: PlaygroundTypeBundle = {schemaVersion: 1, packages: {}, files: {}}
  const seen = new Set<string>()
  const queue = PREVIEW_PACKAGES.map(name => ({name, from: frontendRoot, required: true}))
  queue.push(
    {name: '@types/react', from: frontendRoot, required: true},
    {name: '@types/react-dom', from: frontendRoot, required: true},
  )

  while (queue.length) {
    const {name, from, required} = queue.shift()!
    if (seen.has(name)) continue
    seen.add(name)
    let location: PackageLocation
    try {
      location = await locatePackage(name, from)
    } catch (error) {
      if (required) throw error
      continue
    }
    const source = await declarations(location.typeRoot)
    if (Object.keys(source).length === 0) continue
    output.packages[name] = location.manifest.version
    const dependencies = new Set<string>()
    for (const [path, content] of Object.entries(source)) {
      output.files[`/node_modules/${name}/${path}`] = content
      const metadata = ts.preProcessFile(content, true, true)
      for (const imported of [...metadata.importedFiles, ...metadata.typeReferenceDirectives]) {
        if (imported.fileName.startsWith('.') || imported.fileName.startsWith('node:')) continue
        const dependency = packageName(imported.fileName)
        if (dependency !== name) dependencies.add(dependency)
      }
    }
    exportAliases(name, location.root, location.typeRoot, location.manifest, output.files)
    for (const dependency of dependencies) {
      queue.push({name: dependency, from: location.root, required: false})
    }
  }

  // React's declarations live in @types/react, while preview imports use react.
  output.files['/node_modules/react/index.d.ts'] =
    "import React = require('../@types/react');\nexport = React;\nexport as namespace React;\n"
  output.files['/node_modules/react/jsx-runtime.d.ts'] =
    "export * from '../@types/react/jsx-runtime';\n"
  output.files['/node_modules/react/jsx-dev-runtime.d.ts'] =
    "export * from '../@types/react/jsx-dev-runtime';\n"
  output.files['/node_modules/react-dom/index.d.ts'] =
    "export * from '../@types/react-dom';\n"
  output.files['/node_modules/react-dom/client.d.ts'] =
    "export * from '../@types/react-dom/client';\n"
  output.files['/node_modules/stylex/index.d.ts'] =
    "export * from '@stylexjs/stylex';\nexport {default} from '@stylexjs/stylex';\n"
  output.files['/playground-globals.d.ts'] = `
import * as React from 'react';
declare global {
  const useState: typeof React.useState;
  const useEffect: typeof React.useEffect;
  const useCallback: typeof React.useCallback;
  const useMemo: typeof React.useMemo;
  const useRef: typeof React.useRef;
  const useReducer: typeof React.useReducer;
  const useContext: typeof React.useContext;
}
`
  return output
}

export function monacoAssetPath(vsRoot: string, requestPath: string): string | null {
  if (!requestPath.startsWith('/monaco/vs/')) return null
  let path: string
  try {
    path = decodeURIComponent(requestPath.slice('/monaco/vs/'.length))
  } catch {
    return null
  }
  if (path.includes('\0')) return null
  const absolute = resolve(vsRoot, path)
  const inside = relative(vsRoot, absolute)
  return inside.startsWith('..') || isAbsolute(inside) ? null : absolute
}

const MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.map': 'application/json; charset=utf-8',
}

export function monacoAssets(): Plugin {
  let root = ''
  let vsRoot = ''
  let types: Promise<PlaygroundTypeBundle> | undefined
  let generated = false
  const getTypes = () => types ??= generatePlaygroundTypes(root)

  const serve = (server: ViteDevServer) => {
    server.middlewares.use(async (request, response, next) => {
      const pathname = request.url?.split('?')[0] ?? ''
      if (pathname !== '/playground-types.json' && !pathname.startsWith('/monaco/vs/')) {
        next()
        return
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, {Allow: 'GET, HEAD'}).end()
        return
      }
      try {
        if (pathname === '/playground-types.json') {
          response.writeHead(200, {'Content-Type': MIME['.json'], 'Cache-Control': 'no-cache'})
          response.end(request.method === 'HEAD' ? undefined : JSON.stringify(await getTypes()))
          return
        }
        const asset = monacoAssetPath(vsRoot, pathname)
        if (!asset || !(await stat(asset)).isFile()) {
          response.writeHead(404).end()
          return
        }
        response.writeHead(200, {
          'Content-Type': MIME[extname(asset)] ?? 'application/octet-stream',
          'Cache-Control': 'no-cache',
        })
        if (request.method === 'HEAD') response.end()
        else createReadStream(asset).pipe(response)
      } catch {
        response.writeHead(404).end()
      }
    })
  }

  return {
    name: 'mybot-monaco-assets',
    async configResolved(config) {
      root = config.root
      vsRoot = join((await locatePackage('monaco-editor', root)).root, 'min/vs')
    },
    configureServer: serve,
    async generateBundle() {
      if (generated) return
      generated = true
      // Emit through Rollup instead of copying in writeBundle. This lets Vite
      // own output cleanup and avoids races with its public-directory copier.
      const assets = await filesUnder(vsRoot)
      for (const asset of assets) {
        this.emitFile({
          type: 'asset',
          fileName: `monaco/vs/${asset}`,
          source: await readFile(join(vsRoot, asset)),
        })
      }
      this.emitFile({
        type: 'asset',
        fileName: 'playground-types.json',
        source: JSON.stringify(await getTypes()),
      })
    },
  }
}
