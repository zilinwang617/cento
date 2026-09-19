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

Build the unpacked extension:

```bash
npm run build:extension
```

In Google Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this repository's `dist/extension` directory. The extension intentionally requests access to all sites so selected text can be collected from ordinary web pages. Chrome-protected pages such as `chrome://` pages do not permit content scripts.

The local main-site bridge is limited to `http://localhost/*` and `http://127.0.0.1/*`. The real extension profile starts with an empty document; the website's sample notes remain development-only.

Useful checks:

```bash
npm run test:extension
npm run build
npm run test:sites
```
