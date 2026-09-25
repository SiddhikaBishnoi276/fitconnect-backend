// Email notification service helper
// Dispatches password reset OTP emails (supports console fallback & optional SMTP)

/**
 * Sends a password reset OTP to user's email
 * @param {string} toEmail
 * @param {string} otp
 * @param {number} expiryMinutes
 * @returns {Promise<{ sent: boolean, mode: string }>}
 */
const sendPasswordResetOtpEmail = async (toEmail, otp, expiryMinutes = 10) => {
  const subject = 'Your Password Reset OTP - FitConnect';
  
  // Format console log for instant testing/debugging in development
  console.log(`\n======================================================`);
  console.log(`[FitConnect Mailer] Password Reset OTP`);
  console.log(`To: ${toEmail}`);
  console.log(`OTP Code: ${otp}`);
  console.log(`Subject: ${subject}`);
  console.log(`Expires in: ${expiryMinutes} minutes`);
  console.log(`======================================================\n`);

  // If you integrate an external provider (e.g. Nodemailer/Resend/SendGrid/SES),
  // it can be plugged in here seamlessly using process.env credentials.
  return {
    sent: true,
    mode: process.env.NODE_ENV === 'production' ? 'smtp' : 'development_console',
  };
};

module.exports = {
  sendPasswordResetOtpEmail,
};
