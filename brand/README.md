# Rainlit brand assets

The icon is a glowing raindrop about to land, with ripples spreading below it
on a rainy dusk-blue background. The name is written lowercase in the logo:
**rain** in bold, **lit** softer and lighter, like the glow coming off the drop.

## Files

| File | Where it goes |
|---|---|
| `icons/icon-192.png`, `icons/icon-512.png` | PWA manifest icons |
| `icons/icon-maskable-512.png` | PWA manifest icon with `"purpose": "maskable"` (Android crops it into its own shape) |
| `icons/apple-touch-icon.png` | `<link rel="apple-touch-icon">` (180 x 180) |
| `icons/favicon.svg`, `icons/favicon.ico`, `icons/favicon-32.png` | Browser tab icons (drop only, since ripples are too small to see at tab size) |
| `icons/mark.svg` | The small symbol next to the name in the header (replaces the amber dot), about 24 to 30px tall |
| `icons/icon.svg` | Editable source of the app icon |
| `lockup-split-dark.svg` | **Main logo:** symbol + wordmark, for the sign-in screen |
| `wordmark-split-dark.svg`, `wordmark-split-light.svg` | **Main wordmark:** the name on its own, dark and light backgrounds |
| `lockup-solid-720-dark.svg`, `wordmark-solid-720-*.svg` | Backup: one weight (720), for tiny sizes or single-color uses |
| `lockup-solid-800-dark.svg`, `wordmark-solid-800-*.svg` | Backup: one weight (800), the heaviest |
| `reference/` | Other variations we tried, and the side-by-side comparison, kept for reference. Not used in the app. |
| `wordmark-preview.png`, `icon-preview.png` | Previews |

## Setup

1. Copy `icons/` into the app's icons folder, replacing the old icons.
2. In `<head>`:

```html
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/icons/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
```

3. In the manifest (`name` and `short_name` are "Rainlit", capitalized, since
   that's what shows under the icon on a phone):

```json
"name": "Rainlit",
"short_name": "Rainlit",
"icons": [
  { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
  { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
  { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

4. Bump the service worker cache version so installed copies pick up the new icons.

## Wordmark

Always lowercase in the logo, the lockup and the app header. In normal
sentences (page titles, app store text, "Welcome to Rainlit"), capitalize it.

**Main (split):** "rain" in weight 720, color #eceaf3, then "lit" in weight
420, color #a9b4c8, with no space between them. On light backgrounds use
#151a2d and #5b6682.

**Backup (solid):** the whole word in weight 720 (or 800), color #eceaf3. Use it
where two tones don't work: very small sizes, single-color printing, stickers.

Font: Bricolage Grotesque. As live text:

```html
<span class="wordmark"><span class="wm-rain">rain</span><span class="wm-lit">lit</span></span>
```
```css
.wordmark { letter-spacing: -0.008em; }
.wordmark .wm-rain { font-weight: 720; color: #eceaf3; }
.wordmark .wm-lit { font-weight: 420; color: #a9b4c8; }

/* backup, one weight */
.wordmark--solid { font-weight: 720; color: #eceaf3; letter-spacing: -0.008em; }
```

Bricolage Grotesque is a variable font, so weights like 720 and 420 work as
long as the font is loaded with a weight range, for example:
`family=Bricolage+Grotesque:opsz,wght@12..96,200..800` from Google Fonts.

## Colors

| Name | Hex | Use |
|---|---|---|
| Night | #121826 to #0e1320 | Icon background |
| Rain | #b7c4d9 | Rain streaks, at low opacity |
| Glow | #fffbf0 to #f8c865 to #f0a640 | The raindrop, brightest at its center |
| Lamp | #f5b94a | Ripples, glow, and the app's accent |
| Ink | #eceaf3 | Main text and the wordmark |
| Mist | #a9b4c8 | Secondary text |
