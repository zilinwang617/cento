# Cento

Cento is a Chrome extension for collecting text from web pages and composing cut-up poetry. Selected text enters a side panel as paper strips. A dedicated Chrome tab provides a workspace for arranging, cutting, styling, and exporting a poem.

The extension runs locally in Chrome. It does not require a server during normal use, and it stores notes in `chrome.storage.local`.

## Requirements

- Google Chrome 116 or later. Test extension behavior in Google Chrome.
- Node.js 20.19 or later and npm for development and building.

## Build and install the extension

From the repository root:

```bash
npm install
npm run build:extension
```

The completed extension is in `dist/extension`. Load that directory in Chrome:

1. Open `chrome://extensions` and enable **Developer mode**.
2. Select **Load unpacked** and choose `dist/extension`.
3. Confirm that **Cento** is enabled. Chrome may display a site-access notice because the collector reads selected text and typography on web pages.

Chrome does not run content scripts on protected pages such as `chrome://extensions`.

## Use Cento

Open the Cento side panel from Chrome's Extensions menu. Select text on a web page and drag it into the panel, or right-click the selection and choose **Save to Cento**. Click **Assemble into a poem** to open the workspace in a Chrome tab. Subsequent clicks focus the existing workspace tab.

In the workspace, drag strips onto the page, cut them between words, change the paper style, and export the composed page as a PNG. Collected notes remain available after closing the workspace tab or restarting Chrome. Removing the extension also removes its local data.

## Development

Run the Vite workspace preview with hot reload:

```bash
npm run dev
```

The preview is served at `http://localhost:5173`. It is intended for workspace UI development; extension storage and side panel synchronization are available in the installed extension build.

For continuous extension builds, run:

```bash
npm run dev:extension
```

After a build, reload Cento on `chrome://extensions`. Refresh any web page used to test the collector so Chrome injects the updated content script. If port 5173 is occupied, the Vite development server will fail to start.

## Verification

```bash
npm test
npm run build
npm run build:extension
```

`npm run build` also prepares the static client and worker artifacts used for a possible Sites handoff. The Chrome extension does not depend on those artifacts.

## Contributors

- Zilin Wang — [leowangsz@outlook.com](mailto:leowangsz@outlook.com)
- Peter Ju — [peterju00004@gmail.com](mailto:peterju00004@gmail.com)

## License

Copyright © 2026 Zilin Wang and Peter Ju. This project may be used, copied, and modified for non-commercial purposes only. Commercial use requires prior written permission from the copyright holders.
