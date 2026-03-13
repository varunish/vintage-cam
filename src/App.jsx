import { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { FILTER_PRESETS } from './FilterEngine';
import './App.css';

// Cap DPR so pixel-processing stays fast on high-density screens
const MAX_DPR = 2;

// Let the device pick its native resolution and orientation.
// Specifying landscape dimensions (e.g. 1920×1080) on a portrait phone can
// cause the driver to return a landscape stream whose raw pixels are then
// drawn to the canvas without the rotation metadata → vertical stretch.
const VIDEO_CONSTRAINTS = {
  facingMode: 'environment',
};

export default function App() {
  const webcamRef  = useRef(null);
  const canvasRef  = useRef(null);
  const rafRef     = useRef(null);
  // Cache canvas 2d context so we don't re-fetch every frame
  const ctxRef     = useRef(null);

  const [activeFilter, setActiveFilter] = useState(0);
  const [capturedUrl, setCapturedUrl]   = useState(null);
  const [camError, setCamError]         = useState(null);
  const [camReady, setCamReady]         = useState(false);
  const [needsTap, setNeedsTap]         = useState(false);

  // ── Get (and cache) canvas 2d context ───────────────────────────────────────
  const getCtx = useCallback(() => {
    if (!ctxRef.current && canvasRef.current) {
      ctxRef.current = canvasRef.current.getContext('2d', { willReadFrequently: true });
    }
    return ctxRef.current;
  }, []);

  // ── Pre-size canvas and keep it in sync with layout ──────────────────────────
  // This runs before the animation loop so frame-0 already has correct dims.
  // getBoundingClientRect() is layout-synchronous; clientWidth/clientHeight can
  // return the default 300×150 canvas intrinsic size before CSS layout fires,
  // which produces a landscape buffer that CSS then stretches → vertical distortion.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 50) return;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const w   = Math.round(rect.width  * dpr);
      const h   = Math.round(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width  = w;
        canvas.height = h;
        // Invalidate cached context — resizing canvas resets it
        ctxRef.current = null;
      }
    };

    // Size immediately, then track orientation/window changes
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── Animation loop ──────────────────────────────────────────────────────────
  const startLoop = useCallback(() => {
    const tick = () => {
      // webcamRef.current.video is the underlying HTMLVideoElement (react-webcam API)
      const video  = webcamRef.current?.video;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState >= 2) {
        // Re-fetch context each tick in case a resize invalidated it
        const ctx = getCtx();
        const vw  = video.videoWidth;
        const vh  = video.videoHeight;

        if (ctx && vw > 0 && vh > 0) {
          // getBoundingClientRect is layout-synchronous — unlike clientWidth it
          // never returns the canvas's default 300×150 intrinsic size.
          const rect  = canvas.getBoundingClientRect();
          const cw    = rect.width;
          const ch    = rect.height;

          // Skip until the canvas has a sensible rendered size
          if (cw < 50 || ch < 50) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }

          const dpr   = Math.min(window.devicePixelRatio || 1, MAX_DPR);
          const dispW = Math.round(cw * dpr);
          const dispH = Math.round(ch * dpr);

          if (canvas.width !== dispW || canvas.height !== dispH) {
            canvas.width  = dispW;
            canvas.height = dispH;
            ctxRef.current = null; // canvas resize invalidates the context
          }

          // object-fit: cover — scale video stream to fill canvas, centre-crop
          const scale = Math.max(dispW / vw, dispH / vh);
          const dw    = vw * scale;
          const dh    = vh * scale;
          ctx.drawImage(video, (dispW - dw) / 2, (dispH - dh) / 2, dw, dh);

          try {
            const imageData = ctx.getImageData(0, 0, dispW, dispH);
            FILTER_PRESETS[activeFilter].apply(imageData, dispW, dispH);
            ctx.putImageData(imageData, 0, 0);
          } catch (err) {
            if (err.name === 'SecurityError') setCamError('taint');
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [activeFilter, getCtx]);

  const stopLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Restart loop when filter or preview state changes
  useEffect(() => {
    if (capturedUrl) return;
    stopLoop();
    startLoop();
    return stopLoop;
  }, [activeFilter, capturedUrl, startLoop, stopLoop]);

  // iOS autoplay watchdog — show "Tap to Start" if stream stalls after 2s
  useEffect(() => {
    if (!camReady) return;
    const timer = setTimeout(() => {
      const video = webcamRef.current?.video;
      if (video && video.readyState < 3 && !camError) setNeedsTap(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [camReady, camError]);

  // ── Camera callbacks ────────────────────────────────────────────────────────
  const handleUserMedia = useCallback(() => {
    setCamReady(true);
  }, []);

  const handleUserMediaError = useCallback((err) => {
    const name = err?.name || '';
    if (
      name === 'NotAllowedError' ||
      name === 'PermissionDeniedError' ||
      err?.message?.includes('Permission')
    ) {
      setCamError('denied');
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      setCamError('notfound');
    } else {
      setCamError('denied');
    }
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleCapture = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    stopLoop();
    setCapturedUrl(canvas.toDataURL('image/jpeg', 0.92));
  }, [stopLoop]);

  const handleRetake = useCallback(() => {
    setCapturedUrl(null);
  }, []);

  const handleDownload = useCallback(() => {
    if (!capturedUrl) return;
    const a      = document.createElement('a');
    a.href       = capturedUrl;
    a.download   = `vintage-photo-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [capturedUrl]);

  const handleTap = useCallback(() => {
    webcamRef.current?.video?.play().catch(() => {});
    setNeedsTap(false);
  }, []);

  // ── Error screens ───────────────────────────────────────────────────────────
  if (camError === 'denied') {
    return (
      <div className="error-screen">
        <p>Camera access required — please allow camera permissions and refresh</p>
      </div>
    );
  }
  if (camError === 'notfound') {
    return (
      <div className="error-screen">
        <p>No camera detected on this device</p>
      </div>
    );
  }

  return (
    <div className="app">

      {/*
        Webcam is rendered VISIBLE, filling the screen, but invisible (opacity:0).
        This ensures the browser properly initialises the stream and reports
        correct videoWidth / videoHeight — display:none breaks this on mobile.
        The canvas on top (z-index:1) always covers it.
      */}
      <Webcam
        ref={webcamRef}
        audio={false}
        playsInline
        muted
        videoConstraints={VIDEO_CONSTRAINTS}
        className="webcam-bg"
        onUserMedia={handleUserMedia}
        onUserMediaError={handleUserMediaError}
      />

      {/* Filtered viewfinder — drawn every RAF tick */}
      <canvas ref={canvasRef} className="viewfinder" />

      {/* Canvas SecurityError fallback */}
      {camError === 'taint' && (
        <div className="taint-warning">
          Filter preview unavailable on this browser — capture still works
        </div>
      )}

      {/* iOS tap-to-start overlay */}
      {needsTap && (
        <button className="tap-overlay" onClick={handleTap}>
          Tap to Start
        </button>
      )}

      {/* Bottom controls — float above the viewfinder */}
      <div className="controls-overlay">
        <div className="filter-bar" role="listbox" aria-label="Filter presets">
          {FILTER_PRESETS.map((preset, i) => (
            <button
              key={preset.id}
              role="option"
              aria-selected={i === activeFilter}
              className={`filter-pill${i === activeFilter ? ' active' : ''}`}
              onClick={() => setActiveFilter(i)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="capture-row">
          <button
            className="capture-btn"
            aria-label="Capture photo"
            onClick={handleCapture}
          />
        </div>
      </div>

      {/* Full-screen preview after capture */}
      {capturedUrl && (
        <div className="preview-screen">
          <img src={capturedUrl} alt="Captured" className="preview-img" />
          <div className="preview-actions">
            <button className="btn-retake" onClick={handleRetake}>Retake</button>
            <button className="btn-save"   onClick={handleDownload}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
