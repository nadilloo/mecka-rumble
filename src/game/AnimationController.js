/* ============================================================
   AnimationController.js
   Thin wrapper around THREE.AnimationMixer that preserves the
   old API (play / stop / update) so the rest of Fighter.js
   doesn't care whether animations are procedural or skeletal.

   Behavior:
     - `idle` is the default looping clip and starts immediately.
     - `shield` also loops (until `stop()` is called).
     - All other clips (punch, shoot, dash, dodge, ko, victory)
       are one-shot.  When a one-shot finishes, we automatically
       crossfade back to idle.
     - `super` and `hit` fall back to existing clips since the
       asset pack doesn't ship dedicated clips for them:
           super -> shoot
           hit   -> dodge  (short flinch)
     - Duration passed by Fighter is ignored — the clip's own
       duration drives playback, which matches what the artist
       animated.
   ============================================================ */
import * as THREE from 'three';

// Which states map to which clip name when a direct clip is missing.
// We have dedicated clips for: idle, jab, hook, cross, uppercut,
// shoot, dash, dodge, hit, shield, ko, victory.
const FALLBACKS = {
  super:    'shoot',     // big shoot
  counter:  'dodge',     // parry visual ~ dodge for now
};

// Which actions should loop forever until stopped.
const LOOPING = new Set(['idle']);
// Which actions are terminal — play once, clamp, stay on last frame.
// `ko` stays until match reset.  `shield` stays until setShielding(false)
// calls stop() which fades back to idle.
const TERMINAL = new Set(['ko', 'shield']);

// Crossfade time between clips (seconds).
const FADE = 0.12;

export class AnimationController {
  /**
   * @param {THREE.Object3D} model - the cloned skinned character root
   * @param {Object<string, THREE.AnimationClip>} clips
   */
  constructor(model, clips) {
    this.mixer = new THREE.AnimationMixer(model);

    // Build a THREE.AnimationAction for each clip up-front.
    this.actions = {};
    for (const [name, clip] of Object.entries(clips)) {
      const action = this.mixer.clipAction(clip);
      if (LOOPING.has(name)) {
        action.setLoop(THREE.LoopRepeat, Infinity);
      } else {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions[name] = action;
    }

    // Start idle looping immediately.
    this.current = null;
    this._fadeTo('idle', 0);
  }

  /** Play a named action.  Returns fast if we're already in it. */
  play(name /*, duration (ignored) */) {
    let target = name;
    if (!this.actions[target] && FALLBACKS[target]) target = FALLBACKS[target];
    if (!this.actions[target]) target = 'idle';

    if (target === this.current && !LOOPING.has(target)) {
      // Re-fire a one-shot.
      this.actions[target].reset().setEffectiveTimeScale(1).play();
      return;
    }
    if (target === this.current) return;

    this._fadeTo(target, FADE);
    if (this.actions[target]) this.actions[target].setEffectiveTimeScale(1);
  }

  /** Play a clip but stretch/shrink its playback so it lasts exactly
   *  `targetSec` seconds.  Useful for action descriptors with explicit
   *  frame budgets — a 10-frame jab can use the same Punching clip as
   *  a 25-frame uppercut, just played faster. */
  playFor(name, targetSec) {
    let target = name;
    if (!this.actions[target] && FALLBACKS[target]) target = FALLBACKS[target];
    if (!this.actions[target]) target = 'idle';

    const action = this.actions[target];
    const clipDur = action.getClip().duration;
    const scale = clipDur / Math.max(0.05, targetSec);

    if (target === this.current) {
      action.reset().setEffectiveTimeScale(scale).play();
      return;
    }
    this._fadeTo(target, FADE * 0.6);   // shorter fade for cancels
    action.setEffectiveTimeScale(scale);
  }

  /** Explicitly end a looping clip (like shield) and return to idle. */
  stop() {
    if (this.current !== 'idle') this._fadeTo('idle', FADE);
  }

  /** Multiply animation playback rate.  1.0 = normal. */
  setSpeed(s) { this.mixer.timeScale = s; }

  update(dt /*, facingSign (unused for skeletal) */) {
    this.mixer.update(dt);

    // Auto-return to idle when a one-shot reaches its end.
    if (this.current && !LOOPING.has(this.current) && !TERMINAL.has(this.current)) {
      const action = this.actions[this.current];
      if (action) {
        const clip = action.getClip();
        if (action.time >= clip.duration - 1e-3) {
          this._fadeTo('idle', FADE);
        }
      }
    }
  }

  _fadeTo(name, fade) {
    const next = this.actions[name];
    if (!next) return;

    if (this.current && this.actions[this.current] && this.actions[this.current] !== next) {
      const prev = this.actions[this.current];
      prev.fadeOut(fade);
    }

    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    if (fade > 0) next.fadeIn(fade);
    next.play();

    this.current = name;
  }
}
