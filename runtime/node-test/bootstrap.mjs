import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { run } from 'node:test'
import { finished } from 'node:stream/promises'
import { inspect } from 'node:util'
import { writeSync } from 'node:fs'

const require = createRequire(import.meta.url)
const native = require('./build/sandbox.node')
const workspace = resolve(process.argv[2])
const selection = JSON.parse(process.argv[3])
const files = selection.test_files.map((file) => resolve(workspace, file))
const output = process.stdout.write.bind(process.stdout)
const exit = process.exit.bind(process)
const stringify = JSON.stringify
const report = (value) => output(value)
let settled = false, finalReceipt, runtimeErrors = 0, hookErrors = 0, finalSummary
const runtimeError = () => { runtimeErrors++; process.exitCode = 1 }
process.on('uncaughtException', runtimeError)
process.on('unhandledRejection', runtimeError)
process.on('exit', (code) => {
  if (!settled || !finalReceipt) {
    writeSync(1, 'MYBOT_NODE_RUNNER_INCOMPLETE\n')
    process.exitCode = 125
    return
  }
  const receipt = { ...finalReceipt }
  receipt.errors += hookErrors
  if (hookErrors) receipt.success = false
  if (runtimeErrors || code !== 0 || !finalSummary?.success) {
    receipt.success = false
    receipt.errors += runtimeErrors || (receipt.failures + receipt.errors === 0 ? 1 : 0)
  }
  writeSync(1, `MYBOT_TEST_RESULT=${stringify(receipt)}\n`)
  if (!receipt.success && code === 0) process.exitCode = 1
})
try {
  if (process.version !== 'v24.21.0') throw new Error('coding_node_unavailable')
  await Promise.all(Array.from({ length: 8 }, () => readFile(fileURLToPath(import.meta.url))))
  if (native.confine() !== true) throw new Error('coding_node_sandbox_unavailable')
  report(`MYBOT_NODE_RUNTIME=${stringify({
    version: process.version, executable: process.execPath,
    execArgv: process.execArgv, argv: process.argv,
  })}\n`)
  Object.defineProperty(process, 'dlopen', {
    value() { throw new Error('node_test_addons_unsupported') }, writable: false, configurable: false,
  })
  if (selection.mode === 'probe') {
    const fs = await import('node:fs')
    const promises = await import('node:fs/promises')
    const net = await import('node:net')
    const child = await import('node:child_process')
    const worker = await import('node:worker_threads')
    const denied = []
    for (const [name, operation, code] of [
      ['outside_read', () => fs.readFileSync(selection.canary), 'EACCES'],
      ['workspace_write', () => fs.writeFileSync(resolve(workspace, 'forbidden'), 'no'), 'ERR_ACCESS_DENIED'],
      ['process', () => child.spawnSync(process.execPath, ['-e', '0']), 'ERR_ACCESS_DENIED'],
      ['worker', () => new worker.Worker('0', { eval: true }), 'ERR_ACCESS_DENIED'],
      ['addon', () => process.dlopen({}, resolve(workspace, 'untrusted.node')), 'node_test_addons_unsupported'],
      ['metadata_write', () => fs.chmodSync(resolve(workspace, files[0]), 0o777), 'ERR_ACCESS_DENIED'],
    ]) {
      try { operation() } catch (error) {
        if (error.code === code || error.message === code) denied.push(name)
      }
    }
    try { await promises.readFile(selection.canary) } catch (error) {
      if (error.code === 'EACCES') denied.push('outside_async_read')
    }
    try {
      await new Promise((done, reject) => {
        const socket = net.connect({ host: '127.0.0.1', port: 9 }, done)
        socket.once('error', reject)
      })
    } catch (error) { if (error.code === 'EPERM') denied.push('network') }
    if (denied.length !== 8 || native.probe() !== true)
      throw new Error('coding_node_sandbox_unavailable')
    report(`MYBOT_NODE_PROBE=${stringify({ confined: true, denied })}\n`)
  }
  const stream = run({
    files: [], isolation: 'none', concurrency: false, forceExit: false, only: false,
    async setup() {
      for (const file of files) {
        try { await import(pathToFileURL(file).href) } catch (error) {
          runtimeErrors++
          report(`IMPORT FAILED ${file}\n${inspect(error, { depth: 4, customInspect: false })}\n`)
        }
      }
    },
  })
  let summary, invalid = false, completed = 0
  stream.on('data', (event) => {
    const data = event.data
    if (event.type === 'test:summary') { summary = data; finalSummary = data }
    if (event.type === 'test:complete') {
      completed++
      if (
        (files.includes(data.name) && data.line === 1 && data.column === 1) ||
        data.expectFailure || data.details?.expectFailure
      ) invalid = true
    }
    if (data.expectFailure || data.details?.expectFailure) invalid = true
    if (event.type === 'test:fail') {
      if (data.details?.error?.failureType === 'hookFailed') hookErrors++
      report(`FAIL ${data.name}\n${inspect(data.details?.error, { depth: 4, customInspect: false })}\n`)
    }
  })
  await finished(stream)
  if (!summary) throw new Error('coding_node_runner_unverified')
  const counts = summary.counts
  const receipt = {
    tests_run: counts.tests, failures: counts.failed,
    errors: counts.cancelled, skipped: counts.skipped + counts.todo,
    success: completed > 0 && !invalid && runtimeErrors === 0 && summary.success &&
      counts.passed > 0 && counts.failed === 0 && counts.cancelled === 0,
  }
  if (invalid) {
    receipt.errors++
    report('MYBOT_NODE_UNSUPPORTED_TEST_SELECTION\n')
  }
  finalReceipt = receipt
  settled = true
  process.exitCode = invalid || receipt.tests_run === receipt.skipped ? 125 : receipt.success ? 0 : 1
} catch {
  report('MYBOT_NODE_SANDBOX_OR_RUNNER_FAILED\n')
  exit(125)
}
