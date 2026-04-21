const AVATAR_IMAGES = [
  '/avatars/wallhaven-3q95d3_1280x960.png',
  '/avatars/wallhaven-d85zo3_1280x1024.png',
  '/avatars/wallhaven-qrzg8q_1280x960.png',
  '/avatars/wallhaven-rqdv21_1280x720.png',
];

interface Ranking {
  playerId: string;
  name: string;
  totalScore: number;
  rank: number;
}

interface Props {
  rankings: Ranking[] | null;
  onPlayAgain: () => void;
  onBackToLobby: () => void;
}

export function ResultsScreen({ rankings, onPlayAgain, onBackToLobby }: Props) {
  if (!rankings || rankings.length === 0) return null;

  const champion = rankings[0];
  // We don't have seat index here, so use ranking order as avatar index
  const avatarMap = new Map<string, number>();
  rankings.forEach((r, i) => avatarMap.set(r.playerId, i % AVATAR_IMAGES.length));

  return (
    <div className="results-screen">
      {/* Victory Banner */}
      <div className="victory-banner halftone">
        <h1 className="display-lg">VICTORY!</h1>
      </div>

      {/* Champion Display */}
      <div className="champion-display">
        <div className="champion-avatar-wrapper">
          <div className="champion-avatar-img">
            <img src={AVATAR_IMAGES[avatarMap.get(champion.playerId) || 0]} alt={champion.name} />
          </div>
          <div className="champion-crown">👑</div>
        </div>
        <div className="champion-name headline-lg">{champion.name}</div>
        <div className="champion-label">CHAMPION</div>
        <div className="total-score-badge">
          <div className="label-md">TOTAL SCORE</div>
          <div className="headline-lg">{champion.totalScore}</div>
        </div>
      </div>

      {/* Rankings List */}
      <div className="results-list">
        {rankings.map((r) => (
          <div key={r.playerId} className={`result-row ${r.rank === 1 ? 'winner halftone' : ''}`}>
            <div className="result-rank">{r.rank}</div>
            <div className="result-avatar-img">
              <img src={AVATAR_IMAGES[avatarMap.get(r.playerId) || 0]} alt={r.name} />
              {r.rank === 1 && <span className="result-crown">👑</span>}
            </div>
            <div className="result-name">{r.name}</div>
            <div className="result-score">{r.totalScore}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="results-actions">
        <button className="btn btn-primary btn-large w-full" onClick={onPlayAgain}>
          PLAY AGAIN ↻
        </button>
        <button className="btn btn-outline btn-large w-full" onClick={onBackToLobby}>
          LOBBY
        </button>
      </div>
    </div>
  );
}
