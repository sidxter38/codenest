import nodemailer from 'nodemailer'

function createTransport() {
  const host = process.env.SMTP_HOST || process.env.EMAIL_HOST
  const port = parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT || '587', 10)
  const user = process.env.SMTP_USER || process.env.EMAIL_USER
  const pass = process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD

  if (!host || !user || !pass) {
    // Development fallback: log email to console
    return null
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false
    }
  })
}

async function sendMail(to: string, subject: string, html: string, textFallback?: string) {
  const transport = createTransport()
  const from = process.env.SMTP_FROM || `"CodeNest" <${process.env.SMTP_USER || process.env.EMAIL_USER || 'noreply@codenest.dev'}>`

  if (!transport) {
    console.log(`\n================== [CodeNest Dev Mailer] ==================`)
    console.log(`To:      ${to}`)
    console.log(`From:    ${from}`)
    console.log(`Subject: ${subject}`)
    if (textFallback) {
      console.log(`Content:\n${textFallback}`)
    } else {
      console.log(`Body:    ${html.replace(/<[^>]+>/g, '').trim()}`)
    }
    console.log(`===========================================================\n`)
    return
  }

  try {
    const info = await transport.sendMail({
      from,
      to,
      subject,
      text: textFallback || html.replace(/<[^>]+>/g, '').trim(),
      html
    })
    console.log(`✉️ [CodeNest Mailer] Email sent successfully to ${to}. MessageId: ${info.messageId}`)
  } catch (err: any) {
    console.error(`❌ [CodeNest Mailer Error] Failed to send email to ${to}:`, err.message || err)
  }
}

/**
 * Send 6-digit OTP email verification code
 */
export async function sendOTPEmail(email: string, name: string, otp: string) {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; background: #0f172e; color: #EAFBFF; padding: 40px; border-radius: 16px; border: 1px solid rgba(122, 220, 240, 0.25);">
      <div style="display: flex; align-items: center; margin-bottom: 24px;">
        <h1 style="color: #7ADCF0; font-size: 26px; margin: 0; letter-spacing: -0.02em;">CodeNest</h1>
      </div>
      <p style="color: #b6cceb; font-size: 14px; margin-top: 0; margin-bottom: 24px;">Where code comes together.</p>

      <h2 style="color: #EAFBFF; font-size: 20px; font-weight: 600; margin-bottom: 12px;">Verify your account</h2>
      <p style="color: #b6cceb; font-size: 15px; line-height: 1.6;">Hi ${name}, welcome to CodeNest. Please use the following 6-digit verification code to activate your account:</p>

      <div style="background: rgba(28, 42, 82, 0.9); border: 2px dashed #7ADCF0; border-radius: 12px; padding: 24px; text-align: center; margin: 28px 0;">
        <span style="font-family: monospace; font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #7ADCF0;">${otp}</span>
      </div>

      <p style="color: #7b97c4; font-size: 13px; line-height: 1.5; margin-bottom: 8px;">
        • This one-time code expires in <strong>10 minutes</strong>.<br />
        • If you did not sign up for CodeNest, please ignore this email.
      </p>
    </div>
  `

  await sendMail(email, `${otp} is your CodeNest verification code`, html, `Your CodeNest verification code is: ${otp} (expires in 10 minutes).`)
}

export async function sendPasswordResetEmail(email: string, name: string, token: string) {
  const frontendUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:3000'
  const link = `${frontendUrl}/reset-password?token=${token}`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; background: #0f172e; color: #EAFBFF; padding: 40px; border-radius: 16px; border: 1px solid rgba(122, 220, 240, 0.25);">
      <h1 style="color: #7ADCF0; font-size: 24px; margin-bottom: 8px;">CodeNest</h1>
      <h2 style="font-size: 20px; margin-bottom: 12px;">Reset your password</h2>
      <p style="color: #b6cceb;">Hi ${name}, you requested a password reset. Click below to set a new password.</p>
      <a href="${link}" style="display: inline-block; background: #7ADCF0; color: #0b142c; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700; margin: 24px 0;">
        Reset Password
      </a>
      <p style="color: #7b97c4; font-size: 13px;">This link expires in 1 hour. If you did not request a reset, ignore this email.</p>
    </div>
  `

  await sendMail(email, 'Reset your CodeNest password', html)
}

export async function sendWorkspaceInviteEmail(
  email: string,
  inviterName: string,
  workspaceName: string,
  workspaceCode: string
) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
  const link = `${frontendUrl}/workspace/${workspaceCode}`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; background: #0f172e; color: #EAFBFF; padding: 40px; border-radius: 16px; border: 1px solid rgba(122, 220, 240, 0.25);">
      <h1 style="color: #7ADCF0; font-size: 24px; margin-bottom: 8px;">CodeNest</h1>
      <h2 style="font-size: 20px; margin-bottom: 12px;">You've been invited to collaborate</h2>
      <p style="color: #b6cceb;"><strong>${inviterName}</strong> has invited you to collaborate in <strong>${workspaceName}</strong>.</p>
      <p style="color: #b6cceb;">Workspace Code: <strong style="color: #7ADCF0; font-size: 18px;">${workspaceCode}</strong></p>
      <a href="${link}" style="display: inline-block; background: #7ADCF0; color: #0b142c; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700; margin: 20px 0;">
        Join Workspace
      </a>
    </div>
  `

  await sendMail(email, `You're invited to collaborate on CodeNest (${workspaceCode})`, html)
}

export async function sendInvitationEmail(
  email: string,
  inviterName: string,
  projectName: string,
  inviteToken: string
) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
  const link = `${frontendUrl}/invitations/${inviteToken}`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; background: #0f172e; color: #EAFBFF; padding: 40px; border-radius: 16px; border: 1px solid rgba(122, 220, 240, 0.25);">
      <h1 style="color: #7ADCF0; font-size: 24px; margin-bottom: 8px;">CodeNest</h1>
      <h2 style="font-size: 20px; margin-bottom: 12px;">Project Invitation</h2>
      <p style="color: #b6cceb;"><strong>${inviterName}</strong> has invited you to join the project <strong>${projectName}</strong>.</p>
      <a href="${link}" style="display: inline-block; background: #7ADCF0; color: #0b142c; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700; margin: 20px 0;">
        Accept Invitation
      </a>
    </div>
  `

  await sendMail(email, `You're invited to join ${projectName} on CodeNest`, html)
}

