/**
 * Wordle Party — Configuration
 * Global constants and settings.
 */
const CONFIG = {
    /** Backend WebSocket server URL. Change to your deployed URL for production. */
    BACKEND_URL: 'https://wordle-multiplayer-63la.onrender.com',

    /** Maximum number of players per room */
    MAX_PLAYERS: 4,

    /** Number of letters per word */
    WORD_LENGTH: 5,

    /** Maximum guesses allowed */
    MAX_GUESSES: 6,

    /** Player avatar colors (hex) */
    PLAYER_COLORS: ['#7c3aed', '#06b6d4', '#f59e0b', '#ef4444'],

    /** Player avatar color names — maps to CSS --player-N */
    PLAYER_COLOR_NAMES: ['purple', 'cyan', 'amber', 'red'],

    /** Tile flip animation duration in ms */
    FLIP_DURATION: 250,

    /** Delay between each tile flip in a row (ms) */
    FLIP_STAGGER: 250,

    /** Bounce animation delay between tiles (ms) */
    BOUNCE_STAGGER: 100,

    /** Toast auto-dismiss default duration (ms) */
    TOAST_DURATION: 3000,

    /** Confetti piece count */
    CONFETTI_COUNT: 60,

    /** Confetti animation duration range (ms) */
    CONFETTI_DURATION_MIN: 2000,
    CONFETTI_DURATION_MAX: 4000
};
