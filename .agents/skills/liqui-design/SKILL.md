---
name: liqui-design
description: Implement or review Liquid Glass layouts and controls in Chulane using Liqui's React kernel, shadcn component registry, and material handbook.
---

# Liqui Design

This repository-local skill adapts the [official Liqui documentation](https://liqui.design/docs). Use the [component index](https://liqui.design/docs/components) to look up the material and behavior of the specific control being changed.

The [glass handbook](references/glass.mdx) and [theming handbook](references/theming.mdx) are available offline. They are MIT-licensed snapshots from [upstream revision 27fea1b](https://github.com/leefanv/liqui-design/tree/27fea1b66069fcb8dcce133486c6fe5f49744db9/apps/www/content/docs/handbook). When refreshing them, copy both handbook files and the upstream license together and update this revision.

- Chulane already depends on `@liqui-design/glass`. Follow the component's documented composition and inspect its source at `https://liqui.design/r/{component}.json`. The registry distributes editable React source. Adapt it at the existing shared UI boundary so callers retain refs, portals, focus management, keyboard behavior and accessible names.
- Anchor decorative content to the viewport. Let sidebar, tab and editor surfaces sample the same background. Use one glass surface around grouped tools, with flat child controls. Use solid fills for accent and destructive actions, checked states and controls whose color communicates a value. [Toolbar](https://liqui.design/docs/components/toolbar) · [Button](https://liqui.design/docs/components/button)
- Use the kernel for small interactive lenses. Broad panes can use translucent theme tokens and floating overlays can use frost. Avoid a separate displacement filter on every row or icon. Chromium supports live refraction; the kernel can use a supplied backdrop for copy refraction, or frost when a copy is unavailable. [Glass handbook](https://liqui.design/docs/handbook/glass)
- Map colors to Chulane's current palette and gate decorative surfaces on the existing glass appearance state. Check Solid, Still glass, reduced motion and opaque system preferences. [Theme handbook](https://liqui.design/docs/handbook/theming)
- Verify the migrated control in the running app, including keyboard access, portal placement and the layout or gesture it participates in.
