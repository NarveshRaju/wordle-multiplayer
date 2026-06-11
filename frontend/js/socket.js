/**
 * Wordle Party — Socket Manager
 * Handles all WebSocket communication with the backend via Socket.IO.
 */

class SocketManager {
    constructor() {
        /** @type {import('socket.io-client').Socket | null} */
        this.socket = null;

        /** Whether the socket is currently connected */
        this.connected = false;

        /** Registered event handlers: { eventName: [callback, ...] } */
        this.handlers = {};

        /** Reconnection attempt counter */
        this._reconnectAttempts = 0;
    }

    /**
     * Connect to the backend Socket.IO server.
     * @returns {Promise<void>} Resolves when connected.
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this.socket && this.connected) {
                resolve();
                return;
            }

            try {
                this.socket = io(CONFIG.BACKEND_URL, {
                    transports: ['websocket', 'polling'],
                    reconnection: true,
                    reconnectionAttempts: 10,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 10000
                });
            } catch (err) {
                reject(new Error('Failed to initialize Socket.IO: ' + err.message));
                return;
            }

            // ── Connection Events ──

            this.socket.on('connect', () => {
                this.connected = true;
                this._reconnectAttempts = 0;
                this._updateConnectionUI(true);
                resolve();
            });

            this.socket.on('disconnect', (reason) => {
                this.connected = false;
                this._updateConnectionUI(false);
                console.warn('[Socket] Disconnected:', reason);
                if (reason === 'io server disconnect') {
                    // Server initiated disconnect — try to reconnect
                    this.socket.connect();
                }
            });

            this.socket.on('connect_error', (err) => {
                this._reconnectAttempts++;
                this._updateConnectionUI(false);
                console.error('[Socket] Connection error:', err.message);
                if (this._reconnectAttempts >= 10) {
                    reject(new Error('Unable to connect to server'));
                }
            });

            this.socket.on('reconnect', (attempt) => {
                this.connected = true;
                this._reconnectAttempts = 0;
                this._updateConnectionUI(true);
                UI.showToast('Reconnected to server', 'success');
                console.log('[Socket] Reconnected after', attempt, 'attempts');
            });

            this.socket.on('reconnect_failed', () => {
                this.connected = false;
                this._updateConnectionUI(false);
                UI.showToast('Connection lost. Please refresh the page.', 'error', 0);
            });

            // ── Forward All Game Events to Registered Handlers ──
            this.socket.onAny((eventName, ...args) => {
                if (this.handlers[eventName]) {
                    this.handlers[eventName].forEach(callback => {
                        try {
                            callback(...args);
                        } catch (err) {
                            console.error(`[Socket] Error in handler for "${eventName}":`, err);
                        }
                    });
                }
            });
        });
    }

    /**
     * Register an event handler.
     * @param {string} event - Event name.
     * @param {Function} callback - Handler function.
     */
    on(event, callback) {
        if (!this.handlers[event]) {
            this.handlers[event] = [];
        }
        this.handlers[event].push(callback);
    }

    /**
     * Remove an event handler.
     * @param {string} event - Event name.
     * @param {Function} callback - Handler to remove.
     */
    off(event, callback) {
        if (!this.handlers[event]) return;
        this.handlers[event] = this.handlers[event].filter(cb => cb !== callback);
    }

    /**
     * Create a new game room.
     * @param {string} playerName - Player's display name.
     * @param {string} gameMode - 'race' or 'coop'.
     * @param {Function} callback - Called with (error, data).
     */
    createRoom(playerName, gameMode, callback) {
        if (!this._ensureConnected(callback)) return;
        this.socket.emit('create-room', { playerName, gameMode }, (response) => {
            if (response && response.error) {
                callback(response.error, null);
            } else {
                callback(null, response);
            }
        });
    }

    /**
     * Join an existing room.
     * @param {string} roomCode - 4-character room code.
     * @param {string} playerName - Player's display name.
     * @param {Function} callback - Called with (error, data).
     */
    joinRoom(roomCode, playerName, callback) {
        if (!this._ensureConnected(callback)) return;
        this.socket.emit('join-room', { roomCode: roomCode.toUpperCase(), playerName }, (response) => {
            if (response && response.error) {
                callback(response.error, null);
            } else {
                callback(null, response);
            }
        });
    }

    /**
     * Start the game (host only).
     * @param {string} roomCode
     */
    startGame(roomCode) {
        if (!this._ensureConnected()) return;
        this.socket.emit('start-game', { roomCode });
    }

    /**
     * Send typing progress (co-op mode).
     * @param {string} roomCode
     * @param {string} currentGuess - The current string being typed.
     */
    sendTypingProgress(roomCode, currentGuess) {
        if (!this._ensureConnected()) return;
        this.socket.emit('typing-progress', { roomCode, currentGuess });
    }

    /**
     * Submit a guess.
     * @param {string} roomCode
     * @param {string} guess - 5-letter word.
     */
    submitGuess(roomCode, guess) {
        if (!this._ensureConnected()) return;
        this.socket.emit('submit-guess', { roomCode, guess: guess.toLowerCase() });
    }

    /**
     * Start a new round (host only).
     * @param {string} roomCode
     */
    newRound(roomCode) {
        if (!this._ensureConnected()) return;
        this.socket.emit('new-round', { roomCode });
    }

    /**
     * Change game mode (host only, during lobby).
     * @param {string} roomCode
     * @param {string} gameMode - 'race' or 'coop'.
     */
    changeMode(roomCode, gameMode) {
        if (!this._ensureConnected()) return;
        this.socket.emit('change-mode', { roomCode, gameMode });
    }

    /**
     * Leave the room.
     * @param {string} roomCode
     */
    leaveRoom(roomCode) {
        if (!this._ensureConnected()) return;
        this.socket.emit('leave-room', { roomCode });
    }

    /**
     * Disconnect from the server.
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.connected = false;
        }
    }

    /**
     * Check if currently connected.
     * @returns {boolean}
     */
    isConnected() {
        return this.connected;
    }

    /**
     * Get the current socket id.
     * @returns {string|null}
     */
    getSocketId() {
        return this.socket ? this.socket.id : null;
    }

    // ── Private Helpers ──

    /**
     * Ensure socket is connected before emitting.
     * @param {Function} [callback]
     * @returns {boolean}
     */
    _ensureConnected(callback) {
        if (!this.socket || !this.connected) {
            const msg = 'Not connected to server';
            console.error('[Socket]', msg);
            if (typeof callback === 'function') {
                callback(msg, null);
            } else {
                UI.showToast(msg, 'error');
            }
            return false;
        }
        return true;
    }

    /**
     * Update the connection status indicator in the UI.
     * @param {boolean} isConnected
     */
    _updateConnectionUI(isConnected) {
        const dot = document.getElementById('connection-dot');
        if (!dot) return;
        dot.classList.remove('connecting', 'disconnected');
        if (isConnected) {
            dot.classList.remove('disconnected', 'connecting');
            // The default state (no extra class) = connected (green)
        } else {
            dot.classList.add('disconnected');
        }
    }
}

/** Singleton instance used throughout the app */
const socketManager = new SocketManager();
