/**
 * Wordle Party — Keyboard Renderer
 * Virtual QWERTY keyboard + physical keyboard listener.
 */

class KeyboardRenderer {
    /** Priority for key color states (only upgrade, never downgrade) */
    static STATE_PRIORITY = { 'absent': 1, 'present': 2, 'correct': 3 };

    /**
     * @param {string} containerId - ID of the keyboard container element.
     * @param {Function} onKeyPress - Callback invoked with the key value.
     */
    constructor(containerId, onKeyPress) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.onKeyPress = onKeyPress;
        this.keys = {}; // letter → key element
        this._physicalKeyHandler = null;
        this._enabled = true;
    }

    /**
     * Build the virtual keyboard DOM.
     */
    createKeyboard() {
        if (!this.container) {
            console.error('[Keyboard] Container not found:', this.containerId);
            return;
        }

        this.container.innerHTML = '';
        this.keys = {};

        const rows = [
            ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
            ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
            ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫']
        ];

        rows.forEach((rowKeys, rowIndex) => {
            const rowEl = document.createElement('div');
            rowEl.className = 'keyboard-row';

            rowKeys.forEach(key => {
                const keyEl = document.createElement('button');
                keyEl.type = 'button';
                keyEl.setAttribute('aria-label', this._getKeyAriaLabel(key));

                if (key === 'ENTER') {
                    keyEl.className = 'key key--wide';
                    keyEl.textContent = 'ENTER';
                    keyEl.dataset.key = 'Enter';
                } else if (key === '⌫') {
                    keyEl.className = 'key key--wide key--backspace';
                    keyEl.textContent = '⌫';
                    keyEl.dataset.key = 'Backspace';
                } else {
                    keyEl.className = 'key';
                    keyEl.textContent = key;
                    keyEl.dataset.key = key;
                    this.keys[key.toLowerCase()] = keyEl;
                }

                keyEl.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (!this._enabled) return;
                    this._handleKeyClick(keyEl.dataset.key);
                });

                // Touch feedback
                keyEl.addEventListener('touchstart', () => {
                    keyEl.classList.add('key-press');
                }, { passive: true });
                keyEl.addEventListener('touchend', () => {
                    setTimeout(() => keyEl.classList.remove('key-press'), 100);
                }, { passive: true });

                rowEl.appendChild(keyEl);
            });

            this.container.appendChild(rowEl);
        });

        this.setupPhysicalKeyboard();
    }

    /**
     * Handle a virtual key click.
     * @param {string} key
     */
    _handleKeyClick(key) {
        if (typeof this.onKeyPress === 'function') {
            this.onKeyPress(key);
        }
    }

    /**
     * Update a key's color state. Only upgrades (absent → present → correct).
     * @param {string} letter - Single letter (a-z or A-Z).
     * @param {string} state - 'correct' | 'present' | 'absent'
     */
    updateKeyColor(letter, state) {
        const key = this.keys[letter.toLowerCase()];
        if (!key) return;

        const currentState = key.dataset.state || '';
        const currentPriority = KeyboardRenderer.STATE_PRIORITY[currentState] || 0;
        const newPriority = KeyboardRenderer.STATE_PRIORITY[state] || 0;

        // Only upgrade
        if (newPriority > currentPriority) {
            key.dataset.state = state;
        }
    }

    /**
     * Reset all key colors.
     */
    reset() {
        Object.values(this.keys).forEach(key => {
            delete key.dataset.state;
        });
    }

    /**
     * Enable or disable the keyboard.
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this._enabled = enabled;
        if (this.container) {
            this.container.style.pointerEvents = enabled ? '' : 'none';
            this.container.style.opacity = enabled ? '' : '0.5';
        }
    }

    /**
     * Set up physical keyboard listener.
     */
    setupPhysicalKeyboard() {
        // Remove existing listener if any
        this.removePhysicalKeyboard();

        this._physicalKeyHandler = (e) => {
            if (!this._enabled) return;

            // Ignore if focused on an input
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

            // Ignore if modifier keys are held (Ctrl, Alt, Meta)
            if (e.ctrlKey || e.altKey || e.metaKey) return;

            const key = e.key;

            if (key === 'Enter') {
                e.preventDefault();
                this._handleKeyClick('Enter');
            } else if (key === 'Backspace') {
                e.preventDefault();
                this._handleKeyClick('Backspace');
            } else if (/^[a-zA-Z]$/.test(key)) {
                e.preventDefault();
                this._handleKeyClick(key.toUpperCase());

                // Visual feedback on virtual key
                const keyEl = this.keys[key.toLowerCase()];
                if (keyEl) {
                    keyEl.classList.add('key-press');
                    setTimeout(() => keyEl.classList.remove('key-press'), 100);
                }
            }
        };

        document.addEventListener('keydown', this._physicalKeyHandler);
    }

    /**
     * Remove physical keyboard listener.
     */
    removePhysicalKeyboard() {
        if (this._physicalKeyHandler) {
            document.removeEventListener('keydown', this._physicalKeyHandler);
            this._physicalKeyHandler = null;
        }
    }

    /**
     * Clean up all event listeners.
     */
    destroy() {
        this.removePhysicalKeyboard();
        if (this.container) {
            this.container.innerHTML = '';
        }
        this.keys = {};
    }

    /**
     * Get accessible label for a key.
     * @param {string} key
     * @returns {string}
     */
    _getKeyAriaLabel(key) {
        if (key === 'ENTER') return 'Submit guess';
        if (key === '⌫') return 'Delete letter';
        return `Letter ${key}`;
    }
}
