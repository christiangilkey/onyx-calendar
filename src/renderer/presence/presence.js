// Hyperfocus presence, the camera half. It runs in its own sealed page (presence.html), which may
// load Onyx's own files and can reach nothing else. Each look takes the camera's current frame,
// asks the MediaPipe Selfie Segmenter which of its pixels are a person, and keeps only the answer:
// how much of the picture is you. The frame is never stored or sent anywhere; Onyx's window hears
// only { seen, cover }. While you set it up (?preview), the page also shows you what it sees: the
// picture dimmed, with the part it takes to be you lit up, drawn here and nowhere else.

(() => {
  const preview = new URLSearchParams(location.search).has('preview');
  const EVERY_MS = preview ? 200 : 1000; // a look a second while you work; five a second while you watch
  const SEEN_COVER = 0.03;               // a person in 3% of the picture: you are there (at a desk, 15 to 50%)
  const video = document.getElementById('cam');
  const view = document.getElementById('view');
  let segmenter = null, stream = null, timer = 0, stopped = false;

  const tell = (msg) => parent.postMessage({ source: 'onyx-presence', ...msg }, '*');

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 10, max: 15 }, facingMode: 'user' }, audio: false,
      });
    } catch (err) {
      const none = err && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError');
      tell({ type: 'error', what: none ? 'no-camera' : 'camera', text: String(err && err.message || err) });
      return;
    }
    if (stopped) { stop(); return; }
    video.srcObject = stream;
    try {
      segmenter = await Vision.ImageSegmenter.createFromOptions(
        { wasmLoaderPath: 'vision/vision_wasm_internal.js', wasmBinaryPath: 'vision/vision_wasm_internal.wasm' },
        { baseOptions: { modelAssetPath: 'vision/selfie_segmenter.tflite', delegate: 'CPU' }, runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true });
    } catch (err) {
      tell({ type: 'error', what: 'model', text: String(err && err.message || err) });
      stop();
      return;
    }
    if (stopped) { stop(); return; }
    tell({ type: 'ready' });
    loop();
  }

  function loop() {
    if (stopped) return;
    try { look(); } catch { /* one frame missed: the next look tries again */ }
    timer = setTimeout(loop, EVERY_MS);
  }

  function look() {
    if (!segmenter || video.readyState < 2 || !video.videoWidth) return;
    const res = segmenter.segmentForVideo(video, performance.now());
    try {
      const masks = res.confidenceMasks || [];
      const mask = masks[masks.length - 1]; // the person: the only mask, or the second after the background
      if (!mask) return;
      const data = mask.getAsFloat32Array();
      let on = 0;
      for (let i = 0; i < data.length; i++) if (data[i] > 0.5) on++;
      const cover = on / data.length;
      if (preview) draw(data, mask.width, mask.height);
      tell({ type: 'look', seen: cover >= SEEN_COVER, cover: Math.round(cover * 1000) / 1000 });
    } finally {
      res.close();
    }
  }

  // ---- the preview: the picture dimmed and mirrored (as a mirror would show you), you lit up in violet
  let maskCanvas = null;
  function draw(data, w, h) {
    view.hidden = false;
    const W = view.width = view.clientWidth * devicePixelRatio || 320, H = view.height = view.clientHeight * devicePixelRatio || 240;
    const g = view.getContext('2d');
    g.save();
    g.translate(W, 0);
    g.scale(-1, 1);
    // the frame, covering the box (cropped, not stretched)
    const vw = video.videoWidth, vh = video.videoHeight, k = Math.max(W / vw, H / vh);
    const dw = vw * k, dh = vh * k, dx = (W - dw) / 2, dy = (H - dh) / 2;
    g.filter = 'grayscale(0.6) brightness(0.45)';
    g.drawImage(video, dx, dy, dw, dh);
    g.filter = 'none';
    // the part that is you
    if (!maskCanvas || maskCanvas.width !== w || maskCanvas.height !== h) { maskCanvas = document.createElement('canvas'); maskCanvas.width = w; maskCanvas.height = h; }
    const mg = maskCanvas.getContext('2d'), img = mg.createImageData(w, h);
    for (let i = 0; i < data.length; i++) {
      const a = Math.max(0, Math.min(1, (data[i] - 0.35) / 0.4));
      img.data[i * 4] = 167; img.data[i * 4 + 1] = 139; img.data[i * 4 + 2] = 250; img.data[i * 4 + 3] = Math.round(a * 150);
    }
    mg.putImageData(img, 0, 0);
    g.drawImage(maskCanvas, dx, dy, dw, dh);
    g.restore();
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
    for (const t of stream?.getTracks() || []) t.stop(); // the camera light goes off
    stream = null;
    video.srcObject = null;
    try { segmenter?.close(); } catch { /* already closed */ }
    segmenter = null;
  }

  addEventListener('message', (e) => {
    if (e.source === parent && e.data?.cmd === 'stop') stop();
  });
  addEventListener('pagehide', stop);
  start();
})();
