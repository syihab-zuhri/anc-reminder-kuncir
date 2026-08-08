import { Inject, Injectable } from "@nestjs/common";

import type { StaffActor } from "../auth/staff-auth.types.js";
import { SCOPED_ACCESS_REPOSITORY } from "../infrastructure/tokens.js";
import { AuthorizationPolicy, forbidden } from "./authorization.policy.js";
import type { ScopedAccessRepository } from "./scoped-access.repository.js";

@Injectable()
export class ScopedAccessService {
  public constructor(
    @Inject(SCOPED_ACCESS_REPOSITORY) private readonly repository: ScopedAccessRepository,
    private readonly policy: AuthorizationPolicy,
  ) {}

  public async assertMotherRead(actor: StaffActor, motherId: string): Promise<void> {
    this.policy.assertCapability(actor, "MOTHER_BASIC_READ");
    if (!(await this.repository.canAccessMother(actor, motherId))) throw forbidden();
  }
}
