# EthioLife brand identity and mini-app logo system

## Brand idea

**Master brand:** EthioLife Agency  
**Product-facing name:** EthioLife  
**Tagline:** People. Services. Opportunity.  
**Promise:** One clear place to find, request, and manage useful services for work, homes, business, and community.

EthioLife brings together agency operations, employment and worker services, homes and rentals, marketplace, Edir, SACCO/MFI pilots, and insurance information. The identity should therefore communicate a dependable connector and service network. It should not look like a bank-only, property-only, or government identity. The master mark is refined as a central opportunity hub connected to three people and service nodes; the icon and app marks share the product palette.

## Research and design implications

An Ethiopia-focused study of digital-finance use in rural communities found that trust, perceived ease, social influence, awareness, phone ownership, and internet access were associated with adoption. This is evidence from a specific study and location, not a claim that all Ethiopians or Africans share one attitude. It supports designing for clarity, recognizable service ownership, transparent states, and easy first-use journeys, then testing those choices with EthioLife users. [Study: What drives digital finance use in rural Africa? Insights from Ethiopia](https://www.tandfonline.com/doi/full/10.1080/2157930X.2025.2542637)

The World Bank’s recent Ethiopia digital-economy update reports fast growth in mobile-money access alongside continuing differences in connectivity and access. That makes a low-bandwidth, mobile-first identity and a clear offline/error state part of brand quality, rather than a separate technical detail. [World Bank: Empowering Ethiopians by laying the digital foundations for economic growth](https://www.worldbank.org/en/results/2025/06/30/empowering-ethiopians-by-laying-the-digital-foundations-for-afe-economic-growth)

Research on Addis Ababa’s linguistic landscape describes international names and logos being used locally and acquiring Ethiopian meaning through local use. This supports a locally legible master brand and multilingual interfaces; it does not justify borrowing a regional or ethnic motif without community review. [Lanza and Woldemariam: Indexing modernity, English and branding in Addis Ababa](https://journals.sagepub.com/doi/10.1177/1367006913484204)

There is no single “African community psychology.” Ethiopia itself is multilingual and culturally diverse. Treat social influence and trust findings as hypotheses, and validate the identity with people from different regions, languages, ages, genders, literacy levels, abilities, and urban/rural contexts. Do not use national colors, religious signs, traditional scripts, or ethnic patterns as decoration without a clear reason and informed local review.

## Visual system

- **Core mark:** a central gold opportunity hub connects three white service and community nodes. The radial layout reads as a shared platform rather than a roof or single service category. The rounded tile makes it work as an app icon. It does not claim identity verification, banking authorization, or a government affiliation.
- **Core colors:** deep green `#174b3d` for the shared product shell; warm gold `#d7ad59` for small accent shapes; deep ink and muted green-gray for readable text; pale neutral surfaces for long work sessions. Gold alone is not used for small text.
- **Type and language:** retain the existing readable sans-serif system and native Ethiopic fallback. Keep service names short, localize them, and test real Amharic, Afaan Oromoo, Tigrinya, Somali, and other supported strings for wrapping and font quality.
- **Illustration and tone:** use simple, purposeful service symbols and plain language. Explain who provides a service, what happens next, what is still a pilot, and whether an action posts money or creates a commitment.

## Mini-app logo family

All app marks use the same 96-unit rounded tile, deep-green field, white linework, and restrained gold detail. Distinct symbols identify the app’s job; the shared tile, palette, size, and wordmark retain the EthioLife relationship.

| Mini-app | Symbol concept | Asset |
| --- | --- | --- |
| Workforce Management | Individual worker record with profile and document details | `public/mini-apps/workforce-management/logo.svg` |
| Staffing | Briefcase and role/matching cue | `public/mini-apps/staffing/logo.svg` |
| Property Management | Home outline with a clear entry | `public/mini-apps/property-management/logo.svg` |
| Marketplace | Local storefront and open doorway | `public/mini-apps/marketplace/logo.svg` |
| Lead Book | Opportunity record with a highlighted lead | `public/mini-apps/leads/logo.svg` |
| Agreements | Contract page with signature cue | `public/mini-apps/contracts/logo.svg` |
| Commissions | ETB/value cue and an earned-amount path | `public/mini-apps/commissions/logo.svg` |
| Rent and deposits | Home entry and key | `public/mini-apps/rent/logo.svg` |
| Agent Network | Connected field and master agents | `public/mini-apps/agents/logo.svg` |
| EthioLife Edir | Three connected community members | `public/mini-apps/edir/logo.svg` |
| SACCO / MFI | Institution account and wallet record | `public/mini-apps/mfi/logo.svg` |
| Insurance information | Shield category marker; the mark does not indicate an active policy | `public/mini-apps/insurance/logo.svg` |
| Agency services | EthioLife core network mark | `public/icon.svg` |

The mini-app marks are decorative when a visible app name is present. They appear on the public service cards, service launcher, and matching signed-in workspace headings. The four independently routed service manifests declare their logo paths; the integrated workspaces use the same naming convention and logo resolver. All 12 logo assets are included in the public-only service-worker shell so the marks can load offline. Asset validity, manifest links, and the brand-family colors are checked in the mini-app and service-worker tests.

## Brand behavior and trust cues

Show the service provider, action owner, next step, and current state before asking a person to submit information. Use specific status text alongside color. Make fees, eligibility, consent, review times, and reversibility visible at the point of choice. Keep synthetic integrations visibly marked as sandbox, and label unconfigured services as information-only or unavailable. Use real social proof only when it is consented to and independently verifiable; never fabricate testimonials, adoption figures, security seals, or partner marks.

## Validation plan

Treat this identity as a reasoned first version, not a market-acceptance guarantee. Test the master symbol and each mini-app symbol at favicon, mobile dock, launcher-card, and printed-agent-material sizes. Ask people to identify each symbol without a label, then check whether the label corrects ambiguity. Compare the preferred mark with the current one in short, moderated sessions; include lower-end Android phones, small screens, local scripts, and low-bandwidth conditions. Track correct service recognition, task completion, errors, perceived legitimacy, and confidence about what the platform does. Do not select a winner from aesthetic preference alone.

## Related quality work

Accessibility and interaction refinements are recorded in [UI_QUALITY_REVIEW_2026-10-13.md](UI_QUALITY_REVIEW_2026-10-13.md). Brand assets remain editable SVG so local review can refine the marks without losing resolution.

## Visual rollout — 14 October 2026

The core mark now shows three people connected through a single gold opportunity hub. This makes the master icon read as a broad service network rather than a standalone letter mark. The same symbol is used in the SVG app icon, PWA icons, Android launcher/adaptive icons, and Android splash artwork. A new service-network illustration connects a worker, home, work opportunity, and community in the public sign-in panel. Mini-app marks remain distinct within the shared family system.

The design direction prioritizes clarity, accessible contrast, local language support, consistent navigation, and transparent service ownership. These priorities align with the National Bank of Ethiopia's [National Digital Payments Strategy 2026–2030 draft](https://nbe.gov.et/wp-content/uploads/2025/12/NATIONAL_DIGITAL_PAYMENT_STRATEGY_2026-2030_Draft_Document.pdf), which calls for simple and accessible experiences, local languages, consistent navigation, clear transaction details, and stronger trust. The strategy is a relevant UX reference for the product's financial service areas, not an endorsement of EthioLife or evidence that users accept this identity.

Files applied: `public/icon.svg`, `public/brand/ethiolife-service-network.svg`, `public/icons/*`, `android/app/src/main/res/mipmap-*`, `android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml`, and Android splash images. Validate the new identity with local users across languages, screen sizes, and assistive technologies before treating it as a market-tested brand.
