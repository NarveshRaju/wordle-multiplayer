/**
 * Wordle Party — UI Utilities
 * Toast notifications, modals, confetti, loading overlays, clipboard.
 */

const UI = (() => {
    'use strict';

    // ────────────────────────────────────────────
    //  TOAST NOTIFICATIONS
    // ────────────────────────────────────────────

    /**
     * Show a toast notification.
     * @param {string} message  - The message to display.
     * @param {'info'|'success'|'error'|'warning'} type - Toast variant.
     * @param {number} duration - Auto-dismiss duration in ms.
     */
    function showToast(message, type = 'info', duration = CONFIG.TOAST_DURATION) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.textContent = message;
        toast.setAttribute('role', 'status');

        container.appendChild(toast);

        // Auto-dismiss
        const timer = setTimeout(() => {
            dismissToast(toast);
        }, duration);

        // Click to dismiss early
        toast.addEventListener('click', () => {
            clearTimeout(timer);
            dismissToast(toast);
        });
    }

    /**
     * Dismiss a toast with exit animation.
     * @param {HTMLElement} toast
     */
    function dismissToast(toast) {
        if (!toast || toast.classList.contains('toast-exit')) return;
        toast.classList.add('toast-exit');
        toast.addEventListener('animationend', () => {
            toast.remove();
        }, { once: true });
    }

    // ────────────────────────────────────────────
    //  MODAL
    // ────────────────────────────────────────────

    /**
     * Show a modal with custom HTML content.
     * @param {string} contentHTML - Inner HTML for the modal body.
     */
    function showModal(contentHTML) {
        let overlay = document.getElementById('game-over-overlay');
        if (overlay) {
            // Re-use existing game-over overlay
            overlay.style.display = 'flex';
            overlay.classList.remove('modal-closing');
            overlay.setAttribute('aria-hidden', 'false');
            const body = overlay.querySelector('.modal__body');
            if (body && contentHTML) {
                body.innerHTML = contentHTML;
            }
            return;
        }

        // Create a generic modal overlay
        overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'dynamic-modal';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.innerHTML = `<div class="modal"><div class="modal__body">${contentHTML}</div></div>`;
        document.body.appendChild(overlay);
    }

    /**
     * Hide the currently visible modal.
     */
    function hideModal() {
        const overlays = document.querySelectorAll('.modal-overlay');
        overlays.forEach(overlay => {
            if (overlay.style.display === 'none') return;
            overlay.classList.add('modal-closing');
            overlay.addEventListener('animationend', () => {
                overlay.style.display = 'none';
                overlay.classList.remove('modal-closing');
                overlay.setAttribute('aria-hidden', 'true');
                // Remove dynamically created modals
                if (overlay.id === 'dynamic-modal') {
                    overlay.remove();
                }
            }, { once: true });
        });
    }

    // ────────────────────────────────────────────
    //  CONFETTI
    // ────────────────────────────────────────────

    /**
     * Show a burst of confetti particles.
     */
    function showConfetti() {
        let container = document.getElementById('confetti-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'confetti-container';
            container.className = 'confetti-container';
            container.setAttribute('aria-hidden', 'true');
            document.body.appendChild(container);
        }

        // Clear any old confetti
        container.innerHTML = '';

        const colors = [
            '#7c3aed', '#06b6d4', '#f59e0b', '#ef4444',
            '#22c55e', '#8b5cf6', '#ec4899', '#3b82f6',
            '#538d4e', '#b59f3b'
        ];

        for (let i = 0; i < CONFIG.CONFETTI_COUNT; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            const color = colors[Math.floor(Math.random() * colors.length)];
            const left = Math.random() * 100;
            const size = Math.random() * 8 + 6;
            const duration = CONFIG.CONFETTI_DURATION_MIN + Math.random() * (CONFIG.CONFETTI_DURATION_MAX - CONFIG.CONFETTI_DURATION_MIN);
            const delay = Math.random() * 1000;

            piece.style.cssText = `
                left: ${left}%;
                width: ${size}px;
                height: ${size}px;
                background: ${color};
                animation-duration: ${duration}ms;
                animation-delay: ${delay}ms;
            `;
            container.appendChild(piece);
        }

        // Clean up after animations complete
        setTimeout(() => {
            container.innerHTML = '';
        }, CONFIG.CONFETTI_DURATION_MAX + 1500);
    }

    // ────────────────────────────────────────────
    //  LOADING OVERLAY
    // ────────────────────────────────────────────

    /**
     * Show the full-screen loading overlay.
     * @param {string} message - Loading message to display.
     */
    function showLoading(message = 'Loading...') {
        const overlay = document.getElementById('loading-overlay');
        if (!overlay) return;
        const text = document.getElementById('loading-text');
        if (text) text.textContent = message;
        overlay.style.display = 'flex';
        overlay.setAttribute('aria-hidden', 'false');
    }

    /**
     * Hide the loading overlay.
     */
    function hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (!overlay) return;
        overlay.style.display = 'none';
        overlay.setAttribute('aria-hidden', 'true');
    }

    // ────────────────────────────────────────────
    //  CLIPBOARD
    // ────────────────────────────────────────────

    /**
     * Copy text to clipboard and show a success toast.
     * @param {string} text - Text to copy.
     */
    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied to clipboard!', 'success', 2000);
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                showToast('Copied to clipboard!', 'success', 2000);
            } catch (e) {
                showToast('Failed to copy', 'error', 2000);
            }
            textArea.remove();
        }
    }

    // ────────────────────────────────────────────
    //  ANIMATION HELPER
    // ────────────────────────────────────────────

    /**
     * Add an animation class to an element, then remove it after the duration.
     * @param {HTMLElement} el - The element to animate.
     * @param {string} animClass - CSS class to add.
     * @param {number} duration - Duration in ms before removal.
     * @returns {Promise} Resolves when animation completes.
     */
    function animateElement(el, animClass, duration = 500) {
        return new Promise(resolve => {
            el.classList.add(animClass);
            setTimeout(() => {
                el.classList.remove(animClass);
                resolve();
            }, duration);
        });
    }

    // ────────────────────────────────────────────
    //  EXPOSE PUBLIC API
    // ────────────────────────────────────────────

    return {
        showToast,
        showModal,
        hideModal,
        showConfetti,
        showLoading,
        hideLoading,
        copyToClipboard,
        animateElement
    };
})();
