/**
 * SANGUINE_RUNNER — Low-Latency Keyboard & Pointer-Lock Input Manager
 * Buffers edge-triggered presses between render frames and 120Hz physics ticks
 * so sub-frame jump/slide inputs are never dropped.
 */

export class InputManager {
  /**
   * @param {HTMLElement} domElement Canvas or container element for Pointer Lock
   * @param {Function} onMouseMove Callback (dx, dy) in pixels
   * @param {Function} onHotkey Callback (key) for arena teleports/resets
   */
  constructor(domElement, onMouseMove, onHotkey) {
    this.domElement = domElement;
    this.onMouseMove = onMouseMove;
    this.onHotkey = onHotkey;

    this.keysDown = new Set();
    this.isPointerLocked = false;

    // Buffered edge-triggered actions consumed by the next physics tick
    this._jumpPressedBuffer = false;
    this._slidePressedBuffer = false;

    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const code = e.code;
      this.keysDown.add(code);

      if (code === 'Space') {
        this._jumpPressedBuffer = true;
        if (this.isPointerLocked) e.preventDefault();
      }
      if (
        code === 'ShiftLeft' ||
        code === 'ShiftRight' ||
        code === 'ControlLeft' ||
        code === 'KeyC'
      ) {
        this._slidePressedBuffer = true;
        if (this.isPointerLocked) e.preventDefault();
      }

      if (this.onHotkey) {
        this.onHotkey(code);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this._jumpPressedBuffer = false;
      this._slidePressedBuffer = false;
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.domElement;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked) return;
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      // Reject rare browser pointer-lock spike artifacts (>350px in 1 event)
      if (Math.abs(dx) < 350 && Math.abs(dy) < 350) {
        if (this.onMouseMove) this.onMouseMove(dx, dy);
      }
    });

    // Allow Mouse Wheel Down/Up to also trigger Jump for classic boomer-shooter bhop enthusiasts!
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.isPointerLocked) return;
        if (Math.abs(e.deltaY) > 0) {
          this._jumpPressedBuffer = true;
        }
      },
      { passive: true }
    );
  }

  requestPointerLock() {
    if (!this.isPointerLocked && this.domElement.requestPointerLock) {
      this.domElement.requestPointerLock();
    }
  }

  /**
   * Samples current input state and consumes buffered edge triggers for one 120Hz physics tick.
   */
  sampleTickInput() {
    const w = this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp') ? 1 : 0;
    const s = this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown') ? 1 : 0;
    const d = this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight') ? 1 : 0;
    const a = this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft') ? 1 : 0;

    const jumpHeld = this.keysDown.has('Space');
    const slideHeld =
      this.keysDown.has('ShiftLeft') ||
      this.keysDown.has('ShiftRight') ||
      this.keysDown.has('ControlLeft') ||
      this.keysDown.has('KeyC');
    const walkHeld = this.keysDown.has('AltLeft');

    const jumpPressed = this._jumpPressedBuffer;
    const slidePressed = this._slidePressedBuffer;

    // Clear one-shot buffers after consumption
    this._jumpPressedBuffer = false;
    this._slidePressedBuffer = false;

    return {
      moveForward: w - s,
      moveRight: d - a,
      jumpPressed,
      jumpHeld,
      slidePressed,
      slideHeld,
      walkHeld,
    };
  }
}
