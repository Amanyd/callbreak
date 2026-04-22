import { useSocket } from '../context/SocketContext';
import type { Room, RoomMode } from '@shared/types';

interface Props {
  room: Room | null;
  onBack: () => void;
}

export function WaitingRoom({ room, onBack }: Props) {
  const socket = useSocket();

  if (!room) return null;

  const isHost = socket.id === room.host;
  const isFull = room.players.length === 4;

  const handleSetMode = (mode: RoomMode) => {
    socket.emit('room:setMode', { mode });
  };

  const handleSetRounds = (rounds: number) => {
    socket.emit('room:setTotalRounds', { totalRounds: rounds });
  };

  const handleStart = () => {
    socket.emit('room:start');
  };

  const slots = Array.from({ length: 4 }, (_, i) => room.players[i] || null);

  return (
    <div className="waiting-room animate-slide-up">
      {/* LEFT: Room info + Players */}
      <div className="waiting-left">
        <div className="room-code-display">
          <span className="label-lg" style={{ color: '#ffffff' }}>ROOM CODE</span>
          <div className="room-code">{room.code}</div>
        </div>

        <div className="player-slots">
          {slots.map((player, i) => (
            <div
              key={i}
              className={`player-slot ${!player ? 'empty' : ''} ${player?.id === room.host ? 'host' : ''}`}
            >
              {player ? (
                <>
                  <div className="slot-avatar">
                    {player.name[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="title-md">{player.name}</div>
                    <div className="label-md" style={{ color: 'var(--on-surface-variant)' }}>
                      {player.id === room.host ? '👑 HOST' : `SEAT ${i + 1}`}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="slot-avatar empty-avatar">?</div>
                  <div>
                    <div className="title-md" style={{ color: '#ffffffaa' }}>Waiting...</div>
                    <div className="label-md" style={{ color: '#ffffffaa' }}>SEAT {i + 1}</div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: Settings + Actions */}
      <div className="waiting-right">
        {/* Mode Selector (host only) */}
        {isHost && (
          <div style={{ textAlign: 'center' }}>
            <span className="label-lg" style={{ display: 'block', marginBottom: '0.5rem', color: '#ffffff' }}>GAME MODE</span>
            <div className="mode-selector" style={{ justifyContent: 'center' }}>
              <button
                className={`mode-btn ${room.mode === 'solo' ? 'active' : ''}`}
                onClick={() => handleSetMode('solo')}
              >
                Solo
              </button>
              <button
                className={`mode-btn ${room.mode === 'team' ? 'active' : ''}`}
                onClick={() => handleSetMode('team')}
              >
                Team
              </button>
            </div>
            {room.mode === 'team' && (
              <div style={{ marginTop: '0.75rem' }}>
                <span className="label-md" style={{ display: 'block', marginBottom: '0.35rem', color: '#ffffffcc' }}>ROUNDS</span>
                <div className="mode-selector" style={{ justifyContent: 'center', gap: '0.5rem' }}>
                  {[2, 4, 6, 8, 10].map(r => (
                    <button
                      key={r}
                      className={`mode-btn ${room.totalRounds === r ? 'active' : ''}`}
                      onClick={() => handleSetRounds(r)}
                      style={{ minWidth: '40px', padding: '0.5rem' }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {!isHost && (
          <div style={{ textAlign: 'center', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
            <div className="badge badge-secondary" style={{ fontSize: '0.75rem', padding: '0.5rem 1rem' }}>
              MODE: {room.mode === 'solo' ? '⚔️ SOLO' : '🤝 TEAM'}
            </div>
            <div className="badge badge-secondary" style={{ fontSize: '0.75rem', padding: '0.5rem 1rem' }}>
              ROUNDS: {room.totalRounds}
            </div>
          </div>
        )}

        {/* Status */}
        <div className="text-center">
          {!isFull ? (
            <p className="body-md" style={{ color: '#ffffff' }}>
              Waiting for <strong>{4 - room.players.length}</strong> more player{4 - room.players.length !== 1 ? 's' : ''}... (bots fill seats)
            </p>
          ) : (
            <p className="body-md" style={{ color: '#ffffff' }}>
              All players in! {isHost ? 'Start!' : 'Waiting for host...'}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="waiting-actions">
          {isHost && (
            <button className="btn btn-primary btn-large w-full" onClick={handleStart}>
              START ({room.players.length}/4{room.players.length < 4 ? ' + bots' : ''})
            </button>
          )}
          <button className="btn btn-outline w-full" onClick={onBack}>
            ← LEAVE
          </button>
        </div>
      </div>
    </div>
  );
}
