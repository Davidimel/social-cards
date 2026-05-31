// Quick check that your email settings work. Run: node test-email.js
require('dotenv').config()
const nodemailer = require('nodemailer')

const t = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
})

t.sendMail({
  from: process.env.EMAIL_FROM,
  to: process.env.EMAIL_TO,
  subject: 'Social Cards — email test ✅',
  text: 'If you can read this, your Social Cards email is working!\n\nAfter you publish a post on Ghost, you\'ll get an email like this with all your cards attached as a zip.'
}).then(info => {
  console.log('OK — test email sent:', info.messageId)
  process.exit(0)
}).catch(err => {
  console.error('FAIL —', err.message)
  process.exit(1)
})
