# AI SUS site design rules

This site should feel like a readable engineering instrument. Its visual focus is the map and the code behind it.

## Visual language

- Use a pale green neutral, forest green, and a small amount of lime. In product previews, green means a matching citation and amber means cited code changed.
- Use the supplied AI SUS wordmark in the header. The secondary diagram mark has no enclosing border and uses the same green as the active Get Started link. Browser tabs use the green PNG favicon.
- Set the homepage headline beside its explanation. Let the interactive map demonstrate the product immediately below. Use sentence-case headings and reserve monospace type for code and interface metadata.
- Home, Features, Pricing, and Data & privacy share the `--content-max` and `--content-gutter` values in `assets/refinement.css`. Their main content stays centered while section backgrounds can span the viewport.
- Use the locally bundled Space Grotesk Semibold for large titles on Home, Features, and Pricing to echo the geometric wordmark. Keep body text, controls, interface previews, Privacy, and the Get Started guide in the Avenir-based reading stack.
- Use `--font-page-title` for public-page headlines, `--font-section-title` for major sections, and `--font-story-title` and `--font-card-title` for smaller headings. Keep the Get Started article at documentation scale.
- Use `--page-hero-top` and `--section-space` for consistent vertical spacing on public pages. Adjust the shared values before adding page-specific spacing.
- Use forest green for primary actions on light surfaces and a plain text link for secondary actions. A lime action can stand out on a dark pricing card. Keep corners modest and avoid decorative shadows on controls and panels.
- Make Get Started read like documentation: a left topic list, a restrained article title and body column, and an on-page outline on wide screens. Use plain tabs and code blocks, with the topic list scrollable on narrow screens.
- Group compatibility by the job each tool does. Use rules and spacing in place of stacked cards. Keep preview labels readable and omit decorative numbering.
- Let the product interface carry the detail. Decorative shapes should come from map boxes, connectors, citations, or version history.
- Keep movement tied to an action, such as selecting a box or changing the code state. Respect reduced-motion preferences.

## Content

- Make one checkable claim per section and show the corresponding action or interface state.
- Use the same checkout example in the hero, feature frames, and guide. The example source lives in `demo/`.
- Label concept interface frames as previews. Replace them with captures from the finished product before launch.
- Name each integration by its real mode: extension, plugin, skill launch, copy prompt, or PR check.
- Treat local use, Cloud uploads, agent token costs, and plan limits as separate facts.
- Use no invented testimonials, customer logos, adoption counts, or performance claims.

## Review before launch

- Check every integration, price, education rule, and privacy statement against the released product.
- Review third-party marks against their owners' current guidelines. Keep product names and marks subordinate to AI SUS's identity.
- Test keyboard access, narrow screens, contrast, reduced motion, and the complete Get Started path in a browser.
