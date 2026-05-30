'use client'

/**
 * Print layout — no sidebar/header. Forces print-sheet visible on screen,
 * and provides a hook (window.__printReady) that Puppeteer waits on.
 *
 * This layout is prepared for locally embedded font files under /public/fonts.
 * If the files are present, Puppeteer will render the original look more closely
 * without depending on OS-installed fonts.
 */

const printFontCss = `
  @font-face {
    font-family: 'Cordia New';
    src:
      url('/fonts/CordiaNew.woff2') format('woff2'),
      url('/fonts/CordiaNew.ttf') format('truetype'),
      url('/fonts/cordia.ttc') format('truetype');
    font-style: normal;
    font-weight: 400;
    font-display: swap;
  }
  @font-face {
    font-family: 'Cordia New';
    src:
      url('/fonts/CordiaNew-Bold.woff2') format('woff2'),
      url('/fonts/CordiaNew-Bold.ttf') format('truetype'),
      url('/fonts/cordia.ttc') format('truetype');
    font-style: normal;
    font-weight: 700;
    font-display: swap;
  }
  @font-face {
    font-family: 'Century Gothic';
    src:
      url('/fonts/CenturyGothic.woff2') format('woff2'),
      url('/fonts/CenturyGothic.ttf') format('truetype'),
      url('/fonts/GOTHIC.TTF') format('truetype');
    font-style: normal;
    font-weight: 400;
    font-display: swap;
  }
  @font-face {
    font-family: 'Century Gothic';
    src:
      url('/fonts/CenturyGothic-Bold.woff2') format('woff2'),
      url('/fonts/CenturyGothic-Bold.ttf') format('truetype'),
      url('/fonts/GOTHICB.TTF') format('truetype');
    font-style: normal;
    font-weight: 700;
    font-display: swap;
  }
  @font-face {
    font-family: 'Broadway';
    src:
      url('/fonts/Broadway.woff2') format('woff2'),
      url('/fonts/Broadway.ttf') format('truetype'),
      url('/fonts/BROADW.TTF') format('truetype');
    font-style: normal;
    font-weight: 400;
    font-display: swap;
  }
  @font-face {
    font-family: 'Brush Script MT';
    src:
      url('/fonts/BrushScriptMT.woff2') format('woff2'),
      url('/fonts/BrushScriptMT.ttf') format('truetype'),
      url('/fonts/BRUSHSCI.TTF') format('truetype');
    font-style: normal;
    font-weight: 400;
    font-display: swap;
  }

  :root {
    --font-body: 'Cordia New', 'Sarabun', 'Noto Sans Thai', sans-serif;
    --font-thai: 'Cordia New';
    --font-en: 'Century Gothic', 'Inter', 'Cordia New', 'Sarabun', 'Noto Sans Thai', sans-serif;
    --font-display: 'Broadway', 'Bebas Neue', sans-serif;
    --font-signature: 'Brush Script MT', 'Dancing Script', cursive;
  }
`

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff' }}>
      <style>{`
        ${printFontCss}

        /* Force print sheet visible on screen for this route only */
        .print-sheet { display: block !important; }
        body { background: #fff !important; margin: 0 !important; padding: 0 !important; }

        @media screen {
          html,
          body {
            width: 210mm !important;
            min-height: 297mm !important;
            background: #fff !important;
          }

          body {
            padding: 6mm 6mm 10mm !important;
            box-sizing: border-box !important;
          }

          .print-sheet.quotation-print {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .print-sheet.quotation-print .quotation-page {
            box-sizing: border-box !important;
            width: 100% !important;
            height: 281mm !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
          }

          .print-sheet.quotation-print .quotation-page + .quotation-page {
            margin-top: 20mm !important;
            border-top: 0 !important;
            padding-top: 0 !important;
          }
        }

        /* Map legacy font names used in print templates to local embedded fonts. */
        [style*="Cordia New"], [style*="'Cordia New'"] {
          font-family: var(--font-thai) !important;
        }
        [style*="Century Gothic"],
        [style*="Arial"],
        [style*="Tahoma"] {
          font-family: var(--font-body) !important;
        }
        [style*="Broadway"] {
          font-family: var(--font-display) !important;
          letter-spacing: 0.02em;
        }
        [style*="Brush Script MT"], [style*="Brush Script Std"] {
          font-family: var(--font-signature) !important;
        }
        /* Make Thai text render consistently in headless Chromium on Linux/Windows */
        .print-sheet, .print-sheet * {
          -webkit-font-smoothing: antialiased;
          text-rendering: geometricPrecision;
        }
      `}</style>
      {children}
    </div>
  )
}
