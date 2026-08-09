import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";

import { PasswordHasher } from "../auth/password-hasher.js";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const SYMBOL_COUNT = 16;

export interface IssuedMotherAccessCode {
  readonly plaintext: string;
  readonly hash: string;
}

@Injectable()
export class MotherAccessCodeService {
  public constructor(private readonly hasher: PasswordHasher) {}

  public async issue(): Promise<IssuedMotherAccessCode> {
    const bytes = randomBytes(SYMBOL_COUNT);
    let symbols = "";
    for (const byte of bytes) symbols += ALPHABET.charAt(byte & 31);
    const grouped = symbols.match(/.{4}/gu);
    if (grouped === null) throw new Error("Mother access code generation failed");
    const plaintext = `ANC-${grouped.join("-")}`;
    return { plaintext, hash: await this.hasher.hash(plaintext) };
  }

  public verifyOrDummy(code: string, encodedHash: string | undefined): Promise<boolean> {
    return this.hasher.verifyOrDummy(code, encodedHash);
  }
}
