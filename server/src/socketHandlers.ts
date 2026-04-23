import type { Server, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '../../shared/types';
import * as roomMgr from './roomManager';
import { startGame, handleBid, handlePlayCard } from './game/gameManager';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerSocketHandlers(io: IO, socket: GameSocket): void {
  // Auto-join the lobby room on connection for scoped broadcasts
  socket.join('lobby');

  // ─── Lobby Scoping ──────────────────────────────────────────
  socket.on('lobby:join', () => {
    socket.join('lobby');
  });

  socket.on('lobby:leave', () => {
    socket.leave('lobby');
  });

  // ─── Room Events ─────────────────────────────────────────

  socket.on('room:create', ({ playerName }) => {
    try {
      const room = roomMgr.createRoom(socket.id, playerName);
      socket.join(room.code);
      socket.emit('room:created', room);
      io.to('lobby').emit('room:list', roomMgr.listRooms());
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
      io.to('lobby').emit('room:list', roomMgr.listRooms());
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
      io.to('lobby').emit('room:list', roomMgr.listRooms());
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

      // Remove all players from lobby room to stop receiving room:list
      for (const p of room.players) {
        const playerSocket = io.sockets.sockets.get(p.id);
        if (playerSocket) playerSocket.leave('lobby');
      }

      startGame(io, room);

      console.log(`🎮 Game started in room ${room.code}`);
    } catch (err: any) {
      socket.emit('room:error', err.message);
    }
  });

  // ─── Game Events ──────────────────────────────────────────
  socket.on('game:bid', ({ bid, suit }) => {
    try {
      const room = roomMgr.getRoomByPlayer(socket.id);
      if (!room) throw new Error('Not in a room');
      handleBid(io, room, socket.id, bid, suit);
    } catch (err: any) {
      socket.emit('game:error', err.message);
    }
  });

  socket.on('game:playCard', ({ cardId }) => {
    try {
      const room = roomMgr.getRoomByPlayer(socket.id);
      if (!room) throw new Error('Not in a room');
      handlePlayCard(io, room, socket.id, cardId);
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
      io.to('lobby').emit('room:list', roomMgr.listRooms());
      console.log(`🔄 Room ${room.code} reset for play again`);
    } catch (err: any) {
      socket.emit('room:error', err.message);
    }
  });

  // ─── Disconnect ──────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`💔 Player disconnected: ${socket.id}`);
    const { room } = roomMgr.markDisconnected(socket.id);
    if (room) {
      io.to(room.code).emit('room:updated', room);
    }
    io.to('lobby').emit('room:list', roomMgr.listRooms());
  });
}
