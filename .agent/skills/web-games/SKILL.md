---
name: web-games
description: Web development standards for "The Defier". Focuses on Native JS, DOM optimization, Asset strategy, and GitHub Pages deployment.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Web Browser Game Development (The Defier Edition)

> Tailored for Native JavaScript, DOM-based Card Games, and Serverless Backends.

---

## 1. Tech Stack Decision (Immutable)

### The "No-Engine" Philosophy
We deliberately avoid heavy engines (Phaser/Unity) to ensure:
1.  **Zero Load Time**: Instant startup on mobile/4G.
2.  **Full Control**: Direct manipulation of Game Loop (`requestAnimationFrame`) and State.
3.  **Learnability**: Understanding the raw mechanics of the browser.

### Architecture Layering
| Layer | Tech | Responsibility |
|-------|------|----------------|
| **UI/Cards** | **DOM + CSS3** | Card hover, UI layout, text rendering. Use CSS `transform` for 60FPS animations. |
| **VFX** | **Canvas 2D** | Particle explosions (`js/core/particles.js`), trails, dynamic backgrounds. |
| **Logic** | **ES6 Modules** | Game rules, `battle.js`, `fateRing.js`. |
| **Backend** | **Bmob SDK** | Serverless DB, Cloud Functions. |

---

## 2. Rendering & Animation Strategy

### CSS3 Hardware Acceleration
For UI elements (Cards, Dialogs):
- **✅ Do**: Animate `transform` (translate/scale/rotate) and `opacity`. These run on the GPU Compositor thread.
- **❌ Don't**: Animate `top`, `left`, `width`, `height`, or `margin`. These trigger CPU Layout recalculations (Reflow), causing lag.

### Canvas Optimization (`particles.js`)
For visual effects:
- **Clear Strategy**: Use `ctx.clearRect` instead of resetting canvas width.
- **Batching**: Group similar particle draws (e.g., strict path batching) if strictly necessary, but for <500 particles, standard drawing is fine.
- **Resolution**: Handle `window.devicePixelRatio` for sharp text/lines on Retina displays.

---

## 3. Performance Principles

### DOM Management
Card games involve frequent creation/destruction of elements (Drawing/Discarding cards).
1.  **DocumentFragment**: When drawing a full hand (5+ cards), build them in a `DocumentFragment` first, then append to DOM once.
2.  **Class Toggling**: Change visual state via `el.classList.add('active')` rather than inline `el.style.border = ...`.
3.  **Reflow Avoidance**: Read layout properties (like `offsetHeight`) *before* writing styles to avoid "Layout Thrashing".

### Memory Management
- **Object Pooling**: Critical for `particles.js` and `DamageNumbers`. Reuse objects instead of `new Particle()` every frame to reduce Garbage Collection (GC) pauses.
- **Event Cleanup**: If a Card element is removed, ensure its `addEventListener` is unbound (or use Event Delegation on the container).

---

## 4. Asset Strategy

### Formats & Compression
| Asset Type | Format | Target Size |
|------------|--------|-------------|
| **Images** | **WebP** | ~80% smaller than PNG. Use for Card Art/Backgrounds. |
| **Audio** | **OGG** / **WebM** | Better quality/size ratio than MP3. |
| **Icons** | **SVG / Unicode** | Use Emoji or inline SVG for UI icons to save requests. |

### Loading Strategy (`js/core/audio.js`)
- **Critical Path**: Preload UI SFX (Click, Hover) and main battle BGM in `game.init()`.
- **Lazy Load**: Load Boss BGM or Map Ambience only when entering that specific Scene.
- **AudioContext**: Initialize purely on the **first user interaction** (Click/Touch) to satisfy Chrome Autoplay Policy.

---

## 5. Deployment (GitHub Pages)

### Constraints
- **Static Hosting**: No server-side logic (PHP/Node). All dynamic logic must be via Bmob SDK.
- **Case Sensitivity**: Linux file systems are case-sensitive. `Image.png` != `image.png`.
- **Caching**: GitHub Pages has aggressive caching.

### Deployment Checklist
1.  **Relative Paths**: Use `./img/card.webp`, NOT `/img/card.webp`.
2.  **Cache Busting**: When updating core logic (`game.js`), append version query: `<script src="js/game.js?v=1.2"></script>`.
3.  **Bmob Whitelist**: Ensure the GitHub Pages domain is whitelisted in Bmob dashboard (if strictly configured).

---

## 6. Mobile Adaptation (PWA Lite)

Even without a full PWA manifest, ensure mobile playability:
- **Touch Targets**: Buttons/Cards should be at least **44x44px**.
- **Viewport**: `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">`.
- **Orientation**: Detect Landscape/Portrait and show a "Please Rotate" overlay if necessary.

---

## 7. Anti-Patterns (The Defier Specific)

| ❌ Don't | ✅ Do |
|----------|-------|
| Use `innerHTML` for single text updates | Use `textContent` (Faster, safer) |
| Create `new Audio()` on every click | Reuse Audio objects or use an Audio Pool |
| Hardcode screen sizes (1920x1080) | Use Flexbox/Grid and relative units (%, vh, vw) |
| Block thread with complex Map Gen | Use `setTimeout` or Web Worker for heavy calc |
| Assume Network is Instant | Show "Saving..." spinner during Bmob sync |

---

> **Remember:** You are building a **Lightweight Web App**, not a AAA Unity Game. Speed and Responsiveness are your best features.