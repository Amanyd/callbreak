import type { GameState, Card, TrickCard, PlayerGameState, Suit, RoomMode } from '../../../shared/types';
import { RANK_ORDER } from '../../../shared/types';
import { createDeck, shuffleDeck, dealCards } from './deck';

/** Initialize a new game state for a room */
export function initGameState(
  roomCode: string,
  playerIds: string[],
  mode: RoomMode,
  totalRounds: number,
  dealerIndex: number = 0
): GameState {
  const deck = shuffleDeck(createDeck());
  const hands = dealCards(deck);

  const players: PlayerGameState[] = playerIds.map((id, i) => ({
    playerId: id,
    hand: hands[i],
    bid: null,
    tricksWon: 0,
    score: 0,
  }));

  // First bidder is the player after the dealer
  const firstBidder = (dealerIndex + 1) % 4;

  return {
    roomCode,
    mode,
    round: 1,
    totalRounds,
    trick: 1,
    currentTrick: [],
    leadSuit: null,
    turnIndex: firstBidder,
    dealerIndex,
    phase: 'bidding',
    players,
    turnOrder: playerIds,
    trumpSuit: mode === 'solo' ? 'spades' : null,
    highestBid: null,
    highestBidder: null,
    consecutivePasses: 0,
  };
}

/** Place a bid for a player */
export function placeBid(state: GameState, playerId: string, bid: number | 'pass', suit?: Suit): void {
  if (state.phase !== 'bidding') throw new Error('Not in bidding phase');
  if (state.turnOrder[state.turnIndex] !== playerId) throw new Error('Not your turn');

  const player = state.players.find(p => p.playerId === playerId);
  if (!player) throw new Error('Player not found');

  if (state.mode === 'solo') {
    if (bid === 'pass') throw new Error('Cannot pass in solo mode');
    if (typeof bid !== 'number' || bid < 1 || bid > 13) throw new Error('Bid must be between 1 and 13');
    if (player.bid !== null) throw new Error('Already placed a bid');

    player.bid = bid;
    
    let next = (state.turnIndex + 1) % 4;
    const allBid = state.players.every(p => p.bid !== null);
    if (allBid) {
      state.phase = 'playing';
      state.turnIndex = (state.dealerIndex + 1) % 4;
    } else {
      state.turnIndex = next;
    }
  } else {
    // Team mode
    if (bid === 'pass') {
      player.bid = 'pass';
      state.consecutivePasses++;
    } else {
      if (typeof bid !== 'number' || bid < 6 || bid > 13) throw new Error('Bid must be between 6 and 13');
      if (!suit) throw new Error('Must select a trump suit with bid');
      
      const requiredBid = state.highestBid !== null ? state.highestBid + 1 : 6;
      if (bid !== requiredBid) throw new Error(`Bid must be exactly ${requiredBid}`);
      
      player.bid = bid;
      state.highestBid = bid;
      state.highestBidder = playerId;
      state.trumpSuit = suit;
      state.consecutivePasses = 0;
    }

    // Check if bidding is over
    // If 3 consecutive passes AND someone has bid, bidding is over
    // If all 4 pass on the very first round of bids without anyone bidding, we must deal again, or force dealer to bid?
    // Let's assume if consecutivePasses === 4 and highestBid === null, we reshuffle and deal (re-init round).
    if (state.consecutivePasses >= 3 && state.highestBidder !== null) {
      state.phase = 'playing';
      // The highest bidder starts the trick play
      state.turnIndex = state.turnOrder.indexOf(state.highestBidder);
    } else if (state.consecutivePasses >= 4 && state.highestBidder === null) {
      // Everyone passed. Reshuffle and start bidding again
      startNextRound(state, true); // Keep same round number
    } else {
      state.turnIndex = (state.turnIndex + 1) % 4;
    }
  }
}

/** Check if a player can follow the lead suit */
function hasCard(hand: Card[], suit: Suit): boolean {
  return hand.some(c => c.suit === suit);
}

/** Validate and play a card */
export function playCard(state: GameState, playerId: string, cardId: string): Card {
  if (state.phase !== 'playing') throw new Error('Not in playing phase');
  if (state.turnOrder[state.turnIndex] !== playerId) throw new Error('Not your turn');

  const player = state.players.find(p => p.playerId === playerId);
  if (!player) throw new Error('Player not found');

  const cardIndex = player.hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) throw new Error('Card not in your hand');

  const card = player.hand[cardIndex];

  // Validate: must follow lead suit if possible
  if (state.currentTrick.length > 0 && state.leadSuit) {
    if (card.suit !== state.leadSuit && hasCard(player.hand, state.leadSuit)) {
      throw new Error(`Must follow lead suit (${state.leadSuit})`);
    }
  }

  // Play the card
  player.hand.splice(cardIndex, 1);
  state.currentTrick.push({ playerId, card });

  // If first card in trick, set lead suit
  if (state.currentTrick.length === 1) {
    state.leadSuit = card.suit;
  }

  // Advance turn
  state.turnIndex = (state.turnIndex + 1) % 4;

  return card;
}

/** Evaluate who wins the current trick */
export function evaluateTrick(trick: TrickCard[], leadSuit: Suit, trumpSuit: Suit): string {
  let winner = trick[0];

  for (let i = 1; i < trick.length; i++) {
    const challenger = trick[i];
    const winnerIsTrump = winner.card.suit === trumpSuit;
    const challengerIsTrump = challenger.card.suit === trumpSuit;

    if (challengerIsTrump && !winnerIsTrump) {
      // Trump beats non-trump
      winner = challenger;
    } else if (challengerIsTrump && winnerIsTrump) {
      // Both trump — higher rank wins
      if (RANK_ORDER[challenger.card.rank] > RANK_ORDER[winner.card.rank]) {
        winner = challenger;
      }
    } else if (!challengerIsTrump && !winnerIsTrump) {
      // Neither is trump — must be same suit as lead to compete
      if (challenger.card.suit === leadSuit && winner.card.suit === leadSuit) {
        if (RANK_ORDER[challenger.card.rank] > RANK_ORDER[winner.card.rank]) {
          winner = challenger;
        }
      } else if (challenger.card.suit === leadSuit) {
        winner = challenger;
      }
    }
  }

  return winner.playerId;
}

/** Check if a trick is complete (4 cards played) */
export function isTrickComplete(state: GameState): boolean {
  return state.currentTrick.length === 4;
}

/** Process end of a trick — returns winner ID */
export function completeTrick(state: GameState): string {
  if (!state.leadSuit) throw new Error('No lead suit set');
  if (!state.trumpSuit) throw new Error('No trump suit set');
  
  const winnerId = evaluateTrick(state.currentTrick, state.leadSuit, state.trumpSuit);

  // Update tricks won
  const winner = state.players.find(p => p.playerId === winnerId);
  if (winner) winner.tricksWon++;

  // Reset for next trick
  state.currentTrick = [];
  state.leadSuit = null;
  state.trick++;

  // Winner leads next trick
  state.turnIndex = state.turnOrder.indexOf(winnerId);

  return winnerId;
}

/** Check if round is over (13 tricks completed) */
export function isRoundOver(state: GameState): boolean {
  return state.trick > 13;
}

/** Score the round */
export function scoreRound(state: GameState): { playerId: string; bid: number | 'pass'; tricksWon: number; roundScore: number; totalScore: number }[] {
  if (state.mode === 'solo') {
    // Solo scoring
    return state.players.map(p => {
      const bid = (p.bid as number) || 1;
      let roundScore: number;
      if (p.tricksWon >= bid) {
        roundScore = bid + (p.tricksWon - bid) * 0.1;
      } else {
        roundScore = -bid;
      }
      p.score += roundScore;
      return {
        playerId: p.playerId,
        bid,
        tricksWon: p.tricksWon,
        roundScore,
        totalScore: p.score,
      };
    });
  } else {
    // Team scoring
    if (state.highestBidder === null || state.highestBid === null) throw new Error('No bidding team found');
    
    const bidderIndex = state.turnOrder.indexOf(state.highestBidder);
    const bidderPartnerIndex = (bidderIndex + 2) % 4;
    
    const bidTeamIds = [state.turnOrder[bidderIndex], state.turnOrder[bidderPartnerIndex]];
    
    let bidTeamTricks = 0;
    state.players.forEach(p => {
      if (bidTeamIds.includes(p.playerId)) bidTeamTricks += p.tricksWon;
    });

    const bidAchieved = bidTeamTricks >= state.highestBid;

    return state.players.map(p => {
      const isBidTeam = bidTeamIds.includes(p.playerId);
      let roundScore = 0;
      
      if (isBidTeam && bidAchieved) roundScore = 1;
      if (!isBidTeam && !bidAchieved) roundScore = 1;

      p.score += roundScore;
      
      return {
        playerId: p.playerId,
        bid: p.bid || 'pass',
        tricksWon: p.tricksWon,
        roundScore,
        totalScore: p.score,
      };
    });
  }
}

/** Start the next round */
export function startNextRound(state: GameState, sameRound: boolean = false): void {
  if (!sameRound) state.round++;
  state.trick = 1;
  state.currentTrick = [];
  state.leadSuit = null;
  state.dealerIndex = (state.dealerIndex + 1) % 4;
  state.turnIndex = (state.dealerIndex + 1) % 4;
  state.phase = 'bidding';
  state.trumpSuit = state.mode === 'solo' ? 'spades' : null;
  state.highestBid = null;
  state.highestBidder = null;
  state.consecutivePasses = 0;

  // Re-deal
  const deck = shuffleDeck(createDeck());
  const hands = dealCards(deck);
  state.players.forEach((p, i) => {
    p.hand = hands[i];
    p.bid = null;
    p.tricksWon = 0;
  });
}

/** Check if the entire game is over */
export function isGameOver(state: GameState): boolean {
  return state.round > state.totalRounds;
}

/** Get final rankings */
export function getFinalRankings(state: GameState): { playerId: string; totalScore: number; rank: number }[] {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  
  if (state.mode === 'team') {
    // In team mode, teammates should tie for ranking based on total score
    return state.players.map(p => {
      // Find highest score of this player's team
      const mySeat = state.turnOrder.indexOf(p.playerId);
      const partnerSeat = (mySeat + 2) % 4;
      const partnerId = state.turnOrder[partnerSeat];
      const partner = state.players.find(x => x.playerId === partnerId)!;
      // Their scores are identical anyway due to how we scored
      const teamScore = p.score;
      // Get rank by counting teams with strictly greater scores
      let greaterTeams = 0;
      const allScores = new Set(state.players.map(x => x.score));
      for (const s of allScores) {
        if (s > teamScore) greaterTeams++;
      }
      return {
        playerId: p.playerId,
        totalScore: teamScore,
        rank: greaterTeams + 1,
      };
    });
  } else {
    // Solo ranking
    return sorted.map((p, i) => ({
      playerId: p.playerId,
      totalScore: p.score,
      rank: i + 1,
    }));
  }
}
