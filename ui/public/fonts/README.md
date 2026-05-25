# Embedded Fonts for Print

Place the actual font files used by the print templates in this folder.

Required names:
- `CordiaNew.woff2` and/or `CordiaNew.ttf`
- `CordiaNew-Bold.woff2` and/or `CordiaNew-Bold.ttf`
- `CenturyGothic.woff2` and/or `CenturyGothic.ttf`
- `CenturyGothic-Bold.woff2` and/or `CenturyGothic-Bold.ttf`
- `Broadway.woff2` and/or `Broadway.ttf`
- `BrushScriptMT.woff2` and/or `BrushScriptMT.ttf`

Optional alternates:
- `BrushScriptStd.woff2`
- `BrushScriptStd.ttf`

The print layout already points to these paths through `@font-face` in `src/app/print/layout.tsx`.
