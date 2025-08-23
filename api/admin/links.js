
import { getStorage, cleanExpiredLinks } from '../../lib/storage.js';

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
    let storage = await getStorage();
    storage = cleanExpiredLinks(storage);
    const now = new Date();
    
    const links = Object.entries(storage).map(([id, data]) => ({
      secureId: id,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
      accessCount: data.accessCount,
      lastAccessed: data.lastAccessed,
      isExpired: data.expiresAt ? new Date(data.expiresAt) <= now : false
    }));

    res.json({ links, totalCount: links.length });

  } catch (error) {
    console.error('Error listing links:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
