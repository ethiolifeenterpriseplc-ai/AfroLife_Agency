# UI quality and accessibility review — 2026-10-13

## Standards consulted

- [W3C Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/): target AA as the practical baseline, including text contrast, visible keyboard focus, focus not obscured, reflow, and the 24 CSS-pixel minimum target-size criterion (with its exceptions). Aim for larger touch targets in frequently used app controls.
- [U.S. Web Design System accessibility guidance](https://designsystem.digital.gov/documentation/accessibility/): apply perceivable, operable, understandable, and robust design; preserve semantic structure and test with keyboard, zoom, assistive technology, touch, and automated checks.
- [GOV.UK Design System error messages](https://design-system.service.gov.uk/components/error-message/): explain what went wrong and how a user can correct it, with errors associated to the relevant input.
- [Material Design 3 typography](https://m3.material.io/styles/typography/applying-type): use a clear hierarchy, readable label styles, and tabular numerals where changing figures should remain aligned.

These are quality references, not a claim of certification or legal compliance. WCAG conformance needs page-by-page and assistive-technology testing.

## Changes applied

The shared stylesheet now uses darker muted text and green tokens, a consistent 3px keyboard focus ring, minimum 44px height for buttons and text actions, clearer input borders and placeholders, more readable line-height, tabular financial figures, calmer card elevation, and Windows forced-colors support. Muted text, small brand metadata, footnotes, and gold-accent labels now use darker text colors; the brighter gold remains a decorative accent instead of carrying small text by itself. Hover lift is limited to hover-capable devices and disabled with reduced motion. Existing responsive layouts, skip navigation, and reduced-motion support remain in place.

Calculated contrast for the core revised tokens is 5.27:1 for muted text on white, 4.85:1 for muted text on the page background, 9.95:1 for primary green on white, and 5.89:1 for the keyboard focus color on white. These calculations cover only those color pairs; every status, disabled, hover, dialog, and translated screen combination still needs checking.

The shared workspace is now named by its page heading instead of being a live region that could announce a large dashboard on every render. The restored-availability dialog now has a programmatic name, and desktop workspace navigation exposes the current section with `aria-current`. The refined hub icon uses the same deep green and warm gold as the interface. The brand direction is to use these two colors consistently with neutral surfaces, reserve gold for emphasis, and keep financial/compliance screens calm and legible. Keep one recognizable master mark and one coordinated set of distinct mini-app marks; do not use color alone for status.

## Review findings and status

- **Fixed:** workspace-wide live announcement could overwhelm screen-reader users during panel changes; replaced it with a labelled region while retaining the dedicated status and alert messages for operation feedback.
- **Fixed:** one native dialog did not reference its visible heading; it now has an accessible name.
- **Fixed:** desktop section navigation did not communicate which section was current to assistive technology.
- **Improved:** brand mark colors now match the interface design tokens.
- **Still needs manual validation:** check every role and locale for contrast and translated text wrapping, keyboard completion of forms and dialogs, screen-reader announcements, 200% zoom, and horizontal overflow at 320 CSS pixels. Automated source checks cannot confirm these behaviors.

## Next quality checks

Before claiming WCAG conformance, check the public hub, login/signup, every role workspace, dialogs, forms, and data tables at 200% zoom and narrow mobile widths. Verify contrast for all state colors and text combinations; complete keyboard-only and screen-reader flows; check errors and async updates are announced; and run automated axe/pa11y checks on representative routes. Include users with disabilities and users working on low-end phones in usability reviews. Visual-only test automation cannot establish usability or conformance.
