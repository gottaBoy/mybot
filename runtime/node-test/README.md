# Fixed Node.js Test Runtime

This is a mybot-owned fixed `node:test` adapter for explicit immutable `.mjs`
and `.cjs` files. It does not install project packages, run npm scripts, discover
tests, accept commands, compile TypeScript or provide model tools.

Run the trusted setup explicitly from the repository root:

```sh
.venv/bin/python runtime/node-test/build.py
```

Setup requires the already installed Node.js v24.21.0, its matching N-API
headers, a C compiler, Linux Landlock ABI3+ and libseccomp.so.2. It compiles only
the checked-in sandbox source. Runtime probes and Tasks never invoke setup.
The local binary manifest binds the exact Node executable and native addon
hashes, platform and sandbox source. Build output is ignored by Git.

The Python launcher applies read-only Landlock before execing fixed Node.
Consequently Node's subsequently created V8/libuv threads inherit the same
filesystem policy even on kernels without Landlock thread synchronization.
Trusted bootstrap prewarms libuv, then applies a seccomp filter with TSYNC to
all existing threads before loading selected tests. Native probes check the
actual OS socket, process-creation and executable-memory denials. The startup
filesystem whitelist contains the selected private copy, fixed trusted files,
the exact Node executable and system libraries; no host project or credentials.

Node permissions additionally deny filesystem writes, subprocesses, workers,
WASI and inspector access. Bootstrap disables subsequent native addon loading.
`--jitless` plus executable-memory syscall restrictions keep selected native
addons and JIT/Wasm compilation unavailable. The trusted addon itself requires
the startup `--allow-addons` flag, whose Node warning is retained as evidence;
it does not authorize selected code to load another addon.

Each run has a clean fixed environment, heap192MiB, stack512KiB, virtual address
space2GiB, CPU5s, output32KiB, configured wall deadline and process-group cleanup.
The Node initialization phase runs before the native address-space cap so V8
can initialize; selected code always runs after confinement and resource limits.
The parent records its real launcher argv. `MYBOT_NODE_RUNTIME` records actual
Node version, executable and execArgv before selected code loads.

The fixed exact-version adapter calls `run({files:[],isolation:'none',only:false})`
with trusted setup that imports each explicit test file and independently
records any import exception, including exceptions after a test is registered.
This avoids Node's native file-loader behavior that can lose that latter error
and creates no artificial passing placeholder for an empty file.
and sets the trusted non-child `NODE_TEST_CONTEXT=mybot-confined-node-test`.
That internal v24.21.0 switch is required because the public programmatic
non-isolated runner otherwise forces `.only` filtering even with `only:false`.
The fixed value activates no child IPC. Regression checks require both focused
and ordinary tests, including nested `runOnly`, to execute. This is a pinned
internal dependency, not a portable Node API guarantee.

Receipts retain the five common fields. Native test counts include parent tests
and subtests but exclude suites. Skip/todo cannot establish a passing result.
Empty files/suites add no passing items; zero cases and `expectFailure` cannot verify a Run. The trusted
import setup supports top-level `await test(...)` without the native file-loader
deadlock observed during the initial probe. Final receipts are emitted only at
natural process exit after the selected execution settles. Hook failures and
late asynchronous errors fail; a fatal native test error may exit without a
receipt, which never verifies a Run. In-process fixtures, assertions, promises,
suites and ordinary nested tests are supported within
the same read-only, no-network, no-subprocess bounds.

Test code and receipts share a process. Confinement and the fixed reporter are
not an independent cryptographic attestation against arbitrary JavaScript,
nor a VM or proof against kernel and side-channel attacks.
