import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8"));

test("Manifest V3 exposes a Chrome 116 side panel with the intended local permissions", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.minimum_chrome_version, "116");
  assert.equal(manifest.side_panel.default_path, "sidepanel.html");
  assert.equal(manifest.background.type, "module");
  assert.ok(manifest.permissions.includes("sidePanel"));
  assert.ok(manifest.permissions.includes("storage"));
  assert.ok(manifest.permissions.includes("contextMenus"));
  assert.deepEqual(manifest.host_permissions, ["<all_urls>"]);
  assert.deepEqual(manifest.icons, {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png",
  });
  assert.deepEqual(manifest.action.default_icon, manifest.icons);
  assert.equal(Object.hasOwn(manifest, "commands"), false);
});

test("collector is global while the privileged main-site bridge is localhost-only", () => {
  const collector = manifest.content_scripts.find((script) => script.js.includes("collector.js"));
  const bridge = manifest.content_scripts.find((script) => script.js.includes("main-bridge.js"));
  assert.deepEqual(collector.matches, ["<all_urls>"]);
  assert.equal(collector.all_frames, true);
  assert.deepEqual(bridge.matches, ["http://localhost/*", "http://127.0.0.1/*"]);
});
