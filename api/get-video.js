import { getStorage, setStorage, decrypt, cleanExpiredLinks } from '../lib/storage.js';

export default async function handler(req, res) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { secureId } = req.query;

    if (!secureId || !secureId.startsWith('sv_')) {
      return res.status(400).json({ error: 'Invalid secure ID format' });
    }

    let storage = await getStorage();
    storage = cleanExpiredLinks(storage);
    
    const linkData = storage[secureId];

    if (!linkData) {
      return res.status(404).json({ error: 'Secure link not found' });
    }

    // Check if link has expired
    if (linkData.expiresAt && new Date(linkData.expiresAt) <= new Date()) {
      delete storage[secureId];
      await setStorage(storage);
      return res.status(410).json({ error: 'Secure link has expired' });
    }

    // Decrypt URL
    const url = decrypt(linkData.encryptedUrl);
    if (!url) {
      return res.status(500).json({ error: 'Failed to decrypt URL' });
    }

    // Update access statistics
    linkData.accessCount++;
    linkData.lastAccessed = new Date().toISOString();
    storage[secureId] = linkData;
    await setStorage(storage);

    console.log(`Served secure video: ${secureId}`);

    res.json({
      url,
      expiresAt: linkData.expiresAt,
      accessCount: linkData.accessCount
    });

  } catch (error) {
    console.error('Error serving secure video:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
