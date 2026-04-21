import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, Room, ClientGameState, GameState, Card, Suit } from '../../../shared/types';
import { RANK_ORDER, TRUMP_SUIT } from '../../../shared/types';
import * as engine from './engine';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

// In-memory game state store
const activeGames = new Map<string, GameState>();
const BOT_NAMES = ['Bot-Alpha', 'Bot-Bravo', 'Bot-Charlie'];

function isBotId(id: string): boolean {
  return id.startsWith('bot-');
}

// ─── Bot AI ──────────────────────────────────────────────────
/** Pick the best legal card for a bot to play */
function botChooseCard(state: GameState, botId: string): string {
  const player = state.players.find(p => p.playerId === botId);
  if (!player || player.hand.length === 0) throw new Error('Bot has no cards');

  const hand = player.hand;

  // If leading the trick, play the highest non-trump card (or highest trump if only trumps)
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
    // Must follow suit — play highest of that suit to try to win
    cardsOfSuit.sort((a, b) => RANK_ORDER[b.rank] - RANK_ORDER[a.rank]);
    return cardsOfSuit[0].id;
  }

  // Can't follow suit — play lowest trump to win cheaply, or dump lowest card
  const trumps = hand.filter(c => c.suit === trump);
  if (trumps.length > 0) {
    trumps.sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank]);
    return trumps[0].id; // lowest trump
  }

  // No lead suit, no trumps — dump lowest card
  const sorted = [...hand].sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank]);
  return sorted[0].id;
}

/** Choose a reasonable bid for a bot */
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
    // Team mode bidding
    let bestSuit: Suit = 'spades';
    let bestEstimate = 0;
    const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
    
    for (const s of suits) {
      let estimate = 0;
      for (const card of player.hand) {
        if (card.suit === s) estimate += 0.8; // trumps are very strong
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
    
    if (requiredBid <= 13 && bestEstimate >= requiredBid - 1) { // Will bid if its estimate is reasonably close
      return { bid: requiredBid, suit: bestSuit };
    } else {
      return { bid: 'pass' };
    }
  }
}

// ─── Fill bots ───────────────────────────────────────────────
/** Add bot players to room to fill up to 4 */
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

// ─── Process bot turn ──────────────────────────────────────────
/** If the current turn belongs to a bot, execute it automatically */
function processBotTurn(io: IO, state: GameState, room: Room): void {
  const currentPlayerId = state.turnOrder[state.turnIndex];
  if (!isBotId(currentPlayerId)) return;

  // Small delay to feel natural
  setTimeout(() => {
    try {
      if (state.phase === 'bidding') {
        const { bid, suit } = botChooseBid(state, currentPlayerId);
        engine.placeBid(state, currentPlayerId, bid, suit);
        io.to(state.roomCode).emit('game:bidPlaced', { playerId: currentPlayerId, bid, suit });
        broadcastState(io, state, room);
        // Check if next player is also a bot
        processBotTurn(io, state, room);
      } else if (state.phase === 'playing') {
        const cardId = botChooseCard(state, currentPlayerId);
        const card = engine.playCard(state, currentPlayerId, cardId);
        io.to(state.roomCode).emit('game:cardPlayed', { playerId: currentPlayerId, card });

        if (engine.isTrickComplete(state)) {
          const completedTrick = [...state.currentTrick];
          const winnerId = engine.completeTrick(state);

          setTimeout(() => {
            io.to(state.roomCode).emit('game:trickEnd', {
              winnerId,
              trick: completedTrick,
            });

            if (engine.isRoundOver(state)) {
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
                activeGames.delete(state.roomCode);
              } else {
                engine.startNextRound(state);
                broadcastState(io, state, room);
                processBotTurn(io, state, room);
              }
            } else {
              broadcastState(io, state, room);
              processBotTurn(io, state, room);
            }
          }, 1000);
        } else {
          broadcastState(io, state, room);
          processBotTurn(io, state, room);
        }
      }
    } catch (err: any) {
      console.error(`Bot ${currentPlayerId} error:`, err.message);
    }
  }, 600); // 600ms delay per bot action
}

// ─── Client state builders ─────────────────────────────────────
function buildClientState(state: GameState, forPlayerId: string): ClientGameState {
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
    players: state.players.map(p => ({
      id: p.playerId,
      name: '',
      seat: state.turnOrder.indexOf(p.playerId),
      bid: p.bid,
      tricksWon: p.tricksWon,
      score: p.score,
      cardCount: p.hand.length,
      connected: true,
    })),
  };
}

function buildClientStateWithNames(state: GameState, forPlayerId: string, room: Room): ClientGameState {
  const clientState = buildClientState(state, forPlayerId);
  clientState.players = clientState.players.map(p => {
    const roomPlayer = room.players.find(rp => rp.id === p.id);
    return { ...p, name: roomPlayer?.name || 'Unknown', connected: roomPlayer?.connected ?? true };
  });
  return clientState;
}

function broadcastState(io: IO, state: GameState, room: Room): void {
  for (const player of state.players) {
    if (!isBotId(player.playerId)) {
      const clientState = buildClientStateWithNames(state, player.playerId, room);
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
  // Fill bots if fewer than 4 human players
  fillBotsInRoom(room);

  const playerIds = room.players.map(p => p.id);
  const state = engine.initGameState(room.code, playerIds, room.mode, room.totalRounds);
  activeGames.set(room.code, state);

  // Send initial state to human players only
  for (const player of state.players) {
    if (!isBotId(player.playerId)) {
      const clientState = buildClientStateWithNames(state, player.playerId, room);
      io.to(player.playerId).emit('game:start', clientState);
    }
  }

  // Notify first bidder (or trigger bot)
  const firstBidderId = state.turnOrder[state.turnIndex];
  if (isBotId(firstBidderId)) {
    processBotTurn(io, state, room);
  } else {
    io.to(firstBidderId).emit('game:yourTurn');
  }
}

export function handleBid(io: IO, playerId: string, bid: number | 'pass', suit?: Suit): void {
  const state = findGameByPlayer(playerId);
  if (!state) throw new Error('Not in an active game');

  const room = getRoomForGame(state);

  engine.placeBid(state, playerId, bid, suit);
  io.to(state.roomCode).emit('game:bidPlaced', { playerId, bid, suit });

  broadcastState(io, state, room);

  // If next turn is a bot, process it
  processBotTurn(io, state, room);
}

export function handlePlayCard(io: IO, playerId: string, cardId: string): void {
  const state = findGameByPlayer(playerId);
  if (!state) throw new Error('Not in an active game');

  const room = getRoomForGame(state);
  const card = engine.playCard(state, playerId, cardId);

  io.to(state.roomCode).emit('game:cardPlayed', { playerId, card });

  if (engine.isTrickComplete(state)) {
    const completedTrick = [...state.currentTrick];
    const winnerId = engine.completeTrick(state);

    setTimeout(() => {
      io.to(state.roomCode).emit('game:trickEnd', {
        winnerId,
        trick: completedTrick,
      });

      if (engine.isRoundOver(state)) {
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
          activeGames.delete(state.roomCode);
        } else {
          engine.startNextRound(state);
          broadcastState(io, state, room);
          processBotTurn(io, state, room);
        }
      } else {
        broadcastState(io, state, room);
        processBotTurn(io, state, room);
      }
    }, 1500);
  } else {
    broadcastState(io, state, room);
    processBotTurn(io, state, room);
  }
}

// Helper to find game state by player
function findGameByPlayer(playerId: string): GameState | undefined {
  for (const state of activeGames.values()) {
    if (state.players.some(p => p.playerId === playerId)) {
      return state;
    }
  }
  return undefined;
}

// Get room data for a game
function getRoomForGame(state: GameState): Room {
  const { getRoom } = require('../roomManager');
  const room = getRoom(state.roomCode);
  if (!room) throw new Error('Room not found');
  return room;
}
