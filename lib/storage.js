// For Vercel, we'll use a simple approach with edge config or KV
// This is a fallback in-memory storage that works with serverless

let memoryStorage = {};

export async function getStorage() {
  // In production, you'd use Vercel KV or external database
  // For now, we'll use a simple approach
  return memoryStorage;
}

export async function setStorage(data) {
  memoryStorage = { ...data };
  // In production, save to Vercel KV or database
  return true;
}

export function encrypt(text) {
  const crypto = require('crypto');
  const key = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher('aes-256-cbc', key);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(encryptedText) {
  try {
    const crypto = require('crypto');
    const key = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
    const [ivHex, encrypted] = encryptedText.split(':');
    const decipher = crypto.createDecipher('aes-256-cbc', key);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    return null;
  }
}

export function generateSecureId() {
  const crypto = require('crypto');
  return 'sv_' + crypto.randomBytes(16).toString('hex') + '_' + Date.now().toString(36);
}

export function cleanExpiredLinks(storage) {
  const now = new Date();
  const cleaned = {};
  
  for (const [id, data] of Object.entries(storage)) {
    if (!data.expiresAt || new Date(data.expiresAt) > now) {
      cleaned[id] = data;
    }
  }
  
  return cleaned;
}
