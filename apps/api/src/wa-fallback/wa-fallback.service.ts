import type {
  GenerateWaLinkResponse,
  WaFallbackItem,
  WaFallbackQueueResponse,
} from "@anc/contracts";
import type { WaFallbackRepository } from "./wa-fallback.repository.js";

export class WaFallbackService {
  public constructor(private readonly repository: WaFallbackRepository) {}

  public async getQueue(scope: {
    healthCenterId?: string;
    villageIds?: string[];
  }): Promise<WaFallbackQueueResponse> {
    const items = await this.repository.getQueue(scope);
    return {
      items,
      total: items.length,
    };
  }

  public async generateWaLink(id: string): Promise<GenerateWaLinkResponse> {
    const item = await this.repository.getById(id);
    if (!item) {
      throw new Error("Tindak lanjut WhatsApp tidak ditemukan.");
    }

    const generatedAt = new Date().toISOString();
    // Synthetic safe default phone for wa.me link generation
    const cleanPhone = "6281234567890";
    const messageText = `Halo Ibu ${item.mother_full_name}, kami dari Posyandu/Puskesmas mengingatkan jadwal pemeriksaan kehamilan ${item.milestone_code}. Mohon dapat hadir sesuai jadwal. Terima kasih.`;
    const waMeUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`;

    await this.repository.updateWaLink(id, waMeUrl, generatedAt);

    return {
      fallback_id: id,
      wa_me_url: waMeUrl,
      generated_at: generatedAt,
      status: "LINK_GENERATED",
      disclaimer:
        "Link wa.me ini adalah aksi manual Bidan dan tidak menjamin status pengiriman/penerimaan pesan di WhatsApp.",
    };
  }

  public async resolve(
    id: string,
    staffUserId: string,
    manualNote?: string,
  ): Promise<WaFallbackItem> {
    const updated = await this.repository.resolve(id, staffUserId, manualNote);
    if (!updated) {
      throw new Error("Gagal mengurai tindak lanjut WhatsApp.");
    }
    return updated;
  }
}
