import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import type { Challenge, ChallengeSide } from "../lib/challenges";

const AnimatedNumber = ({ value, decimals = 2, className }: { value: number; decimals?: number; className?: string }) => {
  const motionValue = useMotionValue(Number(value || 0));
  const spring = useSpring(motionValue, { stiffness: 160, damping: 26, mass: 0.7 });
  const display = useTransform(spring, (latest) => Number(latest || 0).toFixed(decimals));

  useEffect(() => {
    motionValue.set(Number(value || 0));
  }, [motionValue, value]);

  return (
    <motion.span className={className} aria-label={Number(value || 0).toFixed(decimals)}>
      {display}
    </motion.span>
  );
};

const winnerLabel = (winner: ChallengeSide): string => (winner === "A" ? "Player A" : winner === "B" ? "Player B" : "Draw");

const hashHue = (input: string): number => {
  const str = String(input || "");
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return hash % 360;
};

const hashInt = (input: string): number => {
  const str = String(input || "");
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const AVATAR_IMAGES = [
  "/avatars/avatar1.jpg",
  "/avatars/avatar2.jpg",
  "/avatars/avatar3.jpg",
  "/avatars/avatar4.jpg",
  "/avatars/avatar5.jpg",
  "/avatars/avatar6.jpg",
  "/avatars/avatar7.jpg",
  "/avatars/avatar8.jpg",
  "/avatars/avatar9.jpg",
  "/avatars/avatar10.jpg",
  "/avatars/avatar11.jpg",
  "/avatars/avatar12.jpg",
  "/avatars/avatar13.jpg",
  "/avatars/avatar14.jpg",
  "/avatars/avatar15.jpg",
  "/avatars/avatar16.jpg",
  "/avatars/avatar17.jpg",
  "/avatars/avatar18.jpg",
];

const avatarForName = (name: string): string => {
  const idx = AVATAR_IMAGES.length > 0 ? hashInt(name) % AVATAR_IMAGES.length : 0;
  return AVATAR_IMAGES[idx] || "";
};

const PhotoAvatar = ({ name }: { name: string }) => {
  const [failed, setFailed] = useState(false);
  const src = avatarForName(name);
  if (!src || failed) return null;
  return (
    <img
      className="challenge-avatar-img"
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
};

const scoreFromLog = (log: Array<{ winner: ChallengeSide }>) => {
  let winsA = 0;
  let winsB = 0;
  let ties = 0;
  log.forEach((row) => {
    if (row.winner === "A") winsA += 1;
    else if (row.winner === "B") winsB += 1;
    else ties += 1;
  });
  return { winsA, winsB, ties, total: log.length };
};

type Props = {
  canEdit: boolean;
  playerOptions: string[];
  challenges: Challenge[];
  onChange: (next: Challenge[]) => void;
  getKd: (name: string) => number;
  onPlayFx?: (kind: "submit" | "god" | "fun") => void;
  cloudError?: string;
};

export default function ChallengesPanel({
  canEdit,
  playerOptions,
  challenges,
  onChange,
  getKd,
  onPlayFx,
  cloudError,
}: Props) {
  const [title, setTitle] = useState("");
  const [playerA, setPlayerA] = useState("");
  const [playerB, setPlayerB] = useState("");
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(null);
  const leadRef = useRef<Record<string, ChallengeSide>>({});

  const nameSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const list = (playerOptions || []).map((n) => n.trim()).filter(Boolean);
    return list.filter((n) => {
      const key = n.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [playerOptions]);

  useEffect(() => {
    challenges.forEach((challenge) => {
      const kdA = getKd(challenge.playerA);
      const kdB = getKd(challenge.playerB);
      const currentLead: ChallengeSide = kdA > kdB ? "A" : kdB > kdA ? "B" : "TIE";
      const prev = leadRef.current[challenge.id];
      leadRef.current[challenge.id] = currentLead;
      if (!prev || prev === currentLead) return;
      if (challenge.active) onPlayFx?.("fun");
    });
  }, [challenges, getKd, onPlayFx]);

  const removeChallenge = (id: string) => onChange(challenges.filter((c) => c.id !== id));

  const toggleActive = (id: string) =>
    onChange(
      challenges.map((c) => (c.id === id ? { ...c, active: !c.active, updatedAt: Date.now() } : c)),
    );

  const addChallenge = async () => {
    const a = playerA.trim();
    const b = playerB.trim();
    if (!a || !b) return;
    if (a.toLowerCase() === b.toLowerCase()) return;
    const now = Date.now();
    const id = (() => {
      try {
        return crypto.randomUUID();
      } catch {
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }
    })();

    const next: Challenge = {
      id,
      title: title.trim(),
      playerA: a,
      playerB: b,
      active: true,
      createdAt: now,
      updatedAt: now,
      log: [],
    };

    onChange([next, ...challenges]);
    setTitle("");
    setPlayerA("");
    setPlayerB("");
  };

  const activeChallenge = useMemo(
    () => (activeChallengeId ? challenges.find((c) => c.id === activeChallengeId) ?? null : null),
    [activeChallengeId, challenges],
  );

  return (
    <Card className="card-secondary card-awards">
      <CardContent className="card-secondary-content">
        <div className="challenge-head">
          <h2 className="section-title-left">Challenges</h2>
          <div className="challenge-subtitle">Tap a duel card to see full results.</div>
        </div>

        {cloudError && <div className="challenge-error">Not saved to cloud: {cloudError}</div>}

        {canEdit && (
          <div className="challenge-create">
            <div className="challenge-create-row">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" />
              <Input
                value={playerA}
                onChange={(e) => setPlayerA(e.target.value)}
                placeholder="Player A"
                list="challenge-player-options"
              />
              <Input
                value={playerB}
                onChange={(e) => setPlayerB(e.target.value)}
                placeholder="Player B"
                list="challenge-player-options"
              />
              <Button type="button" className="btn-primary" onClick={() => void addChallenge()}>
                Create
              </Button>
            </div>
            <datalist id="challenge-player-options">
              {nameSuggestions.map((name) => (
                <option key={`opt-${name}`} value={name} />
              ))}
            </datalist>
          </div>
        )}

        {!canEdit && <p className="sync-note">View only mode. Ask admin to create or update challenges.</p>}

        <AnimatePresence mode="popLayout">
          {challenges.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="challenge-empty"
            >
              No challenges yet.
            </motion.div>
          ) : (
            <motion.div key="list" layout className="challenge-grid">
              {challenges.map((c) => {
                const kdA = getKd(c.playerA);
                const kdB = getKd(c.playerB);
                const winner: ChallengeSide = kdA > kdB ? "A" : kdB > kdA ? "B" : "TIE";
                const denom = kdA + kdB;
                const ratio = denom > 0 ? kdA / denom : 0.5;
                const recentLog = (c.log || []).slice(-6).reverse();
                const logScore = scoreFromLog(c.log || []);
                const leadName = winner === "A" ? c.playerA : winner === "B" ? c.playerB : "Draw";
                return (
                  <motion.div
                    key={c.id}
                    layout
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.99 }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setActiveChallengeId(c.id);
                    }}
                    onClick={() => setActiveChallengeId(c.id)}
                    className={`challenge-card challenge-card-click ${!c.active ? "is-paused" : ""}`}
                  >
                    <div className="challenge-card-head">
                      <div className="challenge-title">
                        {c.title ? c.title : `${c.playerA} vs ${c.playerB}`}
                        {!c.active && <span className="challenge-pill">Paused</span>}
                      </div>
                      <div className="challenge-actions">
                        {canEdit && (
                          <>
                            <Button
                              type="button"
                              className="btn-secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleActive(c.id);
                              }}
                            >
                              {c.active ? "Pause" : "Resume"}
                            </Button>
                            <Button
                              type="button"
                              className="btn-danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeChallenge(c.id);
                              }}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="challenge-vs">
                      <div className={`challenge-side ${winner === "A" ? "is-winning" : ""}`}>
                        <div className="challenge-side-head">
                          <img className="challenge-side-avatar" src={avatarForName(c.playerA)} alt={c.playerA} loading="lazy" />
                          <div className="challenge-side-meta">
                            <div className="challenge-name">{c.playerA}</div>
                            <div className="challenge-kd">
                              KD <AnimatedNumber value={kdA} />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="challenge-mid">
                        <div className="challenge-vs-label">VS</div>
                        <div className="challenge-winner">
                          <motion.span
                            key={`${c.id}-${winner}`}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                          >
                            {winnerLabel(winner)}
                          </motion.span>
                        </div>
                      </div>
                      <div className={`challenge-side ${winner === "B" ? "is-winning" : ""}`}>
                        <div className="challenge-side-head">
                          <img className="challenge-side-avatar" src={avatarForName(c.playerB)} alt={c.playerB} loading="lazy" />
                          <div className="challenge-side-meta">
                            <div className="challenge-name">{c.playerB}</div>
                            <div className="challenge-kd">
                              KD <AnimatedNumber value={kdB} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="challenge-bar-wrap" aria-hidden="true">
                      <div className="challenge-bar">
                        <motion.div
                          className="challenge-bar-fill"
                          initial={false}
                          animate={{ width: `${Math.round(ratio * 100)}%` }}
                          transition={{ type: "spring", stiffness: 140, damping: 22 }}
                        />
                      </div>
                      <div className="challenge-bar-meta">
                        <span>{c.playerA}</span>
                        <span>{c.playerB}</span>
                      </div>
                    </div>

                    <div className="challenge-mini">
                      <div className="challenge-mini-left">
                        <span className="challenge-mini-badge">Leader</span>
                        <span className="challenge-mini-lead">{leadName}</span>
                      </div>
                      <div className="challenge-mini-right">
                        <span className="challenge-mini-badge">Wins</span>
                        <span className="challenge-mini-wins">
                          {logScore.winsA}-{logScore.winsB}
                          {logScore.ties > 0 ? ` (${logScore.ties}D)` : ""}
                        </span>
                      </div>
                    </div>

                    <div className="challenge-log">
                      <div className="challenge-log-head">Latest wars</div>
                      {recentLog.length === 0 ? (
                        <div className="challenge-log-empty">Submit wars to build the duel timeline.</div>
                      ) : (
                        <div className="challenge-log-list">
                          <AnimatePresence initial={false}>
                            {recentLog.map((row) => (
                              <motion.div
                                key={`${c.id}-war-${row.war}`}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="challenge-log-row"
                              >
                                <span className="challenge-log-war">War {row.war}</span>
                                <span className="challenge-log-kd">
                                  <span>{row.kdA.toFixed(2)}</span> - <span>{row.kdB.toFixed(2)}</span>
                                </span>
                                <span className="challenge-log-win">{row.winner === "TIE" ? "Draw" : row.winner}</span>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>

                    <div className="challenge-open-hint">Tap to open results →</div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {activeChallenge && (
            <motion.div
              className="challenge-modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveChallengeId(null)}
            >
              <motion.div
                className="challenge-modal"
                initial={{ opacity: 0, y: 18, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 18, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 180, damping: 22 }}
                onClick={(e) => e.stopPropagation()}
              >
                {(() => {
                  const c = activeChallenge;
                  const kdA = getKd(c.playerA);
                  const kdB = getKd(c.playerB);
                  const log = c.log || [];
                  const { winsA, winsB, ties, total } = scoreFromLog(log);
                  const winnerByWins: ChallengeSide = winsA > winsB ? "A" : winsB > winsA ? "B" : "TIE";
                  const winner: ChallengeSide =
                    winnerByWins !== "TIE" ? winnerByWins : kdA > kdB ? "A" : kdB > kdA ? "B" : "TIE";
                  const winnerName = winner === "A" ? c.playerA : winner === "B" ? c.playerB : "Draw";
                  const hueA = hashHue(c.playerA);
                  const hueB = hashHue(c.playerB);
                  const ratioA = total > 0 ? winsA / total : 0.5;
                  const ratioB = total > 0 ? winsB / total : 0.5;
                  const timeline = [...log].slice().reverse();

                  return (
                    <>
                      <div className="challenge-modal-head">
                        <div className="challenge-modal-title">Challenge Results</div>
                        <div className="challenge-modal-actions">
                          {canEdit && (
                            <>
                              <Button
                                type="button"
                                className="btn-secondary challenge-modal-btn"
                                onClick={() => toggleActive(c.id)}
                              >
                                {c.active ? "Pause" : "Resume"}
                              </Button>
                              <Button
                                type="button"
                                className="btn-danger challenge-modal-btn challenge-modal-btn-danger"
                                onClick={() => {
                                  removeChallenge(c.id);
                                  setActiveChallengeId(null);
                                }}
                              >
                                Delete
                              </Button>
                            </>
                          )}
                          <Button
                            type="button"
                            className="btn-secondary challenge-modal-btn"
                            onClick={() => setActiveChallengeId(null)}
                          >
                            Close
                          </Button>
                        </div>
                      </div>

                      <div className="challenge-modal-vs">
                        <div className="challenge-modal-player">
                          <div
                            className={`challenge-avatar ${winner === "A" ? "is-winner" : ""}`}
                            style={{
                              ["--hue" as any]: hueA,
                            }}
                          >
                            <PhotoAvatar name={c.playerA} />
                            {winner === "A" && <span className="challenge-crown">👑</span>}
                          </div>
                          {winner === "A" && <div className="challenge-winner-pill">WINNER</div>}
                          <div className="challenge-modal-name">{c.playerA}</div>
                          <div className="challenge-modal-role">Challenger</div>
                        </div>

                        <div className="challenge-modal-mid">
                          <div className="challenge-modal-mid-bubble">VS</div>
                          <div className="challenge-modal-winnerline">
                            Winner: <span className="challenge-modal-winnername">{winnerName}</span>
                          </div>
                        </div>

                        <div className="challenge-modal-player">
                          <div
                            className={`challenge-avatar ${winner === "B" ? "is-winner" : ""}`}
                            style={{
                              ["--hue" as any]: hueB,
                            }}
                          >
                            <PhotoAvatar name={c.playerB} />
                            {winner === "B" && <span className="challenge-crown">👑</span>}
                          </div>
                          {winner === "B" && <div className="challenge-winner-pill">WINNER</div>}
                          <div className="challenge-modal-name">{c.playerB}</div>
                          <div className="challenge-modal-role">Challenged</div>
                        </div>
                      </div>

                      <div className="challenge-score-grid">
                        <div className="challenge-score-card">
                          <div className="challenge-score-label">{c.playerA.toUpperCase()} WINS</div>
                          <div className="challenge-score-big">
                            <span className="challenge-score-num">{winsA}</span>
                            <span className="challenge-score-denom">/{Math.max(total, 0)}</span>
                          </div>
                          <div className="challenge-score-bar">
                            <motion.div
                              className="challenge-score-fill"
                              initial={false}
                              animate={{ width: `${Math.round(ratioA * 100)}%` }}
                              transition={{ type: "spring", stiffness: 140, damping: 22 }}
                            />
                          </div>
                          <div className="challenge-score-sub">
                            KD <AnimatedNumber value={kdA} /> {ties > 0 ? `• Draws ${ties}` : ""}
                          </div>
                        </div>

                        <div className="challenge-score-card">
                          <div className="challenge-score-label">{c.playerB.toUpperCase()} WINS</div>
                          <div className="challenge-score-big">
                            <span className="challenge-score-num">{winsB}</span>
                            <span className="challenge-score-denom">/{Math.max(total, 0)}</span>
                          </div>
                          <div className="challenge-score-bar">
                            <motion.div
                              className="challenge-score-fill"
                              initial={false}
                              animate={{ width: `${Math.round(ratioB * 100)}%` }}
                              transition={{ type: "spring", stiffness: 140, damping: 22 }}
                            />
                          </div>
                          <div className="challenge-score-sub">
                            KD <AnimatedNumber value={kdB} /> {ties > 0 ? `• Draws ${ties}` : ""}
                          </div>
                        </div>
                      </div>

                      <div className="challenge-modal-timeline">
                        <div className="challenge-modal-timeline-head">Timeline</div>
                        {timeline.length === 0 ? (
                          <div className="challenge-modal-timeline-empty">No wars yet. Submit wars to generate results.</div>
                        ) : (
                          <div className="challenge-modal-timeline-list">
                            {timeline.slice(0, 18).map((row) => (
                              <div key={`${c.id}-full-${row.war}`} className="challenge-modal-timeline-row">
                                <span className="challenge-modal-timeline-war">War {row.war}</span>
                                <span className="challenge-modal-timeline-kd">
                                  {row.kdA.toFixed(2)} <span className="challenge-modal-timeline-dash">—</span>{" "}
                                  {row.kdB.toFixed(2)}
                                </span>
                                <span
                                  className={`challenge-modal-timeline-win ${
                                    row.winner === "A" ? "is-a" : row.winner === "B" ? "is-b" : "is-tie"
                                  }`}
                                >
                                  {row.winner === "TIE" ? "DRAW" : row.winner}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
