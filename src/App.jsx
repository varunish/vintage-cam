import { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { FILTER_PRESETS } from './FilterEngine';
import './App.css';

// Cap DPR so pixel-processing stays fast on high-density screens
const MAX_DPR = 2;

export default function App() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  const [activeFilter, setActiveFilter] = useState(0);
  const [capturedUrl, setCapturedUrl]   = useState(null);
  const [camError, setCamError]         = useState(null);
  const [needsTap, setNeedsTap]         = useState(false);
  const [tapDone, setTapDone]           = useState(false);

  // ── Animation loop ──────────────────────────────────────────────────────────
  const startLoop = useCallback(() => {
    const tick = () => {
      const video  = webcamRef.current?.video;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState >= 2) {
        const dpr   = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const dispW = Math.round(canvas.clientWidth  * dpr);
        const dispH = Math.round(canvas.clientHeight * dpr);

        if (canvas.width !== dispW || canvas.height !== dispH) {
          canvas.width  = dispW;
          canvas.height = dispH;
        }

        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const ctx = canvas.getContext('2d');

        if (vw > 0 && vh > 0) {
          // object-fit: cover — scale video to fill canvas, center-crop
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
  }, [activeFilter]);

  const stopLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Restart loop whenever active filter or preview state changes
  useEffect(() => {
    if (capturedUrl) return;
    stopLoop();
    startLoop();
    return stopLoop;
  }, [activeFilter, capturedUrl, startLoop, stopLoop]);

  // iOS autoplay watchdog
  useEffect(() => {
    const timer = setTimeout(() => {
      const video = webcamRef.current?.video;
      if (video && video.readyState < 3 && !camError) setNeedsTap(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [camError]);

  // ── Error handlers ──────────────────────────────────────────────────────────
  const handleUserMediaError = useCallback((err) => {
    const name = err?.name || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || err?.message?.includes('Permission')) {
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

  const handleRetake = useCallback(() => setCapturedUrl(null), []);

  const handleDownload = useCallback(() => {
    if (!capturedUrl) return;
    const a = document.createElement('a');
    a.href     = capturedUrl;
    a.download = `vintage-photo-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [capturedUrl]);

  const handleTap = useCallback(() => {
    webcamRef.current?.video?.play().catch(() => {});
    setNeedsTap(false);
    setTapDone(true);
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
      {/* Hidden webcam — only used as video source */}
      <Webcam
        ref={webcamRef}
        audio={false}
        playsInline
        muted
        videoConstraints={{ facingMode: 'environment' }}
        style={{ display: 'none' }}
        onUserMediaError={handleUserMediaError}
      />

      {/* Viewfinder — fills entire screen */}
      <canvas ref={canvasRef} className="viewfinder" />

      {/* Canvas taint warning */}
      {camError === 'taint' && (
        <div className="taint-warning">
          Filter preview unavailable on this browser — capture still works
        </div>
      )}

      {/* iOS tap-to-start */}
      {needsTap && !tapDone && (
        <button className="tap-overlay" onClick={handleTap}>
          Tap to Start
        </button>
      )}

      {/* Controls — float over the viewfinder at the bottom */}
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

      {/* Preview — fullscreen with bottom action buttons */}
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
