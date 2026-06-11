/**
 * Wordle Party — Board Renderer
 * Creates and animates the main game board and mini opponent boards.
 */

class BoardRenderer {
    /**
     * @param {string} containerId - ID of the board container element.
     * @param {number} rows - Number of guess rows (default 6).
     * @param {number} cols - Number of columns/letters (default 5).
     */
    constructor(containerId, rows = CONFIG.MAX_GUESSES, cols = CONFIG.WORD_LENGTH) {
        this.containerId = containerId;
        this.rows = rows;
        this.cols = cols;
        this.container = document.getElementById(containerId);
        this.tiles = []; // 2D array: tiles[row][col]
    }

    /**
     * Build the board DOM structure.
     */
    createBoard() {
        if (!this.container) {
            console.error('[Board] Container not found:', this.containerId);
            return;
        }

        this.container.innerHTML = '';
        this.tiles = [];

        for (let r = 0; r < this.rows; r++) {
            const rowEl = document.createElement('div');
            rowEl.className = 'board-row';
            rowEl.setAttribute('role', 'row');
            rowEl.dataset.row = r;

            // Mark the first row as active initially
            if (r === 0) {
                rowEl.classList.add('active');
            }

            const rowTiles = [];

            for (let c = 0; c < this.cols; c++) {
                const tile = document.createElement('div');
                tile.className = 'tile';
                tile.dataset.state = 'empty';
                tile.dataset.row = r;
                tile.dataset.col = c;
                tile.setAttribute('role', 'gridcell');
                tile.setAttribute('aria-label', `Row ${r + 1}, Column ${c + 1}: empty`);

                rowEl.appendChild(tile);
                rowTiles.push(tile);
            }

            this.container.appendChild(rowEl);
            this.tiles.push(rowTiles);
        }
    }

    /**
     * Set a letter on a specific tile with pop animation.
     * @param {number} row
     * @param {number} col
     * @param {string} letter
     */
    setTile(row, col, letter) {
        const tile = this.getTile(row, col);
        if (!tile) return;

        tile.textContent = letter.toUpperCase();
        tile.dataset.state = 'tbd';
        tile.setAttribute('aria-label', `Row ${row + 1}, Column ${col + 1}: ${letter.toUpperCase()}`);

        // Pop animation
        UI.animateElement(tile, 'tile-pop', 100);
    }

    /**
     * Clear a tile (remove letter).
     * @param {number} row
     * @param {number} col
     */
    clearTile(row, col) {
        const tile = this.getTile(row, col);
        if (!tile) return;

        tile.textContent = '';
        tile.dataset.state = 'empty';
        tile.setAttribute('aria-label', `Row ${row + 1}, Column ${col + 1}: empty`);
    }

    /**
     * Reveal a row with sequential flip animations.
     * @param {number} row - Row index.
     * @param {Array<string>} feedback - Array of 'correct' | 'present' | 'absent' per tile.
     * @returns {Promise} Resolves after all tiles have finished flipping.
     */
    revealRow(row, feedback) {
        return new Promise((resolve) => {
            const rowTiles = this.tiles[row];
            if (!rowTiles) {
                resolve();
                return;
            }

            const totalDuration = CONFIG.FLIP_STAGGER * (this.cols - 1) + CONFIG.FLIP_DURATION * 2;
            let completedCount = 0;

            rowTiles.forEach((tile, i) => {
                const delay = i * CONFIG.FLIP_STAGGER;

                setTimeout(() => {
                    // Phase 1: Flip in (hide)
                    tile.classList.add('tile-flip-in');

                    setTimeout(() => {
                        // At halfway point: change the color/state
                        tile.classList.remove('tile-flip-in');
                        tile.dataset.state = feedback[i];
                        tile.setAttribute('aria-label',
                            `Row ${row + 1}, Column ${i + 1}: ${tile.textContent}, ${feedback[i]}`
                        );

                        // Phase 2: Flip out (reveal)
                        tile.classList.add('tile-flip-out');

                        setTimeout(() => {
                            tile.classList.remove('tile-flip-out');
                            completedCount++;
                            if (completedCount === this.cols) {
                                resolve();
                            }
                        }, CONFIG.FLIP_DURATION);
                    }, CONFIG.FLIP_DURATION);
                }, delay);
            });

            // Safety timeout
            setTimeout(resolve, totalDuration + 200);
        });
    }

    /**
     * Shake a row to indicate an invalid guess.
     * @param {number} row
     */
    shakeRow(row) {
        const rowEl = this.container.querySelector(`[data-row="${row}"].board-row`);
        if (!rowEl) return;
        UI.animateElement(rowEl, 'row-shake', 500);
    }

    /**
     * Bounce a row sequentially to celebrate a win.
     * @param {number} row
     */
    bounceRow(row) {
        const rowTiles = this.tiles[row];
        if (!rowTiles) return;

        rowTiles.forEach((tile, i) => {
            tile.classList.add('tile-bounce', `tile-bounce-${i}`);
            setTimeout(() => {
                tile.classList.remove('tile-bounce', `tile-bounce-${i}`);
            }, 1000 + i * CONFIG.BOUNCE_STAGGER);
        });
    }

    /**
     * Set the active row indicator.
     * @param {number} row
     */
    setActiveRow(row) {
        // Remove active from all rows
        const rows = this.container.querySelectorAll('.board-row');
        rows.forEach(r => r.classList.remove('active'));

        // Add active to the current row
        if (row < this.rows) {
            const activeRow = this.container.querySelector(`[data-row="${row}"].board-row`);
            if (activeRow) activeRow.classList.add('active');
        }
    }

    /**
     * Highlight the current column cursor position.
     * @param {number} row
     * @param {number} col
     */
    setCurrentTile(row, col) {
        // Remove .current from all tiles in the active row
        const rowTiles = this.tiles[row];
        if (!rowTiles) return;
        rowTiles.forEach(t => t.classList.remove('current'));

        // Mark current
        if (col < this.cols) {
            const tile = this.getTile(row, col);
            if (tile) tile.classList.add('current');
        }
    }

    /**
     * Reset the entire board (clear all tiles).
     */
    reset() {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                this.clearTile(r, c);
            }
            // Remove any animation classes from rows
            const rowEl = this.container.querySelector(`[data-row="${r}"].board-row`);
            if (rowEl) {
                rowEl.classList.remove('active', 'row-shake');
            }
        }
        this.setActiveRow(0);
    }

    /**
     * Get a tile element by row and column.
     * @param {number} row
     * @param {number} col
     * @returns {HTMLElement|null}
     */
    getTile(row, col) {
        if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return null;
        return this.tiles[row] ? this.tiles[row][col] : null;
    }

    // ════════════════════════════════════════════
    //  MINI BOARD (for opponent progress)
    // ════════════════════════════════════════════

    /**
     * Create a mini board inside a container for showing opponent progress.
     * @param {string} containerId - ID of the mini board container.
     * @param {number} rows
     * @param {number} cols
     * @returns {HTMLElement} The mini board element.
     */
    static createMiniBoard(containerId, rows = CONFIG.MAX_GUESSES, cols = CONFIG.WORD_LENGTH) {
        const container = document.getElementById(containerId);
        if (!container) return null;

        const miniBoard = document.createElement('div');
        miniBoard.className = 'mini-board';
        miniBoard.id = `mini-board-${containerId}`;

        for (let r = 0; r < rows; r++) {
            const rowEl = document.createElement('div');
            rowEl.className = 'mini-board-row';
            rowEl.dataset.row = r;

            for (let c = 0; c < cols; c++) {
                const tile = document.createElement('div');
                tile.className = 'mini-tile';
                tile.dataset.row = r;
                tile.dataset.col = c;
                tile.dataset.state = 'empty';
                rowEl.appendChild(tile);
            }

            miniBoard.appendChild(rowEl);
        }

        container.appendChild(miniBoard);
        return miniBoard;
    }

    /**
     * Update a row on a mini board with feedback colors.
     * @param {HTMLElement} miniBoard - The mini board element.
     * @param {number} row
     * @param {Array<string>} feedback - Array of 'correct' | 'present' | 'absent'.
     */
    static updateMiniRow(miniBoard, row, feedback) {
        if (!miniBoard) return;

        const rowEl = miniBoard.querySelector(`.mini-board-row[data-row="${row}"]`);
        if (!rowEl) return;

        const tiles = rowEl.querySelectorAll('.mini-tile');
        tiles.forEach((tile, i) => {
            if (feedback[i]) {
                tile.dataset.state = feedback[i];
            }
        });
    }

    /**
     * Reset all tiles on a mini board.
     * @param {HTMLElement} miniBoard
     */
    static resetMiniBoard(miniBoard) {
        if (!miniBoard) return;
        const tiles = miniBoard.querySelectorAll('.mini-tile');
        tiles.forEach(tile => {
            tile.dataset.state = 'empty';
        });
    }
}
