/**
 * SANGUINE_RUNNER — Low-Latency Keyboard & Pointer-Lock Input Manager
 * Buffers movement and combat actions (LMB, RMB, F Quick Melee, R Active Reload, Q/E/Wheel Swap)
 * between render frames and 120Hz physics ticks.
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
    this.mouseButtonsDown = new Set();
    this.isPointerLocked = false;

    // Buffered edge-triggered movement & combat actions consumed by the next physics tick
    this._jumpPressedBuffer = false;
    this._slidePressedBuffer = false;
    this._primaryPressedBuffer = false;
    this._altPressedBuffer = false;
    this._quickMeleePressedBuffer = false;
    this._reloadPressedBuffer = false;
    this._swapPressedBuffer = false;

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
      if (code === 'KeyF') {
        this._quickMeleePressedBuffer = true;
      }
      if (code === 'KeyR') {
        this._reloadPressedBuffer = true;
      }
      if (code === 'KeyQ' || code === 'KeyE') {
        this._swapPressedBuffer = true;
      }

      if (this.onHotkey) {
        this.onHotkey(code);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    window.addEventListener('mousedown', (e) => {
      if (!this.isPointerLocked) return;
      this.mouseButtonsDown.add(e.button);
      if (e.button === 0) {
        this._primaryPressedBuffer = true;
      } else if (e.button === 2) {
        this._altPressedBuffer = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      this.mouseButtonsDown.delete(e.button);
    });

    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.mouseButtonsDown.clear();
      this._jumpPressedBuffer = false;
      this._slidePressedBuffer = false;
      this._primaryPressedBuffer = false;
      this._altPressedBuffer = false;
      this._quickMeleePressedBuffer = false;
      this._reloadPressedBuffer = false;
      this._swapPressedBuffer = false;
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.domElement;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked) return;
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      if (Math.abs(dx) < 350 && Math.abs(dy) < 350) {
        if (this.onMouseMove) this.onMouseMove(dx, dy);
      }
    });

    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.isPointerLocked) return;
        if (Math.abs(e.deltaY) > 0) {
          this._swapPressedBuffer = true;
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
   * Samples current movement & combat input state for one 120Hz physics tick.
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
    const primaryHeld = this.mouseButtonsDown.has(0);

    const out = {
      moveForward: w - s,
      moveRight: d - a,
      jumpPressed: this._jumpPressedBuffer,
      jumpHeld,
      slidePressed: this._slidePressedBuffer,
      slideHeld,
      walkHeld,
      primaryPressed: this._primaryPressedBuffer,
      primaryHeld,
      altPressed: this._altPressedBuffer,
      quickMeleePressed: this._quickMeleePressedBuffer,
      reloadPressed: this._reloadPressedBuffer,
      swapPressed: this._swapPressedBuffer,
    };

    // Clear one-shot edge buffers after consumption
    this._jumpPressedBuffer = false;
    this._slidePressedBuffer = false;
    this._primaryPressedBuffer = false;
    this._altPressedBuffer = false;
    this._quickMeleePressedBuffer = false;
    this._reloadPressedBuffer = false;
    this._swapPressedBuffer = false;

    return out;
  }
}
