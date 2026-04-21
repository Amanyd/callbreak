import { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import type { Room } from '@shared/types';

interface Props {
  playerName: string;
}

export function LobbyScreen({ playerName }: Props) {
  const socket = useSocket();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  useEffect(() => {
    socket.emit('room:list');
    socket.on('room:list', (list) => setRooms(list));
    return () => { socket.off('room:list'); };
  }, [socket]);

  const handleCreate = () => {
    socket.emit('room:create', { playerName });
  };

  const handleJoin = (code: string) => {
    if (code.trim()) {
      socket.emit('room:join', { code: code.trim().toUpperCase(), playerName });
      setShowJoinModal(false);
      setJoinCode('');
    }
  };

  return (
    <div className="lobby animate-slide-up">
      {/* Hero — Host a Battle */}
      <div className="panel-hero panel-elevated lobby-hero" onClick={handleCreate}>
        <div className="hero-content">
          <span className="badge badge-primary" style={{ borderRadius: 'var(--radius-lg)', padding: '0.4rem 1.25rem' }}>INSTANT ACTION</span>
          <h2 className="display-lg" style={{ marginTop: '0.5rem' }}>HOST A BATTLE</h2>
          <p className="body-md" style={{ color: 'var(--on-surface-variant)', marginTop: '0.25rem' }}>
            Set the rules, invite friends, and crush them.
          </p>
        </div>
        <button className="hero-btn" onClick={(e) => { e.stopPropagation(); handleCreate(); }}>+</button>
      </div>

      {/* Join by Code */}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <input
          type="text"
          className="input"
          placeholder="Enter Room Code (e.g. A8B2XY)"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && handleJoin(joinCode)}
          maxLength={6}
          style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', borderRadius: 'var(--radius-lg)' }}
        />
        <button className="btn btn-primary" onClick={() => handleJoin(joinCode)} disabled={joinCode.trim().length < 4}>
          JOIN
        </button>
      </div>

      {/* Battle Rooms List */}
      <div>
        <div className="rooms-header">
          <h3 className="headline-lg">BATTLE ROOMS</h3>
          <button className="btn btn-small btn-outline" onClick={() => socket.emit('room:list')}>
            ↻ REFRESH
          </button>
        </div>

        <div className="room-list" style={{ marginTop: '1rem' }}>
          {rooms.length === 0 ? (
            <div className="no-rooms">
              <p className="headline-md" style={{ marginBottom: '0.5rem', color: '#ffffff' }}>NO ACTIVE ROOMS</p>
              <p className="body-md" style={{ color: '#ffffff' }}>Be the first to host a battle!</p>
            </div>
          ) : (
            rooms.map((room) => (
              <div key={room.code} className="room-card">
                <div className="room-card-icon">🎴</div>
                <div className="room-card-info">
                  <div className="headline-md">ROOM #{room.code}</div>
                  <div className="body-md" style={{ color: 'var(--on-surface-variant)' }}>
                    {room.mode === 'solo' ? 'Solo' : 'Team'} • {room.players.length < 4 ? 'Open' : 'Full'}
                  </div>
                </div>
                <div className="room-card-meta">
                  <div className="player-count">
                    <div className="label-md">PLAYERS</div>
                    <div className="player-count-num">{room.players.length}/4</div>
                  </div>
                  <button
                    className="btn btn-primary btn-small"
                    disabled={room.players.length >= 4}
                    onClick={() => socket.emit('room:join', { code: room.code, playerName })}
                  >
                    JOIN
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
