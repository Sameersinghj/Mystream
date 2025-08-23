const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Storage file path
const STORAGE_FILE = path.join(__dirname, 'secure_videos.json');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-secret-key-change-this-in-production';

// Utility functions
function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
    try {
        const [ivHex, encrypted] = encryptedText.split(':');
        const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        return null;
    }
}

function generateSecureId() {
    return 'sv_' + crypto.randomBytes(16).toString('hex') + '_' + Date.now().toString(36);
}

async function loadStorage() {
    try {
        const data = await fs.readFile(STORAGE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

async function saveStorage(data) {
    try {
        await fs.writeFile(STORAGE_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Failed to save storage:', error);
    }
}

// Clean expired links periodically
async function cleanExpiredLinks() {
    const storage = await loadStorage();
    const now = new Date();
    let changed = false;

    for (const [id, data] of Object.entries(storage)) {
        if (data.expiresAt && new Date(data.expiresAt) <= now) {
            delete storage[id];
            changed = true;
            console.log(`Cleaned expired link: ${id}`);
        }
    }

    if (changed) {
        await saveStorage(storage);
    }
}

// Clean expired links every hour
setInterval(cleanExpiredLinks, 60 * 60 * 1000);

// Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create secure link
app.post('/api/create-secure-link', async (req, res) => {
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

        const storage = await loadStorage();
        storage[secureId] = linkData;
        await saveStorage(storage);

        console.log(`Created secure link: ${secureId} (expires: ${expiresAt || 'never'})`);

        res.json({
            secureId,
            expiresAt: linkData.expiresAt,
            message: 'Secure link created successfully'
        });

    } catch (error) {
        console.error('Error creating secure link:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get video URL from secure ID
app.get('/api/get-video/:secureId', async (req, res) => {
    try {
        const { secureId } = req.params;

        if (!secureId || !secureId.startsWith('sv_')) {
            return res.status(400).json({ error: 'Invalid secure ID format' });
        }

        const storage = await loadStorage();
        const linkData = storage[secureId];

        if (!linkData) {
            return res.status(404).json({ error: 'Secure link not found' });
        }

        // Check if link has expired
        if (linkData.expiresAt && new Date(linkData.expiresAt) <= new Date()) {
            // Remove expired link
            delete storage[secureId];
            await saveStorage(storage);
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
        await saveStorage(storage);

        console.log(`Served secure video: ${secureId} (access count: ${linkData.accessCount})`);

        res.json({
            url,
            expiresAt: linkData.expiresAt,
            accessCount: linkData.accessCount
        });

    } catch (error) {
        console.error('Error serving secure video:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get link statistics (optional admin endpoint)
app.get('/api/stats/:secureId', async (req, res) => {
    try {
        const { secureId } = req.params;
        const storage = await loadStorage();
        const linkData = storage[secureId];

        if (!linkData) {
            return res.status(404).json({ error: 'Secure link not found' });
        }

        res.json({
            secureId,
            createdAt: linkData.createdAt,
            expiresAt: linkData.expiresAt,
            accessCount: linkData.accessCount,
            lastAccessed: linkData.lastAccessed,
            isExpired: linkData.expiresAt ? new Date(linkData.expiresAt) <= new Date() : false
        });

    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete secure link (optional admin endpoint)
app.delete('/api/delete/:secureId', async (req, res) => {
    try {
        const { secureId } = req.params;
        const storage = await loadStorage();

        if (!storage[secureId]) {
            return res.status(404).json({ error: 'Secure link not found' });
        }

        delete storage[secureId];
        await saveStorage(storage);

        console.log(`Deleted secure link: ${secureId}`);

        res.json({ message: 'Secure link deleted successfully' });

    } catch (error) {
        console.error('Error deleting secure link:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// List all active links (optional admin endpoint)
app.get('/api/admin/links', async (req, res) => {
    try {
        const storage = await loadStorage();
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
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🔒 Secure Video API server running on port ${PORT}`);
    console.log(`📁 Storage file: ${STORAGE_FILE}`);
    console.log(`🌐 API endpoints available at http://localhost:${PORT}/api/`);
    
    // Clean expired links on startup
    cleanExpiredLinks();
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Server shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Server shutting down gracefully...');
    process.exit(0);
});
