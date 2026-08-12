import type {
  ProgramEvidenceMilestoneCode,
  ProgramRuleRequirementInput,
  ProgramStatusEvidence,
} from "@anc/contracts";

export interface ProgramEvidenceSnapshot {
  readonly validatedMilestones: readonly ProgramEvidenceMilestoneCode[];
  readonly recordFields: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface ProgramEvaluation {
  readonly complete: boolean;
  readonly evidence: ProgramStatusEvidence;
}

// Administrative completeness only: both program labels follow the same
// approved requirement set, and no single milestone (including K6) can grant
// them on its own.
export function evaluateProgramEvidence(
  requirements: readonly ProgramRuleRequirementInput[],
  snapshot: ProgramEvidenceSnapshot,
): ProgramEvaluation {
  const validated = new Set<string>(snapshot.validatedMilestones);
  const requiredMilestones = new Set<ProgramEvidenceMilestoneCode>();
  const validatedMilestones = new Set<ProgramEvidenceMilestoneCode>();
  const missingMilestones = new Set<ProgramEvidenceMilestoneCode>();
  const fieldChecks: ProgramStatusEvidence["field_checks"] = [];
  let complete = true;

  for (const requirement of requirements) {
    if (requirement.requirement_type === "MILESTONE_VALIDATED") {
      requiredMilestones.add(requirement.milestone_code);
      if (validated.has(requirement.milestone_code)) {
        validatedMilestones.add(requirement.milestone_code);
      } else {
        complete = false;
        missingMilestones.add(requirement.milestone_code);
      }
      continue;
    }

    if (requirement.field_key === undefined) {
      throw new Error("FIELD_PRESENT requirement is missing its field key");
    }
    requiredMilestones.add(requirement.milestone_code);
    const present =
      snapshot.recordFields.get(requirement.milestone_code)?.has(requirement.field_key) ?? false;
    fieldChecks.push({
      milestone_code: requirement.milestone_code,
      field_key: requirement.field_key,
      present,
    });
    if (!present) complete = false;
  }

  return {
    complete,
    evidence: {
      required_milestones: sortCodes(requiredMilestones),
      validated_milestones: sortCodes(validatedMilestones),
      missing_milestones: sortCodes(missingMilestones),
      field_checks: fieldChecks,
    },
  };
}

function sortCodes(
  codes: ReadonlySet<ProgramEvidenceMilestoneCode>,
): ProgramEvidenceMilestoneCode[] {
  return [...codes].sort();
}
