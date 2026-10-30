# Handoff: ORMO PMO public website restyle

## Overview
Restyle the **public marketing pages** of ORMO PMO (https://pmo.originoverthrow.com/) to match the new ORMO gradient-loop logo and the "futuristic brand hero" art direction: deep navy → sky-blue gradient with a warm orange glow. Tone: considered, professional, elegant, confident; corporate but dynamic; credible to startups and enterprise.

**Scope: public pages only.** Do NOT restyle the logged-in app (Overview, Programmes, Projects, etc.).

Only the homepage has been designed. Apply the same system (tokens, header/hero, section patterns, buttons, footer) to every other public page (pricing, contact, sign-in/sign-up, legal, etc.).

## About the design files
`ORMO PMO Website.dc.html` is a **design reference built in HTML**, not production code. Rebuild it in the existing site codebase (it appears to be a Lovable-generated React + Tailwind app) using that codebase's patterns and components. Open the file in a browser to see it; `support.js` is only the prototype runtime and should not be copied.

## Fidelity
**High-fidelity.** Colours, type, spacing and copy are final unless the copy conflicts with the current site. In that case keep the real product copy and apply the styling.

## Design tokens

### Colours
| Token | Hex | Use |
|---|---|---|
| navy-950 | `#06163a` | Darkest gradient stop, dark section bg |
| navy-800 | `#0a2a6b` | Gradient stop, primary button text, active tab |
| blue-600 | `#1466c4` | Gradient stop |
| sky-400 | `#36a9ec` | Gradient end |
| link | `#1d6fd8` (hover `#0b4fb0`) | Links, eyebrows on light bg |
| ink | `#0b1530` | Body text on light |
| ink-muted | `#46536f` | Secondary text on light |
| ink-faint | `#7a86a0` | Copyright/meta |
| page | `#f5f7fb` | Page background |
| surface | `#ffffff` | Cards |
| border | `#e3e8f1` / rule `#d6dcea` | Card borders, dividers |
| on-dark text | `#d6e5ff`, `#cfe2ff`, `#bccbe6`, `#dbe8ff` | Body/eyebrow text on gradient/navy |
| brand cyan | `#16b8f3` | Logo-derived accent |
| brand violet | `#5b4bff` | Logo-derived accent, step numbers |
| brand orange | `#ff8a2a` / soft `#ffb070` | Logo-derived accent, glow, eyebrow dot |

### Signature gradients
- **Hero background:** `linear-gradient(118deg, #06163a 0%, #0a2a6b 38%, #1466c4 72%, #36a9ec 100%)`
  plus an overlay: `radial-gradient(60% 70% at 88% 108%, rgba(255,170,90,.85) 0%, rgba(255,140,60,.35) 30%, rgba(255,140,60,0) 62%), radial-gradient(50% 60% at 10% -10%, rgba(4,10,35,.7), rgba(4,10,35,0) 70%)`
- **Decorative arcs (optional):** two large circles with only a border, bottom-right of the hero: width 95% / 110%, `border: 1px solid rgba(255,255,255,.22)` / `.12`, positioned `right:-22%; bottom:-70%` and `right:-30%; bottom:-88%`. They echo the curved architecture in the brand hero.
- **Brand accent bar / frame:** `linear-gradient(90deg|135deg, #16b8f3, #5b4bff 55%, #ff8a2a)`
- **CTA band:** `linear-gradient(118deg, #0a2a6b 0%, #1466c4 55%, #36a9ec 100%)` + `radial-gradient(45% 90% at 100% 110%, rgba(255,160,80,.8), rgba(255,160,80,0) 65%)`

### Typography (Google Fonts)
- **Display:** Montserrat 800 (closest match to the logo wordmark). Used for H1/H2/H3-feature, wordmark, step numbers.
- **UI/body:** Plus Jakarta Sans 400/500/600/700.

| Role | Font | Size | Weight | Line-height | Tracking |
|---|---|---|---|---|---|
| H1 | Montserrat | clamp(40px, 5.4vw, 68px) | 800 | 1.04 | -0.025em |
| H2 | Montserrat | clamp(30–32px, 3.2–3.6vw, 40–46px) | 800 | 1.1 | -0.02em |
| Feature H3 | Montserrat | 28px | 800 | 1.15 | -0.02em |
| Card H3 | Jakarta | 20–22px | 700 | — | -0.01em |
| Lead | Jakarta | 19px | 400 | 1.6 | — |
| Body | Jakarta | 15–17px | 400 | 1.65 | — |
| Eyebrow | Jakarta | 12px uppercase | 600–700 | — | 0.16em |
| Nav link | Jakarta | 14px | 500 | — | — |
| Button | Jakarta | 14–15px | 600–700 | — | — |

Use `text-wrap: balance` on headings and `text-wrap: pretty` on paragraphs.

### Radius / shadow / spacing
- Radius: pill buttons `999px`, cards `18–20px`, CTA band `28px`, screenshot frames `16px` outer / `10px` image.
- Shadows: hero screenshot `0 -20px 80px -20px rgba(3,12,40,.6)`, tour frame `0 30px 60px -30px rgba(10,42,107,.45)`.
- Container: `max-width: 1240px`, horizontal padding `32px`.
- Section vertical padding: ~96–104px. Card padding 32–36px. Grid gaps 20–24px for cards, 40–64px for text columns.

## Components

### Logo / wordmark
- Nav (on dark): `assets/ormo-mark.png` at 38×38, then a stacked wordmark: "ORMO" (Montserrat 800, 20px, white) over "PMO" (Montserrat 700, 9px, letter-spacing .5em, `#bcd6ff`, 3px gap).
- Footer (on light): full lockup `assets/ormo-logo.png` at 44px tall.
- Favicon: `assets/ormo-mark.png`.

### Buttons
- **Primary (on dark):** bg `#fff`, text `#0a2a6b`, 700, padding `15px 26px` (nav: `10px 18px`), pill. Hover bg `#e8f1ff`.
- **Secondary (on dark):** transparent, white text, `1px solid rgba(255,255,255,.4)`, pill. Hover bg `rgba(255,255,255,.1)`.
- On light pages (e.g. sign-in, legal), the primary button inverts: bg `#0a2a6b`, white text.

### Nav
Transparent and sitting on the hero gradient. Padding `22px 32px`. Logo, then links (Product, How it works, Who it's for, Pricing) at `rgba(255,255,255,.82)`, white on hover, 28px gap. Right side: "Sign in" (text) and "Get started" (primary pill). On public pages without a gradient hero, use a navy-950 bar with the same styling.

## Homepage sections (top to bottom)
1. **Hero** (gradient + glow + arcs). Two-column grid (collapses below ~920px):
   - Left: eyebrow pill ("Portfolio · Programme · Project", 1px border `rgba(255,255,255,.25)`, orange 6px dot) and the H1 "Know which projects are really on track."
   - Right: lead paragraph, then CTAs "Start free" and "Book a demo".
   - Below, full container width, 72px top margin: `shot-project-dark.png` inside a glass frame (`rgba(255,255,255,.12)` bg, `1px solid rgba(255,255,255,.22)`, 10px padding, no bottom border, top corners rounded). It bleeds to the bottom edge of the hero.
2. **Product pillars** (`#product`): two-column intro (H2 on the left, muted paragraph on the right) and three white cards. Each card has a 40×4 brand-gradient bar, a title and body text.
3. **Product tour** (`#tour`): a pill tab bar (white, bordered). The active tab has bg `#0a2a6b` and white text; inactive tabs have muted text. Below it, the text column (eyebrow, H3, body; max-width 380px, flex `1 1 280px`) sits beside the screenshot (flex `2 1 560px`) in an 8px brand-gradient frame. Tabs:
   - Assurance → `shot-assurance.png`
   - Projects → `shot-project-summary.png`
   - Schedule → `shot-schedule.png`
   - Dependencies → `shot-dependency-map.png`
   - Benefits → `shot-benefits-map.png`
   Copy is in the logic class at the bottom of the HTML file. Tab switching is instant; an optional 150ms crossfade is fine.
4. **How it works** (`#how`): eyebrow and H2, then three columns separated by a 1px top rule: 01 Connect / 02 Calculate / 03 Challenge, with numbers in violet Montserrat.
5. **Who it's for** (`#teams`): navy-950 section with two bordered cards. "Growing teams" has a faint cyan wash and a `#7cc8f5` eyebrow; "Enterprise" has a faint orange wash and a `#ffb070` eyebrow.
6. **CTA band** (`#pricing` anchor): rounded gradient panel. the heading "See your portfolio as it really is." and the two buttons (no offer text).
7. **Footer:** 1px top border, logo lockup, links (Privacy, Terms, Contact), "© 2026 ORMO PMO".

## Applying to other public pages
- Reuse the hero treatment at reduced height (~360px, no screenshot) for page headers: eyebrow, H1, lead.
- Light content area on `#f5f7fb`, with white cards using the border and radius tokens above.
- Sign-in/sign-up: a split layout works well. Put the gradient + glow panel with the logo on one side and a white form card on the other. Inputs: 1px `#e3e8f1` border, 10–12px radius, focus ring `#1d6fd8`.
- Keep the same nav, footer, buttons and type scale everywhere.

## Responsive behaviour
All grids use `repeat(auto-fit, minmax(min(100%, Npx), 1fr))` or flex-wrap, so they stack on narrow screens. Headings scale with clamp(). On mobile the nav links should collapse into a menu.

## Assets
- `assets/ormo-mark.png`: logo mark, transparent, 512² (also the favicon)
- `assets/ormo-logo.png`: full lockup on white
- `assets/ormo-hero.png`: brand hero reference (art direction only; not used directly)
- `assets/shot-*.png`: product screenshots supplied by the client. The user's name and avatar in `shot-project-dark.png` are blurred on purpose.

## Files
- `screenshots/01–06-home.png`: homepage captures from top to bottom (hero, pillars, tour, how it works, who it's for, CTA and footer)
- `ORMO PMO Website.dc.html`: homepage design reference (inline styles hold the exact values)
- `support.js`: prototype runtime, only needed to open the HTML locally
