# Project instructions

## Theme-aware scrollbars

Every scrollable view, panel, menu and dialog must style its scrollbar using the current theme variables (for example, `var(--muted)`), including overlays rendered through portals. Follow the existing thin scrollbar style with a transparent track and rounded thumb, and cover both `scrollbar-width` / `scrollbar-color` and `::-webkit-scrollbar` selectors, including hover and corner states. Check light and dark themes when adding or changing a scrollable container.
