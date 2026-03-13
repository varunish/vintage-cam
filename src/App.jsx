import { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { FILTER_PRESETS } from './FilterEngine';
import './App.css';

// CSS filter strings for live preview — close visual approximation of each preset.
// The captured photo uses the full pixel-accurate LUT filters from FilterEngine.
const CSS_PREVIEWS = [
  'sepia(0.28) saturate(1.35) contrast(1.06) brightness(1.02)',           // Kodak
  'contrast(1.45) brightness(1.18) saturate(0.8) sepia(0.12)',            // Polaroid
  'sepia(0.48) saturate(1.9) hue-rotate(-8deg) contrast(1.12)',           // 70s
  'saturate(0.55) brightness(1.12) contrast(0.88) sepia(0.06)',           // Faded
];

export default function App() {
  const webcamRef = useRef(null);

  const [activeFilter, setActiveFilter] = useState(0);
  const [capturedUrl, setCapturedUrl]   = useState(null);
  const [camError, setCamError]         = useState(null);
  const [camReady, setCamReady]         = useState(false);
  const [needsTap, setNeedsTap]         = useState(false);

  // iOS autoplay watchdog
  useEffect(() => {
    if (!camReady) return;
    const timer = setTimeout(() => {
      const video = webcamRef.current?.video;
      if (video && video.readyState < 3 && !camError) setNeedsTap(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [camReady, camError]);

  // ── Camera callbacks ──────────────────────────────────────────────────────
  const handleUserMedia = useCallback(() => setCamReady(true), []);

  const handleUserMediaError = useCallback((err) => {
    const name = err?.name || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      setCamError('denied');
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      setCamError('notfound');
    } else {
      setCamError('denied');
    }
  }, []);

  // ── Capture ───────────────────────────────────────────────────────────────
  // Draw the current video frame to an offscreen canvas at native video
  // resolution, apply the real LUT pixel filter, then save as JPEG.
  const handleCapture = useCallback(() => {
    const video = webcamRef.current?.video;
    if (!video || video.readyState < 2) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    const canvas = document.createElement('canvas');
    canvas.width  = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    ctx.drawImage(video, 0, 0, vw, vh);

    const imageData = ctx.getImageData(0, 0, vw, vh);
    FILTER_PRESETS[activeFilter].apply(imageData, vw, vh);
    ctx.putImageData(imageData, 0, 0);

    setCapturedUrl(canvas.toDataURL('image/jpeg', 0.92));
  }, [activeFilter]);

  const handleRetake = useCallback(() => setCapturedUrl(null), []);

  const handleDownload = useCallback(() => {
    if (!capturedUrl) return;
    const a    = document.createElement('a');
    a.href     = capturedUrl;
    a.download = `vintage-photo-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [capturedUrl]);

  const handleTap = useCallback(() => {
    webcamRef.current?.video?.play().catch(() => {});
    setNeedsTap(false);
  }, []);

  // ── Error screens ─────────────────────────────────────────────────────────
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
        All sizing via inline style — highest CSS specificity, guaranteed to
        override any default width/height that react-webcam puts on the <video>.
        objectFit:'cover' is the key: the browser crops the video stream to fill
        the container natively, with zero JS math and zero stretching.
      */}
      <Webcam
        ref={webcamRef}
        audio={false}
        playsInline
        muted
        videoConstraints={{ facingMode: 'environment' }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: CSS_PREVIEWS[activeFilter],
          transition: 'filter 0.2s ease',
        }}
        onUserMedia={handleUserMedia}
        onUserMediaError={handleUserMediaError}
      />

      {/* iOS tap-to-start */}
      {needsTap && (
        <button className="tap-overlay" onClick={handleTap}>
          Tap to Start
        </button>
      )}

      {/* Bottom controls */}
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
            disabled={!camReady}
          />
        </div>
      </div>

      {/* Full-screen preview */}
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
