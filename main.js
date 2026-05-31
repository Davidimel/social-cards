const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const https = require('https')
const http = require('http')
const { URL } = require('url')

// Headless render mode: `electron . --render --url=… --out=… [--templates=all] [--formats=all]`
const HEADLESS = process.argv.includes('--render')
// Icon generation mode: `electron . --make-icon --out=icon_1024.png`
const MAKE_ICON = process.argv.includes('--make-icon')

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 900,
    minHeight: 700,
    backgroundColor: '#0f0f0f',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Social Cards'
  })

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

app.whenReady().then(() => {
  if (MAKE_ICON) runMakeIcon()
  else if (HEADLESS) runHeadless()
  else createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !HEADLESS && !MAKE_ICON) app.quit()
})

app.on('activate', () => {
  if (!HEADLESS && !MAKE_ICON && BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ── Icon generation ───────────────────────────────────────────────
async function runMakeIcon() {
  const o = {}
  for (const a of process.argv) {
    const m = a.match(/^--([^=]+)=(.*)$/)
    if (m) o[m[1]] = m[2]
  }
  const out = o.out || path.join(__dirname, 'build', 'icon_1024.png')
  const win = new BrowserWindow({ show: false, width: 1100, height: 1100, webPreferences: { offscreen: true } })
  try {
    await win.loadFile(path.join(__dirname, 'renderer', 'icon.html'))
    const dataUrl = await win.webContents.executeJavaScript('window.__icon()')
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'))
    console.log('[icon] wrote', out)
    app.exit(0)
  } catch (err) {
    console.error('[icon] error:', err && err.message ? err.message : err)
    app.exit(1)
  }
}

// ── Headless batch render ─────────────────────────────────────────
function parseRenderArgs() {
  const o = {}
  for (const a of process.argv) {
    const m = a.match(/^--([^=]+)=(.*)$/)
    if (m) o[m[1]] = m[2]
  }
  return {
    url: o.url,
    out: o.out || process.cwd(),
    templates: o.templates && o.templates !== 'all' ? o.templates.split(',').map(Number) : 'all',
    formats: o.formats && o.formats !== 'all' ? o.formats.split(',') : 'all',
    showDesc: o.showDesc !== 'false',
    showSite: o.showSite !== 'false',
    showUrl: o.showUrl !== 'false'
  }
}

async function runHeadless() {
  const opts = parseRenderArgs()
  if (!opts.url) {
    console.error('[render] missing --url')
    return app.exit(2)
  }
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 1200,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true
    }
  })
  try {
    await win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { search: 'headless=1' })
    const results = await win.webContents.executeJavaScript(`window.renderCards(${JSON.stringify(opts)})`)
    fs.mkdirSync(opts.out, { recursive: true })
    const files = []
    for (const r of results) {
      const p = path.join(opts.out, r.filename)
      fs.writeFileSync(p, Buffer.from(r.base64, 'base64'))
      files.push(p)
    }
    console.log(JSON.stringify({ ok: true, count: files.length, files }))
    app.exit(0)
  } catch (err) {
    console.error('[render] error:', err && err.message ? err.message : err)
    app.exit(1)
  }
}

// Fetch URL and extract Open Graph / meta data
ipcMain.handle('fetch-post', async (event, url) => {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(url)
      const protocol = parsedUrl.protocol === 'https:' ? https : http

      const req = protocol.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        },
        timeout: 10000
      }, (res) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url).toString()
          ipcMain.emit('fetch-post', event, redirectUrl)
          resolve(ipcMain.handle('fetch-post', event, redirectUrl))
          return
        }

        let html = ''
        res.setEncoding('utf8')
        res.on('data', chunk => {
          html += chunk
          if (html.length > 500000) res.destroy() // cap at 500kb
        })
        res.on('end', () => {
          resolve(parseMetadata(html, url))
        })
      })

      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Request timed out'))
      })
    } catch (err) {
      reject(err)
    }
  })
})

function parseMetadata(html, url) {
  const get = (pattern) => {
    const m = html.match(pattern)
    // value is always the last capture group (handles the quote-backreference patterns)
    return m ? decodeHtmlEntities(m[m.length - 1].trim()) : null
  }

  const title =
    get(/<meta[^>]+property=["']og:title["'][^>]+content=(["'])(.*?)\1/i) ||
    get(/<meta[^>]+content=(["'])(.*?)\1[^>]+property=["']og:title["']/i) ||
    get(/<title[^>]*>([^<]+)<\/title>/i) ||
    'Untitled Post'

  const description =
    get(/<meta[^>]+property=["']og:description["'][^>]+content=(["'])(.*?)\1/i) ||
    get(/<meta[^>]+content=(["'])(.*?)\1[^>]+property=["']og:description["']/i) ||
    get(/<meta[^>]+name=["']description["'][^>]+content=(["'])(.*?)\1/i) ||
    get(/<meta[^>]+content=(["'])(.*?)\1[^>]+name=["']description["']/i) ||
    ''

  const image =
    get(/<meta[^>]+property=["']og:image["'][^>]+content=(["'])(.*?)\1/i) ||
    get(/<meta[^>]+content=(["'])(.*?)\1[^>]+property=["']og:image["']/i) ||
    null

  const siteName =
    get(/<meta[^>]+property=["']og:site_name["'][^>]+content=(["'])(.*?)\1/i) ||
    get(/<meta[^>]+content=(["'])(.*?)\1[^>]+property=["']og:site_name["']/i) ||
    new URL(url).hostname.replace('www.', '')

  const author =
    get(/<meta[^>]+name=["']author["'][^>]+content=(["'])(.*?)\1/i) ||
    get(/<meta[^>]+content=(["'])(.*?)\1[^>]+name=["']author["']/i) ||
    get(/<[^>]+class=["'][^"']*author[^"']*["'][^>]*>([^<]{2,60})<\//i) ||
    null

  // Publication icon / avatar (prefer high-res apple-touch-icon)
  const iconHref =
    get(/<link[^>]+rel=["']apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i) ||
    get(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon[^"']*["']/i) ||
    get(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i) ||
    get(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i)

  // Resolve relative image URL
  let resolvedImage = image
  if (image && !image.startsWith('http')) {
    try {
      resolvedImage = new URL(image, url).toString()
    } catch {
      resolvedImage = null
    }
  }

  // Resolve icon, with Google favicon service as a reliable fallback
  let resolvedIcon = null
  const host = new URL(url).hostname
  if (iconHref) {
    try {
      resolvedIcon = new URL(iconHref, url).toString()
    } catch {
      resolvedIcon = null
    }
  }
  if (!resolvedIcon) {
    resolvedIcon = `https://www.google.com/s2/favicons?domain=${host}&sz=128`
  }

  // Derive a Substack-style handle from the domain
  const handle = '@' + host.replace('www.', '').split('.')[0]

  return { title, description, image: resolvedImage, icon: resolvedIcon, siteName, author, handle, url }
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
}

// Save card to disk
ipcMain.handle('save-card', async (event, dataUrl) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Save Card',
    defaultPath: path.join(app.getPath('desktop'), 'story-card.jpg'),
    filters: [{ name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }]
  })

  if (canceled || !filePath) return { success: false }

  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
  return { success: true, filePath }
})

// Fetch image as base64 for canvas rendering
ipcMain.handle('fetch-image', async (event, url) => {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url)
      const protocol = parsedUrl.protocol === 'https:' ? https : http

      const req = protocol.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 8000
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(null)
          return
        }

        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => {
          const buffer = Buffer.concat(chunks)
          const contentType = res.headers['content-type'] || 'image/jpeg'
          const base64 = buffer.toString('base64')
          resolve(`data:${contentType};base64,${base64}`)
        })
      })

      req.on('error', () => resolve(null))
      req.on('timeout', () => { req.destroy(); resolve(null) })
    } catch {
      resolve(null)
    }
  })
})
