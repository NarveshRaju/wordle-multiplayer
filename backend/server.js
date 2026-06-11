/**
 * Wordle Party — Main Server Entry Point
 *
 * Express + HTTP + Socket.IO server with CORS configuration,
 * health endpoint, and socket handler registration.
 */

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const GameManager = require('./game/GameManager');
const registerSocketHandlers = require('./socket/handlers');

// ─── Configuration ──────────────────────────────────────
const PORT = process.env.PORT || 3000;

// Build allowed origins list
const allowedOrigins = [
  'http://localhost:5500',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

if (process.env.FRONTEND_URL) {
  // Support comma-separated FRONTEND_URL values
  const urls = process.env.FRONTEND_URL.split(',').map(u => u.trim()).filter(Boolean);
  allowedOrigins.push(...urls);
}

// ─── Express App ────────────────────────────────────────
const app = express();

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  credentials: true,
}));

app.use(express.json());

// ─── HTTP Server ────────────────────────────────────────
const server = http.createServer(app);

// ─── Socket.IO ──────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ─── Game Manager (Singleton) ───────────────────────────
const gameManager = new GameManager();

// ─── REST Endpoints ─────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  const stats = gameManager.getStats();
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    rooms: stats.roomCount,
    players: stats.playerCount,
    timestamp: new Date().toISOString(),
  });
});

// ─── Register Socket Handlers ───────────────────────────
registerSocketHandlers(io, gameManager);

// ─── Start Server ───────────────────────────────────────
server.listen(PORT, () => {
  console.log('═══════════════════════════════════════════');
  console.log('  🟩 Wordle Party Server');
  console.log(`  🌐 Listening on port ${PORT}`);
  console.log(`  🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`  🎯 Allowed origins: ${allowedOrigins.join(', ')}`);
  console.log('═══════════════════════════════════════════');
});

// ─── Graceful Shutdown ──────────────────────────────────
function gracefulShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
  gameManager.shutdown();
  io.close(() => {
    server.close(() => {
      console.log('[Server] Shutdown complete.');
      process.exit(0);
    });
  });

  // Force exit after 5 seconds
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout.');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
