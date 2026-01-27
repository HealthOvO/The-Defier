---
name: deploy-ops
description: Deployment to GitHub Pages, asset optimization, and performance tuning.
---

# Deploy Ops

## 🚀 Deployment Checklist
1. **Relative Paths**: Ensure `index.html` uses `./js/game.js` etc., not `/js/game.js`.
2. **Clean Commit**: `git commit -m "feat: description"` -> `git push origin main`.
3. **Cache Busting**: If game logic updates but users don't see it, suggest appending `?v=1.1` to script tags.

## ⚡ Performance Tuning
- **Asset Loading**:
  - Check `js/core/audio.js`: Ensure heavy SFX are preloaded.
  - Suggest WebP format for `img/` assets.
- **Memory Management**:
  - In `js/core/particles.js`, ensure DOM elements are removed after animation ends.
  - Watch for listener leaks in `game.js` (e.g., re-binding `onclick` without clearing).

## 🐛 Debugging
- If Bmob fails: Check `authService.js` initialization.
- If images 404: Check case-sensitivity (GitHub Pages is Linux-based, case-sensitive).