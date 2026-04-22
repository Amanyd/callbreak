import { useState, useEffect, useCallback } from 'react';
import { SocketContext, socket } from './context/SocketContext';
import { LobbyScreen } from './screens/LobbyScreen';
import { WaitingRoom } from './screens/WaitingRoom';
import { GameScreen } from './screens/GameScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { startBackgroundMusic } from './sounds';
import type { Room, ClientGameState } from '@shared/types';
import './App.css';

type Screen = 'lobby' | 'waiting' | 'game' | 'results';

// Session persistence helpers
const SESSION_KEY = 'callbreak_session';
function saveSession(code: string, name: string) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ code, name }));
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
function loadSession(): { code: string; name: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.code && data.name) return data;
  } catch {}
  return null;
}

function App() {
  const savedSession = loadSession();
  const [screen, setScreen] = useState<Screen>('lobby');
  const [room, setRoom] = useState<Room | null>(null);
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [finalRankings, setFinalRankings] = useState<any[] | null>(null);
  const [playerName, setPlayerName] = useState(savedSession?.name || '');
  const [nameSet, setNameSet] = useState(!!savedSession?.name);

  useEffect(() => {
    if (window.screen && window.screen.orientation && 'lock' in window.screen.orientation) {
      (window.screen.orientation as any).lock('landscape').catch((e: any) => console.log('Orientation lock unavailable:', e));
    }
  }, []);

  // Navigate to a screen and push browser history
  const navigateTo = useCallback((newScreen: Screen) => {
    setScreen(newScreen);
    window.history.pushState({ screen: newScreen }, '', `#${newScreen}`);
  }, []);

  // Handle browser back button
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const targetScreen = e.state?.screen as Screen | undefined;

      if (targetScreen === 'lobby' || !targetScreen) {
        // Going back to lobby — leave room
        socket.emit('room:leave');
        setRoom(null);
        setGameState(null);
        setFinalRankings(null);
        setScreen('lobby');
      } else if (targetScreen === 'waiting') {
        setScreen('waiting');
      } else {
        // For game/results, push forward again to prevent leaving mid-game
        window.history.pushState({ screen }, '', `#${screen}`);
      }
    };

    window.addEventListener('popstate', handlePopState);

    // Push initial state
    if (!window.history.state) {
      window.history.replaceState({ screen: 'lobby' }, '', '#lobby');
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, [screen]);

  useEffect(() => {
    socket.on('room:created', (r) => {
      setRoom(r);
      saveSession(r.code, playerName);
      navigateTo('waiting');
    });

    socket.on('room:joined', (r) => {
      setRoom(r);
      saveSession(r.code, playerName);
      navigateTo('waiting');
    });

    socket.on('room:reconnected', ({ room: r, gameState: gs }) => {
      setRoom(r);
      if (gs) {
        setGameState(gs);
        navigateTo('game');
      } else {
        navigateTo('waiting');
      }
    });

    socket.on('room:updated', (r) => {
      setRoom(r);
    });

    socket.on('game:start', (state) => {
      setGameState(state);
      saveSession(state.roomCode, playerName);
      navigateTo('game');
    });

    socket.on('game:stateUpdate', (state) => {
      setGameState(state);
    });

    socket.on('game:gameEnd', ({ rankings }) => {
      setFinalRankings(rankings);
      clearSession();
      navigateTo('results');
    });

    socket.on('room:reset', (r) => {
      setRoom(r);
      setGameState(null);
      setFinalRankings(null);
      navigateTo('waiting');
    });

    socket.on('room:error', (msg) => {
      alert(msg);
    });

    socket.on('game:error', (msg) => {
      console.error('Game error:', msg);
    });

    return () => {
      socket.off('room:created');
      socket.off('room:joined');
      socket.off('room:reconnected');
      socket.off('room:updated');
      socket.off('game:start');
      socket.off('game:stateUpdate');
      socket.off('game:gameEnd');
      socket.off('room:reset');
      socket.off('room:error');
      socket.off('game:error');
    };
  }, [navigateTo, playerName]);

  // Auto-reconnect on socket connect/reconnect
  useEffect(() => {
    const attemptReconnect = () => {
      const session = loadSession();
      if (session) {
        console.log(`🔌 Attempting reconnect to room ${session.code}...`);
        socket.emit('room:reconnect', { code: session.code, playerName: session.name });
      }
    };

    // Only attempt on reconnection (not initial connect if we're already set up)
    socket.on('connect', attemptReconnect);
    
    // Also attempt right now if socket is already connected and we have a saved session
    if (socket.connected && loadSession() && screen === 'lobby') {
      attemptReconnect();
    }

    return () => { socket.off('connect', attemptReconnect); };
  }, [screen]);

  const handleSetName = (name: string) => {
    setPlayerName(name);
    setNameSet(true);
    startBackgroundMusic();
    window.history.replaceState({ screen: 'lobby' }, '', '#lobby');
  };

  const handleBackToLobby = () => {
    socket.emit('room:leave');
    clearSession();
    setRoom(null);
    setGameState(null);
    setFinalRankings(null);
    setScreen('lobby');
    window.history.pushState({ screen: 'lobby' }, '', '#lobby');
  };

  const handlePlayAgain = () => {
    socket.emit('room:playAgain');
  };

  return (
    <SocketContext.Provider value={socket}>
      <div className={`app${screen === 'game' ? ' game-active' : ''}`}>
        {/* Screen Router */}
        <main className="main-content">
          {!nameSet ? (
            <NameEntry onSubmit={handleSetName} />
          ) : screen === 'lobby' ? (
            <LobbyScreen playerName={playerName} />
          ) : screen === 'waiting' ? (
            <WaitingRoom room={room} onBack={handleBackToLobby} />
          ) : screen === 'game' ? (
            <GameScreen gameState={gameState} />
          ) : screen === 'results' ? (
            <ResultsScreen rankings={finalRankings} onPlayAgain={handlePlayAgain} onBackToLobby={handleBackToLobby} />
          ) : null}
        </main>
      </div>
    </SocketContext.Provider>
  );
}

function NameEntry({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState('');

  return (
    <div className="name-entry animate-slide-up">
      <div className="panel-hero panel-elevated name-card">
        <div className="name-card-inner">
          <span className="badge badge-primary" style={{ borderRadius: 'var(--radius-lg)', padding: '0.5rem 1.5rem' }}>ENTER THE ARENA</span>
          <h1 className="display-lg" style={{ marginTop: '1rem' }}>BREAK ME BAD!!</h1>
          <p className="body-lg" style={{ color: 'var(--on-surface-variant)', marginTop: '0.5rem' }}>
            Set your battle name and join the fight.
          </p>
          <div className="name-input-group">
            <input
              type="text"
              className="input"
              style={{ borderRadius: 'var(--radius-lg)' }}
              placeholder="Your Player Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSubmit(name.trim())}
              maxLength={16}
              autoFocus
            />
            <button
              className="btn btn-primary btn-large"
              onClick={() => name.trim() && onSubmit(name.trim())}
              disabled={!name.trim()}
            >
              ENTER ⚡
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
