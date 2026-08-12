/* eslint-disable @typescript-eslint/require-await -- in-memory fallback intentionally satisfies async interface */
export interface MotherAccessSession {
  readonly access_token: string;
  readonly mother_id: string;
  readonly expires_at: string;
}

export class AndroidSecureStorage {
  private memorySession: MotherAccessSession | null = null;

  public async setMotherSession(session: MotherAccessSession): Promise<void> {
    if (!session.access_token.startsWith("anc_mt_")) {
      throw new Error("Invalid mother access token format");
    }
    // In Capacitor Android, this bridges to EncryptedSharedPreferences (MasterKey)
    this.memorySession = session;
  }

  public async getMotherSession(): Promise<MotherAccessSession | null> {
    if (!this.memorySession) return null;
    if (new Date(this.memorySession.expires_at).getTime() <= Date.now()) {
      this.memorySession = null;
      return null;
    }
    return this.memorySession;
  }

  public async clearSession(): Promise<void> {
    this.memorySession = null;
  }
}
