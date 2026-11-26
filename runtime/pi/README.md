# Mybot Pi Text Runtime

This private dependency boundary uses `@earendil-works/pi-coding-agent` `1.5.0`.
Install only this locked runtime, without package lifecycle scripts:

```sh
npm ci --ignore-scripts --no-audit --no-fund
```

Node.js `>=22.19.0` is required. Installation is separate from starting or testing
a configured model. `node_modules/` is ignored by Git; the lockfile records all
resolved dependency versions and integrity values. Nothing is installed globally
and this runtime does not share the frontend dependency tree.

`bridge.mjs` is an original, one-request SDK adapter. It exposes no interactive
CLI, RPC command forwarding, bash, file tools, extension API or session restore.
The Python caller supplies the configured endpoint, model, optional API key,
confirmed messages and token limit over stdin in a clean isolated process.
The bridge uses memory-only auth/settings/session, an empty resource loader and
an empty tool list. Model requests disable retries, compaction and cache warming.
It rejects redirects and rejects any second model request or tool-call result.

The pinned SDK remains trusted dependency code. Tool suppression and isolated
configuration are not an operating-system capability sandbox. Actual source
writes and tests stay in mybot's separate trusted coding runner.
Internal model context metadata is a bridge bound, not verification of a remote
model's context capacity. The configured endpoint still needs an explicit test.

Package identity and licensing:

- Registry package: `@earendil-works/pi-coding-agent@1.5.0`.
- npm integrity: `sha512-xNDZ5kqowO6Z03FS2gwAkPEGk1ssxVcYKQ6qZId84mFEvwACvvyc2l0vAMOS+c5zvxLRMLBE9r4y44IGYkMJaQ==`.
- npm SHA-1: `5b3ae91e479299ad5c46be8c843f61d92ceb6044`.
- Upstream repository: `https://github.com/earendil-works/pi`.
- Source analysis snapshot: `085c84e98e7f4c950f2be606466fff4f75d8fe7c`.
- The registry did not supply `gitHead`; the source snapshot is not claimed to
  prove the published tarball's build commit.
- Published package metadata declares MIT. The installed Pi-family packages
  likewise declare MIT. This repository does not copy their source.
- The resolved dependency lock includes MIT, Apache-2.0, BSD-3-Clause, ISC,
  BlueOak-1.0.0, 0BSD and Unlicense declarations. Keep dependency notices when
  redistributing an installed runtime; the Pi package license does not replace
  third-party package licenses. Native assets and optional libraries remain
  dependencies, not copied product assets.

See `docs/PI_INTEGRATION_CURRENT.md` for the verified behavior and limits.
