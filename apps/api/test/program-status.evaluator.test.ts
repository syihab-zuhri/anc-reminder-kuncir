import type { ProgramRuleRequirementInput } from "@anc/contracts";
import { describe, expect, it } from "vitest";

import {
  evaluateProgramEvidence,
  type ProgramEvidenceSnapshot,
} from "../src/program-status/program-status.evaluator.js";

const DEFAULT_REQUIREMENTS: ProgramRuleRequirementInput[] = [
  { requirement_type: "MILESTONE_VALIDATED", milestone_code: "K1" },
  { requirement_type: "MILESTONE_VALIDATED", milestone_code: "K4" },
  { requirement_type: "MILESTONE_VALIDATED", milestone_code: "K5" },
  { requirement_type: "MILESTONE_VALIDATED", milestone_code: "K6" },
];

function snapshot(
  validated: readonly string[],
  fields: Record<string, string[]> = {},
): ProgramEvidenceSnapshot {
  return {
    validatedMilestones: validated as ProgramEvidenceSnapshot["validatedMilestones"],
    recordFields: new Map(Object.entries(fields).map(([code, keys]) => [code, new Set(keys)])),
  };
}

describe("evaluateProgramEvidence", () => {
  it("does not grant status from K6 confirmation alone when K4 validation is missing (AC-PROG-001)", () => {
    const result = evaluateProgramEvidence(DEFAULT_REQUIREMENTS, snapshot(["K6"]));

    expect(result.complete).toBe(false);
    expect(result.evidence.missing_milestones).toEqual(["K1", "K4", "K5"]);
    expect(result.evidence.validated_milestones).toEqual(["K6"]);
    expect(result.evidence.required_milestones).toEqual(["K1", "K4", "K5", "K6"]);
  });

  it("reports completion when every required milestone is validated (AC-PROG-002)", () => {
    const result = evaluateProgramEvidence(
      DEFAULT_REQUIREMENTS,
      snapshot(["K1", "K2", "K4", "K5", "K6"]),
    );

    expect(result.complete).toBe(true);
    expect(result.evidence.missing_milestones).toEqual([]);
    expect(result.evidence.validated_milestones).toEqual(["K1", "K4", "K5", "K6"]);
  });

  it("treats extra validated milestones outside the rule as non-decisive", () => {
    const result = evaluateProgramEvidence(
      [{ requirement_type: "MILESTONE_VALIDATED", milestone_code: "K1" }],
      snapshot(["K2", "K3"]),
    );

    expect(result.complete).toBe(false);
    expect(result.evidence.missing_milestones).toEqual(["K1"]);
    expect(result.evidence.validated_milestones).toEqual([]);
  });

  it("checks FIELD_PRESENT requirements against the latest record fields", () => {
    const requirements: ProgramRuleRequirementInput[] = [
      { requirement_type: "FIELD_PRESENT", milestone_code: "K1", field_key: "timbangan_kg" },
    ];

    const missing = evaluateProgramEvidence(requirements, snapshot([]));
    expect(missing.complete).toBe(false);
    expect(missing.evidence.field_checks).toEqual([
      { milestone_code: "K1", field_key: "timbangan_kg", present: false },
    ]);

    const present = evaluateProgramEvidence(
      requirements,
      snapshot([], { K1: ["timbangan_kg", "lingkar_lengan_cm"] }),
    );
    expect(present.complete).toBe(true);
    expect(present.evidence.field_checks).toEqual([
      { milestone_code: "K1", field_key: "timbangan_kg", present: true },
    ]);
  });

  it("combines milestone and field requirements into a single completeness decision", () => {
    const requirements: ProgramRuleRequirementInput[] = [
      { requirement_type: "MILESTONE_VALIDATED", milestone_code: "K4" },
      { requirement_type: "FIELD_PRESENT", milestone_code: "K4", field_key: "tekanan_darah" },
    ];

    const partial = evaluateProgramEvidence(requirements, snapshot(["K4"]));
    expect(partial.complete).toBe(false);

    const full = evaluateProgramEvidence(requirements, snapshot(["K4"], { K4: ["tekanan_darah"] }));
    expect(full.complete).toBe(true);
  });

  it("throws when a FIELD_PRESENT requirement lost its field key", () => {
    expect(() =>
      evaluateProgramEvidence(
        [{ requirement_type: "FIELD_PRESENT", milestone_code: "K1" }],
        snapshot([]),
      ),
    ).toThrow(/field key/u);
  });
});
