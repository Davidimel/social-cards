# Social Cards · Ghost integration

Automatically generate social sharing cards whenever you publish a post on Ghost.

When a post is published, Ghost fires a **webhook** to this small service. The
service drives the Social Cards app in headless mode, renders **all 8 templates
in both formats**, saves them to a folder, and emails them to you as a zip.

```
Ghost (post.published) ──webhook──▶  this service  ──▶  Social Cards app (headless)
                                          │
                                          ├─▶  saves JPGs to OUTPUT_DIR/<date-slug>/
                                          └─▶  emails them to you (zip)
```

> **Note on "plugins":** Ghost has no traditional plugin system. The supported
> way to run something after publishing is a **Custom Integration + webhook**,
> which is exactly what this uses.

---

## 1. Install

```bash
cd "ghost-integration"
npm install
cp .env.example .env       # then edit .env with your values
```

The parent Social Cards app must have its dependencies installed too (it does if
you've run the app). The service calls `../node_modules/.bin/electron`.

## 2. Configure `.env`

- `OUTPUT_DIR` — a folder for the cards. Point it at iCloud/Dropbox to sync them
  to your phone automatically.
- `WEBHOOK_SECRET` — any random string; Ghost will include it in the URL.
- Email block — your SMTP details. For Gmail, use an **App Password**.

## 3. Run it

```bash
npm start
```

You should see `listening on http://localhost:4747`.

### Run it always-on (background service)

A launchd agent is already installed so the service **starts at login and
restarts automatically if it crashes**. Manage it with the helper script:

```bash
./service.sh status     # is it running?
./service.sh restart    # apply changes after editing .env
./service.sh stop       # turn it off
./service.sh start      # turn it on
./service.sh logs       # tail the live log
```

The agent file lives at `~/Library/LaunchAgents/com.davidimel.socialcards-ghost.plist`
and logs to `ghost-integration/logs/`. **Re-run `./service.sh restart` after you
edit `.env`** so it picks up the new settings.

## 4. Make it reachable from Ghost(Pro)

Ghost(Pro) is in the cloud, so it needs a **public URL** to reach the service on
your Mac. Use a free tunnel:

```bash
# one-time install
brew install cloudflared

# point a public URL at the local service
cloudflared tunnel --url http://localhost:4747
```

Cloudflared prints a public `https://….trycloudflare.com` URL. Keep it running.

> ⚠️ The quick-tunnel URL **changes every time you restart cloudflared**, so
> you'd have to update the Ghost webhook each time. For a stable, always-on URL,
> set up a **named tunnel** (free, needs a domain on Cloudflare):
>
> ```bash
> cloudflared tunnel login
> cloudflared tunnel create social-cards
> cloudflared tunnel route dns social-cards cards.yourdomain.com
> cloudflared tunnel run --url http://localhost:4747 social-cards
> ```
>
> Then point the Ghost webhook at `https://cards.yourdomain.com/webhook?secret=…`
> once and never touch it again. You can also wrap `cloudflared tunnel run` in
> its own launchd agent so the tunnel is always up too.

## 5. Create the webhook in Ghost

1. Ghost Admin → **Settings → Advanced → Integrations → + Add custom integration**.
   Name it "Social Cards".
2. In that integration, **+ Add webhook**:
   - **Event:** `Post published`
   - **Target URL:** `https://….trycloudflare.com/webhook?secret=YOUR_WEBHOOK_SECRET`
3. Save.

## 6. Test

Publish a post (or use Ghost's "send test" on the webhook). Within a few seconds
you'll see a new folder in `OUTPUT_DIR` with all the cards, and an email arrives
with the zip.

You can also test the service directly:

```bash
curl -X POST "http://localhost:4747/webhook?secret=YOUR_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"post":{"current":{"url":"https://example.com","title":"My Test Post"}}}'
```

---

### Troubleshooting
- **Nothing happens:** check the service logs; confirm the secret matches.
- **Email fails:** verify SMTP creds; Gmail needs an App Password, not your login.
- **Cards are gradient-only:** the post had no `og:image`; add a feature image.
- **`electron` not found:** set `ELECTRON_BIN` in `.env` to the full path.
