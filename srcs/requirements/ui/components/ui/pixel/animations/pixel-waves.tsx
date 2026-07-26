'use client'

import { useEffect, useRef } from 'react'

type PixelWavesProps = {
  /** Extra classes for the wrapper. The canvas fills the wrapper. */
  className?: string
  /** Ordered low to high. Waves crest into the last color. */
  colors?: string[]
  /** Edge length of each square pixel in CSS px. */
  pixelSize?: number
  /** Gap between pixels in CSS px for the "pixel grid" look. */
  gap?: number
  /** Animation speed multiplier. */
  speed?: number
  /** Overall opacity of the field. */
  opacity?: number
}

type RGB = { r: number; g: number; b: number }

function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  const n = Number.parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  }
}

/** Sample an evenly-spaced color ramp at position t in [0,1]. */
function sampleRamp(stops: RGB[], t: number): RGB {
  const clamped = Math.max(0, Math.min(1, t))
  if (stops.length === 1) return stops[0]
  const scaled = clamped * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(scaled))
  return mix(stops[i], stops[i + 1], scaled - i)
}

/**
 * PixelWaves renders a field of animated square pixels whose brightness and
 * color follow layered sine waves, producing a retro "pixel ocean" swell.
 * Purely decorative and respects prefers-reduced-motion.
 */
export function PixelWaves({
  className,
  colors = ['#0F3460', '#2A9D8F', '#26A69A', '#FFF3E0'],
  pixelSize = 14,
  gap = 2,
  speed = 1,
  opacity = 1,
}: PixelWavesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const ramp = colors.map(hexToRgb)
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    let width = 0
    let height = 0
    let cols = 0
    let rows = 0
    let dpr = 1

    const cell = pixelSize + gap

    const parent = canvas.parentElement

    function resize() {
      if (!parent || !canvas) return
      const rect = parent.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      cols = Math.ceil(width / cell) + 1
      rows = Math.ceil(height / cell) + 1
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function draw(time: number) {
      if (!ctx) return
      const t = (time / 1000) * speed
      ctx.clearRect(0, 0, width, height)

      for (let gx = 0; gx < cols; gx++) {
        for (let gy = 0; gy < rows; gy++) {
          const x = gx * cell
          const y = gy * cell

          // Normalized coords
          const nx = gx / cols
          const ny = gy / rows

          // Layered swell: several sines of differing freq/phase.
          const wave =
            Math.sin(nx * 6.2 + t * 0.9) * 0.5 +
            Math.sin(nx * 12.4 - t * 0.6 + ny * 3.1) * 0.3 +
            Math.sin((nx + ny) * 8.0 + t * 1.3) * 0.2

          // Height of the water surface at this column, 0 (top) .. 1 (bottom)
          const surface = 0.5 + wave * 0.22

          // Below the surface = water; above = sky/foam falloff.
          const depth = ny - surface

          // Color position: deeper water = first colors, crest/foam = last.
          const crest = 1 - Math.min(1, Math.max(0, depth + 0.5))
          const color = sampleRamp(ramp, crest)

          // Alpha: fade out well above the surface so it reads as a wave field.
          let alpha = 1
          if (depth < -0.12) {
            alpha = Math.max(0, 1 + (depth + 0.12) * 4)
          }
          // Subtle shimmer on the crest line.
          const shimmer = 0.85 + 0.15 * Math.sin(nx * 30 + t * 3)
          alpha *= shimmer * opacity

          if (alpha <= 0.02) continue

          ctx.globalAlpha = alpha
          ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`
          ctx.fillRect(x, y, pixelSize, pixelSize)
        }
      }
      ctx.globalAlpha = 1
    }

    let raf = 0
    function loop(time: number) {
      draw(time)
      raf = requestAnimationFrame(loop)
    }

    resize()
    const onResize = () => resize()
    window.addEventListener('resize', onResize)

    if (reduce) {
      draw(0)
    } else {
      raf = requestAnimationFrame(loop)
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [colors, pixelSize, gap, speed, opacity])

  return (
    <div className={className} aria-hidden="true">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}

export default PixelWaves
