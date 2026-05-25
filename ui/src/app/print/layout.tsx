'use client'

/**
 * Print layout — no sidebar/header. Forces print-sheet visible on screen,
 * embeds Google Fonts for cross-OS rendering parity, and provides a hook
 * (window.__printReady) that Puppeteer waits on.
 */
import { Sarabun, Inter, Bebas_Neue, Dancing_Script } from 'next/font/google'

const sarabun = Sarabun({ subsets: ['thai', 'latin'], weight: ['400', '700'], variable: '--font-sarabun', display: 'swap' })
const inter = Inter({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-inter', display: 'swap' })
const bebas = Bebas_Neue({ subsets: ['latin'], weight: ['400'], variable: '--font-bebas', display: 'swap' })
const dancing = Dancing_Script({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-dancing', display: 'swap' })

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${sarabun.variable} ${inter.variable} ${bebas.variable} ${dancing.variable}`}
      style={{ background: '#fff' }}
    >
      <style>{`
        /* Force print sheet visible on screen for this route only */
        .print-sheet { display: block !important; }
        body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
        /* Map legacy font names used in print templates to embedded Google Fonts.
           This ensures Mac/Win/Linux render identically. */
        [style*="Cordia New"], [style*="'Cordia New'"] {
          font-family: var(--font-sarabun), 'Cordia New', 'Sarabun', sans-serif !important;
        }
        [style*="Century Gothic"] {
          font-family: var(--font-inter), 'Century Gothic', 'Inter', sans-serif !important;
        }
        [style*="Broadway"] {
          font-family: var(--font-bebas), 'Broadway', 'Bebas Neue', sans-serif !important;
          letter-spacing: 0.02em;
        }
        [style*="Brush Script MT"], [style*="Brush Script Std"] {
          font-family: var(--font-dancing), 'Brush Script MT', 'Dancing Script', cursive !important;
        }
        /* Tahoma fallback chain — use Sarabun (Thai-capable) when system Tahoma differs */
        [style*="Tahoma"] {
          font-family: var(--font-sarabun), 'Tahoma', 'Sarabun', sans-serif !important;
        }
      `}</style>
      {children}
    </div>
  )
}
