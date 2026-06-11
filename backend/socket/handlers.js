/**
 * Socket.IO event handlers for Wordle Party.
 * Registers all client↔server socket events.
 */

/**
 * Register all socket event handlers.
 * @param {import('socket.io').Server} io - Socket.IO server instance
 * @param {import('../game/GameManager')} gameManager - Game manager instance
 */
function registerSocketHandlers(io, gameManager) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // ──────────────────────────────────────
    // CREATE ROOM
    // ──────────────────────────────────────
    socket.on('create-room', (data, callback) => {
      try {
        const { playerName, gameMode } = data || {};

        if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
          return safeCallback(callback, { success: false, error: 'Player name is required' });
        }

        if (!gameMode || (gameMode !== 'race' && gameMode !== 'coop')) {
          return safeCallback(callback, { success: false, error: 'Invalid game mode' });
        }

        const result = gameManager.createRoom(socket.id, playerName.trim(), gameMode);

        if (!result.success) {
          return safeCallback(callback, { success: false, error: result.error });
        }

        const room = result.room;
        socket.join(room.roomCode);

        // Emit to the creator
        socket.emit('room-created', {
          roomCode: room.roomCode,
          players: room.getPlayerList(),
          gameMode: room.gameMode,
        });

        safeCallback(callback, {
          success: true,
          roomCode: room.roomCode,
        });

        console.log(`[Room] Created room ${room.roomCode} by "${playerName.trim()}" (mode: ${gameMode})`);
      } catch (err) {
        console.error('[create-room] Error:', err);
        safeCallback(callback, { success: false, error: 'Failed to create room' });
      }
    });

    // ──────────────────────────────────────
    // JOIN ROOM
    // ──────────────────────────────────────
    socket.on('join-room', (data, callback) => {
      try {
        const { roomCode, playerName } = data || {};

        if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
          return safeCallback(callback, { success: false, error: 'Player name is required' });
        }

        if (!roomCode || typeof roomCode !== 'string') {
          return safeCallback(callback, { success: false, error: 'Room code is required' });
        }

        const result = gameManager.joinRoom(roomCode, socket.id, playerName.trim());

        if (!result.success) {
          return safeCallback(callback, { success: false, error: result.error });
        }

        const room = result.room;
        socket.join(room.roomCode);

        // Emit to all players in room (including joiner)
        io.to(room.roomCode).emit('player-joined', {
          players: room.getPlayerList(),
          playerCount: room.players.size,
        });

        // Send game state to the joining player
        safeCallback(callback, {
          success: true,
          gameState: room.getPublicState(),
        });

        console.log(`[Room] "${playerName.trim()}" joined room ${room.roomCode} (${room.players.size} players)`);
      } catch (err) {
        console.error('[join-room] Error:', err);
        safeCallback(callback, { success: false, error: 'Failed to join room' });
      }
    });

    // ──────────────────────────────────────
    // START GAME
    // ──────────────────────────────────────
    socket.on('start-game', (data) => {
      try {
        const { roomCode } = data || {};
        const room = gameManager.getRoom(roomCode);

        if (!room) {
          return socket.emit('error', { message: 'Room not found' });
        }

        // Only the host can start the game
        if (room.hostId !== socket.id) {
          return socket.emit('error', { message: 'Only the host can start the game' });
        }

        const result = room.startGame();
        if (!result.success) {
          return socket.emit('error', { message: result.error });
        }

        const gameStartedPayload = {
          wordLength: 5,
          gameMode: room.gameMode,
          round: room.round,
          maxGuesses: 6,
        };

        // Include current turn info for coop mode
        if (room.gameMode === 'coop') {
          const turnPlayer = room.getCurrentTurnPlayer();
          gameStartedPayload.currentTurn = turnPlayer;
        }

        io.to(room.roomCode).emit('game-started', gameStartedPayload);

        console.log(`[Game] Game started in room ${room.roomCode} (round ${room.round}, mode: ${room.gameMode})`);
      } catch (err) {
        console.error('[start-game] Error:', err);
        socket.emit('error', { message: 'Failed to start game' });
      }
    });

    // ──────────────────────────────────────
    // SUBMIT GUESS
    // ──────────────────────────────────────
    socket.on('submit-guess', (data) => {
      try {
        const { roomCode, guess } = data || {};
        const room = gameManager.getRoom(roomCode);

        if (!room) {
          return socket.emit('error', { message: 'Room not found' });
        }

        if (!guess || typeof guess !== 'string') {
          return socket.emit('error', { message: 'Guess is required' });
        }

        const result = room.submitGuess(socket.id, guess);

        if (!result.success) {
          return socket.emit('error', { message: result.error });
        }

        const { playerId, playerName, feedback, guessNumber, solved, failed, gameOver } = result.result;
        const normalizedGuess = guess.toLowerCase().trim();

        if (room.gameMode === 'race') {
          // Send full feedback to the submitter
          socket.emit('guess-result', {
            playerId,
            playerName,
            guess: normalizedGuess,
            feedback,
            guessNumber,
            solved,
          });

          // Send limited info to opponents (no letter details)
          socket.to(room.roomCode).emit('opponent-progress', {
            playerId,
            playerName,
            guessCount: guessNumber,
            solved,
            failed,
          });
        } else {
          // Coop: send full feedback to everyone
          io.to(room.roomCode).emit('guess-result', {
            playerId,
            playerName,
            guess: normalizedGuess,
            feedback,
            guessNumber,
            solved,
          });
        }

        // If game is over, send results
        if (gameOver) {
          const results = room.getResults();
          io.to(room.roomCode).emit('game-over', results);
          console.log(`[Game] Game over in room ${room.roomCode}. Winner: ${results.winner ? (results.winner.playerName || results.winner) : 'none'}`);
        }
      } catch (err) {
        console.error('[submit-guess] Error:', err);
        socket.emit('error', { message: 'Failed to submit guess' });
      }
    });

    // ──────────────────────────────────────
    // TYPING PROGRESS
    // ──────────────────────────────────────
    socket.on('typing-progress', (data) => {
      try {
        const { roomCode, currentGuess } = data || {};
        if (!roomCode) return;
        
        socket.to(roomCode).emit('typing-progress', {
          playerId: socket.id,
          currentGuess
        });
      } catch (err) {
        console.error('[typing-progress] Error:', err);
      }
    });

    // ──────────────────────────────────────
    // NEW ROUND
    // ──────────────────────────────────────
    socket.on('new-round', (data) => {
      try {
        const { roomCode } = data || {};
        const room = gameManager.getRoom(roomCode);

        if (!room) {
          return socket.emit('error', { message: 'Room not found' });
        }

        // Only the host can start a new round
        if (room.hostId !== socket.id) {
          return socket.emit('error', { message: 'Only the host can start a new round' });
        }

        const result = room.startNewRound();
        if (!result.success) {
          return socket.emit('error', { message: result.error });
        }

        const payload = {
          round: room.round,
          wordLength: 5,
          gameMode: room.gameMode,
          maxGuesses: 6,
        };

        if (room.gameMode === 'coop') {
          payload.currentTurn = room.getCurrentTurnPlayer();
        }

        io.to(room.roomCode).emit('new-round-started', payload);

        console.log(`[Game] New round ${room.round} started in room ${room.roomCode}`);
      } catch (err) {
        console.error('[new-round] Error:', err);
        socket.emit('error', { message: 'Failed to start new round' });
      }
    });

    // ──────────────────────────────────────
    // LEAVE ROOM
    // ──────────────────────────────────────
    socket.on('leave-room', (data) => {
      try {
        const { roomCode } = data || {};

        if (roomCode) {
          socket.leave(roomCode);
        }

        const result = gameManager.removePlayer(socket.id);

        if (result.removed && result.roomCode) {
          // Notify remaining players
          if (!result.isEmpty) {
            const room = gameManager.getRoom(result.roomCode);
            if (room) {
              io.to(result.roomCode).emit('player-left', {
                players: room.getPlayerList(),
                playerCount: room.players.size,
                playerName: result.playerName,
                newHostId: result.newHostId || room.hostId,
              });

              // If the game ended because a player left
              if (room.status === 'finished') {
                const results = room.getResults();
                io.to(room.roomCode).emit('game-over', results);
              }
            }
          }

          console.log(`[Room] "${result.playerName}" left room ${result.roomCode}${result.isEmpty ? ' (room deleted)' : ''}`);
        }
      } catch (err) {
        console.error('[leave-room] Error:', err);
      }
    });

    // ──────────────────────────────────────
    // DISCONNECT
    // ──────────────────────────────────────
    socket.on('disconnect', (reason) => {
      try {
        const result = gameManager.removePlayer(socket.id);

        if (result.removed && result.roomCode && !result.isEmpty) {
          const room = gameManager.getRoom(result.roomCode);
          if (room) {
            io.to(result.roomCode).emit('player-left', {
              players: room.getPlayerList(),
              playerCount: room.players.size,
              playerName: result.playerName,
              newHostId: result.newHostId || room.hostId,
            });

            // If the game ended because a player disconnected
            if (room.status === 'finished') {
              const results = room.getResults();
              io.to(room.roomCode).emit('game-over', results);
            }
          }
        }

        console.log(`[Socket] Client disconnected: ${socket.id} (reason: ${reason})${result.removed ? ` — removed from room ${result.roomCode}` : ''}`);
      } catch (err) {
        console.error('[disconnect] Error:', err);
      }
    });
  });
}

/**
 * Safely invoke a Socket.IO callback, handling cases where it might not be a function.
 * @param {Function} callback
 * @param {object} data
 */
function safeCallback(callback, data) {
  if (typeof callback === 'function') {
    callback(data);
  }
}

module.exports = registerSocketHandlers;
