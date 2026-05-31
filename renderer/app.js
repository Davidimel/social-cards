// ── Formats ───────────────────────────────────────────────────────
const FORMATS = {
  story:     { w: 1080, h: 1920, label: 'Instagram Story / Reel — vertical' },
  landscape: { w: 1920, h: 1080, label: 'Landscape — X, blog header, YouTube' }
}
let currentFormat = 'story'
let W = FORMATS.story.w
let H = FORMATS.story.h

// Substack uses a clean bold grotesque — approximate with Helvetica Neue / system sans
const SANS = `'Helvetica Neue', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif`

const FALLBACK_ACCENT = {
  title: '#D9C4A0', onImage: '#FFFFFF',
  tint: '#EFE8DB', tintDeep: '#E4D9C6',
  solid: '#6B5B45', solidText: '#FFFFFF', soft: '#B89B74'
}

// State
let postData = null
let heroImageBitmap = null
let avatarBitmap = null
let accentColors = FALLBACK_ACCENT
let currentTemplate = 0

// Templates — Substack-style
const TEMPLATES = [
  { name: 'Overlay', draw: drawOverlay },
  { name: 'Spotlight', draw: drawSpotlight },
  { name: 'Light Card', draw: drawLightCard },
  { name: 'Dark Card', draw: drawDarkCard },
  { name: 'Paper', draw: drawPaper },
  { name: 'Night', draw: drawNight },
  { name: 'Headline', draw: drawHeadline },
  { name: 'Quote', draw: drawQuote }
]

// DOM refs
const urlInput = document.getElementById('url-input')
const fetchBtn = document.getElementById('fetch-btn')
const fetchStatus = document.getElementById('fetch-status')
const metaSection = document.getElementById('meta-section')
const templateSection = document.getElementById('template-section')
const exportSection = document.getElementById('export-section')
const metaTitle = document.getElementById('meta-title')
const metaDesc = document.getElementById('meta-desc')
const descToggle = document.getElementById('desc-toggle')
const metaSite = document.getElementById('meta-site')
const siteToggle = document.getElementById('site-toggle')
const metaUrl = document.getElementById('meta-url')
const urlToggle = document.getElementById('url-toggle')
const mainCanvas = document.getElementById('card-canvas')
const mainCtx = mainCanvas.getContext('2d')
const exportBtn = document.getElementById('export-btn')
const exportHint = document.getElementById('export-hint')
const templateGrid = document.getElementById('template-grid')
const formatToggle = document.getElementById('format-toggle')
const previewFrame = document.querySelector('.preview-frame')
const previewArea = document.querySelector('.preview-area')

// ── Init template thumbs ──────────────────────────────────────────
function buildTemplateThumbs() {
  TEMPLATES.forEach((t, i) => {
    const wrapper = document.createElement('div')
    wrapper.className = 'template-thumb' + (i === 0 ? ' active' : '')
    wrapper.dataset.idx = i

    const c = document.createElement('canvas')
    c.width = W
    c.height = H

    const nameEl = document.createElement('div')
    nameEl.className = 'template-name'
    nameEl.textContent = t.name

    wrapper.appendChild(c)
    wrapper.appendChild(nameEl)
    wrapper.addEventListener('click', () => selectTemplate(i))
    templateGrid.appendChild(wrapper)
  })
}

function selectTemplate(idx) {
  currentTemplate = idx
  document.querySelectorAll('.template-thumb').forEach((el, i) => {
    el.classList.toggle('active', i === idx)
  })
  renderAll()
}

// ── Format switching ──────────────────────────────────────────────
formatToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('.format-btn')
  if (!btn) return
  applyFormat(btn.dataset.format)
})

function applyFormat(format) {
  currentFormat = format
  W = FORMATS[format].w
  H = FORMATS[format].h

  mainCanvas.width = W
  mainCanvas.height = H

  document.querySelectorAll('.format-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.format === format)
  })

  document.querySelectorAll('.template-thumb').forEach(wrap => {
    wrap.style.aspectRatio = `${W} / ${H}`
    const c = wrap.querySelector('canvas')
    c.width = W
    c.height = H
  })

  exportHint.textContent = FORMATS[format].label
  sizePreview()
  renderAll()
}

function sizePreview() {
  const availW = previewArea.clientWidth - 80
  const availH = previewArea.clientHeight - 80
  const ar = W / H
  let fw, fh
  if (availW / availH > ar) { fh = availH; fw = fh * ar }
  else { fw = availW; fh = fw / ar }
  previewFrame.style.width = Math.round(fw) + 'px'
  previewFrame.style.height = Math.round(fh) + 'px'
}

window.addEventListener('resize', sizePreview)

// ── Fetch ────────────────────────────────────────────────────────
fetchBtn.addEventListener('click', doFetch)
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') doFetch() })

async function doFetch() {
  const url = urlInput.value.trim()
  if (!url) return

  setStatus('loading', 'Fetching post…')
  fetchBtn.disabled = true
  heroImageBitmap = null
  avatarBitmap = null
  accentColors = FALLBACK_ACCENT

  try {
    const data = await window.api.fetchPost(url)
    postData = data

    metaTitle.value = data.title || ''
    metaDesc.value = truncate(data.description || '', 160)
    metaSite.value = data.siteName || data.author || ''
    try { metaUrl.value = new URL(url).hostname.replace(/^www\./, '').toUpperCase() } catch { metaUrl.value = '' }

    metaSection.style.display = ''
    templateSection.style.display = ''
    exportSection.style.display = ''

    setStatus('success', `Fetched: ${data.siteName || new URL(url).hostname}`)
    loadImages(data)
  } catch (err) {
    setStatus('error', 'Could not fetch post. Check the URL and try again.')
    console.error(err)
  } finally {
    fetchBtn.disabled = false
  }
}

async function loadImages(data) {
  setStatus('loading', 'Loading images…')

  if (data.icon) {
    const b64 = await window.api.fetchImage(data.icon)
    if (b64) avatarBitmap = await bitmapFrom(b64)
  }
  renderAll()

  if (data.image) {
    const b64 = await window.api.fetchImage(data.image)
    if (b64) {
      heroImageBitmap = await bitmapFrom(b64)
      accentColors = computeAccent(heroImageBitmap)
    }
    setStatus('success', heroImageBitmap ? 'Ready' : 'Ready (no featured image)')
  } else {
    setStatus('success', 'Ready (no featured image)')
  }
  renderAll()
}

function bitmapFrom(b64) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = async () => resolve(await createImageBitmap(img))
    img.onerror = () => resolve(null)
    img.src = b64
  })
}

;[metaTitle, metaDesc, metaSite, metaUrl].forEach(el => {
  el.addEventListener('input', () => renderAll())
})
;[descToggle, siteToggle, urlToggle].forEach(el => {
  el.addEventListener('change', () => renderAll())
})

// ── Accent color sampling ─────────────────────────────────────────
function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi) }

function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  let h = 0, s = 0, l = (mx + mn) / 2
  const d = mx - mn
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return [h, s, l]
}

function HSL(h, s, l) {
  return `hsl(${h.toFixed(0)}, ${(s * 100).toFixed(0)}%, ${(l * 100).toFixed(0)}%)`
}

// Saturation-weighted dominant color (ignores greys / near black & white)
function sampleColor(bitmap) {
  const n = 28
  const oc = document.createElement('canvas')
  oc.width = n; oc.height = n
  const o = oc.getContext('2d')
  o.drawImage(bitmap, 0, 0, n, n)
  const d = o.getImageData(0, 0, n, n).data
  let r = 0, g = 0, b = 0, cnt = 0
  for (let i = 0; i < d.length; i += 4) {
    const R = d[i], G = d[i + 1], B = d[i + 2]
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B)
    if (mx - mn < 18) continue
    if (mx < 25 || mn > 240) continue
    r += R; g += G; b += B; cnt++
  }
  if (cnt < 10) {
    r = g = b = 0
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2] }
    cnt = d.length / 4
  }
  return { r: r / cnt, g: g / cnt, b: b / cnt }
}

function computeAccent(bitmap) {
  if (!bitmap) return FALLBACK_ACCENT
  const { r, g, b } = sampleColor(bitmap)
  const [h, s] = rgb2hsl(r, g, b)
  const S = clamp(s, 0.25, 0.6)
  const solidL = 0.46
  return {
    title: HSL(h, clamp(S, 0.32, 0.5), 0.66),
    onImage: '#FFFFFF',
    tint: HSL(h, clamp(S * 0.55, 0.12, 0.30), 0.88),
    tintDeep: HSL(h, clamp(S * 0.60, 0.14, 0.32), 0.80),
    solid: HSL(h, clamp(S, 0.38, 0.62), solidL),
    solidText: solidL > 0.55 ? '#1A1A1A' : '#FFFFFF',
    soft: HSL(h, clamp(S, 0.30, 0.50), 0.55)
  }
}

// ── Render pipeline ──────────────────────────────────────────────
function getFields() {
  return {
    title: metaTitle.value.trim() || (postData?.title ?? 'Your Title Here'),
    desc: descToggle.checked ? (metaDesc.value.trim() || (postData?.description ?? '')) : '',
    site: siteToggle.checked ? (metaSite.value.trim() || (postData?.siteName ?? 'Publication')) : '',
    domain: urlToggle.checked ? (metaUrl.value.trim() || 'YOURBLOG.COM') : '',
    image: heroImageBitmap,
    accent: accentColors
  }
}

function renderAll() {
  const fields = getFields()
  TEMPLATES[currentTemplate].draw(mainCtx, W, H, fields)
  document.querySelectorAll('.template-thumb canvas').forEach((c, i) => {
    TEMPLATES[i].draw(c.getContext('2d'), W, H, fields)
  })
}

// ── Export ───────────────────────────────────────────────────────
exportBtn.addEventListener('click', async () => {
  const dataUrl = mainCanvas.toDataURL('image/jpeg', 0.95)
  const result = await window.api.saveCard(dataUrl)
  if (result.success) setStatus('success', `Saved ${result.filePath.split('/').pop()}`)
})

function setStatus(type, msg) {
  fetchStatus.className = 'fetch-status ' + type
  fetchStatus.textContent = msg
}

// ── Drawing helpers ───────────────────────────────────────────────
function truncate(str, max) {
  if (str.length <= max) return str
  return str.slice(0, max - 1) + '…'
}

function wrapTextLines(ctx, text, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    const test = line + (line ? ' ' : '') + word
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word }
    else line = test
  }
  if (line) lines.push(line)
  return lines
}

function fitText(ctx, text, maxWidth, maxLines, startSize, minSize, fontMaker) {
  let size = startSize
  while (size > minSize) {
    ctx.font = fontMaker(size)
    const lines = wrapTextLines(ctx, text, maxWidth)
    if (lines.length <= maxLines) return { size, lines }
    size -= 4
  }
  ctx.font = fontMaker(minSize)
  return { size: minSize, lines: wrapTextLines(ctx, text, maxWidth).slice(0, maxLines) }
}

function drawImageCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height)
  const sw = img.width * scale, sh = img.height * scale
  ctx.drawImage(img, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh)
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawUrlCaps(ctx, x, y, text, color, size, align = 'left') {
  ctx.font = `600 ${size}px ${SANS}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.save(); ctx.letterSpacing = '2px'
  ctx.fillText(text, x, y)
  ctx.restore()
  ctx.textAlign = 'left'
}

function fillFallback(ctx, x, y, w, h, accent) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h)
  g.addColorStop(0, accent.soft)
  g.addColorStop(1, accent.solid)
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
}

// Photo card: rounded image with shadow + bookmark in corner
function drawPhotoCard(ctx, img, x, y, w, h, radius, accent, markColor) {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.22)'
  ctx.shadowBlur = h * 0.05
  ctx.shadowOffsetY = h * 0.025
  roundRect(ctx, x, y, w, h, radius)
  ctx.fillStyle = '#ddd'
  ctx.fill()
  ctx.restore()

  ctx.save()
  roundRect(ctx, x, y, w, h, radius)
  ctx.clip()
  if (img) drawImageCover(ctx, img, x, y, w, h)
  else fillFallback(ctx, x, y, w, h, accent)
  ctx.restore()
}

// ════════════════════════════════════════════════════════════════
// 1 — OVERLAY  (full-bleed image, sampled-accent uppercase title)
// ════════════════════════════════════════════════════════════════
function drawOverlay(ctx, w, h, f) {
  ctx.clearRect(0, 0, w, h)
  const land = w > h, mm = Math.min(w, h), pad = Math.round(mm * 0.07)

  if (f.image) drawImageCover(ctx, f.image, 0, 0, w, h)
  else fillFallback(ctx, 0, 0, w, h, f.accent)

  ctx.fillStyle = 'rgba(0,0,0,0.34)'
  ctx.fillRect(0, 0, w, h)
  const vg = ctx.createRadialGradient(w / 2, h / 2, mm * 0.2, w / 2, h / 2, mm * 0.78)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,0,0,0.42)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, w, h)

  const upper = f.title.toUpperCase()
  const maxW = land ? w * 0.84 : w - pad * 2
  const start = land ? Math.round(w * 0.062) : Math.round(w * 0.108)
  const { size, lines } = fitText(ctx, upper, maxW, land ? 3 : 5, start, 50, s => `800 ${s}px ${SANS}`)
  const lineH = size * 1.04
  const titleH = lines.length * lineH

  const deckSize = Math.round(mm * 0.027)
  const deckLH = Math.round(deckSize * 1.3)
  let deckLines = []
  if (f.desc) {
    ctx.font = `400 ${deckSize}px ${SANS}`
    deckLines = wrapTextLines(ctx, truncate(f.desc, land ? 150 : 120), maxW).slice(0, 2)
  }
  const deckGap = deckLines.length ? Math.round(mm * 0.04) : 0
  const deckH = deckLines.length * deckLH

  let ty = (h - (titleH + deckGap + deckH)) / 2

  ctx.fillStyle = f.accent.title
  ctx.font = `800 ${size}px ${SANS}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (const line of lines) { ctx.fillText(line, w / 2, ty); ty += lineH }

  if (deckLines.length) {
    ty += deckGap
    ctx.font = `400 ${deckSize}px ${SANS}`
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    for (const line of deckLines) { ctx.fillText(line, w / 2, ty); ty += deckLH }
  }
  ctx.textAlign = 'left'

  drawUrlCaps(ctx, pad, h - pad, f.domain, 'rgba(255,255,255,0.92)', Math.round(mm * 0.022))
}

// ════════════════════════════════════════════════════════════════
// 2 — SPOTLIGHT  (full-bleed, white title bottom-left over scrim)
// ════════════════════════════════════════════════════════════════
function drawSpotlight(ctx, w, h, f) {
  ctx.clearRect(0, 0, w, h)
  const land = w > h, mm = Math.min(w, h), pad = Math.round(mm * 0.07)

  if (f.image) drawImageCover(ctx, f.image, 0, 0, w, h)
  else fillFallback(ctx, 0, 0, w, h, f.accent)

  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, 'rgba(6,5,8,0.08)')
  g.addColorStop(0.5, 'rgba(6,5,8,0.12)')
  g.addColorStop(0.8, 'rgba(6,5,8,0.62)')
  g.addColorStop(1, 'rgba(4,3,6,0.92)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  const upper = f.title.toUpperCase()
  const maxW = land ? w * 0.74 : w - pad * 2
  const start = land ? Math.round(w * 0.056) : Math.round(w * 0.096)
  const { size, lines } = fitText(ctx, upper, maxW, land ? 3 : 4, start, 46, s => `800 ${s}px ${SANS}`)
  const lineH = size * 1.05
  const blockH = lines.length * lineH

  const deckSize = Math.round(mm * 0.026)
  const deckLH = Math.round(deckSize * 1.32)
  let deckLines = []
  if (f.desc) {
    ctx.font = `400 ${deckSize}px ${SANS}`
    deckLines = wrapTextLines(ctx, truncate(f.desc, land ? 150 : 120), maxW).slice(0, 2)
  }
  const deckGap = deckLines.length ? Math.round(mm * 0.035) : 0
  const deckH = deckLines.length * deckLH

  const urlY = h - pad
  let ty = urlY - Math.round(mm * 0.06) - (blockH + deckGap + deckH)

  // accent tick
  ctx.fillStyle = f.accent.title
  ctx.fillRect(pad, ty - Math.round(mm * 0.03), Math.round(mm * 0.09), 7)

  ctx.fillStyle = '#fff'
  ctx.font = `800 ${size}px ${SANS}`
  ctx.textBaseline = 'top'
  for (const line of lines) { ctx.fillText(line, pad, ty); ty += lineH }

  if (deckLines.length) {
    ty += deckGap
    ctx.font = `400 ${deckSize}px ${SANS}`
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    for (const line of deckLines) { ctx.fillText(line, pad, ty); ty += deckLH }
  }

  drawUrlCaps(ctx, pad, urlY, f.domain, 'rgba(255,255,255,0.85)', Math.round(mm * 0.022))
}

// ════════════════════════════════════════════════════════════════
// 3 — LIGHT CARD  (light bg · title top · image card · pub + url)
// ════════════════════════════════════════════════════════════════
function drawLightCard(ctx, w, h, f) {
  cardLayout(ctx, w, h, f, {
    bg: '#F4F3F1', ink: '#1A1A1A', sub: 'rgba(0,0,0,0.45)', url: 'rgba(0,0,0,0.4)',
    mark: 'rgba(255,255,255,0.92)'
  })
}

// 6 — NIGHT  (dark variant of Light Card)
function drawNight(ctx, w, h, f) {
  cardLayout(ctx, w, h, f, {
    bg: '#1A1917', ink: '#F1ECE3', sub: 'rgba(241,236,227,0.55)', url: 'rgba(241,236,227,0.4)',
    mark: 'rgba(255,255,255,0.92)'
  })
}

function cardLayout(ctx, w, h, f, c) {
  ctx.clearRect(0, 0, w, h)
  const land = w > h, mm = Math.min(w, h), pad = Math.round(mm * 0.08)

  ctx.fillStyle = c.bg
  ctx.fillRect(0, 0, w, h)

  // Title (top, centered, mixed case)
  const titleMaxW = land ? w * 0.8 : w - pad * 2
  const tStart = land ? Math.round(w * 0.044) : Math.round(w * 0.066)
  const t = fitText(ctx, f.title, titleMaxW, 3, tStart, 40, s => `700 ${s}px ${SANS}`)
  const titleLineH = t.size * 1.14
  const titleH = t.lines.length * titleLineH

  const subSize = Math.round(mm * 0.032)
  const urlSize = Math.round(mm * 0.022)
  const gapA = Math.round(mm * 0.055)   // title block → card
  const gapB = Math.round(mm * 0.05)    // card → publication
  const gapC = Math.round(mm * 0.022)   // publication → url

  // Optional tagline / deck under the title
  const deckSize = Math.round(mm * 0.026)
  const deckLH = Math.round(deckSize * 1.32)
  let deckLines = []
  if (f.desc) {
    ctx.font = `400 ${deckSize}px ${SANS}`
    deckLines = wrapTextLines(ctx, truncate(f.desc, land ? 150 : 110), titleMaxW).slice(0, 2)
  }
  const deckGap = deckLines.length ? Math.round(mm * 0.026) : 0
  const deckH = deckLines.length * deckLH

  // Image card — clamp height so the whole stack fits the canvas
  let cardW = land ? Math.round(w * 0.6) : w - pad * 2
  let cardH = Math.round(cardW / 1.6)
  // Footer (publication + url) — only reserve space for what's shown
  let footerH = 0
  if (f.site) footerH += gapB + subSize
  if (f.domain) footerH += (f.site ? gapC : gapB) + urlSize

  const fixed = titleH + deckGap + deckH + gapA + footerH
  const maxCardH = h - fixed - pad * 2
  if (cardH > maxCardH) { cardH = Math.max(maxCardH, 0); cardW = Math.round(cardH * 1.6) }

  const total = titleH + deckGap + deckH + gapA + cardH + footerH
  let y = (h - total) / 2

  ctx.fillStyle = c.ink
  ctx.font = `700 ${t.size}px ${SANS}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (const line of t.lines) { ctx.fillText(line, w / 2, y); y += titleLineH }

  if (deckLines.length) {
    y += deckGap
    ctx.font = `400 ${deckSize}px ${SANS}`
    ctx.fillStyle = c.sub
    for (const line of deckLines) { ctx.fillText(line, w / 2, y); y += deckLH }
  }
  ctx.textAlign = 'left'

  y += gapA
  drawPhotoCard(ctx, f.image, (w - cardW) / 2, y, cardW, cardH, 24, f.accent, c.mark)
  y += cardH

  if (f.site) {
    y += gapB
    ctx.font = `500 ${subSize}px ${SANS}`
    ctx.fillStyle = c.sub
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(truncate(f.site, 40), w / 2, y)
    ctx.textAlign = 'left'
    y += subSize
  }

  if (f.domain) {
    y += f.site ? gapC : gapB
    drawUrlCaps(ctx, w / 2, y + urlSize, f.domain, c.url, urlSize, 'center')
  }
}

// ════════════════════════════════════════════════════════════════
// 4 — DARK CARD  (warm sampled-tint bg · charcoal card · url below)
// ════════════════════════════════════════════════════════════════
function drawDarkCard(ctx, w, h, f) {
  ctx.clearRect(0, 0, w, h)
  const land = w > h, mm = Math.min(w, h), pad = Math.round(mm * 0.08)

  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, f.accent.tint)
  bg.addColorStop(1, f.accent.tintDeep)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  const cardW = land ? Math.round(w * 0.6) : w - Math.round(mm * 0.18)
  const cp = Math.round(cardW * 0.055)
  const iw = cardW - cp * 2

  // Title inside card
  const tStart = Math.round(cardW * 0.078)
  const t = fitText(ctx, f.title, iw, 3, tStart, 30, s => `700 ${s}px ${SANS}`)
  const titleLineH = t.size * 1.14
  const titleH = t.lines.length * titleLineH
  const subSize = Math.round(cardW * 0.048)
  const gapImg = Math.round(cardW * 0.06)
  const gapSub = Math.round(cardW * 0.03)

  // Optional tagline / deck under the title (inside card)
  const deckSize = Math.round(cardW * 0.044)
  const deckLH = Math.round(deckSize * 1.3)
  let deckLines = []
  if (f.desc) {
    ctx.font = `400 ${deckSize}px ${SANS}`
    deckLines = wrapTextLines(ctx, truncate(f.desc, 120), iw).slice(0, 2)
  }
  const deckGap = deckLines.length ? Math.round(cardW * 0.022) : 0
  const deckH = deckLines.length * deckLH

  const siteBlock = f.site ? (gapSub + subSize) : 0
  const bottomBlock = gapImg + titleH + deckGap + deckH + siteBlock

  const urlSize = Math.round(mm * 0.022)
  const belowGap = Math.round(mm * 0.05)
  const urlSpace = f.domain ? (urlSize + belowGap) : 0

  // Derive image height from available vertical space so nothing clips
  const maxCardH = h - pad * 2 - urlSpace
  const ih = Math.max(Math.round(mm * 0.2), Math.min(Math.round(iw * 0.82), maxCardH - cp * 2 - bottomBlock))
  const cardH = cp + ih + bottomBlock + cp
  const cardX = (w - cardW) / 2
  const cardY = Math.max(pad, (h - cardH - urlSpace) / 2)

  // Card
  ctx.save()
  ctx.shadowColor = 'rgba(40,30,20,0.28)'
  ctx.shadowBlur = mm * 0.05
  ctx.shadowOffsetY = mm * 0.02
  roundRect(ctx, cardX, cardY, cardW, cardH, Math.round(cardW * 0.05))
  ctx.fillStyle = '#262320'
  ctx.fill()
  ctx.restore()

  // Image inside
  const ix = cardX + cp, iy = cardY + cp
  ctx.save()
  roundRect(ctx, ix, iy, iw, ih, Math.round(cardW * 0.03))
  ctx.clip()
  if (f.image) drawImageCover(ctx, f.image, ix, iy, iw, ih)
  else fillFallback(ctx, ix, iy, iw, ih, f.accent)
  ctx.restore()

  // Title + deck + publication
  let ty = iy + ih + gapImg
  ctx.fillStyle = '#F4EFE7'
  ctx.font = `700 ${t.size}px ${SANS}`
  ctx.textBaseline = 'top'
  for (const line of t.lines) { ctx.fillText(line, ix, ty); ty += titleLineH }
  if (deckLines.length) {
    ty += deckGap
    ctx.font = `400 ${deckSize}px ${SANS}`
    ctx.fillStyle = 'rgba(244,239,231,0.6)'
    for (const line of deckLines) { ctx.fillText(line, ix, ty); ty += deckLH }
  }
  if (f.site) {
    ty += gapSub
    ctx.font = `500 ${subSize}px ${SANS}`
    ctx.fillStyle = 'rgba(244,239,231,0.5)'
    ctx.fillText(truncate(f.site, 36), ix, ty)
  }

  // URL under card
  if (f.domain) {
    drawUrlCaps(ctx, cardX, cardY + cardH + belowGap, f.domain, 'rgba(0,0,0,0.4)', urlSize)
  }
}

// ════════════════════════════════════════════════════════════════
// 5 — PAPER  (light bg · image card top · title + pub below, left)
// ════════════════════════════════════════════════════════════════
function drawPaper(ctx, w, h, f) {
  ctx.clearRect(0, 0, w, h)
  const land = w > h, mm = Math.min(w, h), pad = Math.round(mm * 0.08)

  ctx.fillStyle = '#F4F3F1'
  ctx.fillRect(0, 0, w, h)

  const cardW = land ? Math.round(w * 0.52) : w - pad * 2
  const cardH = Math.round(cardW / 1.5)

  const tx0 = pad + cardW + Math.round(mm * 0.07)
  const titleMaxW = land ? (w - tx0 - pad) : w - pad * 2
  const tStart = land ? Math.round(w * 0.042) : Math.round(w * 0.07)
  const t = fitText(ctx, f.title, titleMaxW, 3, tStart, 40, s => `700 ${s}px ${SANS}`)
  const titleLineH = t.size * 1.13
  const titleH = t.lines.length * titleLineH
  const subSize = Math.round(mm * 0.03)
  const urlSize = Math.round(mm * 0.022)

  const deckSize = Math.round(mm * 0.025)
  const deckLH = Math.round(deckSize * 1.3)
  let deckLines = []
  if (f.desc) {
    ctx.font = `400 ${deckSize}px ${SANS}`
    deckLines = wrapTextLines(ctx, truncate(f.desc, 120), titleMaxW).slice(0, 2)
  }
  const deckGap = deckLines.length ? Math.round(mm * 0.022) : 0
  const deckH = deckLines.length * deckLH
  const deckBlock = deckGap + deckH

  if (land) {
    // Side-by-side: image left, text right
    const gT = Math.round(mm * 0.04)   // title/deck → publication
    const gS = Math.round(mm * 0.03)   // publication → url
    let footerH = 0
    if (f.site) footerH += gT + subSize
    if (f.domain) footerH += (f.site ? gS : gT) + urlSize

    const y = (h - cardH) / 2
    drawPhotoCard(ctx, f.image, pad, y, cardW, cardH, 22, f.accent)
    const tx = pad + cardW + Math.round(mm * 0.07)
    let ty = y + Math.round((cardH - (titleH + deckBlock + footerH)) / 2)
    ctx.fillStyle = '#1A1A1A'; ctx.font = `700 ${t.size}px ${SANS}`; ctx.textBaseline = 'top'
    for (const line of t.lines) { ctx.fillText(line, tx, ty); ty += titleLineH }
    if (deckLines.length) {
      ty += deckGap
      ctx.font = `400 ${deckSize}px ${SANS}`; ctx.fillStyle = 'rgba(0,0,0,0.5)'
      for (const line of deckLines) { ctx.fillText(line, tx, ty); ty += deckLH }
    }
    if (f.site) {
      ty += gT
      ctx.font = `500 ${subSize}px ${SANS}`; ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillText(truncate(f.site, 30), tx, ty); ty += subSize
    }
    if (f.domain) {
      ty += f.site ? gS : gT
      drawUrlCaps(ctx, tx, ty + urlSize, f.domain, 'rgba(0,0,0,0.4)', urlSize)
    }
  } else {
    const gapA = Math.round(mm * 0.05)
    const gT = Math.round(mm * 0.035)  // title/deck → publication
    const gS = Math.round(mm * 0.03)   // publication → url
    let footerH = 0
    if (f.site) footerH += gT + subSize
    if (f.domain) footerH += (f.site ? gS : gT) + urlSize

    const total = cardH + gapA + titleH + deckBlock + footerH
    let y = (h - total) / 2
    drawPhotoCard(ctx, f.image, pad, y, cardW, cardH, 22, f.accent)
    y += cardH + gapA
    ctx.fillStyle = '#1A1A1A'; ctx.font = `700 ${t.size}px ${SANS}`; ctx.textBaseline = 'top'
    for (const line of t.lines) { ctx.fillText(line, pad, y); y += titleLineH }
    if (deckLines.length) {
      y += deckGap
      ctx.font = `400 ${deckSize}px ${SANS}`; ctx.fillStyle = 'rgba(0,0,0,0.5)'
      for (const line of deckLines) { ctx.fillText(line, pad, y); y += deckLH }
    }
    if (f.site) {
      y += gT
      ctx.font = `500 ${subSize}px ${SANS}`; ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillText(truncate(f.site, 36), pad, y); y += subSize
    }
    if (f.domain) {
      y += f.site ? gS : gT
      drawUrlCaps(ctx, pad, y + urlSize, f.domain, 'rgba(0,0,0,0.4)', urlSize)
    }
  }
}

// ════════════════════════════════════════════════════════════════
// 7 — HEADLINE  (solid sampled-color bg · big title · no image)
// ════════════════════════════════════════════════════════════════
function drawHeadline(ctx, w, h, f) {
  ctx.clearRect(0, 0, w, h)
  const land = w > h, mm = Math.min(w, h), pad = Math.round(mm * 0.085)
  const ink = f.accent.solidText
  const dim = ink === '#FFFFFF' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)'

  ctx.fillStyle = f.accent.solid
  ctx.fillRect(0, 0, w, h)

  // top label
  drawUrlCaps(ctx, pad, pad + Math.round(mm * 0.02), (f.site || '').toUpperCase(), dim, Math.round(mm * 0.024))

  const maxW = land ? w * 0.82 : w - pad * 2
  const start = land ? Math.round(w * 0.06) : Math.round(w * 0.1)
  const { size, lines } = fitText(ctx, f.title, maxW, land ? 4 : 6, start, 48, s => `700 ${s}px ${SANS}`)
  const lineH = size * 1.1
  const titleH = lines.length * lineH

  const deckSize = Math.round(mm * 0.03)
  const deckLH = Math.round(deckSize * 1.35)
  let deckLines = []
  if (f.desc) {
    ctx.font = `400 ${deckSize}px ${SANS}`
    deckLines = wrapTextLines(ctx, truncate(f.desc, 180), maxW).slice(0, 3)
  }
  const deckGap = deckLines.length ? Math.round(mm * 0.035) : 0
  const deckH = deckLines.length * deckLH

  let ty = (h - (titleH + deckGap + deckH)) / 2 - Math.round(mm * 0.02)

  ctx.fillStyle = ink
  ctx.font = `700 ${size}px ${SANS}`
  ctx.textBaseline = 'top'
  for (const line of lines) { ctx.fillText(line, pad, ty); ty += lineH }

  if (deckLines.length) {
    ty += deckGap
    ctx.font = `400 ${deckSize}px ${SANS}`
    ctx.fillStyle = dim
    for (const line of deckLines) { ctx.fillText(line, pad, ty); ty += deckLH }
  }

  drawUrlCaps(ctx, pad, h - pad, f.domain, dim, Math.round(mm * 0.022))
}

// ════════════════════════════════════════════════════════════════
// 8 — QUOTE  (light sampled-tint bg · big quote · url)
// ════════════════════════════════════════════════════════════════
function drawQuote(ctx, w, h, f) {
  ctx.clearRect(0, 0, w, h)
  const land = w > h, mm = Math.min(w, h), pad = Math.round(mm * 0.09)

  ctx.fillStyle = f.accent.tint
  ctx.fillRect(0, 0, w, h)

  // big quote mark
  ctx.font = `700 ${Math.round(mm * 0.3)}px Georgia, serif`
  ctx.fillStyle = f.accent.soft
  ctx.globalAlpha = 0.5
  ctx.textBaseline = 'top'
  ctx.fillText('“', pad - Math.round(mm * 0.02), land ? pad * 0.4 : pad)
  ctx.globalAlpha = 1

  const maxW = land ? w * 0.76 : w - pad * 2
  const start = land ? Math.round(w * 0.05) : Math.round(w * 0.088)
  const { size, lines } = fitText(ctx, f.title, maxW, 6, start, 50, s => `700 ${s}px ${SANS}`)
  const lineH = size * 1.16
  const titleH = lines.length * lineH

  const deckSize = Math.round(mm * 0.03)
  const deckLH = Math.round(deckSize * 1.32)
  let deckLines = []
  if (f.desc) {
    ctx.font = `italic 400 ${deckSize}px ${SANS}`
    deckLines = wrapTextLines(ctx, truncate(f.desc, 140), maxW).slice(0, 2)
  }
  const deckGap = deckLines.length ? Math.round(mm * 0.035) : 0
  const deckH = deckLines.length * deckLH

  let ty = (h - (titleH + deckGap + deckH)) / 2 - (land ? 0 : Math.round(mm * 0.03))

  ctx.fillStyle = '#1A1A1A'
  ctx.font = `700 ${size}px ${SANS}`
  ctx.textBaseline = 'top'
  for (const line of lines) { ctx.fillText(line, pad, ty); ty += lineH }

  if (deckLines.length) {
    ty += deckGap
    ctx.font = `italic 400 ${deckSize}px ${SANS}`
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    for (const line of deckLines) { ctx.fillText(line, pad, ty); ty += deckLH }
  }

  // byline: publication + url
  ctx.font = `600 ${Math.round(mm * 0.03)}px ${SANS}`
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillText(truncate(f.site, 36), pad, h - pad - Math.round(mm * 0.06))
  drawUrlCaps(ctx, pad, h - pad, f.domain, 'rgba(0,0,0,0.42)', Math.round(mm * 0.021))
}

// ── Placeholder ───────────────────────────────────────────────────
function drawPlaceholder(ctx, w, h) {
  ctx.fillStyle = '#F4F3F1'
  ctx.fillRect(0, 0, w, h)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${Math.round(Math.min(w, h) * 0.2)}px Georgia, serif`
  ctx.fillStyle = 'rgba(0,0,0,0.1)'
  ctx.fillText('“', w / 2, h / 2 - Math.min(w, h) * 0.14)

  ctx.font = `600 ${Math.round(Math.min(w, h) * 0.035)}px ${SANS}`
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillText('Paste a blog URL to begin', w / 2, h / 2 + 40)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

function renderPlaceholders() {
  drawPlaceholder(mainCtx, W, H)
  document.querySelectorAll('.template-thumb canvas').forEach(c => {
    drawPlaceholder(c.getContext('2d'), W, H)
  })
}

// ── Headless batch render (used by `electron . --render`) ─────────
// Fetches a post, loads its imagery, and returns every requested
// template × format as JPEG base64 for the main process to write.
window.renderCards = async function (opts) {
  const data = await window.api.fetchPost(opts.url)
  postData = data

  metaTitle.value = data.title || ''
  metaDesc.value = truncate(data.description || '', 160)
  metaSite.value = data.siteName || data.author || ''
  try { metaUrl.value = new URL(opts.url).hostname.replace(/^www\./, '').toUpperCase() } catch { metaUrl.value = '' }
  if (opts.site) metaSite.value = opts.site
  if (opts.domain) metaUrl.value = opts.domain.toUpperCase()
  descToggle.checked = opts.showDesc !== false
  siteToggle.checked = opts.showSite !== false
  urlToggle.checked = opts.showUrl !== false

  // Load imagery + sample the accent color
  heroImageBitmap = null
  avatarBitmap = null
  accentColors = FALLBACK_ACCENT
  if (data.image) {
    const b64 = await window.api.fetchImage(data.image)
    if (b64) {
      heroImageBitmap = await bitmapFrom(b64)
      if (heroImageBitmap) accentColors = computeAccent(heroImageBitmap)
    }
  }

  const fields = getFields()
  const slug = (data.title || 'card').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'card'

  const tplIdx = opts.templates === 'all' || !opts.templates
    ? TEMPLATES.map((_, i) => i) : opts.templates
  const fmtKeys = opts.formats === 'all' || !opts.formats
    ? Object.keys(FORMATS) : opts.formats

  const out = []
  for (const fmt of fmtKeys) {
    const dim = FORMATS[fmt]
    if (!dim) continue
    for (const idx of tplIdx) {
      const tpl = TEMPLATES[idx]
      if (!tpl) continue
      const c = document.createElement('canvas')
      c.width = dim.w
      c.height = dim.h
      tpl.draw(c.getContext('2d'), dim.w, dim.h, fields)
      const dataUrl = c.toDataURL('image/jpeg', 0.95)
      const tname = tpl.name.toLowerCase().replace(/\s+/g, '-')
      out.push({ filename: `${slug}-${tname}-${fmt}.jpg`, base64: dataUrl.split(',')[1] })
    }
  }
  return out
}

// ── Boot ──────────────────────────────────────────────────────────
buildTemplateThumbs()
applyFormat('story')
sizePreview()
renderPlaceholders()
