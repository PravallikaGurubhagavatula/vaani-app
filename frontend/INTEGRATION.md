# Vaani — Camera OCR Upgrade: Integration Guide
## Files delivered
| File | Purpose |
|---|---|
| `camera-ocr.js` | OCR engine + Camera UI + function patches |
| `camera-ocr.css` | All new styles (modal, overlay, badges, etc.) |

---

## Step 1 — Add the CSS link to `index.html`

Find this existing line in `<head>`:
```html
<link rel="stylesheet" href="permission-guide.css?v=20250325b">
```

Add the new stylesheet **immediately after** it:
```html
<link rel="stylesheet" href="permission-guide.css?v=20250325b">
<link rel="stylesheet" href="camera-ocr.css?v=1">
```

---

## Step 2 — Add the script tag to `index.html`

Find this block near the bottom of `<body>`:
```html
<script src="app.js?v=20250325a"></script>
```

Add the new script **immediately after** it:
```html
<script src="app.js?v=20250325a"></script>
<script src="camera-ocr.js?v=1"></script>
```

> **Order matters.** `camera-ocr.js` must load AFTER `app.js` so it can
> access `translateText`, `autoPlay`, `LANG_CONFIG`, etc.

---

## Step 3 — Set your Google Vision API key

In your existing `<script>` block (already in `index.html`) update:
```html
<script>
  window.VAANI_VERSION = "20250325a";
  window.VAANI_VISION_KEY = "YOUR_GOOGLE_VISION_API_KEY_HERE";
</script>
```

Replace `YOUR_GOOGLE_VISION_API_KEY_HERE` with your real key.
The module gracefully falls back to Server OCR → Tesseract if the key is empty.

---

## Step 4 — Expose `API_URL` (optional but recommended)

`camera-ocr.js` reads `window.API_URL` for the server fallback.
Your `app.js` already defines `const API_URL = "https://vaani-app-ui0z.onrender.com"`.
Make it global so the new module can see it — add one line inside the
existing `<script>` block in `index.html`:

```html
<script>
  window.VAANI_VERSION  = "20250325a";
  window.VAANI_VISION_KEY = "YOUR_KEY_HERE";
  window.API_URL        = "https://vaani-app-ui0z.onrender.com";  // ← add this
</script>
```

---

## Step 5 — (Optional) Append the CSS instead of linking

If you prefer a single CSS file, paste the entire contents of
`camera-ocr.css` at the **bottom** of your existing `style.css`.

---

## What changes automatically (zero manual edits needed)

| Feature | What happens |
|---|---|
| `cameraSrcBtn` click | Now opens the fullscreen Google Translate–style camera modal instead of the old basic modal |
| `translateImage()` | Replaced by upgraded version using `VaaniOCR.run()` with Vision API → Server → Tesseract priority |
| `confirmAndTranslate()` | Replaced with structured paragraph/line-level translation |
| OCR engine badge | Status line now shows a colour-coded `Vision API / Server / Tesseract` pill |
| Translated text | Pre-wrap white-space so line breaks from source are preserved |
| Camera permissions | Uses existing `handlePermission("video")` — no duplicate logic |

---

## What is NOT changed

- All login / Firebase auth code
- Translation, voice, conversation, history, favourites
- Travel helper
- Any existing UI page or CSS rule
- Service worker / PWA logic
- Language select defaults / persistence

---

## Architecture overview

```
camera-ocr.js
├── VaaniOCR (IIFE)
│   ├── run(blob, fromLang, toLang, onProgress) → OCR result
│   ├── optimise(blob) → preprocessed blob
│   ├── _visionOCR()   → Google Vision API
│   ├── _serverOCR()   → FastAPI /image-translate
│   └── _tessOCR()     → Tesseract.js (lazy-loaded)
│
├── VaaniCameraUI (IIFE)
│   ├── open()  → builds & opens fullscreen modal
│   ├── close() → tears down, stops stream
│   └── internal helpers (stream, overlay canvas, scan-line, frame capture)
│
└── Patch block (global scope)
    ├── window.translateImage()      → replaces app.js version
    └── window.confirmAndTranslate() → replaces app.js version
```

---

## Service Worker cache busting

The new files use query-string versioning (`?v=1`).
Your existing `vercel.json` already caches `*.js` and `*.css` with
`immutable`, so bumping the query string (`?v=2`) on any future update
will force clients to re-fetch.

---

## Vercel deployment checklist

1. Copy `camera-ocr.js` and `camera-ocr.css` into your frontend folder.
2. Apply Steps 1–4 above to `index.html`.
3. Push to Vercel — no `vercel.json` changes needed.
