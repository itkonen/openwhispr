// Run ONLY with a packaged Electron executable and ELECTRON_RUN_AS_NODE=1.
// Does not load main.js, dotenv, user data, sidecars, or models.
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
assert.ok(process.versions.electron, "Must use the actual packaged Electron executable");
const root = path.resolve(process.argv[2]);
const native = path.join(
  root,
  "resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
);
assert.equal(process.versions.modules, process.argv[3] || "145");
// Explicit nativeBinding prevents a fallback to the development dependency tree.
const Database = require(path.join(root, "resources/app.asar/node_modules/better-sqlite3"));
require(native);
const db = new Database(":memory:", { nativeBinding: native });
try {
  db.exec("CREATE TABLE abi_probe (text TEXT NOT NULL)");
  db.prepare("INSERT INTO abi_probe VALUES (?)").run("Emacs: ää öö Shift+Insert");
  assert.deepEqual(db.prepare("SELECT text FROM abi_probe").get(), {
    text: "Emacs: ää öö Shift+Insert",
  });
} finally {
  db.close();
}
assert.equal(db.open, false);
console.log(
  JSON.stringify({
    ok: true,
    executable: process.execPath,
    electron: process.versions.electron,
    abi: process.versions.modules,
    native,
    nativeSha256: crypto.createHash("sha256").update(fs.readFileSync(native)).digest("hex"),
    operations: "create/insert/select/close",
    database: ":memory:",
  })
);
