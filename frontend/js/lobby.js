/**
 * Wordle Party — Lobby Controller
 * Manages the lobby/waiting room state before the game starts.
 */

class LobbyController {
    /**
     * @param {SocketManager} sm - The socket manager instance.
     */
    constructor(sm) {
        this.socketManager = sm;

        /** Room code from URL */
        this.roomCode = '';

        /** Is this player the host? */
        this.isHost = false;

        /** Player's display name */
        this.playerName = '';

        /** Current game mode */
        this.gameMode = 'race';

        /** Current player list */
        this.players = [];

        /** My socket ID */
        this.mySocketId = null;

        /** Callback fired when game starts — set by game.js */
        this.onGameStart = null;
    }

    /**
     * Initialize the lobby: parse URL params, connect socket, join room.
     */
    async init() {
        // Parse URL parameters
        const params = new URLSearchParams(window.location.search);
        this.roomCode = (params.get('room') || '').toUpperCase();
        this.isHost = params.get('host') === 'true';
        this.playerName = params.get('name') || 'Player';
        this.gameMode = params.get('mode') || 'race';

        if (!this.roomCode) {
            UI.showToast('No room code provided. Redirecting...', 'error');
            setTimeout(() => { window.location.href = 'index.html'; }, 1500);
            return;
        }

        // Update UI with room info
        this._updateRoomDisplay();
        this._updateModeDisplay();

        // Connect and join room
        UI.showLoading('Connecting to server...');

        try {
            await this.socketManager.connect();
            this.mySocketId = this.socketManager.getSocketId();

            // Join room via socket
            this.socketManager.joinRoom(this.roomCode, this.playerName, (error, data) => {
                UI.hideLoading();

                if (error) {
                    UI.showToast(error, 'error');
                    setTimeout(() => { window.location.href = 'index.html'; }, 2000);
                    return;
                }

                // Process the join response
                if (data) {
                    const state = data.gameState || data;
                    this.mySocketId = this.socketManager.getSocketId();
                    if (state.players) {
                        this.players = state.players;
                        this.renderPlayers(this.players);
                    }
                    if (state.gameMode) {
                        this.gameMode = state.gameMode;
                        this._updateModeDisplay();
                    }
                    if (state.hostId && state.hostId === this.mySocketId) {
                        this.isHost = true;
                    }
                }

                this._setupHostControls();
                this._updatePlayerCount();
            });
        } catch (err) {
            UI.hideLoading();
            UI.showToast('Could not connect to server', 'error');
            console.error('[Lobby]', err);
            return;
        }

        // Register socket event handlers
        this._registerSocketEvents();
    }

    /**
     * Register all lobby-related socket events.
     */
    _registerSocketEvents() {
        // Player joined
        this.socketManager.on('player-joined', (data) => {
            if (data.players) {
                this.players = data.players;
                this.renderPlayers(this.players);
                this._updatePlayerCount();
            }
            if (data.playerName) {
                UI.showToast(`${data.playerName} joined the room`, 'info');
            }
        });

        // Player left
        this.socketManager.on('player-left', (data) => {
            if (data.players) {
                this.players = data.players;
                this.renderPlayers(this.players);
                this._updatePlayerCount();
            }
            if (data.playerName) {
                UI.showToast(`${data.playerName} left the room`, 'warning');
            }
            // Check if host changed
            if (data.hostId && data.hostId === this.mySocketId) {
                this.isHost = true;
                this._setupHostControls();
                UI.showToast('You are now the host!', 'info');
            }
        });

        // Mode changed
        this.socketManager.on('mode-changed', (data) => {
            if (data.gameMode) {
                this.gameMode = data.gameMode;
                this._updateModeDisplay();
                UI.showToast(`Game mode changed to ${this.gameMode === 'race' ? 'Race' : 'Co-op'}`, 'info');
            }
        });

        // Game started
        this.socketManager.on('game-started', (data) => {
            this._transitionToGame(data);
        });

        // Error
        this.socketManager.on('error', (data) => {
            UI.showToast(data.message || 'An error occurred', 'error');
        });
    }

    /**
     * Render the player cards in the lobby grid.
     * @param {Array} players - Array of player objects {id, name, isHost}.
     */
    renderPlayers(players) {
        const container = document.getElementById('lobby-players');
        if (!container) return;

        container.innerHTML = '';

        // Render existing players
        players.forEach((player, index) => {
            const card = document.createElement('div');
            card.className = 'lobby__player-card';
            if (player.id === this.mySocketId) {
                card.classList.add('is-self');
            }

            const colorIndex = (index % CONFIG.MAX_PLAYERS) + 1;
            const initial = (player.name || 'P').charAt(0).toUpperCase();

            card.innerHTML = `
                <div class="avatar avatar--lg avatar--${colorIndex}">
                    ${initial}
                    ${player.isHost ? '<span class="avatar__crown" aria-label="Host">👑</span>' : ''}
                </div>
                <span class="lobby__player-name">${this._escapeHtml(player.name)}</span>
                <div style="display: flex; gap: var(--space-2);">
                    ${player.isHost ? '<span class="lobby__player-badge lobby__player-badge--host">Host</span>' : ''}
                    ${player.id === this.mySocketId ? '<span class="lobby__player-badge lobby__player-badge--you">You</span>' : ''}
                </div>
            `;

            container.appendChild(card);
        });

        // Render empty slots
        const emptySlots = CONFIG.MAX_PLAYERS - players.length;
        for (let i = 0; i < emptySlots; i++) {
            const slot = document.createElement('div');
            slot.className = 'lobby__player-slot';
            slot.innerHTML = `
                <span class="lobby__player-slot-icon">➕</span>
                <span class="lobby__player-slot-text">Waiting...</span>
            `;
            container.appendChild(slot);
        }

        // Update status message
        this._updateLobbyStatus();
    }

    /**
     * Setup host-only controls (start button, mode selector).
     */
    _setupHostControls() {
        const startBtn = document.getElementById('btn-start-game');
        const modeSelect = document.getElementById('lobby-mode-select');

        if (this.isHost) {
            // Show start button
            if (startBtn) {
                startBtn.style.display = '';
                startBtn.onclick = () => this.startGame();
            }

            // Show mode selector
            if (modeSelect) {
                modeSelect.style.display = '';
                const modeButtons = modeSelect.querySelectorAll('.mode-toggle__option');
                modeButtons.forEach(btn => {
                    // Set initial active state
                    if (btn.dataset.mode === this.gameMode) {
                        btn.classList.add('active');
                        btn.setAttribute('aria-checked', 'true');
                    } else {
                        btn.classList.remove('active');
                        btn.setAttribute('aria-checked', 'false');
                    }

                    btn.addEventListener('click', () => {
                        modeButtons.forEach(b => {
                            b.classList.remove('active');
                            b.setAttribute('aria-checked', 'false');
                        });
                        btn.classList.add('active');
                        btn.setAttribute('aria-checked', 'true');
                        this.gameMode = btn.dataset.mode;
                        this._updateModeDisplay();
                        this.socketManager.changeMode(this.roomCode, this.gameMode);
                    });
                });
            }
        } else {
            if (startBtn) startBtn.style.display = 'none';
            if (modeSelect) modeSelect.style.display = 'none';
        }
    }

    /**
     * Start the game (host action).
     */
    startGame() {
        if (!this.isHost) {
            UI.showToast('Only the host can start the game', 'warning');
            return;
        }
        if (this.players.length < 1) {
            UI.showToast('Need at least 1 player to start', 'warning');
            return;
        }
        this.socketManager.startGame(this.roomCode);
    }

    /**
     * Copy the room code to clipboard.
     */
    copyRoomCode() {
        UI.copyToClipboard(this.roomCode);
    }

    /**
     * Transition from lobby to game state.
     * @param {Object} data - Game started data from server.
     */
    _transitionToGame(data) {
        // Hide lobby
        const lobby = document.getElementById('lobby-section');
        if (lobby) {
            lobby.classList.remove('active');
        }

        // Show game
        const game = document.getElementById('game-section');
        if (game) {
            game.classList.add('active');
        }

        // Update mode from server data if available
        if (data && data.gameMode) {
            this.gameMode = data.gameMode;
            this._updateModeDisplay();
        }

        // Callback to game controller
        if (typeof this.onGameStart === 'function') {
            this.onGameStart(data);
        }
    }

    /**
     * Update the room code display elements.
     */
    _updateRoomDisplay() {
        // Header room code
        const headerCode = document.getElementById('header-room-code-text');
        if (headerCode) headerCode.textContent = this.roomCode;

        // Lobby room code
        const lobbyCode = document.getElementById('lobby-room-code');
        if (lobbyCode) {
            lobbyCode.textContent = this.roomCode;
            lobbyCode.addEventListener('click', () => this.copyRoomCode());
        }

        // Header room code click handler
        const headerBtn = document.getElementById('header-room-code');
        if (headerBtn) {
            headerBtn.addEventListener('click', () => this.copyRoomCode());
        }
    }

    /**
     * Update the game mode display badges.
     */
    _updateModeDisplay() {
        const isRace = this.gameMode === 'race';

        // Header badge
        const headerIcon = document.getElementById('header-mode-icon');
        const headerText = document.getElementById('header-mode-text');
        const headerBadge = document.getElementById('header-mode-badge');
        if (headerIcon) {
            headerIcon.innerHTML = isRace ? '<i data-lucide="zap"></i>' : '<i data-lucide="users"></i>';
            if (window.lucide) lucide.createIcons({ root: headerIcon });
        }
        if (headerText) headerText.textContent = isRace ? 'Race' : 'Co-op';
        if (headerBadge) {
            headerBadge.className = `badge ${isRace ? 'badge--primary' : 'badge--secondary'}`;
        }

        // Lobby badge
        const lobbyIcon = document.getElementById('lobby-mode-icon');
        const lobbyText = document.getElementById('lobby-mode-text');
        const lobbyBadge = document.getElementById('lobby-mode-badge');
        if (lobbyIcon) {
            lobbyIcon.innerHTML = isRace ? '<i data-lucide="zap"></i>' : '<i data-lucide="users"></i>';
            if (window.lucide) lucide.createIcons({ root: lobbyIcon });
        }
        if (lobbyText) lobbyText.textContent = isRace ? 'Race Mode' : 'Co-op Mode';
        if (lobbyBadge) {
            lobbyBadge.className = `lobby__mode-badge ${isRace ? 'lobby__mode-badge--race' : 'lobby__mode-badge--coop'}`;
        }
    }

    /**
     * Update the player count display.
     */
    _updatePlayerCount() {
        const el = document.getElementById('header-player-count');
        if (el) el.textContent = `${this.players.length}/${CONFIG.MAX_PLAYERS}`;
    }

    /**
     * Update the lobby status message.
     */
    _updateLobbyStatus() {
        const status = document.getElementById('lobby-status');
        if (!status) return;

        if (this.players.length >= 2 && this.isHost) {
            status.innerHTML = `
                <span class="lobby__status-text" style="color: var(--success);">
                    ✅ Ready to start!
                </span>
            `;
        } else if (this.players.length >= 2) {
            status.innerHTML = `
                <span class="lobby__status-text">
                    Waiting for host to start the game...
                </span>
            `;
        } else {
            status.innerHTML = `
                <div class="dots-loading">
                    <span></span><span></span><span></span>
                </div>
                <span class="lobby__status-text">Waiting for players...</span>
            `;
        }
    }

    /**
     * Escape HTML to prevent XSS.
     * @param {string} str
     * @returns {string}
     */
    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
