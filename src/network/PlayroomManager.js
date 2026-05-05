/* ============================================================
   PlayroomManager.js
   Wraps the Playroom SDK for Mecka Rumble multiplayer.

   Architecture:
     Both clients run the full simulation locally.  Each sends
     their fighter actions to the other via Playroom's per-player
     state.  Each reads the opponent's actions and applies them
     to the opponent's local fighter.

   Who's who:
     Host (room creator) → red / left (side = -1)
     Joiner              → blue / right (side = +1)
     Both see the same layout.  isHost() determines which fighter
     you control.

   Action sync:
     Each action is sent as:
       { name: 'jab', seq: 42 }
     The `seq` counter increments monotonically so the receiver
     can tell when a new action arrives (even if it's the same
     move repeated twice).

   Playroom SDK is loaded globally as `window.Playroom` via a
   <script> tag in index.html.
   ============================================================ */

const GAME_ID = 'u76sQqlnVCxY2iHgV8B5';

// Destructure the API functions from the UMD global.
// This matches the pattern in Playroom's official docs:
//   const { insertCoin, isHost, myPlayer, onPlayerJoin } = Playroom;
const P = window.Playroom || {};
const { insertCoin, isHost, myPlayer, onPlayerJoin, getRoomCode: _getRoomCode } = P;

export class PlayroomManager {
  constructor() {
    if (!insertCoin) throw new Error('Playroom SDK not loaded (insertCoin missing)');

    this._seq = 0;                 // monotonic action counter
    this._lastOpponentSeq = -1;    // last seq we processed from opponent
    this._opponentPlayer = null;   // Playroom PlayerState of opponent
    this._onOpponentAction = null; // callback(actionName)
    this._onOpponentLeave = null;  // callback()
    this._ready = false;
  }

  /** Initialize Playroom.  Shows the built-in lobby UI (room
   *  creation / join code input / player name picker).  Resolves
   *  when the host taps "Launch" and both players are in. */
  async init() {
    console.log('[PlayroomManager] Calling insertCoin with gameId:', GAME_ID);
    await insertCoin({
      gameId: GAME_ID,
      maxPlayersPerRoom: 2,
    });
    console.log('[PlayroomManager] insertCoin resolved');
    console.log('[PlayroomManager] isHost:', isHost());
    console.log('[PlayroomManager] roomCode:', _getRoomCode());

    // Register player-join callback.  We need to find the OTHER
    // player (not us) so we can read their action state.
    onPlayerJoin((playerState) => {
      console.log('[PlayroomManager] Player joined:', playerState.id,
                  '(me:', myPlayer().id, ')');
      if (playerState.id !== myPlayer().id) {
        this._opponentPlayer = playerState;
        console.log('[PlayroomManager] Opponent identified:', playerState.id);
      }

      playerState.onQuit(() => {
        if (playerState.id !== myPlayer().id) {
          this._opponentPlayer = null;
          if (this._onOpponentLeave) this._onOpponentLeave();
        }
      });
    });

    this._ready = true;
  }

  /** True if this client is the host (room creator = red / left). */
  amIHost() { return isHost(); }

  /** The room code players can share to invite the opponent. */
  getRoomCode() { return _getRoomCode(); }

  /** Register callback fired when we detect a new action from
   *  the opponent.  Called with (actionName). */
  onOpponentAction(fn) { this._onOpponentAction = fn; }

  /** Register callback fired when the opponent disconnects. */
  onOpponentLeave(fn) { this._onOpponentLeave = fn; }

  /** Send an action to the opponent.  Called whenever the local
   *  player does something (jab, dodge, dash, etc.). */
  sendAction(actionName) {
    if (!this._ready) return;
    this._seq++;
    myPlayer().setState('action', {
      name: actionName,
      seq: this._seq,
    });
  }

  /** Poll the opponent's latest action.  Call this every frame.
   *  If a new action arrived since the last poll, fires the
   *  onOpponentAction callback. */
  poll() {
    if (!this._ready || !this._opponentPlayer) return;

    const action = this._opponentPlayer.getState('action');
    if (!action || typeof action.seq !== 'number') return;

    // Only fire if the seq is new (higher than what we last saw).
    if (action.seq > this._lastOpponentSeq) {
      this._lastOpponentSeq = action.seq;
      if (this._onOpponentAction) {
        this._onOpponentAction(action.name);
      }
    }
  }

  /** True once insertCoin has resolved. */
  get isReady() { return this._ready; }
}
