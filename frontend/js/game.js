/**
 * Wordle Party — Game Controller
 * Main orchestrator for game.html. Ties together Board, Keyboard, Lobby, and Socket.
 */

(function () {
    'use strict';

    // Only run on game.html
    if (!document.getElementById('game-board')) return;

    // ════════════════════════════════════════════
    //  STATE
    // ════════════════════════════════════════════

    /** @type {BoardRenderer} */
    let board = null;

    /** @type {KeyboardRenderer} */
    let keyboard = null;

    /** @type {LobbyController} */
    let lobby = null;

    /** Current row index (0-based) */
    let currentRow = 0;

    /** Current column index (0-based) */
    let currentCol = 0;

    /** Current guess string being typed */
    let currentGuess = '';

    /** Whether the game is active (accepting input) */
    let gameActive = false;

    /** Whether a guess is currently being processed (prevent double-submit) */
    let isProcessing = false;

    /** Room code */
    let roomCode = '';

    /** Player name */
    let playerName = '';

    /** Game mode: 'race' or 'coop' */
    let gameMode = 'race';

    /** Is this player the host? */
    let isHost = false;

    /** This player's socket ID */
    let mySocketId = null;

    /** All players in the room */
    let players = [];

    /** Opponent mini boards: { playerId: { element, currentRow } } */
    let opponentBoards = {};

    /** Whether the player has solved this round */
    let hasSolved = false;

    // ════════════════════════════════════════════
    //  INITIALIZATION
    // ════════════════════════════════════════════

    document.addEventListener('DOMContentLoaded', () => {
        // Parse URL params
        const params = new URLSearchParams(window.location.search);
        roomCode = (params.get('room') || '').toUpperCase();
        isHost = params.get('host') === 'true';
        playerName = params.get('name') || 'Player';
        gameMode = params.get('mode') || 'race';

        // Create lobby controller and initialize
        lobby = new LobbyController(socketManager);
        lobby.onGameStart = handleGameStarted;
        lobby.init();

        // Register game-specific socket events
        registerSocketEvents();
    });

    // ════════════════════════════════════════════
    //  SOCKET EVENTS
    // ════════════════════════════════════════════

    function registerSocketEvents() {
        // Guess result — returned for every submitted guess
        socketManager.on('guess-result', (data) => {
            handleGuessResult(data);
        });

        // Opponent progress (race mode) — other player made a guess
        socketManager.on('opponent-progress', (data) => {
            handleOpponentProgress(data);
        });

        // Game over
        socketManager.on('game-over', (data) => {
            handleGameOver(data);
        });

        // New round started
        socketManager.on('new-round-started', (data) => {
            handleNewRound(data);
        });

        // Typing progress (co-op mode)
        socketManager.on('typing-progress', (data) => {
            handleTypingProgress(data);
        });

        // Error from server
        socketManager.on('error', (data) => {
            if (data && data.message) {
                // Handle "Not a valid word" by shaking the row
                if (data.message.includes('valid word') || data.message.includes('Not a valid')) {
                    board.shakeRow(currentRow);
                    UI.showToast(data.message, 'error', 2000);
                    isProcessing = false;
                    keyboard.setEnabled(true);
                } else {
                    UI.showToast(data.message, 'error');
                    isProcessing = false;
                    keyboard.setEnabled(true);
                }
            }
        });
    }

    // ════════════════════════════════════════════
    //  GAME START
    // ════════════════════════════════════════════

    /**
     * Called when game-started event arrives from lobby.
     * @param {Object} data - { gameMode, players, ... }
     */
    function handleGameStarted(data) {
        gameMode = data?.gameMode || lobby.gameMode;
        players = data?.players || lobby.players;
        mySocketId = socketManager.getSocketId();

        // Reset state
        currentRow = 0;
        currentCol = 0;
        currentGuess = '';
        gameActive = true;
        isProcessing = false;
        hasSolved = false;
        opponentBoards = {};

        // Create board
        board = new BoardRenderer('game-board', CONFIG.MAX_GUESSES, CONFIG.WORD_LENGTH);
        board.createBoard();
        board.setActiveRow(0);
        board.setCurrentTile(0, 0);

        // Create keyboard
        keyboard = new KeyboardRenderer('game-keyboard', handleKeyPress);
        keyboard.createKeyboard();

        // Setup opponent panels (sidebar)
        setupOpponentPanels(players);

        // Hide turn indicator (no turns in either mode)
        const turnIndicator = document.getElementById('turn-indicator');
        if (turnIndicator) turnIndicator.style.display = 'none';

        // Keyboard is always enabled (no turns)
        keyboard.setEnabled(true);

        UI.showToast('Game started! Good luck! 🎯', 'success');
    }

    // ════════════════════════════════════════════
    //  KEY PRESS HANDLER
    // ════════════════════════════════════════════

    /**
     * Handle a key press from keyboard (virtual or physical).
     * @param {string} key - The key pressed.
     */
    function handleKeyPress(key) {
        if (!gameActive || isProcessing || hasSolved) return;

        if (key === 'Enter') {
            submitGuess();
        } else if (key === 'Backspace') {
            deleteLetter();
        } else if (/^[A-Z]$/.test(key)) {
            addLetter(key);
        }
    }

    /**
     * Add a letter to the current guess.
     * @param {string} letter
     */
    function addLetter(letter) {
        if (currentCol >= CONFIG.WORD_LENGTH) return;

        currentGuess += letter;
        board.setTile(currentRow, currentCol, letter);
        currentCol++;
        board.setCurrentTile(currentRow, currentCol);

        if (gameMode === 'coop') {
            socketManager.sendTypingProgress(roomCode || lobby.roomCode, currentGuess);
        }
    }

    /**
     * Delete the last letter from the current guess.
     */
    function deleteLetter() {
        if (currentCol <= 0) return;

        currentCol--;
        currentGuess = currentGuess.slice(0, -1);
        board.clearTile(currentRow, currentCol);
        board.setCurrentTile(currentRow, currentCol);

        if (gameMode === 'coop') {
            socketManager.sendTypingProgress(roomCode || lobby.roomCode, currentGuess);
        }
    }

    /**
     * Submit the current guess to the server.
     */
    function submitGuess() {
        if (currentGuess.length !== CONFIG.WORD_LENGTH) {
            board.shakeRow(currentRow);
            UI.showToast('Not enough letters', 'warning', 2000);
            return;
        }

        isProcessing = true;
        keyboard.setEnabled(false);
        socketManager.submitGuess(roomCode || lobby.roomCode, currentGuess);
    }

    /**
     * Handle typing progress from a teammate.
     */
    function handleTypingProgress(data) {
        if (gameMode !== 'coop' || data.playerId === mySocketId) return;
        
        const newGuess = data.currentGuess || '';
        
        // Sync our local state
        currentGuess = newGuess;
        
        // Update the board tiles for the current row
        for (let i = 0; i < CONFIG.WORD_LENGTH; i++) {
            if (i < newGuess.length) {
                // Keep it snappy for real-time
                const tile = board.getTile(currentRow, i);
                if (tile && tile.textContent !== newGuess[i]) {
                    board.setTile(currentRow, i, newGuess[i]);
                }
            } else {
                board.clearTile(currentRow, i);
            }
        }
        
        currentCol = newGuess.length;
        board.setCurrentTile(currentRow, currentCol);
    }

    // ════════════════════════════════════════════
    //  GUESS RESULT
    // ════════════════════════════════════════════

    /**
     * Handle the guess result from the server.
     * @param {Object} data - { playerId, guess, feedback, guessNumber, solved }
     */
    async function handleGuessResult(data) {
        const isMyGuess = data.playerId === mySocketId;

        if (gameMode === 'race') {
            // Race mode: only process my own guesses on my board
            if (!isMyGuess) return;

            await revealMyGuess(data);
        } else {
            // Co-op mode: shared board, process all guesses
            if (isMyGuess) {
                // My guess — the letters are already on the board from typing
                await revealMyGuess(data);
            } else {
                // Teammate's guess — need to place letters then reveal
                await revealTeammateGuess(data);
            }
        }
    }

    /**
     * Reveal my own guess result on the board.
     */
    async function revealMyGuess(data) {
        // Reveal the row with animation
        await board.revealRow(currentRow, data.feedback);

        // Update keyboard colors
        const guessLetters = currentGuess.split('');
        guessLetters.forEach((letter, i) => {
            keyboard.updateKeyColor(letter, data.feedback[i]);
        });

        if (data.solved) {
            hasSolved = true;
            gameActive = false;
            board.bounceRow(currentRow);
            UI.showConfetti();
            UI.showToast(gameMode === 'coop' ? 'Team win! 🎉' : 'Brilliant! 🎉', 'success', 3000);
        } else {
            currentRow++;
            currentCol = 0;
            currentGuess = '';

            if (currentRow >= CONFIG.MAX_GUESSES) {
                gameActive = false;
                UI.showToast('Out of guesses!', 'error', 3000);
            } else {
                board.setActiveRow(currentRow);
                board.setCurrentTile(currentRow, 0);
            }
        }

        isProcessing = false;

        if (gameActive) {
            keyboard.setEnabled(true);
        }
    }

    /**
     * Reveal a teammate's guess on the shared co-op board.
     */
    async function revealTeammateGuess(data) {
        // The shared row is based on guessNumber from server (1-indexed)
        const row = data.guessNumber - 1;

        // If we were typing on this row, clear our unsubmitted letters
        if (row === currentRow && currentGuess.length > 0) {
            for (let i = 0; i < currentCol; i++) {
                board.clearTile(currentRow, i);
            }
        }

        // Place the teammate's letters
        const guess = (data.guess || '').toUpperCase();
        for (let i = 0; i < CONFIG.WORD_LENGTH; i++) {
            if (guess[i]) {
                board.setTile(row, i, guess[i]);
            }
        }

        // Reveal with animation
        await board.revealRow(row, data.feedback);

        // Update keyboard
        for (let i = 0; i < guess.length; i++) {
            keyboard.updateKeyColor(guess[i], data.feedback[i]);
        }

        if (data.solved) {
            hasSolved = true;
            gameActive = false;
            board.bounceRow(row);
            UI.showConfetti();
            UI.showToast(`${data.playerName} found it! Team win! 🎉`, 'success');
        } else {
            // Move to next row
            currentRow = row + 1;
            currentCol = 0;
            currentGuess = '';

            if (currentRow >= CONFIG.MAX_GUESSES) {
                gameActive = false;
            } else {
                board.setActiveRow(currentRow);
                board.setCurrentTile(currentRow, 0);
            }
        }
    }

    /**
     * Handle opponent progress update in race mode (mini board).
     * @param {Object} data - { playerId, guessCount, solved, failed }
     */
    function handleOpponentProgress(data) {
        if (data.playerId === mySocketId) return;

        const card = document.querySelector(`[data-player-id="${data.playerId}"]`);
        if (!card) return;

        // Update guess count
        const guessEl = card.querySelector('.opponent-card__guesses');
        if (guessEl) {
            guessEl.textContent = `${data.guessCount}/${CONFIG.MAX_GUESSES}`;
        }

        // Update status
        const statusEl = card.querySelector('.opponent-card__status');
        if (statusEl) {
            if (data.solved) {
                card.classList.add('is-finished');
                statusEl.className = 'opponent-card__status opponent-card__status--won';
                statusEl.textContent = `Solved in ${data.guessCount}!`;
                statusEl.style.display = '';
            } else if (data.failed) {
                card.classList.add('is-finished');
                statusEl.className = 'opponent-card__status opponent-card__status--lost';
                statusEl.textContent = 'Failed';
                statusEl.style.display = '';
            }
        }
    }

    // ════════════════════════════════════════════
    //  GAME OVER
    // ════════════════════════════════════════════

    /**
     * Handle game over.
     * @param {Object} data - { results, word, gameMode }
     */
    function handleGameOver(data) {
        gameActive = false;
        keyboard.setEnabled(false);
        isProcessing = false;

        const word = (data.word || '?????').toUpperCase();
        const results = data.results || [];

        // Update word display
        const wordEl = document.getElementById('result-word');
        if (wordEl) wordEl.textContent = word;

        // Set emoji and title
        const emojiEl = document.getElementById('result-emoji');
        const titleEl = document.getElementById('modal-title');
        const subtitleEl = document.getElementById('modal-subtitle');

        if (gameMode === 'race' || data.gameMode === 'race') {
            renderRaceResults(results, emojiEl, titleEl, subtitleEl);
        } else {
            renderCoopResults(results, data, emojiEl, titleEl, subtitleEl);
        }

        // Show/hide play again button
        const btnPlayAgain = document.getElementById('btn-play-again');
        const waitingText = document.getElementById('waiting-host-text');
        const currentIsHost = isHost || lobby.isHost;

        if (currentIsHost) {
            if (btnPlayAgain) {
                btnPlayAgain.style.display = '';
                btnPlayAgain.onclick = () => {
                    socketManager.newRound(roomCode || lobby.roomCode);
                    UI.hideModal();
                };
            }
            if (waitingText) waitingText.style.display = 'none';
        } else {
            if (btnPlayAgain) btnPlayAgain.style.display = 'none';
            if (waitingText) waitingText.style.display = '';
        }

        // Show modal after a short delay
        setTimeout(() => {
            const overlay = document.getElementById('game-over-overlay');
            if (overlay) {
                overlay.style.display = 'flex';
                overlay.classList.remove('modal-closing');
            }
        }, 1500);
    }

    /**
     * Render race mode results.
     */
    function renderRaceResults(results, emojiEl, titleEl, subtitleEl) {
        const sorted = [...results].sort((a, b) => {
            if (a.solved && !b.solved) return -1;
            if (!a.solved && b.solved) return 1;
            return (a.guessCount || 99) - (b.guessCount || 99);
        });

        const myResult = sorted.find(r => r.playerId === mySocketId);
        const myPosition = sorted.indexOf(myResult) + 1;

        if (emojiEl) {
            if (myPosition === 1 && myResult?.solved) emojiEl.textContent = '🏆';
            else if (myResult?.solved) emojiEl.textContent = '🎉';
            else emojiEl.textContent = '😔';
        }

        if (titleEl) {
            if (myPosition === 1 && myResult?.solved) titleEl.textContent = 'You Won!';
            else if (myResult?.solved) titleEl.textContent = `${getOrdinal(myPosition)} Place`;
            else titleEl.textContent = 'Better Luck Next Time';
        }

        if (subtitleEl) {
            subtitleEl.textContent = myResult?.solved
                ? `Solved in ${myResult.guessCount} ${myResult.guessCount === 1 ? 'guess' : 'guesses'}`
                : 'You ran out of guesses.';
        }

        const contentEl = document.getElementById('result-content');
        if (!contentEl) return;

        let html = '<div class="results-list">';
        const medals = ['🥇', '🥈', '🥉'];

        sorted.forEach((result, index) => {
            const isMe = result.playerId === mySocketId;
            html += `
                <div class="result-item ${isMe ? 'result-item--me' : ''}">
                    <span class="result-position">${medals[index] || (index + 1)}</span>
                    <span class="result-name">${escapeHtml(result.playerName || 'Unknown')}</span>
                    <span class="result-detail">
                        ${result.solved ? `${result.guessCount} guesses` : 'Failed'}
                    </span>
                    <span class="result-score">${result.roundScore || 0} pts</span>
                </div>
            `;
        });

        html += '</div>';
        contentEl.innerHTML = html;
    }

    /**
     * Render coop mode results.
     */
    function renderCoopResults(results, data, emojiEl, titleEl, subtitleEl) {
        const teamSolved = data.solved || results.some(r => r.solved);

        if (emojiEl) emojiEl.textContent = teamSolved ? '🎉' : '😔';
        if (titleEl) titleEl.textContent = teamSolved ? 'Team Victory!' : 'Team Defeat';
        if (subtitleEl) {
            subtitleEl.textContent = teamSolved
                ? `Team found the word in ${data.guessCount} ${data.guessCount === 1 ? 'guess' : 'guesses'}!`
                : 'The team ran out of guesses.';
        }

        const contentEl = document.getElementById('result-content');
        if (!contentEl) return;

        let html = '<div class="results-list">';
        results.forEach((result) => {
            const isMe = result.playerId === mySocketId;
            const guesses = result.personalGuessCount || 0;
            html += `
                <div class="result-item ${isMe ? 'result-item--me' : ''}">
                    <span class="result-name">${escapeHtml(result.playerName || 'Unknown')}</span>
                    <span class="result-detail">${guesses} guess${guesses !== 1 ? 'es' : ''} contributed</span>
                </div>
            `;
        });
        html += '</div>';
        contentEl.innerHTML = html;
    }

    // ════════════════════════════════════════════
    //  NEW ROUND
    // ════════════════════════════════════════════

    function handleNewRound(data) {
        currentRow = 0;
        currentCol = 0;
        currentGuess = '';
        gameActive = true;
        isProcessing = false;
        hasSolved = false;

        if (data?.gameMode) gameMode = data.gameMode;
        if (data?.players) players = data.players;

        // Reset board
        if (board) {
            board.reset();
            board.setActiveRow(0);
            board.setCurrentTile(0, 0);
        }

        // Reset keyboard
        if (keyboard) {
            keyboard.reset();
            keyboard.setEnabled(true);
        }

        // Reset opponent cards
        const cards = document.querySelectorAll('.opponent-card');
        cards.forEach(card => {
            card.classList.remove('is-finished');
            const statusEl = card.querySelector('.opponent-card__status');
            if (statusEl) statusEl.style.display = 'none';
            const guessEl = card.querySelector('.opponent-card__guesses');
            if (guessEl) guessEl.textContent = `0/${CONFIG.MAX_GUESSES}`;
        });

        // Hide game over modal
        const overlay = document.getElementById('game-over-overlay');
        if (overlay) overlay.style.display = 'none';

        UI.showToast('New round! 🎯', 'success');
    }

    // ════════════════════════════════════════════
    //  OPPONENT PANELS (Race mode sidebar)
    // ════════════════════════════════════════════

    function setupOpponentPanels(playerList) {
        const sidebarContainer = document.getElementById('sidebar-players');
        const bottomContainer = document.getElementById('bottom-panel-opponents');
        if (!sidebarContainer) return;

        sidebarContainer.innerHTML = '';
        if (bottomContainer) bottomContainer.innerHTML = '';

        // In co-op mode, don't show opponent panels (shared board)
        if (gameMode === 'coop') {
            // Just show player names list
            playerList.forEach((player, index) => {
                const card = document.createElement('div');
                card.className = 'opponent-card';
                card.dataset.playerId = player.id;
                const isMe = player.id === mySocketId;
                const initial = (player.name || 'P').charAt(0).toUpperCase();
                card.innerHTML = `
                    <div class="opponent-card__header">
                        <span class="opponent-card__name">${escapeHtml(player.name)}${isMe ? ' (You)' : ''}</span>
                    </div>
                `;
                sidebarContainer.appendChild(card);
            });
            return;
        }

        // Race mode: show opponent cards with progress
        playerList.forEach((player, index) => {
            if (player.id === mySocketId) return; // Don't show self

            const card = document.createElement('div');
            card.className = 'opponent-card';
            card.dataset.playerId = player.id;
            const initial = (player.name || 'P').charAt(0).toUpperCase();

            card.innerHTML = `
                <div class="opponent-card__header">
                    <span class="opponent-card__name">${escapeHtml(player.name)}</span>
                    <span class="opponent-card__guesses">0/${CONFIG.MAX_GUESSES}</span>
                    <span class="opponent-card__status" style="display: none;"></span>
                </div>
            `;
            sidebarContainer.appendChild(card);
        });
    }

    // ════════════════════════════════════════════
    //  HELPERS
    // ════════════════════════════════════════════

    function getOrdinal(n) {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
})();
