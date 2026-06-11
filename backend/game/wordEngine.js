/**
 * Word Engine for Wordle Party.
 * Handles word selection, validation, and feedback computation.
 */

const path = require('path');

// Load word lists
const solutions = require(path.join(__dirname, '..', 'data', 'solutions.json')).map(w => w.toLowerCase());
const validGuesses = require(path.join(__dirname, '..', 'data', 'valid-guesses.json'));

// Build a Set of all valid words for O(1) lookup
const allValidWords = new Set([...solutions, ...validGuesses]);

/**
 * Pick a random word from the solutions list.
 * @returns {string} A random 5-letter solution word (lowercase)
 */
function pickRandomWord() {
  const index = Math.floor(Math.random() * solutions.length);
  return solutions[index];
}

/**
 * Check if a word is valid (exists in solutions or valid-guesses).
 * @param {string} word - The word to check (case-insensitive)
 * @returns {boolean}
 */
function isValidWord(word) {
  if (typeof word !== 'string') return false;
  return allValidWords.has(word.toLowerCase());
}

/**
 * Compute feedback for a guess against a target word using the two-pass algorithm.
 *
 * Pass 1: Mark exact position matches as 'correct' (green).
 *         Remove matched letters from the available pool.
 * Pass 2: For remaining letters, check if they exist elsewhere in the target.
 *         Mark as 'present' (yellow) and consume from the pool.
 * Remaining positions are 'absent' (gray).
 *
 * @param {string} guess - The guessed word (5 letters, lowercase)
 * @param {string} target - The target word (5 letters, lowercase)
 * @returns {string[]} Array of 5 feedback strings: 'correct', 'present', or 'absent'
 */
function getFeedback(guess, target) {
  const guessLower = guess.toLowerCase();
  const targetLower = target.toLowerCase();
  const length = targetLower.length;

  const feedback = new Array(length).fill('absent');
  const targetChars = targetLower.split('');
  const guessChars = guessLower.split('');

  // Pass 1: Mark greens (exact matches)
  for (let i = 0; i < length; i++) {
    if (guessChars[i] === targetChars[i]) {
      feedback[i] = 'correct';
      targetChars[i] = null; // Remove from available pool
      guessChars[i] = null;  // Mark as processed
    }
  }

  // Pass 2: Mark yellows (present but wrong position)
  for (let i = 0; i < length; i++) {
    if (guessChars[i] === null) continue; // Already matched as green

    const targetIndex = targetChars.indexOf(guessChars[i]);
    if (targetIndex !== -1) {
      feedback[i] = 'present';
      targetChars[targetIndex] = null; // Consume from pool
    }
  }

  return feedback;
}

module.exports = {
  pickRandomWord,
  isValidWord,
  getFeedback,
  getSolutionCount: () => solutions.length,
  getValidWordCount: () => allValidWords.size,
};
