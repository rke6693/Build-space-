# Squishymon asset provenance

Everything the game loads ships in this repository. There are no third-party
requests at runtime.

## Type

| File | Family | Source | License |
| --- | --- | --- | --- |
| `assets/fonts/bricolage-grotesque-latin.woff2` | Bricolage Grotesque (variable: opsz, wdth, wght) | Google Fonts, latin subset | SIL OFL 1.1 — `assets/fonts/OFL-BricolageGrotesque.txt` |
| `assets/fonts/plus-jakarta-sans-latin.woff2` | Plus Jakarta Sans (variable: wght) | Google Fonts, latin subset | SIL OFL 1.1 — `assets/fonts/OFL-PlusJakartaSans.txt` |

Both are declared with `font-display: swap` and the latin `unicode-range`, so
text paints immediately and characters outside the subset (the HUD's ● and ○,
for instance) fall through to the system stack.

## Art

Mode: built-in ImageGen, `stylized-concept`. The generated PNGs are the source assets; CSS and the canvas renderer apply runtime crop, color treatment, grain, lighting, reflections, and motion.

## `assets/art/lumenfen-marsh.png`

- 1672 × 941 RGB PNG
- SHA-256: `cbf86f913a661b4fd7c3b68029928f497491a2bd3a27d5e7aac9525c5a6470ba`

```text
Use case: stylized-concept
Asset type: game environment plate / responsive title and exploration background
Primary request: Lumenfen, a bioluminescent marsh-laboratory at blue hour
Scene/backdrop: a mysterious wetland research ruin with rain-slick black stone shelves, shallow mirror-like reflective water, giant translucent leaves, pear-yellow spore lanterns glowing through cyan mist, one distant coral beacon, and ruined brass scientific apparatus half-swallowed by moss
Subject: environment only; a clear central walkable clearing surrounded by layered marsh vegetation, stone shelves, water, and scientific ruins
Style/medium: original painterly 3D storybook game art; tactile clay-like materials; lavish environmental detail; premium cinematic game key art; high-end physically inspired lighting, reflections, translucency, wet-surface sheen, and atmospheric depth
Composition/framing: wide cinematic 16:9 establishing view at player-eye height; central walkable clearing and strong foreground water reflections; darker natural edge framing; balanced depth layers; keep all important landmarks, the brass apparatus, lantern clusters, and coral beacon comfortably inside the middle 70 percent so responsive title-screen crops remain useful; no critical detail at extreme edges
Lighting/mood: luminous blue-hour ambience after rain; pear-yellow practical glow; cyan volumetric mist; distant coral accent; gentle reflected light and soft specular highlights; wondrous, mysterious, inviting rather than frightening
Color palette: deep ink-blue and black stone, cyan mist, moss greens, pear-yellow bioluminescence, restrained coral focal accent, aged brass
Materials/textures: tactile clay-like sculpted forms, wet black stone, shallow rippling water, translucent veined leaves, velvety moss, tarnished engraved brass, suspended spores and soft fog
Text: none
Constraints: no creatures, characters, monsters, animals, silhouettes, or faces; no interface or HUD; no text, logo, watermark, signature, border, or recognizable franchise style; environment must read clearly as playable game space; preserve a quiet open center; visually coherent reflections and lighting
Avoid: photorealism, generic fantasy castle imagery, neon cyberpunk city elements, clutter blocking the central path, overexposed bloom, muddy values, flat lighting, edge-critical focal points
```

## `assets/art/gloob.png`

- 1236 × 1272 RGBA PNG with transparent alpha
- SHA-256: `7872fe2193f018ff9deb23b49f064325acf8d1e2c16acbf6f3fca2c69791c3f9`

```text
Use case: stylized-concept
Asset type: game character cutout
Primary request: Create Gloob, an original small pear-shaped squishy gelatin creature for a polished browser game.
Scene/backdrop: genuinely transparent background with clean alpha; no visible backdrop, no cast floor, no pedestal, no environmental scene.
Subject: Full-body Gloob with a translucent chartreuse jelly body and luminous cyan subsurface glow; two expressive ink-dark oval eyes; tiny moss sprout antenna; soft dimpled cheeks; stubby elastic feet; several tiny firefly-like motes visibly trapped inside the gelatin. Friendly but brave expression.
Style/medium: polished tactile 3D storybook game render; glossy jelly material with believable translucency, soft internal scattering, rich micro-texture, and handcrafted charm; entirely original visual language.
Composition/framing: single character, full body, centered in a neutral hero pose, front three-quarter view, strong instantly readable silhouette, generous even padding on all sides, isolated cutout.
Lighting/mood: gentle cinematic rim light, soft cyan internal radiance, tiny wet specular highlights, warm courageous charm; lighting contained on the character only.
Color palette: vivid chartreuse, cyan glow, ink-dark eyes, natural moss green.
Materials/textures: elastic gelatin surface, subtle dimples and tactile imperfections, glossy wet highlights, translucent depth with suspended luminous motes.
Constraints: preserve a clean game-ready silhouette and true transparent alpha around the entire character; no text, no logo, no watermark, no cast shadow, no floor, no border, no extra characters, no accessories beyond the sprout, no recognizable franchise style.
Avoid: flat vector art, opaque background, checkerboard transparency pattern, white halo, cropped feet or antenna, excessive realism, horror, clutter.
```

## `assets/art/the-press.png`

- 1536 × 1536 RGBA PNG with transparent alpha
- SHA-256: `c7b0c7748d650fa8b1c98ab9eb84512a20403af778a498eba0b3fbcd73c97709`

```text
Use case: stylized-concept
Asset type: browser game boss character cutout
Primary request: Create The Press, an original ancient squat marsh-compression automaton built from weathered oxidized brass and black stone. It has a broad platen-like head, two hydraulic arms ending in padded stamp fists, and one warm coral lens eye. Moss and luminous cyan slime grow through its seams. The character should feel imposing but whimsical rather than horrific.
Scene/backdrop: genuinely transparent background with clean alpha; no floor, platform, shadow plane, scenery, vignette, or backdrop
Subject: one complete full-body character only, centered, fully visible from head to feet, broad readable silhouette
Style/medium: tactile high-end stylized 3D storybook game render; original design; premium production-ready character art
Composition/framing: three-quarter battle stance, generous transparent padding on every side, no cropping, strong readable silhouette at gameplay scale
Lighting/mood: controlled pear-green and cyan rim lighting with a warm coral eye glow; damp marsh atmosphere implied only through surface treatment; imposing, curious, whimsical
Color palette: oxidized brass, near-black stone, moss green, luminous cyan slime, warm coral lens, restrained pear highlights
Materials/textures: tactile weathered metal, verdigris oxidation, wet black stone, soft moss, glossy translucent cyan slime in seams, subtle water beads and believable reflections on damp surfaces
Constraints: actual transparent PNG-style alpha background; clean antialiased edges; preserve generous padding; one character only; no floor or cast shadow; no text; no logo; no watermark; no recognizable franchise style
Avoid: horror gore, frightening facial features, extra characters, weapons, busy silhouette, environment, border, frame, pedestal, fake checkerboard transparency, white or colored background, typography, branded or copyrighted character styling
```
