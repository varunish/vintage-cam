// ─── Tone Curve (Monotone Cubic / Fritsch-Carlson) ───────────────────────────
// Builds a 256-entry Uint8ClampedArray LUT from sparse control points.
// Points: [[inputValue, outputValue], ...] — both 0-255.
// Uses monotone cubic Hermite spline so curves never overshoot.
function buildCurve(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0]);

  // Ensure endpoints exist
  if (pts[0][0] > 0)   pts.unshift([0,   pts[0][1]]);
  if (pts[pts.length - 1][0] < 255) pts.push([255, pts[pts.length - 1][1]]);

  const n  = pts.length;
  const xs = pts.map(p => p[0]);
  const ys = pts.map(p => p[1]);

  // Finite difference slopes
  const delta = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    delta[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  }

  // Tangents (Catmull-Rom seed, then Fritsch-Carlson monotonicity fix)
  const m = new Array(n);
  m[0]     = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (delta[i - 1] + delta[i]) / 2;

  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i]     / delta[i];
    const b = m[i + 1] / delta[i];
    const h = a * a + b * b;
    if (h > 9) {
      const tau = 3 / Math.sqrt(h);
      m[i]     = tau * a * delta[i];
      m[i + 1] = tau * b * delta[i];
    }
  }

  // Sample the spline at every integer 0-255
  const lut = new Uint8ClampedArray(256);
  let seg = 0;
  for (let xi = 0; xi < 256; xi++) {
    while (seg < n - 2 && xi >= xs[seg + 1]) seg++;
    const x0 = xs[seg], x1 = xs[seg + 1];
    const y0 = ys[seg], y1 = ys[seg + 1];
    const m0 = m[seg],  m1 = m[seg + 1];
    const hh = x1 - x0;
    const t  = (xi - x0) / hh;
    const t2 = t * t, t3 = t2 * t;
    const val = (2*t3 - 3*t2 + 1)*y0 + (t3 - 2*t2 + t)*hh*m0
              + (-2*t3 + 3*t2)*y1   + (t3 - t2)*hh*m1;
    lut[xi] = Math.max(0, Math.min(255, Math.round(val)));
  }
  return lut;
}

// ─── Grain ───────────────────────────────────────────────────────────────────
// Triangular distribution (sum of two uniforms) — looks more like real film grain
function applyGrain(data, intensity) {
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() + Math.random() - 1) * intensity;
    data[i]     = Math.max(0, Math.min(255, data[i]     + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
  }
}

// ─── Vignette ────────────────────────────────────────────────────────────────
// strength 0-1: 1 = corners darkened ~70%, 0 = no effect
function applyVignette(data, width, height, strength) {
  for (let y = 0; y < height; y++) {
    const dy = (y / height - 0.5) * 2; // -1 → 1
    for (let x = 0; x < width; x++) {
      const dx   = (x / width - 0.5) * 2;
      const dist = Math.sqrt(dx * dx + dy * dy) / Math.SQRT2; // 0 center → 1 corner
      // Smooth cubic falloff
      const t   = Math.min(1, dist);
      const vig = 1 - strength * t * t * (3 - 2 * t);
      const idx = (y * width + x) * 4;
      data[idx]     = Math.max(0, Math.min(255, data[idx]     * vig));
      data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] * vig));
      data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] * vig));
    }
  }
}

// ─── Desaturation helper ──────────────────────────────────────────────────────
function desaturate(data, amount) { // amount: 0 = none, 1 = full grayscale
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i]     = Math.round(data[i]     + (gray - data[i])     * amount);
    data[i + 1] = Math.round(data[i + 1] + (gray - data[i + 1]) * amount);
    data[i + 2] = Math.round(data[i + 2] + (gray - data[i + 2]) * amount);
  }
}

// ─── Filter Presets ───────────────────────────────────────────────────────────

// Pre-build LUTs at module load time (one-time cost)
const CURVES = {
  // Kodak Ultramax: warm shadows/mids, slightly pulled blues
  kodak: {
    r: buildCurve([[0,0],   [64,72],  [128,148], [192,210], [255,255]]),
    g: buildCurve([[0,0],   [64,66],  [128,134], [192,198], [255,248]]),
    b: buildCurve([[0,0],   [64,54],  [128,102], [192,162], [255,215]]),
  },
  // Polaroid 600: high contrast, blue shadow lift, blown highlights
  polaroid: {
    r: buildCurve([[0,8],   [64,78],  [128,168], [192,228], [255,255]]),
    g: buildCurve([[0,5],   [64,68],  [128,162], [192,220], [255,248]]),
    b: buildCurve([[0,38],  [64,98],  [128,160], [192,210], [255,242]]),
  },
  // 70s Kodachrome: orange cast, crushed shadows, pulled blues
  seventies: {
    r: buildCurve([[0,18],  [80,128], [170,205], [255,255]]),
    g: buildCurve([[0,8],   [80,98],  [170,162], [255,232]]),
    b: buildCurve([[0,0],   [80,45],  [170,92],  [255,172]]),
  },
  // Faded: lifted blacks, compressed whites, near-neutral channels
  faded: {
    r: buildCurve([[0,42],  [100,118],[180,178], [255,222]]),
    g: buildCurve([[0,40],  [100,116],[180,178], [255,218]]),
    b: buildCurve([[0,44],  [100,120],[180,178], [255,216]]),
  },
};

export const FILTER_PRESETS = [
  {
    id: 'kodak',
    label: 'Kodak',
    apply(imageData, width, height) {
      const { data } = imageData;
      const { r, g, b } = CURVES.kodak;
      for (let i = 0; i < data.length; i += 4) {
        data[i]     = r[data[i]];
        data[i + 1] = g[data[i + 1]];
        data[i + 2] = b[data[i + 2]];
      }
      applyGrain(data, 12);
      applyVignette(data, width, height, 0.55);
      return imageData;
    },
  },

  {
    id: 'polaroid',
    label: 'Polaroid',
    apply(imageData, width, height) {
      const { data } = imageData;
      const { r, g, b } = CURVES.polaroid;
      for (let i = 0; i < data.length; i += 4) {
        data[i]     = r[data[i]];
        data[i + 1] = g[data[i + 1]];
        data[i + 2] = b[data[i + 2]];
      }
      applyVignette(data, width, height, 0.95);
      return imageData;
    },
  },

  {
    id: '70s',
    label: '70s',
    apply(imageData, width, height) {
      const { data } = imageData;
      const { r, g, b } = CURVES.seventies;
      for (let i = 0; i < data.length; i += 4) {
        data[i]     = r[data[i]];
        data[i + 1] = g[data[i + 1]];
        data[i + 2] = b[data[i + 2]];
      }
      applyGrain(data, 22);
      applyVignette(data, width, height, 0.80);
      return imageData;
    },
  },

  {
    id: 'faded',
    label: 'Faded',
    apply(imageData, width, height) {
      const { data } = imageData;
      desaturate(data, 0.35);
      const { r, g, b } = CURVES.faded;
      for (let i = 0; i < data.length; i += 4) {
        data[i]     = r[data[i]];
        data[i + 1] = g[data[i + 1]];
        data[i + 2] = b[data[i + 2]];
      }
      applyGrain(data, 7);
      applyVignette(data, width, height, 0.38);
      return imageData;
    },
  },
];
