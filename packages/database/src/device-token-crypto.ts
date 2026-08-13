import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const version = "v1";
const authenticationTagBytes = 16;
const associatedData = Buffer.from("anc:device:fcm-token:v1", "utf8");

/** Keeps FCM registration tokens encrypted and gives repositories a stable,
 * non-reversible identifier without ever persisting plaintext. */
export class DeviceTokenCrypto {
  private readonly encryptionKey: Buffer;
  private readonly fingerprintKey: Buffer;

  public constructor(base64MasterKey: string) {
    const masterKey = Buffer.from(base64MasterKey, "base64");
    if (masterKey.length !== 32 || masterKey.toString("base64") !== base64MasterKey) {
      throw new Error("Device token key must be a canonical base64-encoded 32-byte key");
    }
    this.encryptionKey = Buffer.from(
      hkdfSync("sha256", masterKey, Buffer.alloc(0), "anc:device:encryption:v1", 32),
    );
    this.fingerprintKey = Buffer.from(
      hkdfSync("sha256", masterKey, Buffer.alloc(0), "anc:device:fingerprint:v1", 32),
    );
  }

  public encrypt(token: string): string {
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv(algorithm, this.encryptionKey, initializationVector, {
      authTagLength: authenticationTagBytes,
    });
    cipher.setAAD(associatedData);
    const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    return [
      version,
      initializationVector.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(".");
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
      throw new Error("Malformed device token ciphertext envelope");
    }

    try {
      const decipher = createDecipheriv(
        algorithm,
        this.encryptionKey,
        Buffer.from(iv, "base64url"),
        { authTagLength: authenticationTagBytes },
      );
      decipher.setAAD(associatedData);
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new Error("Device token ciphertext authentication failed");
    }
  }

  public fingerprint(token: string): string {
    return createHmac("sha256", this.fingerprintKey).update(token, "utf8").digest("base64url");
  }
}
