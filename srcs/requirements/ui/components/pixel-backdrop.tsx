'use client'

// The landing's pixel ocean as the APP backdrop — every page floats on the
// wave field. Pointer-transparent, sits behind everything; the main content
// column and the chat widget keep their own opaque/glass surfaces (the
// readable islands), the rails and page edges show the ocean through.
import { PixelWaves } from '@/components/ui/pixel/animations/pixel-waves'

export function PixelBackdrop() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
      <PixelWaves
        className="h-full w-full"
        colors={['#0F3460', '#2A9D8F', '#26A69A', '#FFF3E0']}
        pixelSize={12}
        gap={2}
        speed={0.6}
        opacity={0.35}
      />
      {/* Dim toward the page background so text on translucent rails stays
          readable — the same overlay trick the landing uses. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, var(--wave-bg) 0%, transparent 30%, transparent 70%, var(--wave-bg) 100%)',
          opacity: 0.55,
        }}
      />
    </div>
  )
}
