import type { Server, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '../../shared/types';
import * as roomMgr from './roomManager';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerSocketHandlers(io: IO, socket: GameSocket): void {
  // ─── Room Events ─────────────────────────────────────────

  socket.on('room:create', ({ playerName }) => {
    try {
      const room = roomMgr.createRoom(socket.id, playerName);
      socket.join(room.code);
      socket.emit('room:created', room);
      io.emit('room:list', roomMgr.listRooms());
      console.log(`📦 Room ${room.code} created by ${playerName}`);
    } catch (err: any) {
      socket.emit('room:error', err.message);
    }
  });

  socket.on('room:join', ({ code, playerName }) => {
    try {
      const room = roomMgr.joinRoom(code.toUpperCase(), socket.id, playerName);
      socket.join(room.code);
      socket.emit('room:joined', room);
      io.to(room.code).emit('room:updated', room);
      io.emit('room:list', roomMgr.listRooms());
      console.log(`🚪 ${playerName} joined room ${room.code}`);
    } catch (err: any) {
      socket.emit('room:error', err.message);
    }
  });

  socket.on('room:leave', () => {
    const { room, destroyed } = roomMgr.leaveRoom(socket.id);
    if (room) {
      socket.leave(room.code);
      io.to(room.code).emit('room:updated', room);
    }
    if (!destroyed) {
      io.emit('room:list', roomMgr.listRooms());
    }
  });

  socket.on('room:list', () => {
    socket.emit('room:list', roomMgr.listRooms());
  });

  socket.on('room:setMode', ({ mode }) => {
    try {
      const currentRoom = roomMgr.getRoomByPlayer(socket.id);
      if (!currentRoom) throw new Error('Not in a room');
      const room = roomMgr.setMode(currentRoom.code, socket.id, mode);
      io.to(room.code).emit('room:updated', room);
    } catch (err: any) {
      socket.emit('room:error', err.message);
    }
  });

  socket.on('room:setTotalRounds', ({ totalRounds }) => {
    try {
      const currentRoom = roomMgr.getRoomByPlayer(socket.id);
      if (!currentRoom) throw new Error('Not in a room');
      const room = roomMgr.setTotalRounds(currentRoom.code, socket.id, totalRounds);
      io.to(room.code).emit('room:updated', room);
    } catch (err: any) {
      socket.emit('room:error', err.message);
    }
  });

  socket.on('room:start', () => {
    try {
      const room = roomMgr.getRoomByPlayer(socket.id);
      if (!room) throw new Error('Not in a room');
      if (room.host !== socket.id) throw new Error('Only the host can start');
      if (room.players.length < 1) throw new Error('Need at least 1 player to start');

      roomMgr.setRoomState(room.code, 'playing');

      // Game logic will be wired in Phase 3
      // For now, just import and call startGame when it exists
      const { startGame } = require('./game/gameManager');
      startGame(io, room);

      console.log(`🎮 Game started in room ${room.code}`);
    } catch (err: any) {
      socket.emit('room:error', err.message);
    }
  });

  // ─── Game Events (wired in Phase 3) ────────────────────
  socket.on('game:bid', ({ bid, suit }) => {
    try {
      const { handleBid } = require('./game/gameManager');
      handleBid(io, socket.id, bid, suit);
    } catch (err: any) {
      socket.emit('game:error', err.message);
    }
  });

  socket.on('game:playCard', ({ cardId }) => {
    try {
      const { handlePlayCard } = require('./game/gameManager');
      handlePlayCard(io, socket.id, cardId);
    } catch (err: any) {
      socket.emit('game:error', err.message);
    }
  });

  socket.on('room:playAgain', () => {
    try {
      const room = roomMgr.getRoomByPlayer(socket.id);
      if (!room) throw new Error('Not in a room');

      const resetRoom = roomMgr.resetRoom(room.code);
      if (!resetRoom) throw new Error('Could not reset room');

      // Broadcast to all players in the room
      io.to(room.code).emit('room:reset', resetRoom);
      io.emit('room:list', roomMgr.listRooms());
      console.log(`🔄 Room ${room.code} reset for play again`);
    } catch (err: any) {
      socket.emit('room:error', err.message);
    }
  });

  // ─── Disconnect ──────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`💔 Player disconnected: ${socket.id}`);
    const { room, destroyed } = roomMgr.markDisconnected(socket.id);
    if (room) {
      io.to(room.code).emit('room:updated', room);
    }
    // Always refresh room list so stale rooms disappear
    io.emit('room:list', roomMgr.listRooms());
  });
}
