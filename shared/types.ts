// ─── Card Types ─────────────────────────────────────────────
export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string; // e.g. "hearts-A"
}

export const SUIT_ORDER: Record<Suit, number> = { clubs: 0, diamonds: 1, hearts: 2, spades: 3 };
export const RANK_ORDER: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};
export const TRUMP_SUIT: Suit = 'spades';

// ─── Player & Room ─────────────────────────────────────────
export type RoomMode = 'solo' | 'team';

export interface Player {
  id: string;
  name: string;
  seat: number; // 0-3
  connected: boolean;
}

export interface Room {
  code: string;
  host: string;       // player id
  mode: RoomMode;
  totalRounds: number; // For Solo defaults to 5. For team mode, decided by host (even).
  players: Player[];
  state: 'waiting' | 'playing' | 'finished';
}

// ─── Game State ─────────────────────────────────────────────
export interface TrickCard {
  playerId: string;
  card: Card;
}

export interface PlayerGameState {
  playerId: string;
  hand: Card[];
  bid: number | 'pass' | null;
  tricksWon: number;
  score: number;       // cumulative across rounds
}

export interface GameState {
  roomCode: string;
  mode: RoomMode;
  round: number;       // 1-5
  totalRounds: number; // 5
  trick: number;       // 1-13 within a round
  currentTrick: TrickCard[];
  leadSuit: Suit | null;
  turnIndex: number;   // index into players array (0-3)
  dealerIndex: number;
  phase: 'bidding' | 'playing' | 'roundEnd' | 'gameEnd';
  players: PlayerGameState[];
  turnOrder: string[]; // player IDs in seat order
  
  // Team Mode specific fields
  trumpSuit: Suit | null; 
  highestBid: number | null;
  highestBidder: string | null;
  consecutivePasses: number;
}

// ─── Socket Events ──────────────────────────────────────────
export interface ServerToClientEvents {
  'room:created': (room: Room) => void;
  'room:joined': (room: Room) => void;
  'room:updated': (room: Room) => void;
  'room:list': (rooms: Room[]) => void;
  'room:error': (msg: string) => void;
  'room:reset': (room: Room) => void;

  'game:start': (state: ClientGameState) => void;
  'game:stateUpdate': (state: ClientGameState) => void;
  'game:bidPlaced': (data: { playerId: string; bid: number | 'pass'; suit?: Suit }) => void;
  'game:cardPlayed': (data: { playerId: string; card: Card }) => void;
  'game:trickEnd': (data: { winnerId: string; trick: TrickCard[] }) => void;
  'game:roundEnd': (data: { scores: { playerId: string; bid: number | 'pass'; tricksWon: number; roundScore: number; totalScore: number }[] }) => void;
  'game:gameEnd': (data: { rankings: { playerId: string; name: string; totalScore: number; rank: number }[] }) => void;
  'game:error': (msg: string) => void;
  'game:yourTurn': () => void;
}

export interface ClientToServerEvents {
  'room:create': (data: { playerName: string }) => void;
  'room:join': (data: { code: string; playerName: string }) => void;
  'room:leave': () => void;
  'room:list': () => void;
  'room:setMode': (data: { mode: RoomMode }) => void;
  'room:setTotalRounds': (data: { totalRounds: number }) => void;
  'room:start': () => void;
  'room:playAgain': () => void;

  'game:bid': (data: { bid: number | 'pass'; suit?: Suit }) => void;
  'game:playCard': (data: { cardId: string }) => void;
}

// What the client receives (hands are per-player, opponents' hidden)
export interface ClientGameState {
  roomCode: string;
  mode: RoomMode;
  round: number;
  totalRounds: number;
  trick: number;
  currentTrick: TrickCard[];
  leadSuit: Suit | null;
  phase: 'bidding' | 'playing' | 'roundEnd' | 'gameEnd';
  turnPlayerId: string;
  trumpSuit: Suit | null;
  highestBid: number | null;
  highestBidder: string | null;
  consecutivePasses: number;
  myHand: Card[];
  players: {
    id: string;
    name: string;
    seat: number;
    bid: number | 'pass' | null;
    tricksWon: number;
    score: number;
    cardCount: number;
    connected: boolean;
  }[];
}
