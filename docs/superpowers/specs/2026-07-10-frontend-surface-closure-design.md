# Frontend Surface Closure Design

## Scope

This pass continues the frontend upgrade on top of the verified core-loop work. The first priority is mobile decision efficiency on PVP and Collection, followed by keyboard reachability in the reward flow.

## Current Evidence

- `output/frontend-surface-closure-20260710/in-app-audit-baseline/05-pvp-mobile-regular.png`: live PVP spends roughly the first 340px on header and navigation, while the join action is rendered after status, social, invite, loadout, and board content.
- `output/frontend-surface-closure-20260710/in-app-audit-baseline/06-collection-mobile.png`: Collection uses a two-row tab grid and a fully expanded four-filter toolbar, so the first archive content begins near the bottom of a 390x844 viewport.
- `output/frontend-surface-closure-20260710/in-app-audit-baseline/03-challenge-mobile-raw.png`: Challenge reflows correctly and keeps its launch action in the first viewport. It is not part of the first structural patch.

## Design Direction

### Live PVP

- Keep the existing ink-and-gold visual language.
- On mobile, turn the four destinations into one compact navigation row.
- Keep the title, back action, and rank on one compact header grid.
- Render the currently usable command groups before the status dossier.
- Hide command groups whose actions are all disabled or hidden.
- In idle state, suppress empty match metadata and placeholder-only tactical rows; keep mode boundary, match quality, connection, and transport status.
- The join action must be visible and hit-testable without scrolling at 390x844 and 412x915.
- Ranking practice keeps its action above the long opponent dossier.
- The PVP shop collapses to top categories and a single product column; purchase actions stay visible on touch devices.
- Desktop shop categories retain the ink-and-gold surface after becoming native buttons, and purchase buttons remain visible when reached by keyboard.
- PVP tabs use roving focus plus Arrow/Home/End navigation so visual and assistive states stay synchronized.

### Collection

- Keep all eight destinations available in one horizontally scrollable tab row, and automatically center the active destination when a switch moves beyond the visible segment.
- Preserve the search field as the primary tool.
- Move status, element, resonance, and reset controls into an accessible disclosure on mobile.
- Keep the desktop toolbar unchanged through `display: contents` composition.
- The first archive section should enter the initial viewport while all filters remain reachable after opening the disclosure.
- Chapter selection should surface its three drill destinations near the chapter list without forcing a scroll jump or stealing focus from the selected card.
- A cold chapter-drill route must persist its training focus and wait for the deferred challenge module before presenting the destination screen.

### Main Menu And Character Selection

- Constrained desktop and mobile menu surfaces remain vertically scrollable so all three oracle cards and the version footer stay reachable.
- Desktop character cards keep their fixed comparison height but make long body copy scrollable; mobile cards grow with their content and use the existing outer screen scroller.

### Reward Accessibility

- Reward cards remain visually unchanged.
- Each selectable reward card behaves like a button for keyboard and assistive technology users.
- Enter and Space use the same selection path as pointer activation and update `aria-pressed` consistently.
- After selection, every irreversible reward option exposes `aria-disabled` while the chosen card keeps focus.

### Overlay Safety

- Battle-log toasts and the history panel are suppressed while PVP, reward selection, settings, events, or dynamic card/service details own the foreground.
- Foreground dialogs remain above gameplay overlays and keep their close or choice controls hit-testable.

## Acceptance

- No horizontal document overflow at 390x844 or 412x915.
- PVP join action is visible, enabled when the existing runtime enables it, and unobstructed in the initial mobile viewport.
- PVP header plus navigation no longer consumes most of the first viewport.
- Collection tabs occupy one row; every destination is hit-testable after selection and the active tab is automatically scrolled into view.
- Collection secondary filters are closed by default on mobile and remain fully usable when expanded.
- Reward selection can be completed with Tab plus Enter or Space.
- PVP tabs can be traversed with Arrow keys and expose exactly one `tabindex="0"` target.
- Desktop shop purchase buttons have a stable visible height and no browser-default category styling.
- Main-menu and character-selection content produces no non-scrollable clipping warning at desktop, short, 390x844, or 412x915 viewports.
- Desktop layouts preserve the existing hierarchy and interactions.
