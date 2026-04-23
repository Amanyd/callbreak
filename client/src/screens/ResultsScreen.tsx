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
  seat?: number;
  teamLabel?: string;
}

interface Props {
  rankings: Ranking[] | null;
  onPlayAgain: () => void;
  onBackToLobby: () => void;
}

export function ResultsScreen({ rankings, onPlayAgain, onBackToLobby }: Props) {
  if (!rankings || rankings.length === 0) return null;

  // For team mode, deduplicate by teamLabel so we show 2 team rows, not 4 player rows
  const isTeam = rankings.some(r => r.teamLabel);
  let displayRows: Ranking[];
  if (isTeam) {
    const seen = new Set<string>();
    displayRows = rankings.filter(r => {
      const key = r.teamLabel || r.playerId;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } else {
    displayRows = rankings;
  }

  const champion = displayRows[0];

  function getAvatar(r: Ranking): string {
    const idx = typeof r.seat === 'number' ? r.seat : 0;
    return AVATAR_IMAGES[idx % AVATAR_IMAGES.length];
  }

  return (
    <div className="results-screen">
      {/* Left: Champion + Actions */}
      <div className="results-left">
        <div className="victory-banner halftone">
          <h2 className="display-md">VICTORY!</h2>
        </div>
        <div className="champion-display">
          <div className="champion-avatar-wrapper">
            <div className="champion-avatar-img">
              <img src={getAvatar(champion)} alt={champion.name} />
            </div>

          </div>
          <div className="champion-name headline-md">{champion.name}</div>
          <div className="total-score-badge">
            <span className="label-md">SCORE </span>
            <span className="headline-md">{champion.totalScore}</span>
          </div>
        </div>
        <div className="results-actions">
          <button className="btn btn-primary w-full" onClick={onPlayAgain}>
            PLAY AGAIN ↻
          </button>
          <button className="btn btn-outline w-full" onClick={onBackToLobby}>
            LOBBY
          </button>
        </div>
      </div>

      {/* Right: Rankings List */}
      <div className="results-right">
        <h3 className="headline-md" style={{ marginBottom: '0.5rem' }}>RANKINGS</h3>
        <div className="results-list">
          {displayRows.map((r) => (
            <div key={r.playerId} className={`result-row ${r.rank === 1 ? 'winner halftone' : ''}`}>
              <div className="result-rank">{r.rank}</div>
              <div className="result-avatar-img">
                <img src={getAvatar(r)} alt={r.name} />
                {r.rank === 1 && <span className="result-crown">👑</span>}
              </div>
              <div className="result-name">{r.name}</div>
              <div className="result-score">{r.totalScore}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
