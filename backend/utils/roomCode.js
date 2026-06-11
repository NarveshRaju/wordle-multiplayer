/**
 * Room code generator for Wordle Party.
 * Generates 4-character uppercase codes, avoiding ambiguous characters (0/O, 1/I/L).
 */

// Characters that are unambiguous when displayed
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Generate a random room code.
 * @param {number} [length=4] - Length of the code
 * @returns {string} A random room code
 */
function generateRoomCode(length = 4) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return code;
}

/**
 * Generate a unique room code that doesn't exist in the given set.
 * @param {Set<string>|Map<string,*>} existingCodes - Set or Map of existing codes
 * @param {number} [maxAttempts=100] - Maximum generation attempts before throwing
 * @returns {string} A unique room code
 */
function generateUniqueRoomCode(existingCodes, maxAttempts = 100) {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateRoomCode();
    const exists = existingCodes instanceof Map
      ? existingCodes.has(code)
      : existingCodes.has(code);
    if (!exists) return code;
  }
  throw new Error('Failed to generate a unique room code after maximum attempts');
}

/**
 * Validate that a string is a valid room code format.
 * @param {string} code
 * @returns {boolean}
 */
function isValidRoomCode(code) {
  if (typeof code !== 'string') return false;
  if (code.length !== 4) return false;
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/.test(code);
}

module.exports = {
  generateRoomCode,
  generateUniqueRoomCode,
  isValidRoomCode,
};
