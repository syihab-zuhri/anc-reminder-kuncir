import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const version = "v1";
const authenticationTagBytes = 16;
const associatedData = Buffer.from("anc:mother:nik:v1", "utf8");

/**
 * Encrypts only the restricted NIK field. The versioned envelope keeps a
 * future key-rotation migration explicit without exposing plaintext to logs,
 * audit metadata, or ordinary API responses.
 */
export class NikCipher {
  private readonly key: Buffer;
  private readonly fingerprintKey: Buffer;

  public constructor(base64Key: string) {
    const decoded = Buffer.from(base64Key, "base64");
    if (decoded.length !== 32 || decoded.toString("base64") !== base64Key) {
      throw new Error("NIK encryption key must be a canonical base64-encoded 32-byte key");
    }
    this.key = decoded;
    // A separate key, derived from the same secret, so the fingerprint can never be used to
    // attack the encryption (and vice versa).
    this.fingerprintKey = Buffer.from(
      hkdfSync("sha256", decoded, Buffer.alloc(0), "anc:mother:nik-fingerprint:v1", 32),
    );
  }

  /**
   * Deterministic keyed fingerprint of a NIK, stored beside the randomized ciphertext only so the
   * database can enforce "one active record per NIK per health center". Encryption is randomized
   * (two ciphertexts of one NIK differ), so ciphertext cannot be compared. The fingerprint is an
   * HMAC: without the key it cannot be reversed or brute-forced from the 16-digit NIK space.
   */
  public fingerprint(nik: string): string {
    return createHmac("sha256", this.fingerprintKey).update(nik, "utf8").digest("hex");
  }

  public encrypt(nik: string): string {
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv(algorithm, this.key, initializationVector, {
      authTagLength: authenticationTagBytes,
    });
    cipher.setAAD(associatedData);
    const ciphertext = Buffer.concat([cipher.update(nik, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [version, initializationVector, tag, ciphertext]
      .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
      .join(".");
  }

  public decrypt(envelope: string): string {
    const [storedVersion, iv, tag, ciphertext, ...extra] = envelope.split(".");
    if (
      storedVersion !== version ||
      iv === undefined ||
      tag === undefined ||
      ciphertext === undefined ||
      extra.length !== 0
    ) {
      throw new Error("Malformed NIK ciphertext envelope");
    }

    try {
      const decipher = createDecipheriv(algorithm, this.key, Buffer.from(iv, "base64url"), {
        authTagLength: authenticationTagBytes,
      });
      decipher.setAAD(associatedData);
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new Error("NIK ciphertext authentication failed");
    }
  }
}
