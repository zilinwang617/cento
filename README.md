# Cut-Ups Canvas

A desktop web prototype for arranging and cutting text strips on a canvas.

## Setup

Install [Node.js](https://nodejs.org/) 20 or later and npm.

## Install

```bash
npm install
```

## Run locally

```bash
npm run dev
```

Open the local URL printed in the terminal (usually `http://localhost:5173`).

## Chrome Extension MVP

The Extension is delivered as an unpacked Manifest V3 extension. Use **Google Chrome 116 or later** for development and acceptance testing; do not use Arc for Extension QA.

### Build the Extension

1. Install the project dependencies if you have not already done so:

   ```bash
   npm install
   ```

2. From the repository root, build the Extension:

   ```bash
   npm run build:extension
   ```

3. Confirm that the build completed with this message:

   ```text
   Extension ready: dist/extension
   ```

The directory to load into Chrome is `dist/extension`. Do not select the source `extension` directory.

### Load It in Google Chrome

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the repository's `dist/extension` directory.
5. Find **Cento** in the extensions list and confirm that it is enabled.
6. Optionally pin Cento from Chrome's Extensions menu. Clicking its toolbar icon opens the Side Panel.

On first load, Chrome shows that Cento can read and change data on all sites. This permission is intentional: it allows the collector content script to read selected text and its font information on ordinary web pages. Chrome-protected pages such as `chrome://` pages do not allow content scripts.

### Update a Loaded Development Build

After changing Extension source code:

```bash
npm run build:extension
```

Then return to `chrome://extensions` and click the **Reload** button on the Cento card. Refresh any ordinary webpage you want to test so the updated collector content script is injected. You do not need to choose **Load unpacked** again unless the Extension was removed.

For continuous local builds, use:

```bash
npm run dev:extension
```

Chrome still needs to be reloaded from `chrome://extensions` after a relevant build change.

### Local Main-Site Connection

The local main-site bridge is limited to `http://localhost/*` and `http://127.0.0.1/*`. The real extension profile starts with an empty document; the website's sample notes remain development-only.

### Port
To prevent port conflicts and maintain a consistent url that points to the webpage, the dev server strictly uses port 5173. If port 5173 is already taken, the dev server will fail to start: check which process is using the port and terminate it.

### Verification

```bash
npm run test:extension
npm run build
npm run test:sites
```
