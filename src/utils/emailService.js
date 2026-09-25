// Email notification service helper
// Dispatches password reset OTP emails using Nodemailer with HTML templates and development fallback
const nodemailer = require('nodemailer');
const env = require('../config/env.config');

let transporter = null;

/**
 * Initializes and returns a cached Nodemailer transporter instance
 * @returns {nodemailer.Transporter | null}
 */
const getTransporter = () => {
  const smtpUser = process.env.SMTP_USER || env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS || env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || env.SMTP_PORT || '465', 10);
  const isSecure = smtpPort === 465 || (process.env.SMTP_SECURE || env.SMTP_SECURE) === 'true';

  if (transporter) {
    return transporter;
  }

  if (smtpUser && smtpPass) {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: isSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
    return transporter;
  }

  return null;
};

/**
 * Generates an attractive HTML template for the OTP email
 * @param {string} otp
 * @param {number} expiryMinutes
 * @returns {string} HTML email string
 */
const getOtpEmailTemplate = (otp, expiryMinutes) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset OTP</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f9; color: #333333;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f6f9; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 520px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">FitConnect</h1>
              <p style="color: #d1fae5; margin: 6px 0 0 0; font-size: 14px;">AI-Powered Fitness & Sports Coaching</p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 35px 30px;">
              <h2 style="color: #1f2937; margin: 0 0 12px 0; font-size: 20px; font-weight: 600;">Password Reset Request</h2>
              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
                We received a request to reset the password for your FitConnect account. Use the one-time verification code (OTP) below to proceed:
              </p>

              <!-- OTP Box -->
              <div style="background-color: #f0fdf4; border: 2px dashed #10b981; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 24px;">
                <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #047857; letter-spacing: 1px; margin-bottom: 6px;">Your Verification Code</div>
                <div style="font-size: 34px; font-weight: 800; color: #065f46; letter-spacing: 8px; font-family: monospace;">${otp}</div>
                <div style="font-size: 13px; color: #6b7280; margin-top: 8px;">⏳ Expires in <strong>${expiryMinutes} minutes</strong></div>
              </div>

              <!-- Security Notice -->
              <p style="color: #6b7280; font-size: 13px; line-height: 1.5; margin: 0 0 10px 0;">
                🔒 <strong>Security Tip:</strong> Never share this OTP with anyone. FitConnect will never ask you for your OTP.
              </p>
              <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; margin: 0;">
                If you did not request this password reset, please ignore this email or ensure your account is secure.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 30px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                &copy; ${new Date().getFullYear()} FitConnect. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

/**
 * Sends a password reset OTP to user's email
 * @param {string} toEmail
 * @param {string} otp
 * @param {number} expiryMinutes
 * @returns {Promise<{ sent: boolean, mode: string }>}
 */
const sendPasswordResetOtpEmail = async (toEmail, otp, expiryMinutes = 10) => {
  const subject = 'Your Password Reset OTP - FitConnect';
  const mailTransporter = getTransporter();

  // Always log to console in development so testing is smooth
  console.log(`\n======================================================`);
  console.log(`[FitConnect Mailer] Password Reset OTP`);
  console.log(`To: ${toEmail}`);
  console.log(`OTP Code: ${otp}`);
  console.log(`Expires in: ${expiryMinutes} minutes`);
  console.log(`======================================================\n`);

  if (mailTransporter) {
    try {
      const fromAddress = process.env.EMAIL_FROM || env.EMAIL_FROM || (process.env.SMTP_USER ? `"FitConnect" <${process.env.SMTP_USER}>` : '"FitConnect" <noreply@fitconnect.com>');
      const mailOptions = {
        from: fromAddress,
        to: toEmail,
        subject,
        text: `Your FitConnect Password Reset OTP is: ${otp}. It expires in ${expiryMinutes} minutes. If you did not request this, please ignore.`,
        html: getOtpEmailTemplate(otp, expiryMinutes),
      };

      const info = await mailTransporter.sendMail(mailOptions);
      console.log(`✅ [Mailer]: Real email successfully sent to ${toEmail} (Message ID: ${info.messageId})`);
      return { sent: true, mode: 'smtp', messageId: info.messageId };
    } catch (mailError) {
      console.error(`❌ [Mailer Error]: Failed to send email via SMTP to ${toEmail}:`, mailError.message);
      // Fall back gracefully so flow does not crash if SMTP is temporarily down
      return { sent: false, mode: 'smtp_failed', error: mailError.message };
    }
  }

  // When SMTP is not configured in .env
  console.log(`ℹ️ [Mailer Info]: SMTP credentials not set in .env. Using console OTP mode.`);
  return {
    sent: true,
    mode: 'development_console',
  };
};

module.exports = {
  sendPasswordResetOtpEmail,
};
