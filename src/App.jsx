import { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { FILTER_PRESETS } from './FilterEngine';
import './App.css';

const ASPECT = 3 / 4; // portrait 3:4

export default function App() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  const [activeFilter, setActiveFilter] = useState(0);
  const [capturedUrl, setCapturedUrl]   = useState(null);
  const [dims, setDims]                 = useState({ width: 640, height: 480 });
  const [camError, setCamError]         = useState(null); // 'denied' | 'notfound' | 'taint'
  const [needsTap, setNeedsTap]         = useState(false);
  const [tapDone, setTapDone]           = useState(false);

  // ── Keep canvas dims in sync with actual video resolution ──────────────────
  const syncDims = useCallback(() => {
    const video = webcamRef.current?.video;
    if (!video) return;
    const w = video.videoWidth  || 640;
    const h = video.videoHeight || 480;
    if (w !== dims.width || h !== dims.height) {
      setDims({ width: w, height: h });
    }
  }, [dims]);

  // ── Animation loop ─────────────────────────────────────────────────────────
  const startLoop = useCallback(() => {
    const tick = () => {
      const video  = webcamRef.current?.video;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        const w = video.videoWidth  || dims.width;
        const h = video.videoHeight || dims.height;

        if (canvas.width !== w || canvas.height !== h) {
          canvas.width  = w;
          canvas.height = h;
          setDims({ width: w, height: h });
        }

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, w, h);

        try {
          const imageData = ctx.getImageData(0, 0, w, h);
          const filtered  = FILTER_PRESETS[activeFilter].apply(imageData);
          ctx.putImageData(filtered, 0, 0);
        } catch (err) {
          if (err.name === 'SecurityError') {
            setCamError('taint');
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [activeFilter, dims]);

  const stopLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ── Start / restart loop when filter changes ────────────────────────────────
  useEffect(() => {
    if (capturedUrl) return; // paused while previewing
    stopLoop();
    startLoop();
    return stopLoop;
  }, [activeFilter, capturedUrl, startLoop, stopLoop]);

  // ── iOS autoplay watchdog — show "Tap to Start" if video stalls ────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      const video = webcamRef.current?.video;
      if (video && video.readyState < 3 && !camError) {
        setNeedsTap(true);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [camError]);

  // ── Camera error handlers ───────────────────────────────────────────────────
  const handleUserMediaError = useCallback((err) => {
    const name = err?.name || '';
    if (
      name === 'NotAllowedError' ||
      name === 'PermissionDeniedError' ||
      err?.message?.includes('Permission')
    ) {
      setCamError('denied');
    } else if (
      name === 'NotFoundError' ||
      name === 'DevicesNotFoundError'
    ) {
      setCamError('notfound');
    } else {
      setCamError('denied');
    }
  }, []);

  // ── Capture ─────────────────────────────────────────────────────────────────
  const handleCapture = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    stopLoop();
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedUrl(dataUrl);
  }, [stopLoop]);

  // ── Retake ──────────────────────────────────────────────────────────────────
  const handleRetake = useCallback(() => {
    setCapturedUrl(null);
    // loop restarts via effect when capturedUrl clears
  }, []);

  // ── Download ────────────────────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    if (!capturedUrl) return;
    const a = document.createElement('a');
    a.href     = capturedUrl;
    a.download = `vintage-photo-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [capturedUrl]);

  // ── iOS tap-to-start ────────────────────────────────────────────────────────
  const handleTap = useCallback(() => {
    const video = webcamRef.current?.video;
    if (video) video.play().catch(() => {});
    setNeedsTap(false);
    setTapDone(true);
  }, []);

  // ── Render error states ─────────────────────────────────────────────────────
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
      {/* Hidden webcam — feeds video into canvas */}
      <Webcam
        ref={webcamRef}
        audio={false}
        playsInline
        muted
        videoConstraints={{ facingMode: 'environment' }}
        style={{ display: 'none' }}
        onUserMediaError={handleUserMediaError}
        onUserMedia={syncDims}
      />

      {/* Viewfinder */}
      <div className="viewfinder-wrap">
        <canvas
          ref={canvasRef}
          className="viewfinder"
          width={dims.width}
          height={dims.height}
        />

        {/* Canvas taint warning — overlay on viewfinder */}
        {camError === 'taint' && (
          <div className="taint-warning">
            Filter preview unavailable on this browser — capture still works
          </div>
        )}

        {/* iOS tap-to-start overlay */}
        {needsTap && !tapDone && (
          <button className="tap-overlay" onClick={handleTap}>
            Tap to Start
          </button>
        )}
      </div>

      {/* Filter selector */}
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

      {/* Capture button */}
      <div className="capture-row">
        <button
          className="capture-btn"
          aria-label="Capture photo"
          onClick={handleCapture}
        />
      </div>

      {/* Preview panel — slides up after capture */}
      {capturedUrl && (
        <div
          className="preview-backdrop"
          onClick={handleRetake}
        >
          <div
            className="preview-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={capturedUrl}
              alt="Captured"
              className="preview-img"
            />
            <div className="preview-actions">
              <button className="btn-retake" onClick={handleRetake}>
                Retake
              </button>
              <button className="btn-save" onClick={handleDownload}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
