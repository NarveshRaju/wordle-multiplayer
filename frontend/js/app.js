/**
 * Wordle Party — Landing Page Controller (app.js)
 * Handles index.html interactions: create room, join room, mode toggle.
 */

(function () {
    'use strict';

    // Only run on index.html (landing page)
    if (document.querySelector('.landing') === null) return;

    document.addEventListener('DOMContentLoaded', init);

    /** Currently selected game mode */
    let selectedMode = 'race';

    function init() {
        // Connect to server
        UI.showLoading('Connecting to server...');

        socketManager.connect()
            .then(() => {
                UI.hideLoading();
            })
            .catch((err) => {
                UI.hideLoading();
                UI.showToast('Could not connect to server. Please try again.', 'error', 5000);
                console.error('[App] Connection failed:', err);
            });

        // ── Mode Toggle ──
        const modeButtons = document.querySelectorAll('.mode-toggle__option');
        modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                modeButtons.forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-checked', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-checked', 'true');
                selectedMode = btn.dataset.mode;
            });
        });

        // ── Create Room ──
        const btnCreate = document.getElementById('btn-create-room');
        btnCreate.addEventListener('click', handleCreateRoom);

        // ── Join Room ──
        const btnJoin = document.getElementById('btn-join-room');
        btnJoin.addEventListener('click', handleJoinRoom);

        // ── Room Code Input: auto-uppercase and limit ──
        const codeInput = document.getElementById('join-code');
        codeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
        });

        // ── Enter key support for inputs ──
        document.getElementById('create-name').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleCreateRoom();
        });

        document.getElementById('join-name').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('join-code').focus();
            }
        });

        codeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleJoinRoom();
        });
    }

    /**
     * Handle creating a new room.
     */
    function handleCreateRoom() {
        const nameInput = document.getElementById('create-name');
        const name = nameInput.value.trim();

        if (!name) {
            UI.showToast('Please enter your name', 'warning');
            nameInput.focus();
            UI.animateElement(nameInput, 'row-shake', 500);
            return;
        }

        if (name.length < 1 || name.length > 16) {
            UI.showToast('Name must be 1–16 characters', 'warning');
            nameInput.focus();
            return;
        }

        if (!socketManager.isConnected()) {
            UI.showToast('Not connected to server. Trying to reconnect...', 'error');
            socketManager.connect().catch(() => {
                UI.showToast('Could not connect. Please refresh the page.', 'error');
            });
            return;
        }

        const btn = document.getElementById('btn-create-room');
        btn.disabled = true;

        socketManager.createRoom(name, selectedMode, (error, data) => {
            btn.disabled = false;

            if (error) {
                UI.showToast(error, 'error');
                return;
            }

            // Redirect to game page
            const params = new URLSearchParams({
                room: data.roomCode,
                host: 'true',
                name: name,
                mode: selectedMode
            });
            window.location.href = `game.html?${params.toString()}`;
        });
    }

    /**
     * Handle joining an existing room.
     */
    function handleJoinRoom() {
        const nameInput = document.getElementById('join-name');
        const codeInput = document.getElementById('join-code');
        const name = nameInput.value.trim();
        const code = codeInput.value.trim().toUpperCase();

        if (!name) {
            UI.showToast('Please enter your name', 'warning');
            nameInput.focus();
            UI.animateElement(nameInput, 'row-shake', 500);
            return;
        }

        if (name.length < 1 || name.length > 16) {
            UI.showToast('Name must be 1–16 characters', 'warning');
            nameInput.focus();
            return;
        }

        if (code.length !== 4) {
            UI.showToast('Room code must be 4 characters', 'warning');
            codeInput.focus();
            UI.animateElement(codeInput, 'row-shake', 500);
            return;
        }

        if (!socketManager.isConnected()) {
            UI.showToast('Not connected to server. Trying to reconnect...', 'error');
            socketManager.connect().catch(() => {
                UI.showToast('Could not connect. Please refresh the page.', 'error');
            });
            return;
        }

        const btn = document.getElementById('btn-join-room');
        btn.disabled = true;

        socketManager.joinRoom(code, name, (error, data) => {
            btn.disabled = false;

            if (error) {
                UI.showToast(error, 'error');
                return;
            }

            // Redirect to game page
            const params = new URLSearchParams({
                room: data.roomCode || code,
                name: name
            });
            window.location.href = `game.html?${params.toString()}`;
        });
    }
})();
