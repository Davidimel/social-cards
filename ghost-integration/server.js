// Social Cards — Ghost integration
// Receives Ghost's `post.published` webhook, renders all 8 cards by driving
// the Social Cards app in headless mode, then saves them to a folder and
// (optionally) emails them.

const express = require('express')
const { execFile } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const nodemailer = require('nodemailer')
const archiver = require('archiver')
require('dotenv').config()

const CONFIG = {
  port: Number(process.env.PORT || 4747),
  secret: process.env.WEBHOOK_SECRET || '',
  outputDir: process.env.OUTPUT_DIR || path.join(os.homedir(), 'SocialCards'),
  appDir: process.env.APP_DIR || path.join(__dirname, '..'),
  electronBin: process.env.ELECTRON_BIN || path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
  templates: process.env.TEMPLATES || 'all',
  formats: process.env.FORMATS || 'all',
  showTagline: String(process.env.SHOW_TAGLINE).toLowerCase() !== 'false',
  email: {
    enabled: String(process.env.EMAIL_ENABLED).toLowerCase() === 'true',
    to: process.env.EMAIL_TO,
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
}

const app = express()
app.use(express.json({ limit: '2mb' }))

app.get('/', (_req, res) => res.send('Social Cards · Ghost integration is running.'))

// Ghost fires this on post.published. Payload: { post: { current: {...} } }
app.post('/webhook', (req, res) => {
  // Optional shared-secret check (?secret=… or X-Secret header)
  if (CONFIG.secret) {
    const provided = req.query.secret || req.headers['x-secret']
    if (provided !== CONFIG.secret) return res.status(401).send('bad secret')
  }

  const current = (req.body && req.body.post && req.body.post.current) || {}
  const url = current.url
  const title = current.title || 'card'
  if (!url) return res.status(400).send('no post url in payload')

  // Acknowledge immediately — rendering takes a few seconds.
  res.status(202).send('accepted')
  processPost(url, title).catch(err => console.error('[process] failed:', err))
})

async function processPost(url, title) {
  const slug = slugify(title)
  const stamp = new Date().toISOString().slice(0, 10)
  const outDir = path.join(CONFIG.outputDir, `${stamp}-${slug}`)
  fs.mkdirSync(outDir, { recursive: true })

  console.log(`[render] "${title}" → ${outDir}`)
  await renderCards(url, outDir)

  const files = fs.readdirSync(outDir).filter(f => f.endsWith('.jpg')).map(f => path.join(outDir, f))
  console.log(`[render] generated ${files.length} card(s)`)

  if (CONFIG.email.enabled && files.length) {
    try {
      await emailCards(title, url, outDir, files)
      console.log(`[email] sent to ${CONFIG.email.to}`)
    } catch (err) {
      console.error('[email] failed:', err.message)
    }
  }
}

// Drive the Social Cards app headlessly to produce the JPGs.
function renderCards(url, outDir) {
  return new Promise((resolve, reject) => {
    const args = [
      CONFIG.appDir, '--render',
      `--url=${url}`,
      `--out=${outDir}`,
      `--templates=${CONFIG.templates}`,
      `--formats=${CONFIG.formats}`
    ]
    if (!CONFIG.showTagline) args.push('--showDesc=false')
    execFile(CONFIG.electronBin, args, { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || stdout || err.message))
      resolve(stdout)
    })
  })
}

async function emailCards(title, url, outDir, files) {
  const transporter = nodemailer.createTransport({
    host: CONFIG.email.host,
    port: CONFIG.email.port,
    secure: CONFIG.email.port === 465,
    auth: { user: CONFIG.email.user, pass: CONFIG.email.pass }
  })

  // Zip all cards into one attachment to keep the email tidy.
  const zipPath = path.join(outDir, `${slugify(title)}-cards.zip`)
  await zipFiles(files, zipPath)

  await transporter.sendMail({
    from: CONFIG.email.from,
    to: CONFIG.email.to,
    subject: `🖼  Social cards ready — ${title}`,
    text: `Your social cards for "${title}" are ready.\n\nPost: ${url}\nGenerated: ${files.length} images (all templates × formats)\nSaved to: ${outDir}\n\nThey're attached as a zip.`,
    attachments: [{ filename: path.basename(zipPath), path: zipPath }]
  })
}

function zipFiles(files, zipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    output.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(output)
    for (const f of files) archive.file(f, { name: path.basename(f) })
    archive.finalize()
  })
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'card'
}

app.listen(CONFIG.port, () => {
  console.log(`Social Cards · Ghost integration listening on http://localhost:${CONFIG.port}`)
  console.log(`  Output folder : ${CONFIG.outputDir}`)
  console.log(`  Email         : ${CONFIG.email.enabled ? CONFIG.email.to : 'disabled'}`)
  console.log(`  Webhook URL   : POST /webhook${CONFIG.secret ? '?secret=…' : ''}`)
})
