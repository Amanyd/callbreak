# Design System Documentation

## 1. Overview & Creative North Star: "The Kinetic Panel"
This design system rejects the quiet, sterile nature of modern SaaS in favor of **The Kinetic Panel**—a high-energy, editorial approach to gaming UI. It translates the visceral impact of a graphic novel into a premium digital experience. 

The "North Star" is to treat every screen as a curated comic composition. We move beyond the "template" look by utilizing **intentional asymmetry**, **overlapping structural elements**, and **Halftone Dither** for depth. While most systems hide their structure, this system celebrates it with thick, unapologetic strokes and high-contrast color blocks, creating a UI that feels "drawn" rather than "rendered."

## 2. Colors & Textural Identity
The palette is dominated by a high-saturation `primary` (#b50058) pink, supported by "high-frequency" accents of yellow and teal.

### The "No-Line" Rule (Internal)
While this system uses thick black outlines for external component boundaries, we strictly prohibit 1px solid grey borders for internal sectioning. 
- **Internal Separation:** Use background color shifts (e.g., a `surface_container_high` module sitting on a `surface` background).
- **The Outer Stroke:** Only use `on_primary_fixed` (#000000) for structural "Outer Strokes" (3px+). Never use thin, low-contrast lines to separate content.

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked comic panels. 
- **Base Layer:** `surface` (#f9f6f5).
- **Card/Panel Layer:** `surface_container` (#eae7e7).
- **Active/Hero Layer:** `primary_container` (#ff709e).
- **Nesting:** When placing a container inside another, always skip one level of hierarchy (e.g., a `surface_container_highest` element inside a `surface_container_low` section) to ensure the "depth" is intentional and high-contrast.

### Signature Textures: Halftone Dither
To maintain the "no gradients" requirement while providing the "soul" of a premium product, use **Halftone Patterns**. Apply a dot-matrix texture using `primary_dim` over `primary` backgrounds. This creates a perceived value of depth and professional polish without breaking the flat, comic aesthetic.

## 3. Typography: The Editorial Voice
The typography scale is designed to bridge the gap between "Street Poster" and "Luxury Editorial."

- **The Impact Voice (Display/Headline):** We use **Epilogue** (#2f2f2e). It is heavy, geometric, and demanding. All `display-lg` and `headline-lg` text should be set in Uppercase with tight letter-spacing (-0.02em) to mimic hand-lettered comic titles.
- **The Narrative Voice (Title/Body):** **Be Vietnam Pro** provides the clean, legible counterpoint. It ensures that even in a high-contrast environment, game rules and descriptions remain effortlessly readable.
- **The Functional Voice (Labels):** **Plus Jakarta Sans** is reserved for micro-copy and metadata, providing a contemporary, "pro" feel to the game's HUD.

## 4. Elevation & Depth
In this design system, depth is not achieved through light and shadow, but through **Tonal Layering** and **Hard-Offset Overlaps**.

- **The Layering Principle:** Stack `surface-container` tiers to create a physical sense of "Paper on Paper." A card does not just sit on a background; it is "pinned" to it.
- **Ambient Shadows (The "Ink Offset"):** Avoid soft, centered shadows. If a floating effect is needed, use a **Hard Offset Shadow**: a solid block of `on_surface` at 20% opacity, shifted 8px down and 8px right. This mimics the look of misaligned offset printing.
- **Glassmorphism & Depth:** For high-end overlays (like modal backgrounds), use a `surface` color at 80% opacity with a high `backdrop-blur` (20px) and a `primary` halftone overlay. This prevents the "pasted on" look and integrates the modal into the vibrant world.

## 5. Components

### Buttons: The "Impact" Variant
- **Primary:** `primary` background, `on_primary` text, 4px black `on_primary_fixed` stroke.
- **States:** On hover, the button should shift its offset shadow. On press, the shadow disappears (the "click" is physical).
- **Corner Radius:** Use `DEFAULT` (1rem) for a chunky, tactile feel.

### Anime Character Avatars
- **Styling:** Avatars must never be simple circles. Use a `lg` (2rem) roundedness with a 4px `on_primary_fixed` stroke. 
- **Action Frame:** Wrap the avatar in a `secondary_container` (Yellow) "burst" or "halo" to signify active player turns.

### Card Game Table Layout
- **The "Felt":** Use `surface_container_low` as the base table color. 
- **Card Slots:** Defined by `surface_dim` with a dashed `outline` border (the only exception to the "no-line" rule, used here to represent "empty space").
- **Active Cards:** Should use `secondary_fixed` (Yellow) for the border to create a "Neon Pop" against the pink theme.

### Cards & Lists
- **No Dividers:** Prohibit 1px horizontal lines. Separate list items using 16px of vertical white space and a alternating background shift between `surface_container_low` and `surface_container_lowest`.
- **Corner Treatments:** Use `xl` (3rem) roundedness for the main game board panels to create a friendlier, high-end "toy" aesthetic.

## 6. Do's and Don'ts

### Do:
- **Embrace Asymmetry:** Tilt card layouts by 1–2 degrees to create a sense of motion.
- **Use Halftones for Hierarchy:** A halftone pattern on a button makes it feel "Active."
- **Color Blocking:** Use `tertiary_container` (Teal) for success states and `error_container` (Red/Pink) for warnings, ensuring they are always framed with thick black strokes.

### Don't:
- **Avoid "Default" Gradients:** If you need a transition, use a geometric halftone dither.
- **No Thin Strokes:** 1px lines are the enemy. If a line exists, it must be bold (3px+).
- **No Muted Tones:** If a color isn't "vibrant," it should be a functional neutral (`surface` tiers). Never "wash out" the primary pink.

### Accessibility Note:
While the colors are "flashy," ensure all `on_primary` text on `primary` backgrounds maintains a contrast ratio of at least 4.5:1. Use the `on_primary_container` (#4c0021) for text on lighter pink surfaces to ensure maximum legibility for all players.