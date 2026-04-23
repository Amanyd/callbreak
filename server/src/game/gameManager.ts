import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, Room, ClientGameState, GameState, Suit } from '../../../shared/types';
import { RANK_ORDER } from '../../../shared/types';
import * as engine from './engine';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

// In-memory game state store
const activeGames = new Map<string, GameState>();
// Reverse index: playerId → roomCode for O(1) lookups
const playerGameMap = new Map<string, string>();
// Lock to prevent concurrent trick processing
const processingLock = new Set<string>();
// Track active timers per room for cleanup
const activeTimers = new Map<string, Set<ReturnType<typeof setTimeout>>>();
const BOT_NAMES = ['Bot-Alpha', 'Bot-Bravo', 'Bot-Charlie'];

function isBotId(id: string): boolean {
  return id.startsWith('bot-');
}

/** Schedule a timer that is automatically tracked for cleanup */
function scheduleTimer(roomCode: string, callback: () => void, delay: number): void {
  if (!activeTimers.has(roomCode)) {
    activeTimers.set(roomCode, new Set());
  }
  const timers = activeTimers.get(roomCode)!;
  const handle = setTimeout(() => {
    timers.delete(handle);
    // Guard: only execute if game still exists
    if (!activeGames.has(roomCode)) return;
    callback();
  }, delay);
  timers.add(handle);
}

// ─── Bot AI ──────────────────────────────────────────────────
function botChooseCard(state: GameState, botId: string): string {
  const player = state.players.find(p => p.playerId === botId);
  if (!player || player.hand.length === 0) throw new Error('Bot has no cards');

  const hand = player.hand;
  const trump = state.trumpSuit || 'spades';

  if (state.currentTrick.length === 0) {
    const nonTrump = hand.filter(c => c.suit !== trump);
    const pool = nonTrump.length > 0 ? nonTrump : hand;
    pool.sort((a, b) => RANK_ORDER[b.rank] - RANK_ORDER[a.rank]);
    return pool[0].id;
  }

  const leadSuit = state.leadSuit!;
  const cardsOfSuit = hand.filter(c => c.suit === leadSuit);

  if (cardsOfSuit.length > 0) {
    cardsOfSuit.sort((a, b) => RANK_ORDER[b.rank] - RANK_ORDER[a.rank]);
    return cardsOfSuit[0].id;
  }

  const trumps = hand.filter(c => c.suit === trump);
  if (trumps.length > 0) {
    trumps.sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank]);
    return trumps[0].id;
  }

  const sorted = [...hand].sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank]);
  return sorted[0].id;
}

function botChooseBid(state: GameState, botId: string): { bid: number | 'pass', suit?: Suit } {
  const player = state.players.find(p => p.playerId === botId);
  if (!player) return { bid: state.mode === 'solo' ? 2 : 'pass' };

  if (state.mode === 'solo') {
    let estimate = 0;
    for (const card of player.hand) {
      if (card.suit === 'spades') estimate += 0.6;
      if (RANK_ORDER[card.rank] >= 12) estimate += 0.5;
      if (RANK_ORDER[card.rank] === 14) estimate += 0.3;
    }
    return { bid: Math.max(1, Math.min(13, Math.round(estimate))) };
  } else {
    let bestSuit: Suit = 'spades';
    let bestEstimate = 0;
    const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
    
    for (const s of suits) {
      let estimate = 0;
      for (const card of player.hand) {
        if (card.suit === s) estimate += 0.8;
        else if (RANK_ORDER[card.rank] >= 13) estimate += 0.5;
        if (RANK_ORDER[card.rank] >= 12) estimate += 0.3;
        if (RANK_ORDER[card.rank] === 14) estimate += 0.3;
      }
      if (estimate > bestEstimate) {
        bestEstimate = estimate;
        bestSuit = s;
      }
    }
    
    const requiredBid = state.highestBid !== null ? state.highestBid + 1 : 6;
    if (requiredBid <= 13 && bestEstimate >= requiredBid - 1) {
      return { bid: requiredBid, suit: bestSuit };
    } else {
      return { bid: 'pass' };
    }
  }
}

// ─── Fill bots ───────────────────────────────────────────────
function fillBotsInRoom(room: Room): void {
  const takenSeats = new Set(room.players.map(p => p.seat));
  let botIndex = 0;

  while (room.players.length < 4) {
    let seat = 0;
    while (takenSeats.has(seat)) seat++;
    takenSeats.add(seat);

    const botId = `bot-${room.code}-${botIndex}`;
    room.players.push({
      id: botId,
      name: BOT_NAMES[botIndex] || `Bot-${botIndex + 1}`,
      seat,
      connected: true,
    });
    botIndex++;
  }
}

// ─── Trick completion (shared between human + bot paths) ─────
/**
 * After the 4th card is played, broadcast state so client sees all 4 cards,
 * then WAIT, then resolve the trick winner and continue.
 */
function scheduleTrickCompletion(io: IO, state: GameState, room: Room): void {
  // Broadcast state WITH all 4 cards visible on the table
  broadcastState(io, state, room);

  // Snapshot the trick before we clear it
  const completedTrick = [...state.currentTrick];

  // After a short pause so the player can see all 4 cards, resolve the trick
  scheduleTimer(state.roomCode, () => {
    try {
      const winnerId = engine.completeTrick(state);

      io.to(state.roomCode).emit('game:trickEnd', {
        winnerId,
        trick: completedTrick,
      });

      // After the slide animation completes, continue
      scheduleTimer(state.roomCode, () => {
        try {
          if (engine.isRoundOver(state)) {
            handleRoundEnd(io, state, room);
          } else {
            broadcastState(io, state, room);
            scheduleNextBotTurn(io, state, room);
          }
        } catch (err: any) {
          console.error('Error after trick resolution:', err.message);
          // Attempt recovery: broadcast current state
          broadcastState(io, state, room);
          scheduleNextBotTurn(io, state, room);
        } finally {
          processingLock.delete(state.roomCode);
        }
      }, 1200);
    } catch (err: any) {
      console.error('Error completing trick:', err.message);
      processingLock.delete(state.roomCode);
    }
  }, 1200);
}

// ─── Bot turn scheduling ────────────────────────────────────────
function scheduleNextBotTurn(io: IO, state: GameState, room: Room): void {
  const currentPlayerId = state.turnOrder[state.turnIndex];
  if (!isBotId(currentPlayerId)) return;

  scheduleTimer(state.roomCode, () => {
    try {
      if (state.phase === 'bidding') {
        executeBotBid(io, state, room);
      } else if (state.phase === 'playing') {
        executeBotPlay(io, state, room);
      }
    } catch (err: any) {
      console.error(`Bot ${currentPlayerId} error:`, err.message);
      // Recovery: try to advance to next player to prevent freeze
      state.turnIndex = (state.turnIndex + 1) % 4;
      broadcastState(io, state, room);
      scheduleNextBotTurn(io, state, room);
    }
  }, 500);
}

function executeBotBid(io: IO, state: GameState, room: Room): void {
  const currentPlayerId = state.turnOrder[state.turnIndex];
  const { bid, suit } = botChooseBid(state, currentPlayerId);
  engine.placeBid(state, currentPlayerId, bid, suit);
  io.to(state.roomCode).emit('game:bidPlaced', { playerId: currentPlayerId, bid, suit });
  broadcastState(io, state, room);
  scheduleNextBotTurn(io, state, room);
}

function executeBotPlay(io: IO, state: GameState, room: Room): void {
  if (processingLock.has(state.roomCode)) return; // don't play if trick is resolving

  const currentPlayerId = state.turnOrder[state.turnIndex];
  const cardId = botChooseCard(state, currentPlayerId);
  const card = engine.playCard(state, currentPlayerId, cardId);
  io.to(state.roomCode).emit('game:cardPlayed', { playerId: currentPlayerId, card });

  if (engine.isTrickComplete(state)) {
    processingLock.add(state.roomCode);
    scheduleTrickCompletion(io, state, room);
  } else {
    broadcastState(io, state, room);
    scheduleNextBotTurn(io, state, room);
  }
}

function handleRoundEnd(io: IO, state: GameState, room: Room): void {
  const scores = engine.scoreRound(state);
  const scoresWithNames = scores.map(s => {
    const rp = room.players.find(p => p.id === s.playerId);
    return { ...s, name: rp?.name || 'Unknown' };
  });
  io.to(state.roomCode).emit('game:roundEnd', { scores: scoresWithNames });

  if (state.round >= state.totalRounds) {
    state.phase = 'gameEnd';
    const rankings = engine.getFinalRankings(state);
    const rankingsWithNames = rankings.map(r => {
      const rp = room.players.find(p => p.id === r.playerId);
      return { ...r, name: rp?.name || 'Unknown' };
    });
    io.to(state.roomCode).emit('game:gameEnd', { rankings: rankingsWithNames });
    cleanupGame(state.roomCode);
  } else {
    // Delay before starting next round so roundEnd overlay is visible
    scheduleTimer(state.roomCode, () => {
      engine.startNextRound(state);
      broadcastState(io, state, room);
      scheduleNextBotTurn(io, state, room);
    }, 3000);
  }
}

// ─── Client state builder ─────────────────────────────────────
function buildClientState(state: GameState, forPlayerId: string, room: Room): ClientGameState {
  const me = state.players.find(p => p.playerId === forPlayerId);
  return {
    roomCode: state.roomCode,
    mode: state.mode,
    round: state.round,
    totalRounds: state.totalRounds,
    trick: state.trick,
    currentTrick: state.currentTrick,
    leadSuit: state.leadSuit,
    phase: state.phase,
    turnPlayerId: state.turnOrder[state.turnIndex],
    trumpSuit: state.trumpSuit,
    highestBid: state.highestBid,
    highestBidder: state.highestBidder,
    consecutivePasses: state.consecutivePasses,
    myHand: me?.hand || [],
    players: state.players.map(p => {
      const roomPlayer = room.players.find(rp => rp.id === p.playerId);
      return {
        id: p.playerId,
        name: roomPlayer?.name || 'Unknown',
        seat: state.turnOrder.indexOf(p.playerId),
        bid: p.bid,
        tricksWon: p.tricksWon,
        score: p.score,
        cardCount: p.hand.length,
        connected: roomPlayer?.connected ?? true,
      };
    }),
  };
}

function broadcastState(io: IO, state: GameState, room: Room): void {
  for (const player of state.players) {
    if (!isBotId(player.playerId)) {
      const clientState = buildClientState(state, player.playerId, room);
      io.to(player.playerId).emit('game:stateUpdate', clientState);
    }
  }
  const currentPlayerId = state.turnOrder[state.turnIndex];
  if (!isBotId(currentPlayerId)) {
    io.to(currentPlayerId).emit('game:yourTurn');
  }
}

// ─── Public API ─────────────────────────────────────────────────
export function startGame(io: IO, room: Room): void {
  fillBotsInRoom(room);

  const playerIds = room.players.map(p => p.id);
  const state = engine.initGameState(room.code, playerIds, room.mode, room.totalRounds);
  activeGames.set(room.code, state);

  // Register all players in reverse index for O(1) lookup
  for (const pid of playerIds) {
    playerGameMap.set(pid, room.code);
  }

  for (const player of state.players) {
    if (!isBotId(player.playerId)) {
      const clientState = buildClientState(state, player.playerId, room);
      io.to(player.playerId).emit('game:start', clientState);
    }
  }

  const firstBidderId = state.turnOrder[state.turnIndex];
  if (isBotId(firstBidderId)) {
    scheduleNextBotTurn(io, state, room);
  } else {
    io.to(firstBidderId).emit('game:yourTurn');
  }
}

export function handleBid(io: IO, room: Room, playerId: string, bid: number | 'pass', suit?: Suit): void {
  const state = findGameByPlayer(playerId);
  if (!state) throw new Error('Not in an active game');

  engine.placeBid(state, playerId, bid, suit);
  io.to(state.roomCode).emit('game:bidPlaced', { playerId, bid, suit });
  broadcastState(io, state, room);
  scheduleNextBotTurn(io, state, room);
}

export function handlePlayCard(io: IO, room: Room, playerId: string, cardId: string): void {
  const state = findGameByPlayer(playerId);
  if (!state) throw new Error('Not in an active game');
  if (processingLock.has(state.roomCode)) throw new Error('Trick is being resolved');

  const card = engine.playCard(state, playerId, cardId);
  io.to(state.roomCode).emit('game:cardPlayed', { playerId, card });

  if (engine.isTrickComplete(state)) {
    processingLock.add(state.roomCode);
    scheduleTrickCompletion(io, state, room);
  } else {
    broadcastState(io, state, room);
    scheduleNextBotTurn(io, state, room);
  }
}


function findGameByPlayer(playerId: string): GameState | undefined {
  const roomCode = playerGameMap.get(playerId);
  if (!roomCode) return undefined;
  return activeGames.get(roomCode);
}

/** Clean up all resources for a game (called on game end or room destroy) */
export function cleanupGame(roomCode: string): void {
  const state = activeGames.get(roomCode);
  if (state) {
    // Remove reverse-index entries for all players
    for (const p of state.players) {
      playerGameMap.delete(p.playerId);
    }
  }
  activeGames.delete(roomCode);
  processingLock.delete(roomCode);

  // Cancel all pending timers
  const timers = activeTimers.get(roomCode);
  if (timers) {
    for (const t of timers) clearTimeout(t);
    activeTimers.delete(roomCode);
  }
}
