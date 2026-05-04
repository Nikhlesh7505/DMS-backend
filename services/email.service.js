const nodemailer = require('nodemailer')

let transporter = null

const hasSmtpConfig = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)

const getTransporter = () => {
  if (!hasSmtpConfig()) {
    return null
  }

  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587)

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    })
  }

  return transporter
}

const sendMail = async ({ to, subject, html, text }) => {
  const mailer = getTransporter()

  if (!mailer) {
    throw new Error('SMTP is not configured. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.')
  }

  return mailer.sendMail({
    from: `"Disaster Management System" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
    text
  })
}

const sendOtpEmail = async ({ to, name = 'there', otp, purpose = 'verification' }) => {
  const escapedName = String(name || 'there')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  const subject =
    purpose === 'password_reset'
      ? 'Your password reset OTP'
      : 'Your email verification OTP'

  const text = `Hi ${name || 'there'}, your Disaster Management System OTP is ${otp}. It expires in 10 minutes.`

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111827;">
      <h2 style="margin-bottom: 8px;">Disaster Management System</h2>
      <p>Hi ${escapedName},</p>
      <p>Your ${purpose === 'password_reset' ? 'password reset' : 'email verification'} OTP is:</p>
      <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; padding: 16px 20px; background: #f3f4f6; border-radius: 8px; display: inline-block;">
        ${otp}
      </div>
      <p style="margin-top: 20px;">This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>
    </div>
  `

  return sendMail({ to, subject, text, html })
}

module.exports = {
  hasSmtpConfig,
  sendMail,
  sendOtpEmail
}
