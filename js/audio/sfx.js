export class Sfx {
  constructor() { this.ctx = null; }
  ensure() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
  blip(freq, dur, type = 'square', vol = 0.12, slide = 0) {
    try {
      this.ensure();
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur);
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.connect(g).connect(c.destination);
      o.start(); o.stop(c.currentTime + dur);
    } catch (e) { /* audio blocked until user gesture; fine */ }
  }
  jump()   { this.blip(300, 0.18, 'square', 0.09, 320); }
  coin()   { this.blip(880, 0.09, 'square', 0.08); setTimeout(() => this.blip(1320, 0.14, 'square', 0.08), 60); }
  stomp()  { this.blip(200, 0.15, 'triangle', 0.14, -120); }
  hurt()   { this.blip(180, 0.3, 'sawtooth', 0.1, -120); }
  power()  { [520, 660, 880].forEach((f, i) => setTimeout(() => this.blip(f, 0.12, 'square', 0.08), i * 80)); }
  goal()   { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 'triangle', 0.1), i * 130)); }
  boss()   { this.blip(90, 0.5, 'sawtooth', 0.12, -40); }
}
export const sfx = new Sfx();
