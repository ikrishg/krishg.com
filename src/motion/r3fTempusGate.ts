import { recordR3fFlushRenderCount } from "./r3fFlushTelemetry";

export type R3fTempusGate = {
  inView: () => boolean;
  isDirty: () => boolean;
  clearDirty: () => void;
  render: () => void;
};

const gates = new Set<R3fTempusGate>();

export function registerR3fTempusGate(gate: R3fTempusGate): () => void {
  gates.add(gate);
  return () => {
    gates.delete(gate);
  };
}

/** Run demand-mode invalidates for visible, dirty canvases (Tempus order 1). */
export function flushR3fTempusGates(): number {
  let rendered = 0;
  for (const gate of gates) {
    if (!gate.inView() || !gate.isDirty()) continue;
    gate.clearDirty();
    gate.render();
    rendered += 1;
  }
  recordR3fFlushRenderCount(rendered);
  return rendered;
}

export function countR3fTempusGates(): number {
  return gates.size;
}
