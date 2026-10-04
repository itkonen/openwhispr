// Bounded local packaging: renderer/resources must already be prepared.
// Run Node tests BEFORE this script; it leaves the build tree on Electron's ABI.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const version = "1.10.2-emacs.2";
const evidence = path.join(root, "dist/verification/abi-repair");
const nativeRelative =
  "resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node";

function verify(appDir, label) {
  const home = path.join(evidence, "isolated-home");
  fs.mkdirSync(home, { recursive: true });
  // Deliberately do not invoke the shell launcher: it reads user flags.
  const env = {
    PATH: process.env.PATH,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, "config"),
    XDG_CACHE_HOME: path.join(home, "cache"),
    TMPDIR: process.env.TMPDIR,
    ELECTRON_RUN_AS_NODE: "1",
  };
  const output = execFileSync(
    path.join(appDir, "open-whispr-app"),
    [path.join(root, "scripts/verify-packaged-sqlite.cjs"), appDir, "145"],
    { env, encoding: "utf8", timeout: 30000 }
  );
  fs.writeFileSync(path.join(evidence, `${label}-sqlite.log`), output);
  console.log(output.trim());
  const src = fs.statSync(
    path.join(root, "node_modules/better-sqlite3/build/Release/better_sqlite3.node")
  );
  const dest = fs.statSync(path.join(appDir, nativeRelative));
  assert.ok(
    src.dev !== dest.dev || src.ino !== dest.ino,
    "Packaged SQLite must not share its source inode"
  );
  assert.equal(dest.nlink, 1, "Packaged SQLite must not be hardlinked");
}

async function main() {
  assert.equal(process.platform, "linux");
  assert.equal(process.arch, "x64");
  assert.equal(process.versions.node.split(".")[0], "24");
  assert.equal(fs.existsSync(path.join(root, ".env")), false, "Refusing to package a local .env");
  fs.mkdirSync(evidence, { recursive: true });
  process.chdir(root);
  // Set before loading builder-util. Do not let development rebuilds mutate output.
  process.env.USE_HARD_LINKS = "false";
  delete process.env.VITEST;
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
  const { rebuild } = await import("@electron/rebuild");
  const electronVersion = require("electron/package.json").version;
  // npm rebuild may leave .forge-meta saying x64--145 beside a Node ABI binary.
  // npmRebuild:true alone trusts that stale marker. Force an actual rebuild.
  await rebuild({
    buildPath: root,
    electronVersion,
    arch: "x64",
    onlyModules: ["better-sqlite3"],
    force: true,
  });
  const { build, Platform, Arch } = require("electron-builder");
  const normalAfterPack = require("./afterPack.js").default;
  const artifacts = await build({
    targets: Platform.LINUX.createTarget(["AppImage", "deb"], Arch.x64),
    publish: "never",
    config: {
      extends: path.join(root, "electron-builder.json"),
      extraMetadata: { version },
      afterPack: async (context) => {
        await normalAfterPack(context);
        verify(context.appOutDir, "unpacked");
      },
    },
  });
  const image = artifacts.find((file) => file.endsWith(".AppImage"));
  const deb = artifacts.find((file) => file.endsWith(".deb"));
  assert.ok(image && deb, "Both distributions must be produced");
  // Fresh extraction of the exact final archives, no FUSE or installation.
  const extraction = fs.mkdtempSync(path.join(evidence, "final-"));
  execFileSync(image, ["--appimage-extract"], { cwd: extraction, stdio: "ignore" });
  verify(path.join(extraction, "squashfs-root"), "appimage");
  const debDir = path.join(extraction, "deb");
  execFileSync("dpkg-deb", ["-x", deb, debDir]);
  verify(path.join(debDir, "opt/OpenWhispr"), "deb");
  fs.writeFileSync(
    path.join(evidence, "final-paths.json"),
    JSON.stringify(
      {
        artifacts,
        unpacked: path.join(root, "dist/linux-unpacked"),
        appimageExtracted: path.join(extraction, "squashfs-root"),
        debExtracted: path.join(debDir, "opt/OpenWhispr"),
      },
      null,
      2
    )
  );
  console.log("Verified unpacked, extracted AppImage, and extracted deb SQLite runtimes.");
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
