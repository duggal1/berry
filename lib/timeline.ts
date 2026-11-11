export type TimelineState = {
  sceneIndex: number;
  playing: boolean;
  elapsedMs: number;
  progress: number;
  startedAt: number | null;
};

export type TimelineAction =
  | { type: "play"; sceneCount: number; now: number }
  | { type: "pause"; now: number; durationMs: number }
  | { type: "tick"; sceneCount: number; durationMs: number; now: number }
  | { type: "seek"; sceneCount: number; sceneIndex: number }
  | { type: "restart"; sceneCount: number; now: number }
  | { type: "clear" };

export const INITIAL_TIMELINE: TimelineState = {
  sceneIndex: -1,
  playing: false,
  elapsedMs: 0,
  progress: 0,
  startedAt: null,
};

function atScene(sceneIndex: number, playing = false, now: number | null = null): TimelineState {
  return { sceneIndex, playing, elapsedMs: 0, progress: 0, startedAt: now };
}

export function reduceTimeline(state: TimelineState, action: TimelineAction): TimelineState {
  switch (action.type) {
    case "play": {
      if (state.playing || action.sceneCount === 0) return state;
      if (state.sceneIndex < 0 || state.sceneIndex >= action.sceneCount - 1) {
        return atScene(0, true, action.now);
      }
      return { ...state, playing: true, startedAt: action.now };
    }
    case "pause": {
      if (!state.playing) return state;
      const elapsedMs = state.elapsedMs + Math.max(0, action.now - (state.startedAt ?? action.now));
      const progress = action.durationMs > 0 ? Math.min(1, elapsedMs / action.durationMs) : state.progress;
      return { ...state, playing: false, elapsedMs, progress, startedAt: null };
    }
    case "tick": {
      if (!state.playing || state.sceneIndex < 0 || action.durationMs <= 0) return state;
      const elapsedMs = state.elapsedMs + Math.max(0, action.now - (state.startedAt ?? action.now));
      const progress = Math.min(1, elapsedMs / action.durationMs);
      if (progress >= 1) {
        if (state.sceneIndex >= action.sceneCount - 1) {
          return { ...state, playing: false, elapsedMs: action.durationMs, progress: 1, startedAt: null };
        }
        return atScene(state.sceneIndex + 1, true, action.now);
      }
      if (Math.abs(progress - state.progress) < 0.015) return state;
      return { ...state, elapsedMs: state.elapsedMs, progress };
    }
    case "seek": {
      const sceneIndex = Math.max(-1, Math.min(action.sceneCount - 1, action.sceneIndex));
      return atScene(sceneIndex);
    }
    case "restart":
      return action.sceneCount > 0 ? atScene(0, true, action.now) : INITIAL_TIMELINE;
    case "clear":
      return INITIAL_TIMELINE;
  }
}
