const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");

// Explicit opt-in: no native helper is ever run against the user's display.
// npm run compile:linux-paste first; OPENWHISPR_NATIVE_PASTE_TEST=1 node --test ...
test(
  "native Linux paste emits the right keys on a private Xvfb",
  {
    skip: process.env.OPENWHISPR_NATIVE_PASTE_TEST !== "1",
    timeout: 20000,
  },
  async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openwhispr-paste-test-"));
    const harness = path.join(dir, "window");
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const compile = spawnSync(
      "gcc",
      [path.join(__dirname, "harness/linuxPasteWindow.c"), "-o", harness, "-lX11"],
      { encoding: "utf8" }
    );
    assert.equal(compile.status, 0, compile.stderr);
    const xvfb = spawn(
      "Xvfb",
      ["-displayfd", "1", "-screen", "0", "640x480x24", "-nolisten", "tcp", "-noreset"],
      { stdio: ["ignore", "pipe", "ignore"] }
    );
    t.after(async () => {
      if (xvfb.exitCode === null) {
        const exited = once(xvfb, "exit");
        xvfb.kill();
        await exited;
      }
    });
    const display = await new Promise((resolve, reject) => {
      let output = "";
      xvfb.on("error", reject);
      xvfb.on("exit", (code) => reject(new Error(`Xvfb exited ${code}`)));
      xvfb.stdout.on("data", (data) => {
        output += data;
        if (output.includes("\n")) resolve(`:${output.trim()}`);
      });
    });
    const binary =
      process.env.OPENWHISPR_PASTE_BINARY ||
      path.resolve(__dirname, "../../resources/bin/linux-fast-paste");
    const ctrlV = ["down:Control_L", "down:v", "up:v", "up:Control_L"];
    const shiftInsert = ["down:Shift_L", "down:Insert", "up:Insert", "up:Shift_L"];
    const ctrlShiftV = [
      "down:Control_L",
      "down:Shift_L",
      "down:v",
      "up:v",
      "up:Shift_L",
      "up:Control_L",
    ];
    for (const [name, instance, klass, focus, flag, expected] of [
      ["Emacs auto-detection without xdotool", "emacs", "Emacs", "parent", "auto", shiftInsert],
      ["Emacs focused child", "emacs", "Emacs", "child", "auto", shiftInsert],
      ["case-insensitive class", "custom", "EMACS", "parent", "auto", shiftInsert],
      ["Firefox unchanged", "Navigator", "firefox_firefox", "parent", "auto", ctrlV],
      [
        "terminal unchanged",
        "gnome-terminal-server",
        "Gnome-terminal",
        "parent",
        "auto",
        ctrlShiftV,
      ],
      ["unknown unchanged", "", "NONE", "parent", "auto", ctrlV],
      ["substring is not Emacs", "other", "not-emacs", "parent", "auto", ctrlV],
      ["instance is not class", "emacs", "Firefox", "parent", "auto", ctrlV],
      ["explicit mode still wins", "Navigator", "Firefox", "parent", "--shift-insert", shiftInsert],
      [
        "copy unchanged",
        "emacs",
        "Emacs",
        "parent",
        "--copy",
        ["COPY_OK", "down:Control_L", "down:c", "up:c", "up:Control_L"],
      ],
    ]) {
      await t.test(name, () => {
        const result = spawnSync(
          "dbus-run-session",
          ["--", harness, binary, instance, klass, focus, flag],
          {
            encoding: "utf8",
            timeout: 5000,
            env: { ...process.env, DISPLAY: display, OPENWHISPR_TEST_DISPLAY: display },
          }
        );
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(
          result.stdout
            .trim()
            .split("\n")
            .filter((line) => /^(down:|up:|COPY_OK$)/.test(line)),
          expected
        );
      });
    }
  }
);
