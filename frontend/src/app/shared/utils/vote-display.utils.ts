/**
 * Maps a vote/decision value to a CSS class for color-coding.
 * Used by both VotingPanel and VerdictCard.
 */
export const voteColorClass = (value: string): 'affirm' | 'oppose' | 'neutral' => {
  const lower = value.toLowerCase();
  if (lower === 'true' || lower === 'yes' || lower === 'agree') return 'affirm';
  if (lower === 'false' || lower === 'no' || lower === 'disagree') return 'oppose';
  return 'neutral';
};

/** Converts a 0–1 confidence float to a 0–100 percentage. */
export const confidencePercent = (confidence: number | null): number =>
  confidence != null ? Math.round(confidence * 100) : 0;
