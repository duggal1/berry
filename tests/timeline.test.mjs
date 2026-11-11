import test from "node:test";
import assert from "node:assert/strict";
import { INITIAL_TIMELINE, reduceTimeline } from "../lib/timeline.ts";

test("play, pause, and resume preserve the same scene position", () => {
  let state = reduceTimeline(INITIAL_TIMELINE, { type: "play", sceneCount: 3, now: 100 });
  state = reduceTimeline(state, { type: "tick", sceneCount: 3, durationMs: 1000, now: 450 });
  assert.equal(state.sceneIndex, 0);
  assert.equal(state.progress, 0.35);

  state = reduceTimeline(state, { type: "pause", now: 500, durationMs: 1000 });
  assert.equal(state.playing, false);
  assert.equal(state.elapsedMs, 400);
  assert.equal(state.progress, 0.4);

  state = reduceTimeline(state, { type: "play", sceneCount: 3, now: 1000 });
  state = reduceTimeline(state, { type: "tick", sceneCount: 3, durationMs: 1000, now: 1600 });
  assert.equal(state.sceneIndex, 1);
  assert.equal(state.progress, 0);
  assert.equal(state.startedAt, 1600);
});

test("seek reconstructs a paused scene and restart replays from the beginning", () => {
  let state = reduceTimeline(INITIAL_TIMELINE, { type: "seek", sceneCount: 4, sceneIndex: 2 });
  assert.deepEqual(state, {
    sceneIndex: 2,
    playing: false,
    elapsedMs: 0,
    progress: 0,
    startedAt: null,
  });

  state = reduceTimeline(state, { type: "restart", sceneCount: 4, now: 20 });
  assert.equal(state.sceneIndex, 0);
  assert.equal(state.playing, true);
  assert.equal(state.startedAt, 20);

  state = reduceTimeline(state, { type: "tick", sceneCount: 4, durationMs: 100, now: 120 });
  state = reduceTimeline(state, { type: "seek", sceneCount: 4, sceneIndex: 3 });
  assert.equal(state.sceneIndex, 3);
  assert.equal(state.playing, false);

  state = reduceTimeline(state, { type: "play", sceneCount: 4, now: 200 });
  assert.equal(state.sceneIndex, 0);
  assert.equal(state.progress, 0);
});

test("the final scene stops at completion and an empty story cannot play", () => {
  let state = reduceTimeline(INITIAL_TIMELINE, { type: "play", sceneCount: 1, now: 0 });
  state = reduceTimeline(state, { type: "tick", sceneCount: 1, durationMs: 10, now: 10 });
  assert.equal(state.sceneIndex, 0);
  assert.equal(state.playing, false);
  assert.equal(state.progress, 1);

  const empty = reduceTimeline(INITIAL_TIMELINE, { type: "play", sceneCount: 0, now: 0 });
  assert.equal(empty, INITIAL_TIMELINE);
});
