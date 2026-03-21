/* ================================================================
   Vaani — camera-ocr.js  v1.1
   Google Translate–style camera OCR module.

   ARCHITECTURE
   ─────────────
   VaaniOCR       — OCR engine (Vision API → Server → Tesseract)
   VaaniCameraUI  — Fullscreen camera overlay (Google Translate feel)
   Patch block    — Upgrades translateImage() and confirmAndTranslate()
                    in-place so the static upload flow also benefits.

   INTEGRATION (zero existing-code breakage)
   ──────────────────────────────────────────
   1. Add  <link rel="stylesheet" href="camera-ocr.css?v=1">
      before </head> in index.html.
   2. Add  <script src="camera-ocr.js?v=1"></script>
      AFTER <script src="app.js?v=…"></script> in index.html.
   3. That's it. All existing features continue unchanged.
================================================================ */

"use strict";

/* ──────────────────────────────────────────────────────────────────
   § 1  OCR ENGINE
────────────────────────────────────────────────────────────────── */
const VaaniOCR = (() => {

  const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";
  const getKey     = () => window.VAANI_VISION_KEY || "";
  const getApi     = () => window.API_URL || "https://vaani-app-ui0z.onrender.com";

  const BCP47 = {
    te:"te",ta:"ta",hi:"hi",kn:"kn",ml:"ml",mr:"mr",bn:"bn",
    gu:"gu",pa:"pa",ur:"ur",or:"or",as:"as",ne:"ne",sa:"sa",en:"en",
    sd:"ur",mai:"hi",doi:"hi",kok:"mr",bho:"hi",mwr:"hi",tcy:"kn",
    ks:"ur",brx:"hi",sat:"bn","mni-Mtei":"bn",lus:"en",awa:"hi",
    mag:"hi",hne:"hi",bgc:"hi",raj:"hi",gom:"mr",kha:"en",lep:"ne",
  };

  const TESS_MAP = {
    te:"tel",ta:"tam",hi:"hin",kn:"kan",ml:"mal",mr:"mar",bn:"ben",
    gu:"guj",pa:"pan",ur:"urd",or:"ori",as:"asm",ne:"nep",sa:"san",
    sd:"snd",mai:"hin",doi:"hin",kok:"mar",bho:"hin",mwr:"hin",
    tcy:"kan",ks:"urd",sat:"ben","mni-Mtei":"ben",lus:"eng",brx:"hin",
    awa:"hin",mag:"hin",hne:"hin",bgc:"hin",en:"eng",
  };

  /* helpers */
  function _blobToBase64(blob) {
    return new Promise((res, rej) => {
      const r   = new FileReader();
      r.onload  = () => res(r.result.split(",")[1]);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }

  function _fixBullets(text) {
    if (!text) return text;
    return text.split(/\r?\n/).map(l => {
      l = l.replace(/^([e|o·•●■▪◦‣⁃➢➤►▶→]\s+)/, "• ");
      l = l.replace(/^([-*]\s+)/, "• ");
      return l;
    }).join("\n");
  }

  /* Vision fullTextAnnotation → clean string */
  function _reconstructVision(full) {
    const pages = full.pages;
    if (!pages?.length) return (full.text || "").trim();
    const blockTexts = [];
    for (const page of pages) {
      for (const block of (page.blocks || [])) {
        const paraTexts = [];
        for (const para of (block.paragraphs || [])) {
          let t = "";
          for (const word of (para.words || [])) {
            for (const sym of (word.symbols || [])) {
              t += sym.text || "";
              const bt = sym.property?.detectedBreak?.type || "";
              if (bt === "LINE_BREAK" || bt === "EOL_SURE_SPACE") t += "\n";
              else if (bt === "HYPHEN")                           t += "-";
              else if (bt === "SPACE"  || bt === "SURE_SPACE")   t += " ";
            }
          }
          t = t.replace(/ +\n/g,"\n").replace(/\n +/g,"\n").replace(/ {2,}/g," ").trim();
          if (t) paraTexts.push(t);
        }
        if (paraTexts.length) blockTexts.push(paraTexts.join("\n"));
      }
    }
    return blockTexts.length ? blockTexts.join("\n\n").trim() : (full.text || "").trim();
  }

  /* Extract pixel-space bounding-box blocks for overlay */
  function _extractBlocks(full) {
    const out = [];
    for (const page of (full.pages || [])) {
      for (const block of (page.blocks || [])) {
        let t = "";
        for (const para of (block.paragraphs || [])) {
          for (const word of (para.words || [])) {
            for (const sym of (word.symbols || [])) {
              t += sym.text || "";
              const bt = sym.property?.detectedBreak?.type || "";
              if (bt === "SPACE" || bt === "SURE_SPACE") t += " ";
              else if (bt === "LINE_BREAK" || bt === "EOL_SURE_SPACE") t += "\n";
            }
          }
        }
        t = t.trim();
        if (!t) continue;
        const verts = block.boundingBox?.vertices || [];
        if (verts.length === 4) {
          const xs = verts.map(v => v.x || 0);
          const ys = verts.map(v => v.y || 0);
          out.push({ text:t, x:Math.min(...xs), y:Math.min(...ys),
                     w:Math.max(...xs)-Math.min(...xs), h:Math.max(...ys)-Math.min(...ys) });
        }
      }
    }
    return out;
  }

  /* Image optimiser: scale + greyscale + contrast + sharpen */
  async function optimise(blob) {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX=2000, MIN=1000;
        let { naturalWidth:w, naturalHeight:h } = img;
        if (w>MAX||h>MAX)      { const s=MAX/Math.max(w,h); w=Math.round(w*s); h=Math.round(h*s); }
        else if (w<MIN)        { const s=MIN/w;             w=Math.round(w*s); h=Math.round(h*s); }
        const c=document.createElement("canvas"); c.width=w; c.height=h;
        const ctx=c.getContext("2d"); ctx.drawImage(img,0,0,w,h);
        // Greyscale + contrast 1.8
        const id=ctx.getImageData(0,0,w,h), d=id.data;
        for (let i=0;i<d.length;i+=4) {
          const g=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
          d[i]=d[i+1]=d[i+2]=Math.min(255,Math.max(0,1.8*(g-128)+128));
        }
        ctx.putImageData(id,0,0);
        // Sharpen kernel
        const k=[0,-1,0,-1,5,-1,0,-1,0];
        const src=ctx.getImageData(0,0,w,h), dst=ctx.createImageData(w,h);
        const sd=src.data, dd=dst.data;
        for (let y=1;y<h-1;y++) for (let x=1;x<w-1;x++) {
          let v=0;
          for (let ky=-1;ky<=1;ky++) for (let kx=-1;kx<=1;kx++)
            v+=sd[((y+ky)*w+(x+kx))*4]*k[(ky+1)*3+(kx+1)];
          const o=(y*w+x)*4;
          dd[o]=dd[o+1]=dd[o+2]=Math.min(255,Math.max(0,v)); dd[o+3]=255;
        }
        ctx.putImageData(dst,0,0);
        c.toBlob(b=>resolve(b||blob),"image/png");
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
      img.src = url;
    });
  }

  /* Vision API */
  async function _visionOCR(blob, lang, progress) {
    if (!getKey()) return null;
    progress?.("Calling Google Vision API…", 20);
    try {
      const b64 = await _blobToBase64(blob);
      const payload = { requests:[{
        image:       { content:b64 },
        features:    [{ type:"DOCUMENT_TEXT_DETECTION", maxResults:1 }],
        imageContext:{ languageHints:[BCP47[lang]||"en","en"] },
      }]};
      const res = await fetch(`${VISION_URL}?key=${getKey()}`,{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload), signal:AbortSignal.timeout(30000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const r    = data.responses?.[0];
      if (!r||r.error) return null;
      const full = r.fullTextAnnotation;
      if (full) {
        const text   = _reconstructVision(full);
        const blocks = _extractBlocks(full);
        if (text.length > 2) {
          progress?.("Vision API ✓", 55);
          return { text:_fixBullets(text), blocks, engine:"google_vision" };
        }
      }
      const simple = r.textAnnotations?.[0]?.description?.trim();
      if (simple?.length > 2) {
        progress?.("Vision API ✓", 55);
        return { text:_fixBullets(simple), blocks:[], engine:"google_vision_simple" };
      }
      return null;
    } catch(e) { console.warn("[Vision]",e.message); return null; }
  }

  /* Server OCR fallback */
  async function _serverOCR(blob, lang, toLang, progress) {
    progress?.("Trying server OCR…", 40);
    try {
      const fd = new FormData();
      fd.append("file", blob, "image.png");
      fd.append("from_lang", lang);
      fd.append("to_lang", toLang||lang);
      const res = await fetch(`${getApi()}/image-translate`,{
        method:"POST", body:fd, signal:AbortSignal.timeout(40000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.extracted?.trim().length > 5) {
        progress?.("Server OCR ✓", 60);
        return { text:data.extracted.trim(), blocks:[], engine:data.engine||"server",
                 preTranslated:data.translated||null };
      }
      return null;
    } catch(e) { console.warn("[Server OCR]",e.message); return null; }
  }

  /* Tesseract */
  function _loadTesseract() {
    return new Promise((res,rej)=>{
      if (window.Tesseract) { res(window.Tesseract); return; }
      const s=document.createElement("script");
      s.src="https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js";
      s.onload=()=>res(window.Tesseract); s.onerror=()=>rej(new Error("Tesseract load failed"));
      document.head.appendChild(s);
    });
  }
  async function _tessOCR(blob, lang, progress) {
    progress?.("Loading Tesseract…", 45);
    const T  = await _loadTesseract();
    const tl = TESS_MAP[lang]||"eng";
    const ls = tl==="eng"?"eng":`${tl}+eng`;
    const w  = await T.createWorker(ls,1,{
      logger:m=>{
        if (m.status==="recognizing text")
          progress?.(`Tesseract ${Math.round((m.progress||0)*100)}%`, 45+Math.round((m.progress||0)*30));
      }
    });
    try {
      const { data:{text} } = await w.recognize(blob);
      await w.terminate();
      const clean=(text||"").trim();
      if (clean.length<3) return null;
      progress?.("Tesseract ✓", 78);
      return { text:clean, blocks:[], engine:"tesseract" };
    } catch(e) {
      try{await w.terminate();}catch(_){}
      console.warn("[Tesseract]",e.message); return null;
    }
  }

  /* Public run() */
  async function run(blob, langCode, toLang, onProgress) {
    onProgress?.("Optimising image…", 10);
    const opt = await optimise(blob);
    const vr  = await _visionOCR(opt, langCode, onProgress);
    if (vr?.text?.length > 5) return vr;
    const sr  = await _serverOCR(opt, langCode, toLang, onProgress);
    if (sr?.text?.length > 5) return sr;
    const tr  = await _tessOCR(opt, langCode, onProgress);
    if (tr?.text?.length > 5) return tr;
    onProgress?.("No text detected", 100);
    return null;
  }

  return { run, optimise };
})();


/* ──────────────────────────────────────────────────────────────────
   § 2  CAMERA UI  —  Google Translate–style fullscreen camera
────────────────────────────────────────────────────────────────── */
const VaaniCameraUI = (() => {

  let _stream   = null;
  let _modal    = null;
  let _scanning = false;

  /* Build DOM */
  function _build() {
    const m = document.createElement("div");
    m.id    = "vaaniCamOCR";
    m.className = "vcam-ocr-modal";
    /* .vcam-ocr-inner is the flex column that wraps top-bar / video / bottom-bar */
    m.innerHTML = `
      <div class="vcam-ocr-inner">

        <!-- TOP BAR -->
        <div class="vcam-ocr-topbar">
          <button class="vcam-ocr-close" id="vcamOcrClose" aria-label="Close">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div class="vcam-ocr-lang-bar">
            <select class="vcam-ocr-lang-select" id="vcamOcrFrom"></select>
            <div class="vcam-ocr-lang-arrow">
              <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </div>
            <select class="vcam-ocr-lang-select" id="vcamOcrTo"></select>
          </div>
          <div class="vcam-ocr-mode-badge" id="vcamModeBadge">LIVE</div>
        </div>

        <!-- VIDEO + OVERLAY (fills remaining height) -->
        <div class="vcam-ocr-video-wrap">
          <video id="vcamOcrVideo" autoplay playsinline muted></video>
          <canvas id="vcamOcrOverlay" class="vcam-ocr-overlay"></canvas>
          <!-- Viewfinder corners -->
          <div class="vcam-ocr-frame">
            <div class="vcam-ocr-corner vcam-ocr-tl"></div>
            <div class="vcam-ocr-corner vcam-ocr-tr"></div>
            <div class="vcam-ocr-corner vcam-ocr-bl"></div>
            <div class="vcam-ocr-corner vcam-ocr-br"></div>
          </div>
          <!-- Animated scan line -->
          <div id="vcamScanLine"></div>
        </div>

        <!-- BOTTOM BAR -->
        <div class="vcam-ocr-bottombar">
          <div class="vcam-ocr-status" id="vcamOcrStatus">Point camera at text</div>
          <button class="vcam-ocr-capture-btn" id="vcamOcrCapture">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2.5"/><circle cx="12" cy="12" r="6" fill="currentColor"/></svg>
            Capture &amp; Translate
          </button>
          <div class="vcam-ocr-hints">Hold steady · Good lighting · 15–40 cm away</div>
        </div>

      </div><!-- /.vcam-ocr-inner -->
    `;
    return m;
  }

  /* Populate language dropdowns from app globals */
  function _populateLangs(fromLang, toLang) {
    const groups = window.LANG_GROUPS || [];
    const cfg    = window.LANG_CONFIG || {};
    ["vcamOcrFrom","vcamOcrTo"].forEach((id, idx) => {
      const sel = document.getElementById(id);
      if (!sel) return;
      let html = "";
      groups.forEach(g => {
        const opts = g.langs
          .filter(c => cfg[c])
          .map(c => `<option value="${c}">${cfg[c].name}</option>`)
          .join("");
        if (opts) html += `<optgroup label="${g.label}">${opts}</optgroup>`;
      });
      sel.innerHTML = html;
      sel.value = idx === 0 ? fromLang : toLang;
    });
  }

  /* Start camera stream, trying back-camera first */
  async function _startStream(videoEl) {
    _stopStream();
    const tries = [
      { video:{ facingMode:{exact:"environment"}, width:{ideal:1920}, height:{ideal:1080} } },
      { video:{ facingMode:"environment" } },
      { video: true },
    ];
    for (const c of tries) {
      try {
        _stream = await navigator.mediaDevices.getUserMedia(c);
        videoEl.srcObject = _stream;
        await videoEl.play();
        return true;
      } catch(_) {}
    }
    return false;
  }
  function _stopStream() {
    if (_stream) { _stream.getTracks().forEach(t=>t.stop()); _stream=null; }
  }

  /* Scan-line animation helpers */
  function _startScan() {
    const el = document.getElementById("vcamScanLine");
    if (!el) return;
    el.style.cssText = "display:block";
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "vcamScanAnim 2s ease-in-out infinite";
  }
  function _stopScan() {
    const el = document.getElementById("vcamScanLine");
    if (el) el.style.display = "none";
  }

  /* Capture a JPEG blob from the live video */
  function _captureFrame(videoEl) {
    return new Promise(resolve => {
      const c = document.createElement("canvas");
      c.width  = videoEl.videoWidth  || 1280;
      c.height = videoEl.videoHeight || 720;
      c.getContext("2d").drawImage(videoEl, 0, 0, c.width, c.height);
      c.toBlob(b => resolve(b), "image/jpeg", 0.95);
    });
  }

  /* Draw translated text blocks as overlay on canvas */
  function _drawOverlay(canvas, blocks, imgW, imgH, translatedBlocks) {
    if (!blocks?.length) return;
    const ctx    = canvas.getContext("2d");
    const scaleX = canvas.width  / imgW;
    const scaleY = canvas.height / imgH;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    blocks.forEach((block, i) => {
      const x  = block.x * scaleX;
      const y  = block.y * scaleY;
      const w  = block.w * scaleX;
      const h  = block.h * scaleY;
      const tx = (translatedBlocks && translatedBlocks[i]) ? translatedBlocks[i] : block.text;
      const fs = Math.max(11, Math.min(18, h * 0.55));

      // Background pill
      ctx.save();
      ctx.fillStyle   = "rgba(10,8,28,0.84)";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur  = 6;
      _rrect(ctx, x-4, y-4, w+8, h+8, 6);
      ctx.fill();
      ctx.restore();

      // Text
      ctx.save();
      ctx.fillStyle    = "#c4b5fd";
      ctx.font         = `600 ${fs}px 'Outfit',sans-serif`;
      ctx.textBaseline = "top";
      ctx.shadowColor  = "rgba(0,0,0,0.6)";
      ctx.shadowBlur   = 2;
      _wrapText(ctx, tx, x+4, y+2, w, fs*1.3);
      ctx.restore();
    });
  }

  function _rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
    ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r);
    ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
    ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r);
    ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
  }
  function _wrapText(ctx, text, x, y, maxW, lineH) {
    const words = text.split(" ");
    let line = "", ly = y;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, ly); line = w; ly += lineH;
      } else { line = test; }
    }
    if (line) ctx.fillText(line, x, ly);
  }

  /* Slowly fade overlay canvas to transparent */
  function _fadeOut(canvas, delay=6000) {
    setTimeout(()=>{
      let op=1;
      const tick=()=>{
        op-=0.03; if (op<=0){ canvas.getContext("2d").clearRect(0,0,canvas.width,canvas.height); return; }
        canvas.style.opacity=op; requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay);
  }

  /* Write OCR result into the Image page's existing result UI */
  function _pushResultToPage(ocrResult, translated, from, to) {
    const editEl    = document.getElementById("imgExtractedTextEdit");
    const transEl   = document.getElementById("imgTranslatedText");
    const resultsEl = document.getElementById("imgResults");
    const statusEl  = document.getElementById("imgStatus");
    const confirmBt = document.getElementById("imgConfirmTranslateBtn");
    const tlEl      = document.getElementById("audioTimelineImg");

    if (editEl)    { editEl.value = ocrResult.text; editEl.style.display = "block"; }
    if (confirmBt) confirmBt.style.display = "flex";
    if (transEl)   transEl.textContent = translated || "—";
    if (resultsEl) resultsEl.style.display = "block";

    // Engine badge
    const badgeClass = ocrResult.engine.includes("vision") ? "badge-vision"
                     : ocrResult.engine === "server"       ? "badge-server"
                     : "badge-tesseract";
    const badgeLabel = ocrResult.engine.includes("vision") ? "Vision API"
                     : ocrResult.engine === "server"       ? "Server"
                     : "Tesseract";
    if (statusEl) {
      statusEl.className = "status-text status-ok";
      statusEl.innerHTML = `OCR complete <span class="ocr-engine-badge ${badgeClass}">${badgeLabel}</span>`;
    }
    if (tlEl && translated) tlEl.style.display = "flex";
    if (translated && typeof window.autoPlay === "function") {
      window.autoPlay(translated, to, "Img", transEl);
    }
  }

  /* Close and clean up */
  function _close() {
    _stopStream(); _stopScan(); _scanning = false;
    if (_modal) {
      _modal.classList.remove("vcam-ocr-open");
      setTimeout(()=>{ _modal?.remove(); _modal=null; }, 350);
    }
  }

  /* PUBLIC: open() */
  async function open() {
    if (_modal) return;

    const from = document.getElementById("imgFromLang")?.value || "en";
    const to   = document.getElementById("imgToLang")?.value   || "en";

    // Camera permission
    if (typeof window.handlePermission === "function") {
      const ok = await window.handlePermission("video");
      if (!ok) return;
    } else if (navigator.mediaDevices?.getUserMedia) {
      try { const s=await navigator.mediaDevices.getUserMedia({video:true}); s.getTracks().forEach(t=>t.stop()); }
      catch(_) { return; }
    }

    _modal = _build();
    document.body.appendChild(_modal);
    requestAnimationFrame(()=>_modal.classList.add("vcam-ocr-open"));
    _populateLangs(from, to);

    const videoEl   = document.getElementById("vcamOcrVideo");
    const overlayEl = document.getElementById("vcamOcrOverlay");
    const statusEl  = document.getElementById("vcamOcrStatus");
    const captureBtn= document.getElementById("vcamOcrCapture");

    // Keyboard close
    function _escHandler(e){ if(e.key==="Escape"){ _close(); document.removeEventListener("keydown",_escHandler); } }
    document.addEventListener("keydown", _escHandler);
    document.getElementById("vcamOcrClose").addEventListener("click", ()=>{
      document.removeEventListener("keydown",_escHandler); _close();
    });

    statusEl.textContent = "Starting camera…";
    const started = await _startStream(videoEl);
    if (!started) { statusEl.textContent = "Camera not available"; return; }

    // Resize overlay canvas once video metadata is known
    videoEl.addEventListener("loadedmetadata", ()=>{
      overlayEl.width  = videoEl.videoWidth  || 1280;
      overlayEl.height = videoEl.videoHeight || 720;
    }, { once:true });

    statusEl.textContent = "Point camera at text and tap Capture";
    _startScan();

    /* ── Capture & translate ── */
    captureBtn.addEventListener("click", async () => {
      if (_scanning) return;
      _scanning = true;
      captureBtn.disabled = true;
      captureBtn.classList.add("vcam-ocr-btn-loading");

      const badge = document.getElementById("vcamModeBadge");
      if (badge) { badge.textContent="SCANNING"; badge.classList.add("scanning"); }

      const curFrom = document.getElementById("vcamOcrFrom")?.value || from;
      const curTo   = document.getElementById("vcamOcrTo")?.value   || to;
      statusEl.textContent = "Capturing frame…";

      try {
        const frameBlob = await _captureFrame(videoEl);
        statusEl.textContent = "Running OCR…";

        const ocrResult = await VaaniOCR.run(frameBlob, curFrom, curTo, (msg)=>{
          statusEl.textContent = msg;
        });

        if (!ocrResult?.text) {
          statusEl.textContent = "No text found — adjust angle and try again";
          _scanning = false;
          captureBtn.disabled = false;
          captureBtn.classList.remove("vcam-ocr-btn-loading");
          if (badge) { badge.textContent="LIVE"; badge.classList.remove("scanning"); }
          return;
        }

        statusEl.textContent = "Translating…";

        // Full-text translation
        let translated = curFrom === curTo ? ocrResult.text : "";
        if (!translated && typeof window.translateText === "function") {
          translated = await window.translateText(ocrResult.text, curFrom, curTo).catch(()=>"");
        }

        // Per-block translations for overlay
        let txBlocks = [];
        if (ocrResult.blocks?.length && curFrom !== curTo && typeof window.translateText === "function") {
          txBlocks = await Promise.all(
            ocrResult.blocks.map(b => window.translateText(b.text, curFrom, curTo).catch(()=>b.text))
          );
        }

        // Render overlay using actual captured image dimensions
        if (ocrResult.blocks?.length) {
          const probe = new Image();
          const probeUrl = URL.createObjectURL(frameBlob);
          probe.onload = () => {
            URL.revokeObjectURL(probeUrl);
            overlayEl.width  = probe.naturalWidth;
            overlayEl.height = probe.naturalHeight;
            _drawOverlay(overlayEl, ocrResult.blocks, probe.naturalWidth, probe.naturalHeight, txBlocks);
            _fadeOut(overlayEl, 8000);
          };
          probe.src = probeUrl;
        }

        // Sync page language selects
        ["imgFromLang","imgToLang"].forEach((id,i)=>{
          const el=document.getElementById(id);
          if (el) el.value = i===0 ? curFrom : curTo;
        });

        // Show captured preview image
        const previewImg = document.getElementById("imgPreview");
        const previewBox = document.getElementById("imgPreviewBox");
        const uploadArea = document.getElementById("uploadArea");
        if (previewImg) {
          const previewUrl = URL.createObjectURL(frameBlob);
          previewImg.src = previewUrl;
          previewImg.style.cursor = "zoom-in";
          previewImg.onclick = () => typeof window.openImagePreview === "function" && window.openImagePreview(previewImg.src);
        }
        if (previewBox) previewBox.style.display = "block";
        if (uploadArea) uploadArea.style.display  = "none";

        // Store for re-translate button
        window._imgCroppedBlob = frameBlob;
        window._imgCurrentFile = frameBlob;

        _pushResultToPage(ocrResult, translated, curFrom, curTo);
        if (badge) { badge.textContent="DONE"; badge.classList.remove("scanning"); badge.classList.add("done"); }
        statusEl.textContent = "Done! Closing…";

        setTimeout(()=>{
          _close();
          setTimeout(()=>{
            document.getElementById("imgResults")?.scrollIntoView({ behavior:"smooth", block:"start" });
          }, 400);
        }, 1000);

      } catch(err) {
        console.error("[CameraOCR]", err);
        statusEl.textContent = "Error — please try again";
        _scanning = false;
        captureBtn.disabled = false;
        captureBtn.classList.remove("vcam-ocr-btn-loading");
        if (badge) { badge.textContent="LIVE"; badge.classList.remove("scanning"); }
      }
    });
  }

  return { open, close: _close };
})();


/* ──────────────────────────────────────────────────────────────────
   § 3  PATCH — Upgrade translateImage() and confirmAndTranslate()
   Uses VaaniOCR instead of the inline OCR logic in app.js.
   Replaces the existing window functions — called by HTML onclick.
────────────────────────────────────────────────────────────────── */

/* Helper: status text with colour class */
function _setImgStatus(msg, type="info") {
  const el = document.getElementById("imgStatus");
  if (!el) return;
  el.className = `status-text status-${type}`;
  el.textContent = msg;
}
function _setImgStatusHtml(html, type="info") {
  const el = document.getElementById("imgStatus");
  if (!el) return;
  el.className = `status-text status-${type}`;
  el.innerHTML = html;
}

/* Sentence-level translate preserving structure */
async function _translateStructured(text, from, to) {
  if (from === to) return text;
  if (typeof window.translateText !== "function") return text;

  const paragraphs = text.split(/\n\n+/);
  const out = await Promise.all(paragraphs.map(async para => {
    if (!para.trim()) return "";
    const lines = para.split("\n");
    const tLines = await Promise.all(lines.map(async line => {
      const l = line.trim();
      if (!l) return "";
      try { return await window.translateText(l, from, to); } catch(_){ return l; }
    }));
    return tLines.join("\n");
  }));
  return out.join("\n\n").trim();
}

/* Upgraded translateImage — replaces the one in app.js */
window.translateImage = async function() {
  const fromLang   = document.getElementById("imgFromLang")?.value || "en";
  const toLang     = document.getElementById("imgToLang")?.value   || "en";
  const btn        = document.getElementById("imgTranslateBtn");
  const sourceBlob = window._imgCroppedBlob || window._imgCurrentFile;

  if (!sourceBlob) { typeof window.showToast === "function" && window.showToast("No image selected"); return; }

  if (btn) btn.disabled = true;
  document.getElementById("imgResults").style.display = "none";

  // Reset editable area
  const editEl    = document.getElementById("imgExtractedTextEdit");
  const confirmBt = document.getElementById("imgConfirmTranslateBtn");
  if (editEl)    { editEl.value = ""; editEl.style.display = "none"; }
  if (confirmBt) confirmBt.style.display = "none";

  if (typeof window.resetTimeline === "function") window.resetTimeline("Img");

  try {
    const ocrResult = await VaaniOCR.run(sourceBlob, fromLang, toLang, (msg, pct) => {
      _setImgStatus(msg, "info");
    });

    if (!ocrResult?.text || ocrResult.text.length < 3) {
      const transEl = document.getElementById("imgTranslatedText");
      if (transEl) transEl.textContent = "No text detected. Try a clearer image.";
      document.getElementById("imgResults").style.display = "block";
      _setImgStatus("No text found", "error");
      return;
    }

    // Show editable extracted text
    if (editEl)    { editEl.value = ocrResult.text; editEl.style.display = "block"; }
    if (confirmBt) confirmBt.style.display = "flex";
    _setImgStatus("OCR complete — translating…", "info");

    // Translate
    let translated = "";
    // If server gave us a pre-translation, use it
    if (ocrResult.preTranslated) {
      translated = ocrResult.preTranslated;
    } else {
      translated = await _translateStructured(ocrResult.text, fromLang, toLang);
    }

    const transEl = document.getElementById("imgTranslatedText");
    if (transEl)   transEl.textContent = translated || "—";

    document.getElementById("imgResults").style.display = "block";

    const badgeClass = ocrResult.engine.includes("vision") ? "badge-vision"
                     : ocrResult.engine === "server"       ? "badge-server"
                     : "badge-tesseract";
    const badgeLabel = ocrResult.engine.includes("vision") ? "Vision API"
                     : ocrResult.engine === "server"       ? "Server"
                     : "Tesseract";
    _setImgStatusHtml(
      `OCR complete <span class="ocr-engine-badge ${badgeClass}">${badgeLabel}</span>`,
      "ok"
    );

    if (typeof window.showTimeline === "function") window.showTimeline("Img");
    if (translated && translated !== ocrResult.text && typeof window.autoPlay === "function") {
      const tEl = document.getElementById("imgTranslatedText");
      window.autoPlay(translated, toLang, "Img", tEl);
    }

  } catch(e) {
    console.error("[translateImage]", e);
    _setImgStatus("Error: " + e.message, "error");
    typeof window.showToast === "function" && window.showToast("Image processing failed");
  } finally {
    if (btn) btn.disabled = false;
  }
};

/* Upgraded confirmAndTranslate — replaces the one in app.js */
window.confirmAndTranslate = async function() {
  const editEl = document.getElementById("imgExtractedTextEdit");
  const text   = (editEl?.value || "").trim();
  if (!text) { typeof window.showToast === "function" && window.showToast("No text to translate"); return; }

  const fromLang = document.getElementById("imgFromLang")?.value || "en";
  const toLang   = document.getElementById("imgToLang")?.value   || "en";
  const btn      = document.getElementById("imgConfirmTranslateBtn");

  if (btn) btn.disabled = true;
  _setImgStatus("Translating…", "info");

  try {
    const translated = await _translateStructured(text, fromLang, toLang);
    const transEl    = document.getElementById("imgTranslatedText");
    if (transEl) transEl.textContent = translated || "—";
    _setImgStatus("Translation complete ✓", "ok");

    if (typeof window.showTimeline === "function") window.showTimeline("Img");
    if (translated && translated !== text && typeof window.autoPlay === "function") {
      const tEl = document.getElementById("imgTranslatedText");
      window.autoPlay(translated, toLang, "Img", tEl);
    }
  } catch(e) {
    console.error("[confirmAndTranslate]", e);
    _setImgStatus("Translation error: " + e.message, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
};


/* ──────────────────────────────────────────────────────────────────
   § 4  WIRE UP — runs after DOM is ready
────────────────────────────────────────────────────────────────── */
function _wireCameraBtn() {
  const btn = document.getElementById("cameraSrcBtn");
  if (!btn) return;
  // Clone to remove old listeners from app.js
  const fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);
  fresh.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    VaaniCameraUI.open();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", _wireCameraBtn);
} else {
  // DOM already ready (script loaded late)
  _wireCameraBtn();
}

// Expose globals
window.VaaniOCR      = VaaniOCR;
window.VaaniCameraUI = VaaniCameraUI;
