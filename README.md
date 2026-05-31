# Social Cards

Turn your blog posts into stylish, Substack-style social sharing cards — by hand
in a Mac app, or **automatically** whenever you publish on Ghost.

Paste a post URL (or let a Ghost webhook do it) and get clean cards in **8 styles**,
in both **Instagram Story (1080×1920)** and **Landscape (1920×1080)** sizes. The
accent color is auto-sampled from your post's featured image.

![Templates: Overlay · Spotlight · Light Card · Dark Card · Paper · Night · Headline · Quote](#)

---

## Two ways to use it

### 1. The Mac app (manual)
An Electron desktop app. Paste a blog URL, pick a template and size, tweak the
text, and save a JPG.

```bash
npm install
npm start          # run in dev
npm run dist       # build a native .app (output in dist/)
```

Toggle the title / tagline / publication / URL on or off per card.

### 2. Ghost integration (automatic)
A small webhook service that listens for Ghost's `post.published` event, renders
all the cards by driving the app in a headless mode, then **saves them to a folder
and emails them to you**.

> Ghost has no traditional plugin system — the supported way to run something
> after publishing is a **Custom Integration + webhook**, which is what this uses.

Full setup guide: **[`ghost-integration/README.md`](ghost-integration/README.md)**

```
Ghost (post.published) ──webhook──▶  service  ──▶  Social Cards (headless render)
                                        ├─▶  saves JPGs to a folder
                                        └─▶  emails them to you
```

---

## Requirements
- **macOS** (the renderer uses Electron; cards use Mac system fonts)
- **Node.js 18+**
- For the Ghost integration: a way to expose the service publicly (e.g. a
  [Cloudflare tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)),
  and optionally SMTP details for email.

## Notes for self-hosters
- Cards are drawn with Mac system fonts (e.g. Helvetica Neue). On a non-Mac
  server the fonts will substitute and look slightly different unless you bundle them.
- Secrets live in `ghost-integration/.env` (gitignored). Copy `.env.example` to
  `.env` and fill it in.
- The headless renderer is invoked as:
  `electron . --render --url=<post> --out=<dir> [--templates=all] [--formats=all] [--showDesc=false]`

## License
MIT — see [LICENSE](LICENSE).
