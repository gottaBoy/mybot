import { readFile } from 'node:fs/promises'
import { createAgentSession } from './node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.js'
import { AuthStorage } from './node_modules/@earendil-works/pi-coding-agent/dist/core/auth-storage.js'
import { ModelRuntime } from './node_modules/@earendil-works/pi-coding-agent/dist/core/model-runtime.js'
import { SessionManager } from './node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js'
import { SettingsManager } from './node_modules/@earendil-works/pi-coding-agent/dist/core/settings-manager.js'
import { createExtensionRuntime } from './node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js'

const VERSION = '1.5.0'
const MAX_BYTES = 1024 * 1024
const MAX_TEXT = 80000
const provider = 'mybot-explicit'
let session
let requests = 0
let events = 0
let httpStatus = null
let requestFailure = null
let usageSeen = false
let wireUsage = { input: null, output: null, native: null, read: null, write: null }
let interrupted = false
const failure = (code) => Object.assign(new Error(code), { safeCode: code })
const object = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
const text = (value, maximum) => typeof value === 'string' && value.length <= maximum &&
  !/[\uD800-\uDFFF]/u.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''))
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null
function wireCounts(value) {
  const result = { input: null, output: null, native: null, read: null, write: null }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result
  result.output = count(value.completion_tokens)
  const prompt = count(value.prompt_tokens)
  const details = Object.hasOwn(value, 'prompt_tokens_details') ? value.prompt_tokens_details : {}
  if (prompt === null || !details || typeof details !== 'object' || Array.isArray(details)) return result
  const readValues = [
    [details, 'cached_tokens'], [value, 'prompt_cache_hit_tokens'], [value, 'cached_tokens'],
  ].filter(([parent, key]) => Object.hasOwn(parent, key)).map(([parent, key]) => count(parent[key]))
  let read = readValues.length ? readValues[0] : null
  let write = Object.hasOwn(details, 'cache_write_tokens') ? count(details.cache_write_tokens) : null
  if (readValues.some((value) => value === null || value !== read) ||
      Object.hasOwn(details, 'cache_write_tokens') && write === null ||
      (read ?? 0) > prompt || (write ?? 0) > prompt - (read ?? 0)) return result
  if (prompt === 0) { read ??= 0; write ??= 0 }
  return {
    input: prompt, output: result.output,
    native: read !== null && write !== null ? prompt - read - write : null, read, write,
  }
}
function diagnostics() {
  return {
    sdk_version: VERSION, requests, events, http_status: httpStatus,
    tools_disabled: true, resources_disabled: true, session_in_memory: true,
    retries_disabled: true, cache_warming_disabled: true,
  }
}
async function stop() {
  interrupted = true
  if (session) await session.abort().catch(() => {})
}
process.on('SIGTERM', () => { void stop().finally(() => process.exit(143)) })
process.on('SIGINT', () => { void stop().finally(() => process.exit(130)) })

try {
  if (Number(process.versions.node.split('.')[0]) < 22 ||
      (Number(process.versions.node.split('.')[0]) === 22 && Number(process.versions.node.split('.')[1]) < 19))
    throw failure('pi_sdk_not_available')
  let raw = ''
  for await (const chunk of process.stdin) {
    raw += chunk.toString('utf8')
    if (Buffer.byteLength(raw) > MAX_BYTES) throw failure('pi_sdk_invalid_input')
  }
  const input = JSON.parse(raw)
  if (!object(input, ['endpoint', 'model', 'api_key', 'messages', 'max_tokens', 'timeout_ms']) ||
      !text(input.model, 150) || !input.model.trim() ||
      !text(input.api_key, 8192) || !Number.isSafeInteger(input.max_tokens) ||
      input.max_tokens < 1 || input.max_tokens > 16384 ||
      !Number.isSafeInteger(input.timeout_ms) || input.timeout_ms < 1 || input.timeout_ms > 300000 ||
      !Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > 20 ||
      input.messages.some((message) => !object(message, ['role', 'content']) ||
        !['system', 'user', 'assistant'].includes(message.role) || !text(message.content, MAX_BYTES)))
    throw failure('pi_sdk_invalid_input')
  const endpoint = new URL(input.endpoint)
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password ||
      endpoint.search || endpoint.hash) throw failure('pi_sdk_invalid_input')
  const expectedUrl = `${endpoint.href.replace(/\/$/, '')}/chat/completions`
  const packageValue = JSON.parse(await readFile(new URL('./node_modules/@earendil-works/pi-coding-agent/package.json', import.meta.url)))
  if (packageValue.version !== VERSION) throw failure('pi_sdk_not_available')
  const settings = SettingsManager.inMemory({
    retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0, maxRetryDelayMs: 0 } },
    compaction: { enabled: false }, cacheWarming: 'off',
    enableInstallTelemetry: false, enableAnalytics: false,
    packages: [], extensions: [], skills: [], prompts: [], themes: [],
    defaultTools: [], enableSkillCommands: false, transport: 'sse',
    images: { blockImages: true }, deviceId: 'mybot-text-runtime',
  })
  const runtime = await ModelRuntime.create({
    credentials: AuthStorage.inMemory(),
    modelsPath: null, refreshOnCreate: false, allowModelNetwork: false,
  })
  runtime.registerProvider(provider, {
    baseUrl: endpoint.href.replace(/\/$/, ''), api: 'openai-completions',
    authHeader: Boolean(input.api_key),
    models: [{
      id: input.model, name: input.model, api: 'openai-completions',
      reasoning: false, input: ['text'], contextWindow: 1048576, maxTokens: input.max_tokens,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      compat: { maxTokensField: 'max_tokens', supportsStore: false, supportsDeveloperRole: false },
    }],
  })
  await runtime.setRuntimeApiKey(provider, input.api_key || 'mybot-no-key')
  const extensions = { extensions: [], errors: [], runtime: createExtensionRuntime() }
  const emptyLoader = {
    getExtensions: () => extensions,
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => 'Use only the explicitly supplied conversation. No tools are available.',
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => { throw failure('pi_sdk_policy_violation') },
    reload: async () => {},
  }
  const model = runtime.getModel(provider, input.model)
  if (!model) throw failure('pi_sdk_not_available')
  const created = await createAgentSession({
    cwd: process.cwd(), agentDir: process.env.PI_CODING_AGENT_DIR,
    modelRuntime: runtime, model, thinkingLevel: 'off',
    noTools: 'all', tools: [], customTools: [], resourceLoader: emptyLoader,
    sessionManager: SessionManager.inMemory(process.cwd()), settingsManager: settings,
  })
  session = created.session
  if (session.getActiveToolNames().length || session.getAllTools().length ||
      created.extensionsResult.extensions.length) throw failure('pi_sdk_policy_violation')
  const fixedMessages = input.messages.map((message) => ({ ...message, timestamp: 0 }))
  let streamRequests = 0
  // Keep Pi's session lifecycle while sending exactly the confirmed messages,
  // without its default cwd/system prompt or an implicit transcript.
  session.agent.streamFunction = (selectedModel, _context, options) => {
    if (++streamRequests !== 1 || selectedModel.id !== input.model ||
        selectedModel.provider !== provider) throw failure('pi_sdk_policy_violation')
    return runtime.streamSimple(model, { messages: fixedMessages }, {
      ...options, maxTokens: input.max_tokens, maxRetries: 0, maxRetryDelayMs: 0,
      timeoutMs: input.timeout_ms, cacheRetention: 'none', reasoning: 'off',
      identity: { attribution: null }, env: {},
      fetch: async (url, init) => {
        if (String(url) !== expectedUrl || init?.method !== 'POST' || requests !== 0)
          throw failure('pi_sdk_policy_violation')
        requests++
        const headers = new Headers(init.headers)
        if (!input.api_key) headers.delete('authorization')
        const response = await fetch(url, { ...init, headers, redirect: 'manual' })
        httpStatus = response.status
        if (!response.ok) {
          requestFailure = 'pi_sdk_provider_rejected'
          throw failure(requestFailure)
        }
        let size = 0
        const reader = response.body.getReader()
        return new Response(new ReadableStream({
          async pull(controller) {
            try {
              const item = await reader.read()
              if (item.done) { controller.close(); return }
              size += item.value.byteLength
              if (size > MAX_BYTES) {
                await reader.cancel()
                requestFailure = 'pi_sdk_output_limit'
                throw failure(requestFailure)
              }
              controller.enqueue(item.value)
            } catch (reason) { controller.error(reason) }
          },
          cancel: () => reader.cancel(),
        }), { status: response.status, headers: response.headers })
      },
      onProviderStreamEvent: (data) => {
        if (data?.usage !== undefined && data.usage !== null) {
          usageSeen = true
          wireUsage = wireCounts(data.usage)
        }
      },
    })
  }
  let settled = false
  let toolOutput = false
  session.subscribe((event) => {
    events++
    if (event.type === 'agent_settled') settled = true
    if (event.type === 'tool_execution_start' || event.type === 'tool_execution_end') toolOutput = true
    if (event.type === 'message_end' && event.message?.role === 'assistant' &&
        event.message.content.some((part) => part.type === 'toolCall')) toolOutput = true
  })
  session.agent.beforeToolCall = () => { throw failure('pi_sdk_policy_violation') }
  await session.prompt('Explicit mybot text request', { expandPromptTemplates: false, source: 'rpc' })
  await session.agent.waitForIdle()
  if (toolOutput || streamRequests !== 1 || requests !== 1 ||
      session.agent.hasQueuedMessages() || !settled) throw failure('pi_sdk_policy_violation')
  const answers = session.messages.filter((message) => message.role === 'assistant')
  if (answers.length !== 1) throw failure('pi_sdk_invalid_response')
  const answer = answers[0]
  if (!['stop', 'length'].includes(answer.stopReason))
    throw failure(requestFailure ?? 'pi_sdk_connection_outcome_unknown')
  if (answer.content.some((part) => !['text', 'thinking'].includes(part.type)))
    throw failure('pi_sdk_policy_violation')
  const result = answer.content.filter((part) => part.type === 'text').map((part) => part.text).join('').trim()
  if (!result || [...result].length > MAX_TEXT) throw failure(result ? 'pi_sdk_output_limit' : 'pi_sdk_empty_response')
  const usage = usageSeen ? answer.usage : null
  // Pi's native input excludes cache reads/writes; mybot's public input is the
  // complete prompt denominator shared by its other text providers.
  if (wireUsage.input !== null && (
    wireUsage.native !== null && count(usage?.input) !== wireUsage.native ||
    wireUsage.read !== null && count(usage?.cacheRead) !== wireUsage.read ||
    wireUsage.write !== null && count(usage?.cacheWrite) !== wireUsage.write
  )) wireUsage = { ...wireUsage, input: null, native: null, read: null, write: null }
  if (wireUsage.output !== null && count(usage?.output) !== wireUsage.output)
    wireUsage.output = null
  process.stdout.write(JSON.stringify({
    text: result, model: answer.model, input_tokens: wireUsage.input,
    output_tokens: wireUsage.output, truncated: answer.stopReason === 'length',
    diagnostics: {
      ...diagnostics(), native_input_tokens: wireUsage.native,
      cache_read_tokens: wireUsage.read, cache_write_tokens: wireUsage.write,
      cache_tokens_are_input_subset: true, usage_reported: usageSeen,
    },
  }) + '\n')
} catch (reason) {
  const allowed = [
    'pi_sdk_not_available', 'pi_sdk_invalid_input', 'pi_sdk_policy_violation',
    'pi_sdk_provider_rejected', 'pi_sdk_output_limit', 'pi_sdk_invalid_response',
    'pi_sdk_empty_response', 'pi_sdk_connection_outcome_unknown',
  ]
  const code = allowed.includes(reason?.safeCode) ? reason.safeCode :
    (requestFailure ?? (httpStatus && httpStatus >= 400 ? 'pi_sdk_provider_rejected' :
      requests ? 'pi_sdk_connection_outcome_unknown' : 'pi_sdk_invalid_input')
    )
  if (!interrupted) process.stdout.write(JSON.stringify({ error: code, diagnostics: diagnostics() }) + '\n')
  process.exitCode = 1
} finally {
  if (session) session.dispose()
}
