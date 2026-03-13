// ─── Utilities ───────────────────────────────────────────────────────────────

function clamp(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function applyGrain(data, intensity) {
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() * 2 - 1) * intensity;
    data[i]     = clamp(data[i]     + noise);
    data[i + 1] = clamp(data[i + 1] + noise);
    data[i + 2] = clamp(data[i + 2] + noise);
  }
}

function applyVignette(data, width, height, strength) {
  const cx = width / 2;
  const cy = height / 2;
  const rx = cx * cx;
  const ry = cy * cy;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      // Elliptical distance 0 (center) → 1+ (corners)
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Smooth falloff, clamped
      const factor = Math.max(0, 1 - dist * strength);
      const idx = (y * width + x) * 4;
      data[idx]     = clamp(data[idx]     * factor);
      data[idx + 1] = clamp(data[idx + 1] * factor);
      data[idx + 2] = clamp(data[idx + 2] * factor);
    }
  }
}

// ─── Filter Presets ───────────────────────────────────────────────────────────

export const FILTER_PRESETS = [
  {
    id: 'kodak',
    label: 'Kodak',
    apply(imageData) {
      const { data, width, height } = imageData;

      for (let i = 0; i < data.length; i += 4) {
        // Warm amber tone
        let r = clamp(data[i]     + 15);
        let g = clamp(data[i + 1] + 5);
        let b = clamp(data[i + 2] - 10);

        // Sepia-like warmth
        r = clamp(r * 1.1);
        g = clamp(g * 0.95);
        b = clamp(b * 0.85);

        data[i]     = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }

      applyGrain(data, 15);
      applyVignette(data, width, height, 1.1);

      return imageData;
    },
  },

  {
    id: 'polaroid',
    label: 'Polaroid',
    apply(imageData) {
      const { data, width, height } = imageData;

      for (let i = 0; i < data.length; i += 4) {
        // Overexposed, faded
        data[i]     = clamp(data[i]     * 0.85 + 40);
        data[i + 1] = clamp(data[i + 1] * 0.85 + 40);
        data[i + 2] = clamp(data[i + 2] * 0.85 + 40 + 10); // blue lift
      }

      // Heavy vignette (stronger falloff)
      applyVignette(data, width, height, 1.6);

      return imageData;
    },
  },

  {
    id: '70s',
    label: '70s',
    apply(imageData) {
      const { data, width, height } = imageData;

      for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        // Orange/yellow cast
        r = clamp(r * 1.2);
        g = clamp(g * 1.05);
        b = clamp(b * 0.75);

        // Crush shadows: desaturate if luminance is low
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum < 60) {
          r = clamp(r * 0.85);
          g = clamp(g * 0.85);
          b = clamp(b * 0.85);
        }

        data[i]     = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }

      applyGrain(data, 25);
      applyVignette(data, width, height, 1.3);

      return imageData;
    },
  },

  {
    id: 'faded',
    label: 'Faded',
    apply(imageData) {
      const { data, width, height } = imageData;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Grayscale value
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;

        // Partial desaturation: 60% original, 40% grayscale
        let dr = r * 0.6 + gray * 0.4;
        let dg = g * 0.6 + gray * 0.4;
        let db = b * 0.6 + gray * 0.4;

        // Lift blacks
        dr = clamp(dr * 0.85 + 30);
        dg = clamp(dg * 0.85 + 30);
        db = clamp(db * 0.85 + 30);

        data[i]     = dr;
        data[i + 1] = dg;
        data[i + 2] = db;
      }

      applyGrain(data, 8);
      applyVignette(data, width, height, 0.7);

      return imageData;
    },
  },
];
