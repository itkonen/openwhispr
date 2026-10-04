# Local Emacs paste patch (not installed)

## Scope and source verification

- Local branch: `fix/emacs-paste-v1.10.2`; base commit `1c123e8739f87c0a72d0b252bc9cff14e684b7f4`.
- `git rev-parse 'v1.10.2^{commit}'` equals that commit. The annotated tag object's ID differs; this is not a source mismatch.
- `origin` is `https://github.com/itkonen/openwhispr.git`; `upstream` is `https://github.com/OpenWhispr/openwhispr.git`. No commits, pushes, or remote changes were made.
- Installed `/opt/OpenWhispr/resources/app.asar` reports 1.10.2. Its `main.js` and `src/helpers/clipboard.js` are byte-identical to the tag. Packaged `package.json` differs only by omitted scripts, keywords, and devDependencies. Native C source is not in that archive, so native-source identity cannot be proven from it. Running the **installed helper on a private Xvfb** reproduced the same three Emacs failures as the unpatched tag helper.
- Read-only `xprop` inspection found the user's Emacs window `0x2400148`, `WM_CLASS = "emacs", "Emacs"`. Session variables confirm Ubuntu GNOME X11. No window was activated or changed during discovery. `xdotool` is absent on this host: fixing JavaScript alone would NOT fix the primary native route.

## Fix

`src/helpers/clipboard.js` recognizes the exact, lowercased Emacs window class and chooses the existing Shift+Insert dispatch for native and system-tool routes. `resources/linux-fast-paste.c` independently recognizes the class (case-insensitive), including a focused child whose nearest class-bearing ancestor is Emacs. The native helper already chose its own keys when JavaScript supplied no mode flag; previously it chose Ctrl+V for ordinary Emacs.

No Emacs configuration/keybinding changes: physical Ctrl+V remains Emacs scrolling. No new completion sound or global direct-typing behavior. Existing explicit flags, terminal detection, other app shortcuts, copy behavior, clipboard/PRIMARY snapshots, restore delay, and restore race guards remain unchanged.

Tests added/extended:

- `test/helpers/clipboardRestore.test.js`: actual Linux routing and restore code with process/clipboard boundaries mocked; Emacs/case variant, Firefox, GNOME Terminal, unknown and false-positive classes; native available, missing and failed. Checks both clipboard and PRIMARY restoration.
- `test/helpers/linuxFastPaste.test.js` plus `test/helpers/harness/linuxPasteWindow.c`: opt-in native integration test on a private Xvfb and private D-Bus session. Captures real key press/release events emitted by the compiled helper. Ten cases cover Emacs, child focus, case variant, non-Emacs behavior, false positives, explicit Shift+Insert and unchanged copy. Does not touch the user's display or clipboard.

## Commands and actual results

All commands ran in `/home/juha/workspace/openwhispr` with Node **v24.11.1**. `package-lock.json` was not changed.

1. `npm ci --no-audit --no-fund` — successful (895 packages); postinstall builds SQLite for Electron.
2. Initial `npm test` — 117 failures caused by the Electron-built `better-sqlite3` being loaded by Node. `npm rebuild better-sqlite3` corrected the local test ABI. No application code was changed to hide these failures.
3. RED: `node --test --test-name-pattern='X11 Emacs' test/helpers/clipboardRestore.test.js` — both initial Emacs regressions failed: missing native `--shift-insert` and fallback `ctrl+v` instead of `shift+Insert`.
4. RED: `npm run compile:linux-paste`; `OPENWHISPR_NATIVE_PASTE_TEST=1 node --test test/helpers/linuxFastPaste.test.js` — three Emacs cases failed on unmodified C source; seven control cases passed (Node counts the failing parent as a fourth failure). The installed helper reproduced these failures with `OPENWHISPR_PASTE_BINARY=/opt/OpenWhispr/resources/bin/linux-fast-paste`.
5. GREEN: `node --test test/helpers/clipboardRestore.test.js` — **49 passed**, no failures.
6. GREEN: `OPENWHISPR_NATIVE_PASTE_TEST=1 node --test test/helpers/linuxFastPaste.test.js` — **11 passed** (parent plus ten cases), no failures. Also passed against the unpacked package and the helper extracted from the actual AppImage.
7. Final full suite, after packaging: `npm rebuild better-sqlite3 && OPENWHISPR_NATIVE_PASTE_TEST=1 npm test` — **4,646 passed, 0 failed, 24 skipped, 1 todo; 4,671 total**, about 132 seconds.
8. `npm run lint`, `npm run typecheck`, and `git diff --check` — successful. Changed JavaScript was formatted using the installed Prettier.
9. `npm run build:renderer` — successful, existing large-chunk advisory. No private brand-font download was used; default font fallback applies.
10. `npm run compile:linux-paste` — compiled patched C with X11/XTest, uinput, GIO and AT-SPI. Existing warning: implicit declaration of `atspi_accessible_is_text`; link and native tests succeed. This unrelated upstream warning is not patched here.
11. `npm run compile:native` — successful, but local PipeWire development headers are absent and its unrelated system-audio rebuild omitted native PipeWire support. To avoid shipping that unrelated downgrade, the unmodified system-audio, key-listener and text-monitor helpers were restored from the installed public binaries before final packaging. The changed fast-paste helper is always locally compiled, never reused.
12. Final packaging command:

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false node node_modules/electron-builder/cli.js \
  --linux AppImage --x64 --publish never \
  --config.extraMetadata.version=1.10.2-emacs.1
```

The builder reported success with Electron **41.10.5** from the pinned lockfile, but this was NOT a valid runtime verification. **Correction:** the original AppImage and unpacked output both shipped SQLite ABI 137 rather than Electron ABI 145. The earlier claim that packaging rebuilt it correctly was false. See the verified ABI repair below. The existing afterPack hook checked other bundled binaries, not SQLite runtime compatibility.

### Public runtime reuse

To keep this a bounded local build and retain the installed runtime bundle, 58 public runtime files under `/opt/OpenWhispr/resources/bin` (including its bundled public model assets and libraries) were copied into ignored `resources/bin`, excluding `linux-fast-paste`. The copy does not execute any model. The final unmodified Linux helper binaries match the installed versions byte-for-byte.

No installed `.env`, credentials, user configuration, databases or downloaded user models were read or copied. There is no `.env` in the artifact. The normal broad prebuild downloader chain was intentionally bypassed after supplying these runtime resources and building the renderer/helper explicitly.

## Original artifact (invalid SQLite ABI; superseded)

- Original AppImage has been quarantined as `/home/juha/workspace/openwhispr/dist/verification/abi-repair/OpenWhispr-1.10.2-emacs.1-linux-x86_64.AppImage.broken`; do not launch it.
- Size: **533174001 bytes**.
- SHA-256: `b1349526bf089e12177474fc6938cbafb27e27232fc9bd12c15221e3a4640186`
- Unpacked application: `/home/juha/workspace/openwhispr/dist/linux-unpacked/`
- Compiled helper: `/home/juha/workspace/openwhispr/resources/bin/linux-fast-paste`
- Logs and public-source hash manifest: `/home/juha/workspace/openwhispr/dist/verification/`.

The AppImage was extracted using `--appimage-extract` (the application was NOT launched). Its clipboard JavaScript is byte-identical to the patched source, and its native helper is byte-identical to the tested compiled helper. The extracted helper passed the private-display suite:

```sh
OPENWHISPR_NATIVE_PASTE_TEST=1 \
OPENWHISPR_PASTE_BINARY=/home/juha/workspace/openwhispr/dist/verification/squashfs-root/resources/bin/linux-fast-paste \
node --test test/helpers/linuxFastPaste.test.js
```

## Verified SQLite ABI repair (2026-10-04)

### Root cause and old-artifact reproduction

The exact old packaged `open-whispr-app` executable, run with `ELECTRON_RUN_AS_NODE=1`, reproduced ABI **137 vs 145**. A fresh extraction of the original AppImage (whose SHA-256 still matched the original manifest) reproduced the same failure. Thus the AppImage was already wrong, not merely an unpacked tree damaged after packaging.

The old development and unpacked SQLite binaries had identical SHA-256 `ec599358a4c58d528278fccd189357975d33debc587bc1e2b6cd8fb3904e25b1`, but **different inodes and link count 1**. Hardlink sharing was not present. The actual cause was stale `node_modules/better-sqlite3/build/Release/.forge-meta`: it contained `x64--145` beside an ABI 137 binary. A non-forced `@electron/rebuild` invocation explicitly logged `skipping: better-sqlite3 as it is already built`. Its installed source checks the marker rather than loading the binary. The Node prebuild rebuild had left the marker behind. `npmRebuild: true` alone was therefore insufficient.

### Corrected build path

New `scripts/build-emacs-linux.cjs` explicitly forces `@electron/rebuild` for SQLite using the installed locked Electron version, disables hardlink copying, preserves the normal afterPack hook, and adds an actual packaged SQLite runtime gate before archiving. It builds both AppImage and deb, freshly extracts each, and repeats the runtime probe. It refuses to build if a local `.env` exists. It does not change the normal launcher, sandbox policy, app runtime source, or lockfile.

```sh
export PATH=/home/juha/.nvm/versions/node/v24.11.1/bin:$PATH
# Run the full Node suite BEFORE switching native dependencies to Electron.
# If dependencies currently target Electron, use a separate Node test tree.
OPENWHISPR_NATIVE_PASTE_TEST=1 npm test
node scripts/build-emacs-linux.cjs
```

Renderer and public runtime resources must already be prepared as described above; this bounded local script deliberately bypasses broad prebuild download/compile chains. Do NOT run `npm rebuild better-sqlite3` in this build tree after packaging. The tree is intentionally left at Electron ABI 145; future full Node tests need a separate dependency tree or a fresh force-rebuild/package/verify cycle afterward. The Node suite in this repair ran before the forced rebuild.

`verify-packaged-sqlite.cjs` requires the exact native module from the output, uses the shipped better-sqlite3 JavaScript via ASAR, and explicitly selects that native binding. It verifies Electron **41.10.5**, ABI **145**, creates an in-memory table, inserts/selects Finnish text, and closes the database. All three exact packaged executables passed: unpacked, freshly extracted AppImage, freshly extracted deb. The wrapper is bypassed; HOME/XDG paths are isolated, DISPLAY/D-Bus are absent, and no main.js/dotenv/profile/model initialization occurs.

### Delivered artifacts and hashes

- **Deb:** `/home/juha/workspace/openwhispr/dist/OpenWhispr-1.10.2-emacs.2-linux-amd64.deb` — 461657244 bytes; SHA-256 `2bede5bbd3932a5c7f7a82e706bc959cb3270775a7e384981ac6c96b3ee18b39`.
- **AppImage:** `/home/juha/workspace/openwhispr/dist/OpenWhispr-1.10.2-emacs.2-linux-x86_64.AppImage` — 533198581 bytes; SHA-256 `42724df8a1ffd7233f1e6c6cdc026031a65b496b67dc90ccc5be1162a9786590`.
- **Unpacked:** `/home/juha/workspace/openwhispr/dist/linux-unpacked/` (now repaired).
- All three shipped `app.asar` files: SHA-256 `a27ebd10129806cb60772f69c80c1040f5b4ff552b0ce7218d3bd42432cae3f0`.
- All three SQLite native modules: SHA-256 `54e8afbc2007086afcac80c83901a4e2cc3dbb26b4583fa2cdf22465f6ed856c`; each matches its ASAR entry integrity hash and has link count 1, distinct from the development inode.
- Deb control version is `1.10.2~emacs.2` (electron-builder's Debian prerelease conversion), architecture `amd64`; package metadata was inspected without installation.

### Verification and boundaries

Evidence directory: `/home/juha/workspace/openwhispr/dist/verification/abi-repair/`.

- `previous-unpacked.log`, `previous-appimage-runtime.log`, `previous-hashes.json`: exact old failures and hashes.
- `stale-metadata-repro.log`: non-forced rebuild skip despite wrong binary.
- `build.log`, `unpacked-sqlite.log`, `appimage-sqlite.log`, `deb-sqlite.log`: successful build and real Electron/SQLite operations.
- `final-paths.json`, `final-manifest.json`, `asar-verification.json`: exact extraction paths, hashes/inodes, ASAR integrity and source comparisons.
- Full Node suite: **4646 passed, 0 failed, 24 skipped, 1 todo; 4671 total** (`full-node-tests.log`).
- Clipboard routing suite after packaging: **49 passed** (`clipboard-tests.log`).
- Native paste suite against each of unpacked/AppImage/deb helpers: **11 passed each** (`*-paste-tests.log`), using private Xvfb/private D-Bus only.
- `npm run lint`, `npm run typecheck`, `git diff --check`: passed.
- Shipped clipboard.js and main.js match local source; every helper matches the previously compiled/tested patched helper; no `.env` in ASAR or resources.

The launcher was inspected read-only and is byte-identical to the old artifact. Its existing warning and automatic `--no-sandbox` fallback occur when no executable root-owned setuid sandbox is available and the user-namespace probe fails. **No security setting or sandbox behavior was changed.** The SQLite ABI failure is separate from that warning. AppImage FUSE mounting was not tested (FUSE2 remains unavailable); extraction and exact executable runtime were tested. The deb was extracted, never installed; maintainer scripts/dependency installation were not exercised. Packaging retains the existing desktopName advisory.

## Remaining acceptance, rollout and rollback (not executed)

The desktop application itself has **not** been launched, installed, or restarted by this repair; only the restricted Electron-as-Node SQLite probe was executed. `/opt/OpenWhispr` and the existing running application were left untouched; the original main process and native input-region helper remained running. No settings were changed. Automatic tests prove shortcut selection/dispatch, not a complete spoken-dictation round trip in the user's configured Spacemacs.

With separate user approval:

1. Arrange a controlled test window and explicitly approve quitting the installed app before launching the local artifact (same application identity/single-instance lock). Do not run both instances or casually point a test instance at the live profile. Decide profile isolation/backup first; do not copy secrets into the build.
2. In ordinary Spacemacs, a plain text buffer and the actual input area should receive a short dictated sentence at point, without Ctrl+V scrolling. Verify Ctrl+V still scrolls when physically pressed. Test non-ASCII Finnish text and multiline text, and repeat consecutive dictations.
3. Verify normal paste in Firefox and GNOME Terminal. Check clipboard and PRIMARY restoration after the existing delay, and verify that a new user clipboard copy made during that delay is not overwritten.
4. If the real Spacemacs keymap maps Shift+Insert differently, stop and investigate rather than changing its keymap automatically. Manual acceptance remains necessary.
5. Only after acceptance, approve any installation/replacement separately. Until then rollback requires no action: the old installation is still active. If testing the standalone artifact fails, quit it and relaunch `/opt/OpenWhispr/open-whispr`; any later installation must first preserve the original package/files and approved profile backup for rollback.
6. The local version suffix identifies this build; it is not a published release. Upstream updater behavior has NOT been disabled or redirected by this patch. An upstream update can replace the patch. Before adopting an update, rebase/reapply the two production changes onto that release, rerun both regression paths, build and accept it again. Preserve this pinned branch; do not silently advance it to fork `main`. Commit/push/PR work needs separate approval.
