// In-memory OTP manager with TTL and attempt throttling
// No database schema changes needed

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5; // Max 5 verification attempts before invalidation
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute between OTP requests

/**
 * Map: normalizedEmail -> { otp: string, expiresAt: number, attempts: number, lastSentAt: number }
 */
const otpStore = new Map();

// Periodic cleanup of expired OTPs every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [email, record] of otpStore.entries()) {
    if (record.expiresAt < now) {
      otpStore.delete(email);
    }
  }
}, 5 * 60 * 1000).unref();

/**
 * Generates a random 6-digit numeric OTP string
 * @returns {string}
 */
const generateNumericOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Creates or overwrites an OTP for an email address
 * @param {string} email
 * @returns {{ otp: string, expiresAt: number }}
 */
const createOtp = (email, ignoreCooldown = false) => {
  const normalizedEmail = email.toLowerCase().trim();
  const now = Date.now();
  const existing = otpStore.get(normalizedEmail);

  if (!ignoreCooldown && process.env.NODE_ENV !== 'test' && existing && now - existing.lastSentAt < RESEND_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((RESEND_COOLDOWN_MS - (now - existing.lastSentAt)) / 1000);
    const error = new Error(`Please wait ${remainingSeconds} seconds before requesting a new OTP.`);
    error.code = 'OTP_RATE_LIMITED';
    error.statusCode = 429;
    throw error;
  }

  const otp = generateNumericOtp();
  const expiresAt = now + OTP_EXPIRY_MS;

  otpStore.set(normalizedEmail, {
    otp,
    expiresAt,
    attempts: 0,
    lastSentAt: now,
  });

  return { otp, expiresAt };
};

/**
 * Verifies an OTP for a given email address
 * @param {string} email
 * @param {string} otp
 * @returns {boolean}
 */
const verifyOtp = (email, otp) => {
  const normalizedEmail = email.toLowerCase().trim();
  const record = otpStore.get(normalizedEmail);

  if (!record) {
    const error = new Error('No OTP request found for this email or OTP has expired');
    error.code = 'OTP_NOT_FOUND';
    error.statusCode = 400;
    throw error;
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(normalizedEmail);
    const error = new Error('OTP has expired. Please request a new one.');
    error.code = 'OTP_EXPIRED';
    error.statusCode = 400;
    throw error;
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(normalizedEmail);
    const error = new Error('Maximum OTP verification attempts exceeded. Please request a new OTP.');
    error.code = 'MAX_ATTEMPTS_EXCEEDED';
    error.statusCode = 429;
    throw error;
  }

  if (record.otp !== otp.trim()) {
    record.attempts += 1;
    const remaining = MAX_ATTEMPTS - record.attempts;
    const error = new Error(`Invalid OTP. ${remaining} attempt(s) remaining.`);
    error.code = 'INVALID_OTP';
    error.statusCode = 400;
    throw error;
  }

  return true;
};

/**
 * Clears/invalidates an OTP after successful password reset
 * @param {string} email
 */
const clearOtp = (email) => {
  const normalizedEmail = email.toLowerCase().trim();
  otpStore.delete(normalizedEmail);
};

module.exports = {
  createOtp,
  verifyOtp,
  clearOtp,
  OTP_EXPIRY_MS,
};
