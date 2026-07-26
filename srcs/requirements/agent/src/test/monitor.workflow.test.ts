// monitor workflow routing tests — classifyAction, the retune|gate|noop decision (the
// posture invariant: retune is ALWAYS autonomous, HITL set disjoint). The decide() logic
// itself is covered by test/graphDelta.test.ts (monitorTick → R1 retune). Offline, CI-safe.
import { describe, it, expect } from "vitest";
import { classifyAction } from "../mastra/workflows/monitor.workflow.js";

describe("monitor workflow routing (classifyAction)", () => {
  it("retune → autonomous (the Graph invariant — never HITL)", () => {
    expect(classifyAction({ type: "retune" })).toBe("autonomous");
  });

  it("noop → noop (idle, no action)", () => {
    expect(classifyAction({ type: "noop" })).toBe("noop");
  });

  it("stop / remove / askHuman → hitl (gate at /review)", () => {
    for (const t of ["stop", "remove", "askHuman"] as const) {
      expect(classifyAction({ type: t })).toBe("hitl");
    }
  });

  it("retune is disjoint from the HITL set (no approval path produces a retune)", () => {
    // The falsifiable invariant: every non-retune verdict gates; retune never does.
    const verdicts: ("retune" | "stop" | "remove" | "askHuman" | "noop")[] = [
      "retune",
      "stop",
      "remove",
      "askHuman",
      "noop",
    ];
    for (const v of verdicts) {
      const mode = classifyAction({ type: v });
      if (v === "retune") expect(mode).toBe("autonomous");
      else if (v === "noop") expect(mode).toBe("noop");
      else expect(mode).toBe("hitl");
    }
  });
});
