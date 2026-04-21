import type { Room, Player, RoomMode } from '../../shared/types';

// In-memory room store
const rooms = new Map<string, Room>();
// Map socket.id → room code for fast disconnect lookup
const playerRoomMap = new Map<string, string>();

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  // Ensure uniqueness
  if (rooms.has(code)) return generateCode();
  return code;
}

export function createRoom(hostId: string, hostName: string): Room {
  const code = generateCode();
  const host: Player = {
    id: hostId,
    name: hostName,
    seat: 0,
    connected: true,
  };
  const room: Room = {
    code,
    host: hostId,
    mode: 'solo',
    totalRounds: 5,
    players: [host],
    state: 'waiting',
  };
  rooms.set(code, room);
  playerRoomMap.set(hostId, code);
  return room;
}

export function joinRoom(code: string, playerId: string, playerName: string): Room {
  const room = rooms.get(code);
  if (!room) throw new Error('Room not found');
  if (room.state !== 'waiting') throw new Error('Game already in progress');
  if (room.players.length >= 4) throw new Error('Room is full');
  if (room.players.find(p => p.id === playerId)) throw new Error('Already in this room');

  // Assign next available seat
  const takenSeats = new Set(room.players.map(p => p.seat));
  let seat = 0;
  while (takenSeats.has(seat)) seat++;

  const player: Player = {
    id: playerId,
    name: playerName,
    seat,
    connected: true,
  };
  room.players.push(player);
  playerRoomMap.set(playerId, code);
  return room;
}

export function leaveRoom(playerId: string): { room: Room | null; destroyed: boolean } {
  const code = playerRoomMap.get(playerId);
  if (!code) return { room: null, destroyed: false };

  const room = rooms.get(code);
  if (!room) {
    playerRoomMap.delete(playerId);
    return { room: null, destroyed: false };
  }

  room.players = room.players.filter(p => p.id !== playerId);
  playerRoomMap.delete(playerId);

  if (room.players.length === 0) {
    rooms.delete(code);
    return { room: null, destroyed: true };
  }

  // Transfer host if the host left
  if (room.host === playerId) {
    room.host = room.players[0].id;
  }

  return { room, destroyed: false };
}

export function markDisconnected(playerId: string): { room: Room | null; destroyed: boolean } {
  const code = playerRoomMap.get(playerId);
  if (!code) return { room: null, destroyed: false };
  const room = rooms.get(code);
  if (!room) {
    playerRoomMap.delete(playerId);
    return { room: null, destroyed: false };
  }

  // If room is still waiting, treat disconnect as a full leave
  if (room.state === 'waiting') {
    return leaveRoom(playerId);
  }

  // If game is in progress, mark as disconnected
  const player = room.players.find(p => p.id === playerId);
  if (player) player.connected = false;

  // If ALL human players (non-bot) are disconnected, destroy the room
  const humanPlayers = room.players.filter(p => !p.id.startsWith('bot-'));
  const allDisconnected = humanPlayers.every(p => !p.connected);
  if (allDisconnected) {
    // Clean up all player mappings
    room.players.forEach(p => playerRoomMap.delete(p.id));
    rooms.delete(code);
    return { room: null, destroyed: true };
  }

  return { room, destroyed: false };
}

export function setMode(code: string, playerId: string, mode: RoomMode): Room {
  const room = rooms.get(code);
  if (!room) throw new Error('Room not found');
  if (room.host !== playerId) throw new Error('Only the host can change the mode');
  room.mode = mode;
  // Reset rounds when switching modes
  if (mode === 'solo') room.totalRounds = 5;
  if (mode === 'team') room.totalRounds = 4;
  return room;
}

export function setTotalRounds(code: string, playerId: string, totalRounds: number): Room {
  const room = rooms.get(code);
  if (!room) throw new Error('Room not found');
  if (room.host !== playerId) throw new Error('Only the host can change rounds');
  if (totalRounds % 2 !== 0 || totalRounds < 2) throw new Error('Total rounds must be an even number');
  room.totalRounds = totalRounds;
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function getRoomByPlayer(playerId: string): Room | undefined {
  const code = playerRoomMap.get(playerId);
  return code ? rooms.get(code) : undefined;
}

export function listRooms(): Room[] {
  return Array.from(rooms.values()).filter(r => r.state === 'waiting');
}

export function setRoomState(code: string, state: Room['state']): void {
  const room = rooms.get(code);
  if (room) room.state = state;
}

/** Reset room back to waiting — remove bots, keep human players */
export function resetRoom(code: string): Room | null {
  const room = rooms.get(code);
  if (!room) return null;

  // Remove bot players and their mappings
  room.players = room.players.filter(p => {
    if (p.id.startsWith('bot-')) {
      playerRoomMap.delete(p.id);
      return false;
    }
    return true;
  });

  // Reset state
  room.state = 'waiting';

  return room;
}
