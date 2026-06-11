/**
 * GameRoom class for Wordle Party.
 * Manages the state of a single game room including players, guesses,
 * turns (co-op), scoring, and multi-round support.
 */

const { pickRandomWord, isValidWord, getFeedback } = require('./wordEngine');

const MAX_PLAYERS = 4;
const MAX_GUESSES = 6;
const SOLVE_POSITION_SCORES = [100, 60, 30, 10];

class GameRoom {
  /**
   * @param {string} roomCode - The unique room code
   * @param {string} hostSocketId - Socket ID of the host
   * @param {string} hostName - Display name of the host
   * @param {string} gameMode - 'race' or 'coop'
   */
  constructor(roomCode, hostSocketId, hostName, gameMode) {
    this.roomCode = roomCode;
    this.gameMode = gameMode;
    this.status = 'waiting'; // 'waiting' | 'playing' | 'finished'
    this.targetWord = null;
    this.players = new Map();
    this.hostId = hostSocketId;
    this.round = 0;
    this.currentTurnIndex = 0; // For coop mode: index into player order
    this.solveOrder = [];      // Track order of solvers for scoring
    this.createdAt = Date.now();
    this.lastActivity = Date.now();

    // Co-op shared state
    this.coopGuesses = [];
    this.coopFeedback = [];

    // Add the host as the first player
    this._addPlayerInternal(hostSocketId, hostName, 0);
  }

  /**
   * Internal method to add a player.
   * @param {string} socketId
   * @param {string} name
   * @param {number} index
   * @returns {object} Player object
   */
  _addPlayerInternal(socketId, name, index) {
    const player = {
      id: socketId,
      name: name,
      index: index,
      guesses: [],
      feedback: [],
      solved: false,
      failed: false,
      score: 0,
    };
    this.players.set(socketId, player);
    return player;
  }

  /**
   * Add a player to the room.
   * @param {string} socketId
   * @param {string} name
   * @returns {{ success: boolean, player?: object, error?: string }}
   */
  addPlayer(socketId, name) {
    this.lastActivity = Date.now();

    if (this.players.has(socketId)) {
      return { success: false, error: 'You are already in this room' };
    }

    if (this.players.size >= MAX_PLAYERS) {
      return { success: false, error: 'Room is full (max 4 players)' };
    }

    if (this.status === 'playing') {
      return { success: false, error: 'Game is already in progress' };
    }

    // If the room is empty (e.g., host reconnected), make them the host
    if (this.players.size === 0) {
      this.hostId = socketId;
    }

    // Find the next available index
    const usedIndices = new Set();
    for (const p of this.players.values()) {
      usedIndices.add(p.index);
    }
    let nextIndex = 0;
    while (usedIndices.has(nextIndex)) nextIndex++;

    const player = this._addPlayerInternal(socketId, name, nextIndex);
    return { success: true, player };
  }

  /**
   * Remove a player from the room.
   * @param {string} socketId
   * @returns {{ removed: boolean, playerName?: string, isEmpty: boolean, newHostId?: string }}
   */
  removePlayer(socketId) {
    this.lastActivity = Date.now();
    const player = this.players.get(socketId);

    if (!player) {
      return { removed: false, isEmpty: this.players.size === 0 };
    }

    const playerName = player.name;
    this.players.delete(socketId);

    const isEmpty = this.players.size === 0;
    let newHostId = null;

    // Reassign host if the host left and room isn't empty
    if (!isEmpty && socketId === this.hostId) {
      const firstPlayer = this.players.values().next().value;
      this.hostId = firstPlayer.id;
      newHostId = firstPlayer.id;
    }

    // If game is in progress and in coop mode, adjust current turn
    if (this.status === 'playing' && this.gameMode === 'coop' && !isEmpty) {
      const playerOrder = this._getPlayerOrder();
      if (playerOrder.length > 0) {
        this.currentTurnIndex = this.currentTurnIndex % playerOrder.length;
      }
    }

    // Check if game should end due to player leaving
    if (this.status === 'playing' && !isEmpty) {
      if (this.isGameOver()) {
        this.status = 'finished';
      }
    }

    return { removed: true, playerName, isEmpty, newHostId };
  }

  /**
   * Start a new game.
   * @returns {{ success: boolean, error?: string }}
   */
  startGame() {
    this.lastActivity = Date.now();

    if (this.players.size < 1) {
      return { success: false, error: 'Need at least 1 player to start' };
    }

    if (this.status === 'playing') {
      return { success: false, error: 'Game is already in progress' };
    }

    this.targetWord = pickRandomWord();
    this.status = 'playing';
    this.round += 1;
    this.solveOrder = [];
    this.currentTurnIndex = 0;
    this.coopGuesses = [];
    this.coopFeedback = [];

    // Reset player game state but keep scores
    for (const player of this.players.values()) {
      player.guesses = [];
      player.feedback = [];
      player.solved = false;
      player.failed = false;
    }

    return { success: true };
  }

  /**
   * Submit a guess from a player.
   * @param {string} socketId
   * @param {string} guess
   * @returns {{ success: boolean, error?: string, result?: object }}
   */
  submitGuess(socketId, guess) {
    this.lastActivity = Date.now();

    if (this.status !== 'playing') {
      return { success: false, error: 'Game is not in progress' };
    }

    const player = this.players.get(socketId);
    if (!player) {
      return { success: false, error: 'You are not in this room' };
    }

    // Normalize guess
    const normalizedGuess = guess.toLowerCase().trim();

    // Validate guess format
    if (normalizedGuess.length !== 5) {
      return { success: false, error: 'Guess must be exactly 5 letters' };
    }

    if (!/^[a-z]{5}$/.test(normalizedGuess)) {
      return { success: false, error: 'Guess must contain only letters' };
    }

    // Validate guess is a real word
    if (!isValidWord(normalizedGuess)) {
      return { success: false, error: 'Not a valid word' };
    }

    if (this.gameMode === 'race') {
      return this._submitRaceGuess(player, normalizedGuess);
    } else {
      return this._submitCoopGuess(socketId, player, normalizedGuess);
    }
  }

  /**
   * Handle a guess in race mode.
   * @param {object} player
   * @param {string} guess
   * @returns {object}
   */
  _submitRaceGuess(player, guess) {
    if (player.solved) {
      return { success: false, error: 'You have already solved this word' };
    }

    if (player.failed) {
      return { success: false, error: 'You have used all your guesses' };
    }

    if (player.guesses.length >= MAX_GUESSES) {
      return { success: false, error: 'You have used all your guesses' };
    }

    const feedback = getFeedback(guess, this.targetWord);
    player.guesses.push(guess);
    player.feedback.push(feedback);

    const solved = feedback.every(f => f === 'correct');
    if (solved) {
      player.solved = true;
      this.solveOrder.push(player.id);
    } else if (player.guesses.length >= MAX_GUESSES) {
      player.failed = true;
    }

    // Check if the game is over
    const gameOver = this.isGameOver();
    if (gameOver) {
      this.status = 'finished';
    }

    return {
      success: true,
      result: {
        playerId: player.id,
        playerName: player.name,
        guess,
        feedback,
        guessNumber: player.guesses.length,
        solved,
        failed: player.failed,
        gameOver,
      },
    };
  }

  /**
   * Handle a guess in coop mode.
   * @param {string} socketId
   * @param {object} player
   * @param {string} guess
   * @returns {object}
   */
  _submitCoopGuess(socketId, player, guess) {
    if (this.coopGuesses.length >= MAX_GUESSES) {
      return { success: false, error: 'All guesses have been used' };
    }

    const feedback = getFeedback(guess, this.targetWord);
    this.coopGuesses.push(guess);
    this.coopFeedback.push(feedback);

    // Also store on the player who made the guess for reference
    player.guesses.push(guess);
    player.feedback.push(feedback);

    const solved = feedback.every(f => f === 'correct');
    let gameOver = false;

    if (solved) {
      // Everyone wins in coop
      for (const p of this.players.values()) {
        p.solved = true;
      }
      gameOver = true;
    } else if (this.coopGuesses.length >= MAX_GUESSES) {
      // Everyone fails in coop
      for (const p of this.players.values()) {
        p.failed = true;
      }
      gameOver = true;
    }

    if (gameOver) {
      this.status = 'finished';
    }

    return {
      success: true,
      result: {
        playerId: player.id,
        playerName: player.name,
        guess,
        feedback,
        guessNumber: this.coopGuesses.length,
        solved,
        failed: this.coopGuesses.length >= MAX_GUESSES && !solved,
        gameOver,
      },
    };
  }

  /**
   * Get players in a consistent order for coop turn rotation.
   * @returns {object[]}
   */
  _getPlayerOrder() {
    return Array.from(this.players.values()).sort((a, b) => a.index - b.index);
  }

  /**
   * Check if the game is over.
   * @returns {boolean}
   */
  isGameOver() {
    if (this.status !== 'playing') return false;

    if (this.gameMode === 'coop') {
      // Coop ends when solved or all guesses used
      const solved = this.coopFeedback.length > 0 &&
        this.coopFeedback[this.coopFeedback.length - 1].every(f => f === 'correct');
      return solved || this.coopGuesses.length >= MAX_GUESSES;
    }

    // Race mode: game ends when all players are done (solved or failed)
    for (const player of this.players.values()) {
      if (!player.solved && !player.failed) {
        return false;
      }
    }
    return true;
  }

  /**
   * Compute final results with scoring.
   * @returns {object}
   */
  getResults() {
    if (this.gameMode === 'race') {
      return this._getRaceResults();
    } else {
      return this._getCoopResults();
    }
  }

  /**
   * Compute race mode results and scoring.
   * @returns {object}
   */
  _getRaceResults() {
    const results = [];

    for (const player of this.players.values()) {
      let roundScore = 0;

      if (player.solved) {
        const solvePosition = this.solveOrder.indexOf(player.id);
        const baseScore = SOLVE_POSITION_SCORES[Math.min(solvePosition, SOLVE_POSITION_SCORES.length - 1)];
        const guessBonus = (MAX_GUESSES - player.guesses.length) * 10;
        roundScore = baseScore + guessBonus;
      }

      player.score += roundScore;

      results.push({
        playerId: player.id,
        playerName: player.name,
        guesses: player.guesses,
        feedback: player.feedback,
        guessCount: player.guesses.length,
        solved: player.solved,
        failed: player.failed,
        roundScore,
        totalScore: player.score,
      });
    }

    // Sort by: solved first (by solve order), then failed
    results.sort((a, b) => {
      if (a.solved && !b.solved) return -1;
      if (!a.solved && b.solved) return 1;
      if (a.solved && b.solved) return a.roundScore > b.roundScore ? -1 : 1;
      return 0;
    });

    const winner = results.find(r => r.solved);

    return {
      gameMode: 'race',
      word: this.targetWord,
      round: this.round,
      results,
      winner: winner ? { playerId: winner.playerId, playerName: winner.playerName } : null,
    };
  }

  /**
   * Compute coop mode results.
   * @returns {object}
   */
  _getCoopResults() {
    const solved = this.coopFeedback.length > 0 &&
      this.coopFeedback[this.coopFeedback.length - 1].every(f => f === 'correct');

    const results = [];
    for (const player of this.players.values()) {
      results.push({
        playerId: player.id,
        playerName: player.name,
        personalGuesses: player.guesses,
        personalFeedback: player.feedback,
        personalGuessCount: player.guesses.length,
      });
    }

    return {
      gameMode: 'coop',
      word: this.targetWord,
      round: this.round,
      solved,
      guesses: this.coopGuesses,
      feedback: this.coopFeedback,
      guessCount: this.coopGuesses.length,
      results,
      winner: solved ? 'team' : null,
    };
  }

  /**
   * Start a new round. Picks new word, resets boards, keeps scores.
   * @returns {{ success: boolean, error?: string }}
   */
  startNewRound() {
    this.lastActivity = Date.now();

    if (this.status !== 'finished') {
      return { success: false, error: 'Current game is not finished yet' };
    }

    this.targetWord = pickRandomWord();
    this.status = 'playing';
    this.round += 1;
    this.solveOrder = [];
    this.currentTurnIndex = 0;
    this.coopGuesses = [];
    this.coopFeedback = [];

    // Reset player game state but keep cumulative scores
    for (const player of this.players.values()) {
      player.guesses = [];
      player.feedback = [];
      player.solved = false;
      player.failed = false;
    }

    return { success: true };
  }

  /**
   * Get sanitized public state (no target word exposed).
   * @returns {object}
   */
  getPublicState() {
    const players = [];
    for (const player of this.players.values()) {
      players.push({
        id: player.id,
        name: player.name,
        index: player.index,
        guessCount: player.guesses.length,
        solved: player.solved,
        failed: player.failed,
        score: player.score,
      });
    }

    const state = {
      roomCode: this.roomCode,
      gameMode: this.gameMode,
      status: this.status,
      hostId: this.hostId,
      round: this.round,
      players,
      playerCount: this.players.size,
      maxPlayers: MAX_PLAYERS,
    };

    if (this.gameMode === 'coop') {
      state.currentTurn = this.getCurrentTurnPlayer();
      state.coopGuessCount = this.coopGuesses.length;
      state.maxGuesses = MAX_GUESSES;
    }

    return state;
  }

  /**
   * Get the current turn player (for coop mode).
   * @returns {{ id: string, name: string } | null}
   */
  getCurrentTurnPlayer() {
    if (this.gameMode !== 'coop' || this.status !== 'playing') {
      return null;
    }

    const playerOrder = this._getPlayerOrder();
    if (playerOrder.length === 0) return null;

    const current = playerOrder[this.currentTurnIndex % playerOrder.length];
    return { id: current.id, name: current.name };
  }

  /**
   * Get the list of player info objects.
   * @returns {object[]}
   */
  getPlayerList() {
    const players = [];
    for (const player of this.players.values()) {
      players.push({
        id: player.id,
        name: player.name,
        index: player.index,
        score: player.score,
      });
    }
    return players.sort((a, b) => a.index - b.index);
  }
}

module.exports = GameRoom;
