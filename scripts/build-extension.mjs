import { access, copyFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { build } from "vite";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = path.join(projectRoot, "extension");
const outDir = path.join(projectRoot, "dist", "extension");
const watch = process.argv.includes("--watch");

await rm(outDir, { recursive: true, force: true });
await mkdir(path.join(outDir, "fonts"), { recursive: true });

const common = { configFile: false, root: extensionRoot, publicDir: false, logLevel: "info" };
const watchOption = watch ? {} : undefined;

await build({
  ...common,
  base: "./",
  plugins: [react()],
  build: {
    outDir,
    emptyOutDir: false,
    watch: watchOption,
    rollupOptions: {
      input: path.join(extensionRoot, "sidepanel.html"),
      output: { entryFileNames: "assets/[name]-[hash].js", chunkFileNames: "assets/[name]-[hash].js", assetFileNames: "assets/[name]-[hash][extname]" },
    },
  },
});

for (const entry of [
  { source: "service-worker.js", format: "es" },
  { source: "collector.js", format: "iife", name: "CentoCollector" },
  { source: "main-bridge.js", format: "iife", name: "CentoMainBridge" },
]) {
  await build({
    ...common,
    build: {
      outDir,
      emptyOutDir: false,
      watch: watchOption,
      lib: {
        entry: path.join(extensionRoot, "src", entry.source),
        formats: [entry.format],
        name: entry.name,
        fileName: () => entry.source,
      },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
}

await copyFile(path.join(extensionRoot, "manifest.json"), path.join(outDir, "manifest.json"));
await copyFile(path.join(projectRoot, "public", "fonts", "special-elite.ttf"), path.join(outDir, "fonts", "special-elite.ttf"));
await copyFile(path.join(projectRoot, "public", "fonts", "pacifico.ttf"), path.join(outDir, "fonts", "pacifico.ttf"));

const manifest = JSON.parse(await readFile(path.join(outDir, "manifest.json"), "utf8"));
const referenced = [manifest.background.service_worker, manifest.side_panel.default_path,
  ...manifest.content_scripts.flatMap((script) => script.js ?? [])];
await Promise.all(referenced.map((file) => access(path.join(outDir, file))));
console.log(`Extension ready: ${path.relative(projectRoot, outDir)}${watch ? " (watching source entries)" : ""}`);
