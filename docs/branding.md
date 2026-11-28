# Leonida Log branding

**Visual source of truth:** the [design reference](https://claude.ai/artifact/FL8isDnFAyobGqPrkFeb9W) (screens, components, logo, palette and type, in light and dark). Chosen in the [design review](https://claude.ai/artifact/UeXqmdUW34qdRoMSfq4kg8) (history): **A Postcard** in every section (2026-11-24).

## Name

**Leonida Log**, at gta.dvdby.cc. Written as two words, title case. Never "GTA" in the name or wordmark.

## Logo and app icon

An original mark: a sunset disc over a Gulf-teal sea with a single palm, on sunset pink. It isn't based on any Rockstar or GTA VI artwork.

```svg
<svg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><rect width="60" height="60" rx="13.5" fill="#e5336d"/><circle cx="30" cy="31" r="15" fill="#ff8a3d"/><rect x="0" y="40" width="60" height="20" fill="#0f8b8d"/><path d="M0 44c7 0 7-2 15-2s8 2 15 2 8-2 15-2 8 2 15 2v16H0z" fill="#0b6f71"/><path d="M41 40c-1-8 0-14 3-19" stroke="#22101c" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M44 21c-5-3-10-2-13 1 4-1 8 0 13-1zm0 0c4-4 9-4 12-2-4 0-8 1-12 2zm0 0c-2 4-1 8-1 10 1-4 2-7 1-10zm0 0c4 1 7 4 8 7-3-3-5-5-8-7z" fill="#22101c"/></svg>
```

- **Sizes:** 60px for the home-screen icon, 29px for settings, and 180/192/512px PNGs exported from the SVG for the PWA manifest and apple-touch-icon, plus a 512px maskable icon (full bleed, art at 80%). `app/icon.svg` is the SVG; `node scripts/make-icons.mjs` rewrites the PNGs in `public/icons/`.
- **Wordmark:** "LEONIDA LOG" in Anton, uppercase, in sunset pink. It appears on white (light) or on #1c0f1a (dark).
- **Clear space:** at least a quarter of the icon's width around it.

## Palette

| Role                                   | Light     | Dark      |
| -------------------------------------- | --------- | --------- |
| Sunset pink (primary, headers, checks) | `#e5336d` | `#ff5c8a` |
| Sun orange (sun disc)                  | `#ff8a3d` | `#ff9d5c` |
| Gulf teal (sea band, exit sign, tips)  | `#0f8b8d` | `#3cc7c2` |
| Ink                                    | `#22101c` | `#fbeef3` |
| Muted text                             | `#7a5a6c` | `#c29bb0` |
| Card                                   | `#fff0f4` | `#2a1726` |
| Rule / track                           | `#f3dbe4` | `#3a2435` |
| Ground                                 | `#ffffff` | `#1c0f1a` |

- Text on pink is white in light mode and #1c0f1a in dark mode.

### Contrast

The raw palette fails 4.5:1 for small text in light mode (white on `#e5336d` is 4.18, white on `#0f8b8d` 4.12, pink on the card 3.78, teal on the card 3.73). Light mode therefore adds darkened tokens, each the palette colour scaled toward black until the pair reaches 4.5:1. In dark mode they equal the palette. `app/globals.css` holds them; `app/globals.test.ts` fails if a pair drops below its threshold.

| Token         | Light     | Dark      | Use                                                        |
| ------------- | --------- | --------- | ---------------------------------------------------------- |
| `--pink-text` | `#cf2e63` | `#ff5c8a` | Pink text on ground or card, focus ring                    |
| `--pink-fill` | `#db3168` | `#ff5c8a` | Pink fill under small text: header band, button, chip      |
| `--teal-text` | `#0d7c7e` | `#3cc7c2` | Teal text on ground, card or the exit badge                |
| `--teal-fill` | `#0e8486` | `#3cc7c2` | Teal fill under small text: exit sign, Tip chip            |
| `--on-pink`   | `#ffffff` | `#1c0f1a` | Text on `--pink-fill`                                      |
| `--on-teal`   | `#ffffff` | `#1c0f1a` | Text on `--teal-fill`; also the exit badge fill and border |

Raw `--pink`, `--orange` and `--teal` stay for decoration (sun, sea strip), the Anton title on the band and non-text shapes (ring, bar, checkbox: 3:1).

Small-text pairs (light / dark ratio):

| Text on background           | Light | Dark  |
| ---------------------------- | ----- | ----- |
| `--ink` on `--ground`        | 18.12 | 16.44 |
| `--ink` on `--card`          | 16.41 | 14.91 |
| `--muted` on `--ground`      | 5.99  | 7.60  |
| `--muted` on `--card`        | 5.42  | 6.89  |
| `--pink-text` on `--ground`  | 4.97  | 6.31  |
| `--pink-text` on `--card`    | 4.50  | 5.72  |
| `--teal-text` on `--ground`  | 5.00  | 8.95  |
| `--teal-text` on `--card`    | 4.53  | 8.12  |
| `--on-pink` on `--pink-fill` | 4.51  | 6.31  |
| `--on-teal` on `--teal-fill` | 4.50  | 8.95  |
| `--teal-text` on `--on-teal` | 5.00  | 8.95  |

Shapes (3:1): `--pink` on ground 4.18 / 6.31, on card 3.78 / 5.72; `--muted` checkbox border on ground 5.99 / 7.60; the check mark `--on-pink` on `--pink` 4.18 / 6.31.

- Pink means "yours to do" or done. Teal marks a point of no return or a tip. Orange is the sun disc.

## Type

- **Display:** [Anton](https://fonts.google.com/specimen/Anton), uppercase. Use it for screen titles, card headings and category headers.
- **Text:** [Work Sans](https://fonts.google.com/specimen/Work+Sans) 400/500/600/700. Use it for everything else, with a 16px body on the phone.
- Load both from Google Fonts with `display=swap`. Fall back to Impact for Anton and to system-ui for Work Sans.

## Motifs

- **Postcard header:** a pink band, an orange sun disc cropped at the right edge, and a teal sea strip along the bottom. Every main screen has one.
- **Exit sign** (taken from Highway in round 2): a teal sign with an "EXIT 20" badge, used for the next point of no return. The number is the mission number.
- **Rings** for stat levels 0-4, plus a thin progress bar for checklist completion.
- **Chips:** "Soon lost" (pink), "Tip" (teal) and a muted outline for countdowns ("Closes in 3 missions"). No confidence chip and no "Research" chip (ADR 0008).

## Voice

- Short, direct, second person. It reads like a friend who already played this part: "Drive the Ultimate Edition cars while you still have them."
- Spoiler-safe by default: name only missions you've reached, plus the next point of no return and the mission that unlocks hidden items ("4 more unlock after Day Release"), never what's in them (ADR 0002).
- State the best-evidence value plainly. Never label it unverified or unconfirmed; when guides split, the text gives the safe reading (ADR 0008).

## Do

- Use the real in-game names for missions, stats and collectibles.
- Keep one treatment for repeated items. Category headers, chips and checkboxes look the same everywhere.
- Show light and dark. Both are first-class.

## Don't

- Don't use or imitate Rockstar's logos, the GTA VI wordmark or its gradient lettering.
- Don't put game screenshots or key art in the public repo.
- Don't use neon glows, dark gradients or generic bordered-card layouts.
- Don't show anything past the current mission unless the user opens it on purpose.
