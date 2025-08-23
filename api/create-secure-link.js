import { getStorage, setStorage, encrypt, generateSecureId, cleanExpiredLinks } from '../lib/storage.js';

export default async function handler(req, res) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url, expiryHours } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const secureId = generateSecureId();
    const encryptedUrl = encrypt(url);
    
    let expiresAt = null;
    if (expiryHours > 0) {
      expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + expiryHours);
    }

    const linkData = {
      encryptedUrl,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      accessCount: 0,
      lastAccessed: null
    };

    let storage = await getStorage();
    storage = cleanExpiredLinks(storage);
    storage[secureId] = linkData;
    await setStorage(storage);

    console.log(`Created secure link: ${secureId}`);

    res.json({
      secureId,
      expiresAt: linkData.expiresAt,
      message: 'Secure link created successfully'
    });

  } catch (error) {
    console.error('Error creating secure link:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
