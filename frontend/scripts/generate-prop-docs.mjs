#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.
//
// Adapted from Astryx docsite componentRegistry generation. This keeps only
// the PropDoc fields used by the local property editor so the browser does not
// need to ship descriptions, examples, or source metadata.

import {mkdir, readdir, writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {dirname, join, relative, resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const require = createRequire(import.meta.url)
const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const coreEntry = require.resolve('@astryxdesign/core')
const corePackage = resolve(dirname(coreEntry), '..')
const sourceRoot = join(corePackage, 'src')
const outputPath = join(frontendRoot, 'src/playground-property/prop-docs.generated.json')
const namesPath = join(frontendRoot, 'src/playground-property/prop-component-names.generated.ts')

async function walk(directory) {
  const files = []
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    else if (entry.name.endsWith('.doc.mjs')) files.push(path)
  }
  return files
}

function compactProp(prop) {
  const compact = {
    name: prop.name,
    type: prop.type,
  }
  if (prop.required === true) compact.required = true
  if (typeof prop.default === 'string') compact.default = prop.default
  if (Array.isArray(prop.slotElements) && prop.slotElements.length > 0) {
    compact.slotElements = prop.slotElements.map(element => ({
      __element: element.__element,
    }))
  }
  return compact
}

const components = {}
for (const file of (await walk(sourceRoot)).sort()) {
  const module = await import(pathToFileURL(file))
  const doc = module.docs
  if (!doc || typeof doc.name !== 'string' || !/^[A-Z]/.test(doc.name) || !Array.isArray(doc.props)) {
    continue
  }
  components[doc.name] = {
    displayName: typeof doc.displayName === 'string' ? doc.displayName : doc.name,
    props: doc.props
      .filter(prop => prop && typeof prop.name === 'string' && typeof prop.type === 'string')
      .map(compactProp),
  }
}

await mkdir(dirname(outputPath), {recursive: true})
const output = {
  schemaVersion: 1,
  package: '@astryxdesign/core',
  version: require(join(corePackage, 'package.json')).version,
  sourceCommit: '5770e5b197cf80d5a824667c23046887cc8fa0f5',
  componentCount: Object.keys(components).length,
  components,
}
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`)
await writeFile(
  namesPath,
  `// Generated from @astryxdesign/core PropDocs; do not edit.\nexport const GENERATED_PROP_COMPONENT_NAMES = ${JSON.stringify(Object.keys(components).sort(), null, 2)} as const\n`,
)
console.log(`Generated ${output.componentCount} component PropDocs from ${relative(frontendRoot, sourceRoot)}`)
