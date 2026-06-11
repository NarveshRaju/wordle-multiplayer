/**
 * GameManager — Singleton that manages all active game rooms.
 * Handles room creation/joining, player-to-room mapping, and stale room cleanup.
 */

const GameRoom = require('./GameRoom');
const { generateUniqueRoomCode } = require('../utils/roomCode');

const STALE_ROOM_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;     // Run cleanup every 5 minutes

class GameManager {
  constructor() {
    this.rooms = new Map();           // roomCode → GameRoom
    this.playerRoomMap = new Map();   // socketId → roomCode

    // Start periodic stale room cleanup
    this._cleanupInterval = setInterval(() => {
      this.cleanupStaleRooms();
    }, CLEANUP_INTERVAL_MS);

    // Allow the interval to not prevent process exit
    if (this._cleanupInterval.unref) {
      this._cleanupInterval.unref();
    }
  }

  /**
   * Create a new game room.
   * @param {string} socketId - Host's socket ID
   * @param {string} playerName - Host's display name
   * @param {string} gameMode - 'race' or 'coop'
   * @returns {{ success: boolean, room?: GameRoom, error?: string }}
   */
  createRoom(socketId, playerName, gameMode) {
    // Validate game mode
    if (gameMode !== 'race' && gameMode !== 'coop') {
      return { success: false, error: 'Invalid game mode. Must be "race" or "coop"' };
    }

    // Validate player name
    if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
      return { success: false, error: 'Player name is required' };
    }

    const trimmedName = playerName.trim().substring(0, 20); // Cap name length

    // Check if player is already in a room
    if (this.playerRoomMap.has(socketId)) {
      return { success: false, error: 'You are already in a room. Leave your current room first.' };
    }

    try {
      const roomCode = generateUniqueRoomCode(this.rooms);
      const room = new GameRoom(roomCode, socketId, trimmedName, gameMode);
      this.rooms.set(roomCode, room);
      this.playerRoomMap.set(socketId, roomCode);

      return { success: true, room };
    } catch (err) {
      return { success: false, error: 'Failed to create room. Please try again.' };
    }
  }

  /**
   * Join an existing room.
   * @param {string} roomCode - The room code to join
   * @param {string} socketId - Joiner's socket ID
   * @param {string} playerName - Joiner's display name
   * @returns {{ success: boolean, room?: GameRoom, error?: string }}
   */
  joinRoom(roomCode, socketId, playerName) {
    // Validate player name
    if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
      return { success: false, error: 'Player name is required' };
    }

    const trimmedName = playerName.trim().substring(0, 20);

    // Validate room code
    if (!roomCode || typeof roomCode !== 'string') {
      return { success: false, error: 'Invalid room code' };
    }

    const normalizedCode = roomCode.toUpperCase();

    // Check if player is already in a different room
    if (this.playerRoomMap.has(socketId)) {
      const existingCode = this.playerRoomMap.get(socketId);
      if (existingCode === normalizedCode) {
        return { success: false, error: 'You are already in this room' };
      }
      return { success: false, error: 'You are already in another room. Leave it first.' };
    }

    const room = this.rooms.get(normalizedCode);
    if (!room) {
      return { success: false, error: 'Room not found. Check your room code.' };
    }

    const result = room.addPlayer(socketId, trimmedName);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    this.playerRoomMap.set(socketId, normalizedCode);
    return { success: true, room };
  }

  /**
   * Get a room by its code.
   * @param {string} roomCode
   * @returns {GameRoom|undefined}
   */
  getRoom(roomCode) {
    if (!roomCode) return undefined;
    return this.rooms.get(roomCode.toUpperCase());
  }

  /**
   * Get the room a socket is currently in.
   * @param {string} socketId
   * @returns {GameRoom|undefined}
   */
  getRoomBySocket(socketId) {
    const roomCode = this.playerRoomMap.get(socketId);
    if (!roomCode) return undefined;
    return this.rooms.get(roomCode);
  }

  /**
   * Get the room code a socket is currently in.
   * @param {string} socketId
   * @returns {string|undefined}
   */
  getRoomCodeBySocket(socketId) {
    return this.playerRoomMap.get(socketId);
  }

  /**
   * Remove a player from their room (handles disconnect/leave).
   * @param {string} socketId
   * @returns {{ removed: boolean, roomCode?: string, playerName?: string, isEmpty: boolean, newHostId?: string }}
   */
  removePlayer(socketId) {
    const roomCode = this.playerRoomMap.get(socketId);
    if (!roomCode) {
      return { removed: false, isEmpty: false };
    }

    const room = this.rooms.get(roomCode);
    if (!room) {
      this.playerRoomMap.delete(socketId);
      return { removed: false, isEmpty: false };
    }

    const result = room.removePlayer(socketId);
    this.playerRoomMap.delete(socketId);

    // We intentionally DO NOT delete the room here if it's empty.
    // This allows the host to seamlessly navigate from index.html to game.html
    // and reconnect. Stale rooms will be removed by cleanupStaleRooms().

    return {
      removed: result.removed,
      roomCode,
      playerName: result.playerName,
      isEmpty: result.isEmpty,
      newHostId: result.newHostId,
    };
  }

  /**
   * Remove rooms that have been inactive for more than 30 minutes.
   */
  cleanupStaleRooms() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [code, room] of this.rooms.entries()) {
      if (now - room.lastActivity > STALE_ROOM_TIMEOUT_MS) {
        // Remove all players from the player-room map
        for (const player of room.players.values()) {
          this.playerRoomMap.delete(player.id);
        }
        this.rooms.delete(code);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[GameManager] Cleaned up ${cleanedCount} stale room(s). Active rooms: ${this.rooms.size}`);
    }
  }

  /**
   * Get stats about the current state.
   * @returns {{ roomCount: number, playerCount: number }}
   */
  getStats() {
    return {
      roomCount: this.rooms.size,
      playerCount: this.playerRoomMap.size,
    };
  }

  /**
   * Shutdown cleanup — clears the interval timer.
   */
  shutdown() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }
}

module.exports = GameManager;
