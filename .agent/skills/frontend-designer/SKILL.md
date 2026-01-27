---
name: frontend-design
description: Design and implement distinctive, production-grade UI components specifically for "The Defier" (Xianxia Card Roguelike). Enforces "Ink & Gold" aesthetics, fluid CSS animations, and strict adherence to the project's visual identity.
license: Private - The Defier Project
---

This skill acts as the **Lead UI Designer & Frontend Engineer** for "The Defier" (逆命者). It guides the creation of immersive, high-quality game interfaces that blend traditional Oriental aesthetics (Ink Wash/Xianxia) with modern Dark UI patterns.

## Context & Aesthetic Direction

All generated UI must adhere to the **"Ethereal Daoist Void" (虚空道韵)** design language:

- **Core Metaphor**: The interface is not a "webpage" but a spiritual projection in the void. Elements should feel like floating artifacts, talismans, or condensed spiritual energy.
- **Tone**: Mystical, Dark, Elegant, Dangerous. Avoid "cute" or "corporate" styles.
- **Palette**: Deep Void (`#0a0e14`) backgrounds, Muted Ink (`#1c2541`) containers, and Luminous Gold (`#cfaa70`) accents.
- **Texture**: Use noise, grain, and smoke/fog overlays to avoid flat digital colors.

## Implementation Instructions

When the user asks for a UI component, page, or refactor, follow these steps:

1.  **Analyze the Requirement**: Determine the component's function (e.g., "Combat HUD", "Inventory", "Event Modal").
2.  **Consult Existing Styles**: ALWAYS prioritize using CSS variables defined in `css/style.css` (e.g., `var(--primary)`, `var(--accent-gold)`, `var(--font-display)`).
3.  **Design for Impact**: Apply the "Design Thinking" rules below.
4.  **Generate Code**: Produce raw HTML and CSS (no React/Vue unless requested) that integrates seamlessly with `index.html`.

## Design Thinking & Guidelines

### 1. Typography & Layout
- **Headings**: ALWAYS use the display font: `font-family: var(--font-display);` ('Ma Shan Zheng'). Text should feel like calligraphy—dynamic and spaced.
- **Body**: Use `var(--font-body)` ('Noto Sans SC') for readability.
- **Composition**: Embrace asymmetry and negative space. Break the grid. Use vertical writing modes (`writing-mode: vertical-rl`) for decorative text to emphasize the Oriental theme.

### 2. Visual Style (The "Defier" Look)
- **Containers**: DO NOT use solid white boxes. Use:
    - **Glassmorphism**: `backdrop-filter: blur(10px); background: rgba(10, 14, 20, 0.65);`
    - **Borders**: Thin, glowing borders (`1px solid rgba(255, 215, 0, 0.2)`).
    - **Shapes**: Cut corners (octagon-like) or talisman shapes rather than standard rounded rectangles.
- **Effects**: Add `box-shadow` glows (`0 0 20px var(--accent-gold-bright)`) for active states.

### 3. Motion & Micro-interactions
- **Breathing**: Elements should rarely be static. Use subtle floating animations (`@keyframes float`).
- **Energy**: Hover states should trigger "spiritual energy" flows (glow expansion, text color shifts).
- **Transitions**: Use `transition: all var(--transition-normal);`.

## Constraints (DO NOT DO)

- **NO Generic Aesthetics**: Never use standard Bootstrap/Tailwind-looking buttons or cards.
- **NO Light Mode**: The game is strictly dark-themed. Never use white backgrounds.
- **NO System Fonts**: Never fall back to Arial/Helvetica unless `var(--font-body)` fails.
- **NO "Flat" Design**: Ensure depth is created through layers, shadows, and z-index.

## Example Usage

**User**: "Help me design a 'Victory Reward' modal."

**Skill Action**:
1.  Creates a modal container using `var(--bg-ink)` with a noise texture overlay.
2.  Uses `var(--font-display)` for the "Victory" title, styled with a gold gradient text-fill.
3.  Lists rewards as "floating artifacts" with a hover glow effect.
4.  Adds a CSS animation for the modal entrance (e.g., `fade-in-up` with a spiritual trail).