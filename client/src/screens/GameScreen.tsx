import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { useSocket } from '../context/SocketContext';
import { playCardThrow, playTrickWin, playTrickSlide, playCardDeal, playBidPlace } from '../sounds';
import type { ClientGameState, Card, Suit, TrickCard } from '@shared/types';

interface Props {
  gameState: ClientGameState | null;
}

// Avatar images from public/avatars
const AVATAR_IMAGES = [
  '/avatars/wallhaven-3q95d3_1280x960.png',
  '/avatars/wallhaven-d85zo3_1280x1024.png',
  '/avatars/wallhaven-qrzg8q_1280x960.png',
  '/avatars/wallhaven-rqdv21_1280x720.png',
];

const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
};

const SUIT_COLORS: Record<Suit, string> = {
  spades: 'suit-black', hearts: 'suit-red', diamonds: 'suit-red', clubs: 'suit-black',
};

// Use seat index directly for unique avatars
function getAvatarIndex(seat: number): number {
  return seat % AVATAR_IMAGES.length;
}

const FACE_IMAGES: Record<string, string> = {
  J: '/cards/jack.png',
  Q: '/cards/queen.png',
  K: '/cards/king.png',
};

const PlayingCard = memo(function PlayingCard({ card, onClick, disabled, isInTrick, isTrump, style, className }: {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  isInTrick?: boolean;
  isTrump?: boolean;
  style?: React.CSSProperties;
  className?: string;
}) {
  const FACE_RANKS = ['J', 'Q', 'K'];
  const isFace = FACE_RANKS.includes(card.rank);
  const faceFile = card.rank === 'J' ? 'jack' : card.rank === 'Q' ? 'queen' : 'king';

  return (
    <div
      className={`playing-card ${disabled ? 'disabled' : ''} ${isTrump ? 'trump' : ''} ${isInTrick ? 'trick-card' : ''} ${className || ''}`}
      onClick={disabled ? undefined : onClick}
      style={style}
    >
      <div className="card-corner top-left">
        <span className={`card-corner-rank ${SUIT_COLORS[card.suit]}`}>{card.rank}</span>
        <span className={`card-corner-suit ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
      </div>
      {isFace ? (
        <>
          <img
            className="card-face-img"
            src={`/cards/${faceFile}.png`}
            alt={card.rank}
            draggable={false}
          />
          <span className={`card-center-suit ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
        </>
      ) : (
        <div className={`card-pips ${SUIT_COLORS[card.suit]}`}>
          {(() => {
            const s = SUIT_SYMBOLS[card.suit];
            const pip = (key: string | number) => <span key={key} className="pip">{s}</span>;
            const flipPip = (key: string | number) => <span key={key} className="pip flip">{s}</span>;
            const rank = card.rank;

            if (rank === 'A') return <span className="pip ace">{s}</span>;

            // Standard pip layout using left/center/right columns
            const left: React.ReactElement[] = [];
            const center: React.ReactElement[] = [];
            const right: React.ReactElement[] = [];

            if (rank === '2') {
              center.push(pip('t'), flipPip('b'));
            } else if (rank === '3') {
              center.push(pip('t'), pip('m'), flipPip('b'));
            } else if (rank === '4') {
              left.push(pip('tl'), flipPip('bl'));
              right.push(pip('tr'), flipPip('br'));
            } else if (rank === '5') {
              left.push(pip('tl'), flipPip('bl'));
              center.push(pip('m'));
              right.push(pip('tr'), flipPip('br'));
            } else if (rank === '6') {
              left.push(pip('tl'), pip('ml'), flipPip('bl'));
              right.push(pip('tr'), pip('mr'), flipPip('br'));
            } else if (rank === '7') {
              left.push(pip('tl'), pip('ml'), flipPip('bl'));
              center.push(pip('cm'));
              right.push(pip('tr'), pip('mr'), flipPip('br'));
            } else if (rank === '8') {
              left.push(pip('tl'), pip('ml'), flipPip('bl'));
              center.push(pip('ct'), flipPip('cb'));
              right.push(pip('tr'), pip('mr'), flipPip('br'));
            } else if (rank === '9') {
              left.push(pip('1'), pip('2'), pip('3'), flipPip('4'));
              center.push(pip('m'));
              right.push(pip('5'), pip('6'), pip('7'), flipPip('8'));
            } else if (rank === '10') {
              left.push(pip('1'), pip('2'), pip('3'), flipPip('4'));
              center.push(pip('ct'), flipPip('cb'));
              right.push(pip('5'), pip('6'), pip('7'), flipPip('8'));
            }

            return (
              <>
                {left.length > 0 && <div className="pip-col">{left}</div>}
                {center.length > 0 && <div className="pip-col pip-col-center">{center}</div>}
                {right.length > 0 && <div className="pip-col">{right}</div>}
              </>
            );
          })()}
        </div>
      )}
      <div className="card-corner bottom-right">
        <span className={`card-corner-rank ${SUIT_COLORS[card.suit]}`}>{card.rank}</span>
        <span className={`card-corner-suit ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
      </div>
      {isTrump && <div className="trump-badge">👑</div>}
    </div>
  );
});

const CardBack = memo(function CardBack() {
  return (
    <div className="card-back-styled">
      <div className="card-back-inner">
        <div className="card-back-pattern">
          <span>♠</span>
        </div>
      </div>
    </div>
  );
});

export function GameScreen({ gameState }: Props) {
  const socket = useSocket();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 600);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 600);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [selectedBid, setSelectedBid] = useState<number | 'pass' | null>(null);
  const [selectedSuit, setSelectedSuit] = useState<Suit | null>(null);
  const [trickWinner, setTrickWinner] = useState<string | null>(null);
  const [slideTrick, setSlideTrick] = useState<TrickCard[] | null>(null);
  const [slideTarget, setSlideTarget] = useState<string | null>(null);
  const [thrownCardId, setThrownCardId] = useState<string | null>(null);
  const [roundScores, setRoundScores] = useState<any[] | null>(null);

  const positions = ['bottom', 'left', 'top', 'right'] as const;

  // Player ordering: me at bottom, clockwise — memoized to avoid re-creating every render
  const myId = socket.id;
  const myIndex = gameState ? gameState.players.findIndex(p => p.id === myId) : 0;
  const orderedPlayers = useMemo(
    () => gameState
      ? Array.from({ length: 4 }, (_, i) => gameState.players[(myIndex + i) % 4])
      : [],
    [gameState?.players, myIndex]
  );

  const getPlayerPosition = useCallback((playerId: string) => {
    const idx = orderedPlayers.findIndex(p => p.id === playerId);
    return positions[idx] || 'bottom';
  }, [orderedPlayers]);

  useEffect(() => {
    const onTrickEnd = ({ winnerId, trick }: { winnerId: string; trick: TrickCard[] }) => {
      setTrickWinner(winnerId);
      setSlideTrick(trick);
      setSlideTarget(winnerId);
      playTrickWin();

      // Play slide sound slightly after the win chime
      setTimeout(() => playTrickSlide(), 150);

      setTimeout(() => {
        setTrickWinner(null);
        setSlideTrick(null);
        setSlideTarget(null);
      }, 1200);
    };

    const onCardPlayed = ({ card }: { playerId: string; card: Card }) => {
      setThrownCardId(card.id);
      playCardThrow();
      setTimeout(() => setThrownCardId(null), 400);
    };

    const onRoundEnd = ({ scores }: { scores: any[] }) => {
      setRoundScores(scores);
      setTimeout(() => setRoundScores(null), 4000);
    };

    socket.on('game:trickEnd', onTrickEnd);
    socket.on('game:cardPlayed', onCardPlayed);
    socket.on('game:roundEnd', onRoundEnd);
    return () => {
      socket.off('game:trickEnd', onTrickEnd);
      socket.off('game:cardPlayed', onCardPlayed);
      socket.off('game:roundEnd', onRoundEnd);
    };
  }, [socket]);

  useEffect(() => {
    if (gameState?.phase === 'bidding') {
      setSelectedBid(null);
      setSelectedSuit(null);
    }
  }, [gameState?.round, gameState?.phase]);

  if (!gameState) return null;

  const isMyTurn = gameState.turnPlayerId === myId;

  const handleBid = () => {
    if (selectedBid !== null) {
      playBidPlace();
      socket.emit('game:bid', { bid: selectedBid });
      setSelectedBid(null);
    }
  };

  const handlePlayCard = (cardId: string) => {
    if (isMyTurn && gameState.phase === 'playing') {
      socket.emit('game:playCard', { cardId });
    }
  };

  const canPlayCard = (card: Card): boolean => {
    if (!isMyTurn || gameState.phase !== 'playing') return false;
    if (!gameState.leadSuit) return true;
    if (card.suit === gameState.leadSuit) return true;
    const hasLeadSuit = gameState.myHand.some(c => c.suit === gameState.leadSuit);
    return !hasLeadSuit;
  };

  const sortedHand = useMemo(() => {
    if (!gameState) return [];
    const suitOrder: Record<string, number> = { clubs: 0, diamonds: 1, hearts: 2, spades: 3 };
    const rankOrder: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    return [...gameState.myHand].sort((a, b) => {
      if (a.suit !== b.suit) return suitOrder[a.suit] - suitOrder[b.suit];
      return rankOrder[a.rank] - rankOrder[b.rank];
    });
  }, [gameState?.myHand]);

  const handCount = sortedHand.length;
  // Fan angle: gentle spread, nearly straight
  const fanSpread = isMobile ? Math.min(handCount * 1.8, 24) : Math.min(handCount * 1.5, 20);
  const startAngle = -fanSpread / 2;

  // Slide target position for trick-win animation
  const slidePositions: Record<string, { x: number; y: number }> = {
    top: { x: 0, y: -180 },
    left: { x: -220, y: 0 },
    right: { x: 220, y: 0 },
    bottom: { x: 0, y: 180 },
  };

  const bgGifs = useMemo(() => ['dd.gif', 'df.gif', 'dfth.gif', 'dg.gif', 'dsg.gif', 'ii.gif', 'oo.gif', 'sd.gif'], []);

  // Preload all background GIFs at mount to avoid mid-game network stutter
  useEffect(() => {
    bgGifs.forEach(name => {
      const img = new Image();
      img.src = `/bg/${name}`;
    });
  }, [bgGifs]);

  const currentBg = bgGifs[Math.max(0, gameState.round - 1) % bgGifs.length];

  return (
    <>
      <div className="game-layout">
        <div className="game-table-wrapper">
          <div className="game-table halftone-table">
            <div className="table-felt" />
            <div style={{
              position: 'absolute',
              inset: '8px',
              borderRadius: 'var(--radius-lg)',
              backgroundImage: `url('/bg/${currentBg}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: 0.15,
              zIndex: 1,
              pointerEvents: 'none'
            }} />

            {/* Players */}
            {orderedPlayers.map((player, i) => {
              const pos = positions[i];
              const isCurrentTurn = player.id === gameState.turnPlayerId;
              const isMe = player.id === myId;
              const isWinner = player.id === trickWinner;
              const tilt = pos === 'left' ? 'rotate(3deg)' : pos === 'right' ? 'rotate(-1deg)' : '';
              const avatarIdx = getAvatarIndex(player.seat);

              return (
                <div key={player.id} className={`table-player ${pos}`} style={{ transform: pos !== 'bottom' ? tilt : undefined }}>
                  <div className={`player-avatar-img ${isCurrentTurn ? 'active-turn' : ''} ${isWinner ? 'trick-winner' : ''}`}>
                    <img src={AVATAR_IMAGES[avatarIdx]} alt={player.name} />
                  </div>
                  <div className="player-name-tag">
                    {isMe ? 'YOU' : player.name}
                  </div>
                  <div className="player-stats">
                    {player.bid !== null && <span>Bid: {player.bid}</span>}
                    <span>Won: {player.tricksWon}</span>
                  </div>
                  {/* Styled card backs for opponents */}
                  {!isMe && player.cardCount > 0 && (
                    <div className="card-back-row">
                      {Array.from({ length: Math.min(player.cardCount, 5) }, (_, j) => (
                        <CardBack key={j} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Trick Area */}
            <div className="trick-area">
              {(slideTrick || gameState.currentTrick).map((tc) => {
                const playerIdx = orderedPlayers.findIndex(p => p.id === tc.playerId);
                const pos = positions[playerIdx];
                const offsets: Record<string, { x: number; y: number; rot: number }> = {
                  top: { x: 0, y: -40, rot: -6 },
                  left: { x: -50, y: 0, rot: 12 },
                  right: { x: 50, y: 0, rot: -8 },
                  bottom: { x: 0, y: 40, rot: 3 },
                };
                const offset = offsets[pos] || offsets.bottom;

                // If trick is won, slide all cards toward winner
                let slideStyle: React.CSSProperties = {
                  transform: `translate(${offset.x}px, ${offset.y}px) rotate(${offset.rot}deg)`,
                };
                if (slideTrick && slideTarget) {
                  const targetPos = getPlayerPosition(slideTarget);
                  const target = slidePositions[targetPos];
                  slideStyle = {
                    transform: `translate(${target.x}px, ${target.y}px) rotate(0deg) scale(0.6)`,
                    opacity: 0,
                    transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                  };
                }

                return (
                  <div
                    key={tc.card.id}
                    className={`trick-card-wrapper ${thrownCardId === tc.card.id ? 'card-thrown' : ''}`}
                    style={slideStyle}
                  >
                    <PlayingCard card={tc.card} isInTrick isTrump={tc.card.suit === (gameState.trumpSuit || 'spades')} />
                  </div>
                );
              })}
            </div>



            {/* Bid Overlay */}
            {gameState.phase === 'bidding' && isMyTurn && gameState.mode === 'solo' && (
              <div className="bid-overlay">
                <div className="bid-panel">
                  <div className="bid-title headline-lg">YOUR BID!</div>
                  <div className="bid-options">
                    {Array.from({ length: 13 }, (_, i) => i + 1).map(n => (
                      <button
                        key={n}
                        className={`bid-btn ${selectedBid === n ? 'selected' : ''}`}
                        onClick={() => setSelectedBid(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: '1rem', width: '100%' }}
                    onClick={() => {
                      if (selectedBid && selectedBid !== 'pass') socket.emit('game:bid', { bid: selectedBid });
                    }}
                    disabled={selectedBid === null}
                  >
                    PLACE BID
                  </button>
                </div>
              </div>
            )}

            {gameState.phase === 'bidding' && isMyTurn && gameState.mode === 'team' && (
              <div className="bid-overlay">
                <div className="bid-panel p-4" style={{ maxWidth: '400px' }}>
                  <div className="bid-title headline-lg text-center">TEAM BID</div>

                  {gameState.highestBid !== null && (
                    <div className="body-md text-center mb-4" style={{ color: 'var(--primary)' }}>
                      Current High: <strong>{gameState.highestBid}</strong> by {gameState.players.find(p => p.id === gameState.highestBidder)?.name}
                    </div>
                  )}

                  <div className="flex gap-2 justify-center mb-6 mt-2">
                    {(['spades', 'hearts', 'diamonds', 'clubs'] as Suit[]).map(s => (
                      <button
                        key={s}
                        className={`btn ${selectedSuit === s ? 'btn-primary' : 'btn-outline'}`}
                        style={{ flex: 1, padding: '0.5rem', fontSize: '1.5rem' }}
                        onClick={() => setSelectedSuit(s)}
                      >
                        <span className={selectedSuit !== s ? SUIT_COLORS[s] : ''}>{SUIT_SYMBOLS[s]}</span>
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-4">
                    <button
                      className="btn btn-outline flex-1"
                      onClick={() => {
                        socket.emit('game:bid', { bid: 'pass' });
                      }}
                    >
                      PASS
                    </button>
                    <button
                      className="btn btn-primary flex-1"
                      onClick={() => {
                        const requiredBid = gameState.highestBid !== null ? gameState.highestBid + 1 : 6;
                        if (requiredBid <= 13 && selectedSuit) {
                          socket.emit('game:bid', { bid: requiredBid, suit: selectedSuit });
                        }
                      }}
                      disabled={selectedSuit === null || (gameState.highestBid !== null && gameState.highestBid >= 13)}
                    >
                      {gameState.highestBid !== null && gameState.highestBid >= 13 ? 'MAX BID HIT' : 'BID'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {gameState.phase === 'bidding' && !isMyTurn && (
              <div className="bid-overlay">
                <div className="bid-panel waiting-bid">
                  <div className="headline-md">WAITING FOR BID</div>
                  <p className="body-md" style={{ marginTop: '0.5rem' }}>
                    <strong>{gameState.players.find(p => p.id === gameState.turnPlayerId)?.name}</strong> is choosing...
                  </p>
                </div>
              </div>
            )}

            {/* Round End Summary */}
            {roundScores && (
              <div className="bid-overlay">
                <div className="bid-panel" style={{ minWidth: '280px' }}>
                  <div className="bid-title headline-lg">ROUND COMPLETE</div>
                  <div style={{ marginTop: '0.75rem' }}>
                    {roundScores.map((s: any) => (
                      <div key={s.playerId} className="score-row" style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--outline)' }}>
                        <span style={{ fontWeight: s.playerId === myId ? 700 : 400 }}>
                          {s.playerId === myId ? 'YOU' : s.name}
                        </span>
                        <span>
                          {typeof s.bid === 'number' ? `${s.tricksWon}/${s.bid}` : 'Pass'}
                          {' → '}
                          <strong style={{ color: s.roundScore >= 0 ? 'var(--primary)' : '#ff4444' }}>
                            {s.roundScore >= 0 ? '+' : ''}{s.roundScore}
                          </strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Scoreboard */}
        <div className="scoreboard">
          <div className="scoreboard-inner">
            <div className="scoreboard-title">SCORES</div>

            {gameState.mode === 'solo' ? (
              <>
                {orderedPlayers.map(p => (
                  <div key={p.id} className={`score-row ${p.id === myId ? 'me' : ''}`}>
                    <span>{p.id === myId ? 'YOU' : p.name}</span>
                    <span className="score-value">
                      {p.bid !== null ? `${p.tricksWon}/${p.bid}` : '-'}
                    </span>
                  </div>
                ))}
                <div className="score-totals">
                  <div className="scoreboard-subtitle">TOTAL</div>
                  {orderedPlayers.map(p => (
                    <div key={p.id} className={`score-row ${p.id === myId ? 'me' : ''}`}>
                      <span>{p.id === myId ? 'YOU' : p.name}</span>
                      <span className="score-value">{p.score}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* TEAM MODE SCOREBOARD */}
                <div className="scoreboard-subtitle" style={{ color: 'var(--primary)', marginBottom: '4px' }}>
                  {gameState.highestBid !== null ? `BID: ${gameState.highestBid} ${SUIT_SYMBOLS[gameState.trumpSuit!]}` : 'BIDDING...'}
                </div>
                <div style={{ marginBottom: '12px' }}>
                  {gameState.players.map(p => (
                    <div key={p.id} className={`score-row ${p.id === myId ? 'me' : ''}`}>
                      <span style={{ fontSize: '0.8rem', color: p.bid === 'pass' ? 'var(--on-surface-variant)' : 'var(--on-surface)' }}>
                        {p.id === myId ? 'YOU' : p.name} {p.bid === 'pass' ? '(Pass)' : p.bid ? `(${p.bid})` : ''}
                      </span>
                      <span className="score-value" style={{ fontSize: '0.9rem' }}>{p.tricksWon} tricks</span>
                    </div>
                  ))}
                </div>

                <div className="score-totals">
                  <div className="scoreboard-subtitle">ROUND WINS</div>
                  {/* Find Team 1 and Team 2, compute their total score which is identical for teammates */}
                  {(() => {
                    const myTeam = orderedPlayers.filter((_, i) => i === 0 || i === 2);
                    const otherTeam = orderedPlayers.filter((_, i) => i === 1 || i === 3);
                    return (
                      <>
                        <div className="score-row me">
                          <span>YOUR TEAM</span>
                          <span className="score-value">{myTeam[0].score}</span>
                        </div>
                        <div className="score-row">
                          <span>ENEMY TEAM</span>
                          <span className="score-value">{otherTeam[0].score}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </>
            )}

            <div className="round-indicator">
              ROUND {gameState.round} / {gameState.totalRounds} &nbsp;•&nbsp; TRICK {Math.min(gameState.trick, 13)} / 13
            </div>
          </div>
        </div>
      </div>

      {/* Player Hand — portaled to body so position:fixed works outside scaled container */}
      {createPortal(
        <div className="my-hand">
          {sortedHand.map((card, idx) => {
            return (
              <div
                key={card.id}
                className={gameState.trick === 1 && gameState.phase === 'bidding' ? 'deal-anim-wrapper' : ''}
                style={gameState.trick === 1 && gameState.phase === 'bidding' ? { animationDelay: `${idx * 0.07}s` } : undefined}
                onAnimationStart={idx === 0 ? () => playCardDeal() : undefined}
              >
                <PlayingCard
                  card={card}
                  onClick={() => handlePlayCard(card.id)}
                  disabled={!canPlayCard(card)}
                  isTrump={card.suit === (gameState.trumpSuit || 'spades')}
                />
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
