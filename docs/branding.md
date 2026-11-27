# Leonida Log branding

**Visual source of truth:** the [design reference](https://claude.ai/artifact/FL8isDnFAyobGqPrkFeb9W) (screens, components, logo, palette and type, in light and dark). Chosen in the [design review](https://claude.ai/artifact/UeXqmdUW34qdRoMSfq4kg8) (history): **A Postcard** in every section (2026-11-24).

## Name

**Leonida Log**, at gta.dvdby.cc. Written as two words, title case. Never "GTA" in the name or wordmark.

## Logo and app icon

An original mark: a sunset disc over a Gulf-teal sea with a single palm, on sunset pink. It isn't based on any Rockstar or GTA VI artwork.

```svg
<svg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><rect width="60" height="60" rx="13.5" fill="#e5336d"/><circle cx="30" cy="31" r="15" fill="#ff8a3d"/><rect x="0" y="40" width="60" height="20" fill="#0f8b8d"/><path d="M0 44c7 0 7-2 15-2s8 2 15 2 8-2 15-2 8 2 15 2v16H0z" fill="#0b6f71"/><path d="M41 40c-1-8 0-14 3-19" stroke="#22101c" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M44 21c-5-3-10-2-13 1 4-1 8 0 13-1zm0 0c4-4 9-4 12-2-4 0-8 1-12 2zm0 0c-2 4-1 8-1 10 1-4 2-7 1-10zm0 0c4 1 7 4 8 7-3-3-5-5-8-7z" fill="#22101c"/></svg>
```

- **Sizes:** 60px for the home-screen icon, 29px for settings, and 180/192/512px PNGs exported from the SVG for the PWA manifest and apple-touch-icon.
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
- Pink means "yours to do" or done. Teal marks a point of no return or a tip. Orange is the sun disc.

## Type

- **Display:** [Anton](https://fonts.google.com/specimen/Anton), uppercase. Use it for screen titles, card headings and category headers.
- **Text:** [Work Sans](https://fonts.google.com/specimen/Work+Sans) 400/500/600/700. Use it for everything else, with a 16px body on the phone.
- Load both from Google Fonts with `display=swap`. Fall back to Impact for Anton and to system-ui for Work Sans.

## Motifs

- **Postcard header:** a pink band, an orange sun disc cropped at the right edge, and a teal sea strip along the bottom. Every main screen has one.
- **Exit sign** (taken from Highway in round 2): a teal sign with an "EXIT 20" badge, used for the next point of no return. The number is the mission number.
- **Rings** for stat levels 0-4, plus a thin progress bar for checklist completion.
- **Chips:** "Soon lost" (pink) and "Tip" (teal). No confidence chip (ADR 0008).

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
