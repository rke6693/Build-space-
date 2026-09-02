/**
 * The simulation never touches the DOM, the audio graph, or the particle
 * pool. It appends plain records to a queue and the shell drains them once a
 * frame. That keeps the physics testable in Node and keeps presentation
 * concerns out of the update loop.
 */
export class EventQueue {
  constructor() {
    this.items = [];
  }

  push(type, payload = {}) {
    this.items.push({ type, ...payload });
  }

  sound(name, amount = 1) {
    this.push("sound", { name, amount });
  }

  say(text) {
    this.push("announce", { text });
  }

  burst(x, y, tone, count, speed, kind = "droplet") {
    this.push("burst", { x, y, tone, count, speed, kind });
  }

  shake(amount) {
    this.push("shake", { amount });
  }

  flash(amount, tone = "paper") {
    this.push("flash", { amount, tone });
  }

  /** Returns and clears everything queued since the last drain. */
  drain() {
    const items = this.items;
    this.items = [];
    return items;
  }

  /** Test helper: every queued event of one type, without consuming. */
  ofType(type) {
    return this.items.filter((item) => item.type === type);
  }
}
