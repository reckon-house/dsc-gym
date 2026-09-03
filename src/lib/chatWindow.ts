// How much of a conversation gets sent back to the model.
//
// The whole transcript is kept in the database and shown in the UI forever.
// Only a recent window is replayed to the API, because every message is
// re-sent on every turn AND on every tool round within that turn — a
// 220-message draft was replaying ~37k tokens per call and growing without
// end.
//
// Two things make this safe here, and neither is generally true of chat apps:
//
//  1. The app's state is in the database, not the conversation. There are
//     eleven read tools (list_sessions, list_pending_proposals, list_groups…),
//     so anything scrolled out of the window can be looked up again. Trimming
//     costs conversational memory, not facts.
//
//  2. A window can only be cut at a real user turn. The API requires every
//     tool_use block to be answered by a matching tool_result in the next
//     message; slicing mid-turn orphans one and the request hard-fails. User
//     turns are the only points where nothing is outstanding.

/** Roughly four characters per token — good enough for a budget. */
const CHARS_PER_TOKEN = 4

/** Replay at most this much conversation. Beyond it, the window slides. */
export const HISTORY_BUDGET_CHARS = 120_000 // ~30k tokens

/** How many recent user turns to keep once trimming starts. */
export const KEEP_TURNS = 20

/**
 * Trim in steps rather than continuously.
 *
 * If the cut point advanced by one turn on every message, the replayed prefix
 * would change every time and prompt caching would never hit — trading one
 * cost for another. Anchoring the cut to a multiple of this many turns keeps
 * the prefix byte-identical for several turns at a stretch, so the cache holds
 * and only re-warms when the window actually steps forward.
 */
const CHUNK_TURNS = 10

export interface WindowedHistory<T> {
  kept: T[]
  /** Messages left behind. Still in the database and still shown in the UI. */
  dropped: number
  /** Real user turns left behind. */
  droppedTurns: number
  truncated: boolean
}

/**
 * Keep a recent slice of history, cut at a user turn.
 *
 * `isUserTurn` identifies a genuine user message — NOT a tool_result, which is
 * also sent with role "user" but is the tail of an assistant turn and can
 * never be a cut point.
 */
export function windowHistory<T>(
  history: T[],
  isUserTurn: (m: T) => boolean,
  sizeOf: (m: T) => number,
  budgetChars: number = HISTORY_BUDGET_CHARS
): WindowedHistory<T> {
  const total = history.reduce((n, m) => n + sizeOf(m), 0)
  if (total <= budgetChars) {
    return { kept: history, dropped: 0, droppedTurns: 0, truncated: false }
  }

  // Index of every real user turn, in order.
  const turnAt: number[] = []
  history.forEach((m, i) => {
    if (isUserTurn(m)) turnAt.push(i)
  })
  // Nothing to cut at safely — send everything rather than risk an orphan.
  if (turnAt.length <= 1) {
    return { kept: history, dropped: 0, droppedTurns: 0, truncated: false }
  }

  // Chunk-aligned so the anchor holds still between steps.
  const anchor = Math.floor(turnAt.length / CHUNK_TURNS) * CHUNK_TURNS
  const cutTurn = Math.max(0, anchor - KEEP_TURNS)
  if (cutTurn === 0) {
    return { kept: history, dropped: 0, droppedTurns: 0, truncated: false }
  }

  const cutIndex = turnAt[cutTurn]
  return {
    kept: history.slice(cutIndex),
    dropped: cutIndex,
    droppedTurns: cutTurn,
    truncated: true,
  }
}

/** A line for the system prompt so the model knows it cannot see everything. */
export function truncationNote(w: WindowedHistory<unknown>): string {
  if (!w.truncated) return ''
  return `\n\nNote: this conversation is longer than what you can see. ${w.droppedTurns} earlier exchanges are not included. They are still in the owner's transcript. If you need something from earlier — a decision, an id, what is currently staged — call the read tools (list_pending_proposals, list_sessions, list_groups) rather than guessing or saying you have lost the thread.`
}

export function estimateTokens(chars: number): number {
  return Math.round(chars / CHARS_PER_TOKEN)
}
