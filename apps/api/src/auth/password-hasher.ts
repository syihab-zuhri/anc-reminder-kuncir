import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";

const KEY_LENGTH = 64;
// OWASP's current minimum scrypt profile: N=2^17, r=8, p=1 (128 MiB).
const COST = 131_072;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const MAX_MEMORY = 256 * 1024 * 1024;
const PREFIX = "scrypt";
const DUMMY_SALT = Buffer.from("anc-staff-auth-dummy-salt", "utf8");
const DUMMY_EXPECTED = Buffer.alloc(KEY_LENGTH);

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        N: COST,
        r: BLOCK_SIZE,
        p: PARALLELIZATION,
        maxmem: MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error === null) resolve(derivedKey);
        else reject(error);
      },
    );
  });
}

@Injectable()
export class PasswordHasher {
  public async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await derive(password, salt);
    return [
      PREFIX,
      String(COST),
      String(BLOCK_SIZE),
      String(PARALLELIZATION),
      salt.toString("base64url"),
      derived.toString("base64url"),
    ].join("$");
  }

  public async verifyOrDummy(password: string, encoded: string | undefined): Promise<boolean> {
    const parsed = encoded === undefined ? undefined : parseHash(encoded);
    const salt = parsed?.salt ?? DUMMY_SALT;
    const expected = parsed?.expected ?? DUMMY_EXPECTED;
    const actual = await derive(password, salt);
    return parsed !== undefined && timingSafeEqual(actual, expected);
  }
}

function parseHash(
  encoded: string,
): { readonly salt: Buffer; readonly expected: Buffer } | undefined {
  const [prefix, cost, blockSize, parallelization, salt, expected] = encoded.split("$");
  if (
    prefix !== PREFIX ||
    cost !== String(COST) ||
    blockSize !== String(BLOCK_SIZE) ||
    parallelization !== String(PARALLELIZATION) ||
    salt === undefined ||
    expected === undefined
  ) {
    return undefined;
  }

  try {
    const saltBuffer = Buffer.from(salt, "base64url");
    const expectedBuffer = Buffer.from(expected, "base64url");
    if (saltBuffer.length !== 16 || expectedBuffer.length !== KEY_LENGTH) return undefined;
    return { salt: saltBuffer, expected: expectedBuffer };
  } catch {
    return undefined;
  }
}
