"use client";

import {
  contentTemplateCreateRequestSchema,
  contentTemplateListResponseSchema,
  contentTemplateResponseSchema,
  contentVersionCreateRequestSchema,
  contentVersionResponseSchema,
  type ContentTemplateListResponse,
  type ContentTemplateResponse,
  type ContentTemplateType,
  type ContentVersionResponse,
  type ContentVersionStatus,
} from "@anc/contracts";
import { useEffect, useMemo, useState } from "react";

interface ContentManagementPanelProps {
  readonly userRole: "PUSKESMAS" | "BIDAN" | "SUPER_ADMIN";
}

interface DraftFields {
  readonly contentType: ContentTemplateType;
  readonly templateKey: string;
  readonly title: string;
  readonly body: string;
  readonly sourceReference: string;
}

type EditorMode = "NEW_TEMPLATE" | "NEW_VERSION" | null;
type Feedback = { readonly type: "success" | "error"; readonly message: string };

export const SYNTHETIC_PREVIEW_VALUES = {
  milestone_code: "K2",
  facility_name: "Puskesmas Kuncir — data sintetis",
} as const;

const lifecycle: readonly ContentVersionStatus[] = [
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "PUBLISHED",
  "ARCHIVED",
];

const contentTypeCopy: Readonly<
  Record<ContentTemplateType, { readonly label: string; readonly shortLabel: string }>
> = {
  PUSH_REMINDER: { label: "Pengingat push", shortLabel: "PUSH" },
  WAME_REMINDER: { label: "Pengingat WhatsApp manual", shortLabel: "WA.ME" },
  EDUCATION: { label: "Materi edukasi", shortLabel: "EDU" },
  CONTACT_GUIDANCE: { label: "Panduan kontak", shortLabel: "KONTAK" },
};

const initialDraft: DraftFields = {
  contentType: "PUSH_REMINDER",
  templateKey: "anc.push-reminder",
  title: "Pengingat Pemeriksaan ANC",
  body: "Pengingat jadwal pemeriksaan kehamilan {{milestone_code}} dari {{facility_name}}.",
  sourceReference: "",
};

export function ContentManagementPanel({ userRole }: ContentManagementPanelProps) {
  if (userRole !== "PUSKESMAS") {
    return (
      <section className="staff-panel-card staff-panel-restricted">
        <span className="staff-panel-badge badge-warning">Akses Terbatas</span>
        <h2>Meja konten hanya tersedia untuk Puskesmas.</h2>
        <p>
          Bidan dan Super Admin tidak dapat membaca, menyusun, atau menerbitkan template
          operasional.
        </p>
      </section>
    );
  }

  return <ContentWorkspace />;
}

function ContentWorkspace() {
  const [content, setContent] = useState<ContentTemplateListResponse | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [draft, setDraft] = useState<DraftFields>(initialDraft);
  const [approvalReference, setApprovalReference] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void loadInitial(controller.signal);
    return () => controller.abort();

    async function loadInitial(signal: AbortSignal): Promise<void> {
      try {
        const next = await fetchContentTemplates(signal);
        setContent(next);
        const firstTemplate = next.items[0];
        setSelectedTemplateId(firstTemplate?.id ?? null);
        setSelectedVersionId(firstTemplate?.versions[0]?.id ?? null);
      } catch (error) {
        if (!isAbortError(error)) {
          setFeedback({ type: "error", message: errorMessage(error) });
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }
  }, []);

  const selectedTemplate = useMemo(
    () => content?.items.find((item) => item.id === selectedTemplateId) ?? null,
    [content, selectedTemplateId],
  );
  const selectedVersion = useMemo(
    () => selectedTemplate?.versions.find((version) => version.id === selectedVersionId) ?? null,
    [selectedTemplate, selectedVersionId],
  );

  const localTemplateCount = content?.items.filter((item) => !item.system_managed).length ?? 0;
  const publishedCount =
    content?.items.reduce(
      (count, template) =>
        count + template.versions.filter((version) => version.status === "PUBLISHED").length,
      0,
    ) ?? 0;
  const canGovern = content?.capabilities.can_approve_publish_archive === true;

  function selectTemplate(template: ContentTemplateResponse): void {
    setSelectedTemplateId(template.id);
    setSelectedVersionId(template.versions[0]?.id ?? null);
    setEditorMode(null);
    setFeedback(null);
  }

  function openNewTemplate(): void {
    setDraft(initialDraft);
    setEditorMode("NEW_TEMPLATE");
    setFeedback(null);
  }

  function openNewVersion(): void {
    if (selectedTemplate === null || selectedTemplate.system_managed) return;
    const source = selectedVersion ?? selectedTemplate.versions[0];
    setDraft({
      contentType: selectedTemplate.content_type,
      templateKey: selectedTemplate.template_key,
      title: source?.title ?? "",
      body: source?.body ?? "",
      sourceReference: "",
    });
    setEditorMode("NEW_VERSION");
    setFeedback(null);
  }

  async function refresh(
    preferredTemplateId = selectedTemplateId,
    preferredVersionId = selectedVersionId,
  ): Promise<void> {
    const next = await fetchContentTemplates();
    setContent(next);
    const template =
      next.items.find((item) => item.id === preferredTemplateId) ?? next.items[0] ?? null;
    const version =
      template?.versions.find((item) => item.id === preferredVersionId) ??
      template?.versions[0] ??
      null;
    setSelectedTemplateId(template?.id ?? null);
    setSelectedVersionId(version?.id ?? null);
  }

  async function refreshFromToolbar(): Promise<void> {
    if (busyAction !== null) return;
    setLoading(true);
    setFeedback(null);
    try {
      await refresh();
    } catch (error) {
      setFeedback({ type: "error", message: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  async function createDraft(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busyAction !== null) return;

    const idempotencyKey = crypto.randomUUID();
    setBusyAction("CREATE_DRAFT");
    setFeedback(null);
    try {
      let templateId: string;
      let versionId: string | null;
      if (editorMode === "NEW_TEMPLATE") {
        const parsed = contentTemplateCreateRequestSchema.safeParse({
          idempotency_key: idempotencyKey,
          template_key: draft.templateKey.trim(),
          content_type: draft.contentType,
          title: draft.title.trim(),
          body: draft.body.trim(),
          source_reference: draft.sourceReference.trim(),
        });
        if (!parsed.success) throw new Error(firstValidationMessage(parsed.error.issues));
        const created = await requestJson(
          "/api/staff-proxy/content/templates",
          contentTemplateResponseSchema,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(parsed.data),
          },
        );
        templateId = created.id;
        versionId = created.versions[0]?.id ?? null;
      } else {
        if (selectedTemplate === null) throw new Error("Pilih template lokal terlebih dahulu.");
        const parsed = contentVersionCreateRequestSchema.safeParse({
          idempotency_key: idempotencyKey,
          title: draft.title.trim(),
          body: draft.body.trim(),
          source_reference: draft.sourceReference.trim(),
        });
        if (!parsed.success) throw new Error(firstValidationMessage(parsed.error.issues));
        const created = await requestJson(
          `/api/staff-proxy/content/templates/${selectedTemplate.id}/versions`,
          contentVersionResponseSchema,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(parsed.data),
          },
        );
        templateId = created.content_template_id;
        versionId = created.id;
      }
      await refresh(templateId, versionId ?? null);
      setEditorMode(null);
      setFeedback({
        type: "success",
        message: "Draft tersimpan. Periksa preview sintetis sebelum mengirimnya ke review.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: errorMessage(error) });
    } finally {
      setBusyAction(null);
    }
  }

  async function transitionVersion(
    action: "submit-review" | "approve" | "publish" | "archive",
  ): Promise<void> {
    if (selectedVersion === null || busyAction !== null) return;
    if (action === "approve" && approvalReference.trim().length < 3) {
      setFeedback({
        type: "error",
        message: "Referensi persetujuan wajib diisi sebelum approval.",
      });
      return;
    }

    setBusyAction(action);
    setFeedback(null);
    try {
      const payload = {
        idempotency_key: crypto.randomUUID(),
        ...(action === "approve" ? { approval_reference: approvalReference.trim() } : {}),
      };
      const updated = await requestJson(
        `/api/staff-proxy/content/versions/${selectedVersion.id}/${action}`,
        contentVersionResponseSchema,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      await refresh(updated.content_template_id, updated.id);
      if (action === "approve") setApprovalReference("");
      setFeedback({ type: "success", message: transitionSuccessMessage(action) });
    } catch (error) {
      setFeedback({ type: "error", message: errorMessage(error) });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="content-studio" aria-labelledby="content-studio-title">
      <header className="content-studio-hero">
        <div>
          <p className="staff-kicker">TASK-P4-010 / Meja editorial klinis</p>
          <h2 id="content-studio-title">Naskah yang aman, jejak persetujuan yang jelas.</h2>
          <p>
            Susun template tanpa data pasien, tinjau hasil substitusi sintetis, lalu terbitkan
            melalui lifecycle yang dikendalikan server.
          </p>
        </div>
        <dl className="content-studio-metrics" aria-label="Ringkasan pustaka konten">
          <div>
            <dt>Template lokal</dt>
            <dd>{localTemplateCount.toString().padStart(2, "0")}</dd>
          </div>
          <div>
            <dt>Sedang terbit</dt>
            <dd>{publishedCount.toString().padStart(2, "0")}</dd>
          </div>
          <div>
            <dt>Wewenang sesi</dt>
            <dd className="content-capability-copy">
              {canGovern ? "Owner klinis" : "Draft & review"}
            </dd>
          </div>
        </dl>
      </header>

      <div className="content-studio-toolbar" aria-label="Aksi pustaka konten">
        <div>
          <button className="btn-primary" type="button" onClick={openNewTemplate}>
            Template baru
          </button>
          <button
            className="btn-secondary"
            type="button"
            onClick={openNewVersion}
            disabled={selectedTemplate === null || selectedTemplate.system_managed}
          >
            Versi baru
          </button>
        </div>
        <button
          className="content-refresh-button"
          type="button"
          onClick={() => void refreshFromToolbar()}
          disabled={loading || busyAction !== null}
        >
          {loading ? "Memuat…" : "↻ Muat ulang"}
        </button>
      </div>

      {feedback !== null ? (
        <div
          className={`content-feedback ${feedback.type === "success" ? "is-success" : "is-error"}`}
          role={feedback.type === "error" ? "alert" : "status"}
        >
          <span aria-hidden="true">{feedback.type === "success" ? "✓" : "!"}</span>
          <p>{feedback.message}</p>
        </div>
      ) : null}

      {editorMode !== null ? (
        <ContentDraftEditor
          draft={draft}
          mode={editorMode}
          busy={busyAction === "CREATE_DRAFT"}
          onChange={setDraft}
          onCancel={() => setEditorMode(null)}
          onSubmit={createDraft}
        />
      ) : null}

      <div className="content-studio-grid">
        <aside className="content-library" aria-label="Pustaka template">
          <div className="content-library-heading">
            <span>Pustaka</span>
            <strong>{content?.total ?? 0}</strong>
          </div>
          {loading ? (
            <ContentLibraryLoading />
          ) : content === null || content.items.length === 0 ? (
            <div className="content-library-empty">
              <strong>Belum ada template.</strong>
              <p>Buat template lokal pertama untuk memulai alur review.</p>
            </div>
          ) : (
            <div className="content-library-list">
              {content.items.map((template) => {
                const current = template.versions[0];
                return (
                  <button
                    key={template.id}
                    className={`content-template-card ${
                      selectedTemplateId === template.id ? "is-selected" : ""
                    }`}
                    type="button"
                    onClick={() => selectTemplate(template)}
                  >
                    <span className="content-template-code">
                      {contentTypeCopy[template.content_type].shortLabel}
                    </span>
                    <span className="content-template-copy">
                      <strong>{contentTypeCopy[template.content_type].label}</strong>
                      <small>{template.template_key}</small>
                    </span>
                    <span className={`content-status-dot status-${current?.status ?? "EMPTY"}`}>
                      {current?.status ?? "KOSONG"}
                    </span>
                    {template.system_managed ? (
                      <span className="content-system-label">Baseline sistem</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section className="content-review-desk" aria-label="Meja review versi konten">
          {selectedTemplate === null || selectedVersion === null ? (
            <div className="content-review-empty">
              <span aria-hidden="true">Aa</span>
              <h3>Pilih template untuk membuka meja review.</h3>
              <p>Preview selalu menggunakan milestone dan fasilitas sintetis—bukan data pasien.</p>
            </div>
          ) : (
            <>
              <header className="content-version-header">
                <div>
                  <p>
                    {contentTypeCopy[selectedTemplate.content_type].label} / versi{" "}
                    {selectedVersion.version_no}
                  </p>
                  <h3>{selectedVersion.title}</h3>
                </div>
                <span className={`content-status-seal status-${selectedVersion.status}`}>
                  {selectedVersion.status}
                </span>
              </header>

              <VersionHistory
                template={selectedTemplate}
                selectedVersionId={selectedVersion.id}
                onSelect={setSelectedVersionId}
              />

              <LifecycleTrack status={selectedVersion.status} />

              <div className="content-review-grid">
                <article className="content-manuscript">
                  <span className="content-section-number">01 / NASKAH TERKUNCI</span>
                  <h4>{selectedVersion.title}</h4>
                  <p className="content-manuscript-body">{selectedVersion.body}</p>
                  <dl className="content-manuscript-meta">
                    <div>
                      <dt>Sumber</dt>
                      <dd>{selectedVersion.source_reference}</dd>
                    </div>
                    <div>
                      <dt>Placeholder</dt>
                      <dd>
                        {selectedVersion.placeholder_keys.length === 0
                          ? "Tanpa placeholder"
                          : selectedVersion.placeholder_keys.map((key) => `{{${key}}}`).join(" · ")}
                      </dd>
                    </div>
                    <div>
                      <dt>Referensi approval</dt>
                      <dd>{selectedVersion.approval_reference ?? "Belum disetujui"}</dd>
                    </div>
                  </dl>
                </article>

                <SyntheticPreview
                  contentType={selectedTemplate.content_type}
                  version={selectedVersion}
                />
              </div>

              <GovernanceActions
                version={selectedVersion}
                systemManaged={selectedTemplate.system_managed}
                canGovern={canGovern}
                approvalReference={approvalReference}
                busyAction={busyAction}
                onApprovalReferenceChange={setApprovalReference}
                onTransition={transitionVersion}
              />
            </>
          )}
        </section>
      </div>
    </section>
  );
}

function ContentDraftEditor({
  draft,
  mode,
  busy,
  onChange,
  onCancel,
  onSubmit,
}: {
  readonly draft: DraftFields;
  readonly mode: Exclude<EditorMode, null>;
  readonly busy: boolean;
  readonly onChange: (next: DraftFields) => void;
  readonly onCancel: () => void;
  readonly onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  function update<Key extends keyof DraftFields>(key: Key, value: DraftFields[Key]): void {
    onChange({ ...draft, [key]: value });
  }

  function insertPlaceholder(key: "milestone_code" | "facility_name"): void {
    update("body", `${draft.body}${draft.body.endsWith(" ") ? "" : " "}{{${key}}}`);
  }

  return (
    <form className="content-draft-editor" onSubmit={(event) => void onSubmit(event)}>
      <header>
        <div>
          <span>{mode === "NEW_TEMPLATE" ? "Template lokal baru" : "Versi draft baru"}</span>
          <h3>Susun naskah tanpa identitas atau detail klinis pasien.</h3>
        </div>
        <button type="button" onClick={onCancel} aria-label="Tutup editor draft">
          ×
        </button>
      </header>
      <div className="content-editor-fields">
        {mode === "NEW_TEMPLATE" ? (
          <>
            <label>
              Jenis konten
              <select
                value={draft.contentType}
                onChange={(event) =>
                  update("contentType", event.target.value as ContentTemplateType)
                }
              >
                {Object.entries(contentTypeCopy).map(([value, copy]) => (
                  <option key={value} value={value}>
                    {copy.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Kunci template
              <input
                value={draft.templateKey}
                onChange={(event) => update("templateKey", event.target.value)}
                placeholder="anc.push-reminder"
                required
              />
            </label>
          </>
        ) : null}
        <label className="content-editor-wide">
          Judul
          <input
            value={draft.title}
            onChange={(event) => update("title", event.target.value)}
            maxLength={120}
            required
          />
        </label>
        <label className="content-editor-wide">
          Isi naskah
          <textarea
            value={draft.body}
            onChange={(event) => update("body", event.target.value)}
            maxLength={1000}
            rows={5}
            required
          />
          <span className="content-field-counter">{draft.body.length} / 1000 karakter</span>
        </label>
        <div className="content-placeholder-tools content-editor-wide">
          <span>Placeholder aman</span>
          <button type="button" onClick={() => insertPlaceholder("milestone_code")}>
            + milestone_code
          </button>
          <button type="button" onClick={() => insertPlaceholder("facility_name")}>
            + facility_name
          </button>
        </div>
        <label className="content-editor-wide">
          Referensi sumber terkendali
          <input
            value={draft.sourceReference}
            onChange={(event) => update("sourceReference", event.target.value)}
            placeholder="Contoh sintetis: SOP-ANC-SYNTHETIC-001"
            maxLength={240}
            required
          />
          <small>Jangan memasukkan nama pasien, NIK, diagnosis, atau hasil laboratorium.</small>
        </label>
      </div>
      <footer>
        <button className="btn-secondary" type="button" onClick={onCancel} disabled={busy}>
          Batal
        </button>
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "Menyimpan…" : "Simpan sebagai DRAFT"}
        </button>
      </footer>
    </form>
  );
}

function VersionHistory({
  template,
  selectedVersionId,
  onSelect,
}: {
  readonly template: ContentTemplateResponse;
  readonly selectedVersionId: string;
  readonly onSelect: (id: string) => void;
}) {
  return (
    <div className="content-version-strip" aria-label="Riwayat versi">
      <span>Riwayat versi</span>
      <div>
        {template.versions.map((version) => (
          <button
            key={version.id}
            className={version.id === selectedVersionId ? "is-selected" : ""}
            type="button"
            onClick={() => onSelect(version.id)}
          >
            v{version.version_no} <small>{version.status}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function LifecycleTrack({ status }: { readonly status: ContentVersionStatus }) {
  const currentIndex = lifecycle.indexOf(status);
  return (
    <ol className="content-lifecycle-track" aria-label={`Lifecycle saat ini ${status}`}>
      {lifecycle.map((step, index) => (
        <li
          key={step}
          className={index === currentIndex ? "is-current" : index < currentIndex ? "is-past" : ""}
        >
          <span>{(index + 1).toString().padStart(2, "0")}</span>
          <strong>{step}</strong>
        </li>
      ))}
    </ol>
  );
}

function SyntheticPreview({
  contentType,
  version,
}: {
  readonly contentType: ContentTemplateType;
  readonly version: ContentVersionResponse;
}) {
  const rendered = renderSyntheticContentPreview(version.body);
  return (
    <aside className="content-preview-stage" aria-label="Preview sintetis">
      <header>
        <span>02 / PREVIEW</span>
        <strong>SINTETIS · BUKAN PESAN PASIEN</strong>
      </header>
      <div className={`content-device-preview preview-${contentType}`}>
        <div className="content-device-topline">
          <span>{contentType === "WAME_REMINDER" ? "WA manual" : "ANC Kuncir"}</span>
          <span>09:41</span>
        </div>
        <div className="content-preview-message">
          <strong>{version.title}</strong>
          <p>{rendered}</p>
          {contentType === "WAME_REMINDER" ? (
            <small>Preview link manual · status pengiriman tidak diketahui</small>
          ) : null}
        </div>
      </div>
      <p className="content-preview-footnote">
        Nilai <code>K2</code> dan <code>Puskesmas Kuncir</code> di atas adalah data uji tetap. UI
        tidak mengambil identitas ibu, nomor telepon, atau detail klinis untuk preview.
      </p>
    </aside>
  );
}

function GovernanceActions({
  version,
  systemManaged,
  canGovern,
  approvalReference,
  busyAction,
  onApprovalReferenceChange,
  onTransition,
}: {
  readonly version: ContentVersionResponse;
  readonly systemManaged: boolean;
  readonly canGovern: boolean;
  readonly approvalReference: string;
  readonly busyAction: string | null;
  readonly onApprovalReferenceChange: (value: string) => void;
  readonly onTransition: (
    action: "submit-review" | "approve" | "publish" | "archive",
  ) => Promise<void>;
}) {
  if (systemManaged) {
    return (
      <div className="content-governance-note">
        <span aria-hidden="true">◇</span>
        <div>
          <strong>Baseline sistem bersifat read-only.</strong>
          <p>Buat template lokal untuk mengusulkan naskah pengganti pada fasilitas ini.</p>
        </div>
      </div>
    );
  }

  if (version.status === "ARCHIVED") {
    return (
      <div className="content-governance-note">
        <span aria-hidden="true">✓</span>
        <div>
          <strong>Versi ini telah diarsipkan.</strong>
          <p>Snapshot historis tetap tersedia, tetapi tidak dipilih untuk siklus baru.</p>
        </div>
      </div>
    );
  }

  const ownerBlocked = !canGovern && ["REVIEW", "APPROVED", "PUBLISHED"].includes(version.status);
  return (
    <section className="content-governance-actions" aria-labelledby="governance-action-title">
      <div>
        <span className="content-section-number">03 / KEPUTUSAN</span>
        <h4 id="governance-action-title">{nextActionHeading(version.status)}</h4>
        <p>{nextActionDescription(version.status)}</p>
      </div>
      <div className="content-governance-controls">
        {version.status === "REVIEW" ? (
          <label>
            Referensi persetujuan
            <input
              value={approvalReference}
              onChange={(event) => onApprovalReferenceChange(event.target.value)}
              placeholder="Nomor dokumen / berita acara"
              maxLength={240}
              disabled={!canGovern || busyAction !== null}
            />
          </label>
        ) : null}
        {version.status === "DRAFT" ? (
          <button
            className="btn-primary"
            type="button"
            onClick={() => void onTransition("submit-review")}
            disabled={busyAction !== null}
          >
            {busyAction === "submit-review" ? "Mengirim…" : "Kirim ke REVIEW"}
          </button>
        ) : null}
        {version.status === "REVIEW" ? (
          <button
            className="btn-primary"
            type="button"
            onClick={() => void onTransition("approve")}
            disabled={!canGovern || busyAction !== null}
          >
            {busyAction === "approve" ? "Menyetujui…" : "Setujui naskah"}
          </button>
        ) : null}
        {version.status === "APPROVED" ? (
          <button
            className="btn-primary"
            type="button"
            onClick={() => void onTransition("publish")}
            disabled={!canGovern || busyAction !== null}
          >
            {busyAction === "publish" ? "Menerbitkan…" : "Terbitkan ke produksi"}
          </button>
        ) : null}
        {version.status === "PUBLISHED" ? (
          <button
            className="btn-secondary"
            type="button"
            onClick={() => void onTransition("archive")}
            disabled={!canGovern || busyAction !== null}
          >
            {busyAction === "archive" ? "Mengarsipkan…" : "Arsipkan versi"}
          </button>
        ) : null}
        {ownerBlocked ? (
          <small>Hanya Clinical/Program Owner aktif yang dapat menjalankan keputusan ini.</small>
        ) : null}
      </div>
    </section>
  );
}

function ContentLibraryLoading() {
  return (
    <div className="content-library-loading" aria-busy="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export function renderSyntheticContentPreview(body: string): string {
  return body.replace(
    /\{\{\s*(milestone_code|facility_name)\s*\}\}/gu,
    (_match, key: keyof typeof SYNTHETIC_PREVIEW_VALUES) => SYNTHETIC_PREVIEW_VALUES[key],
  );
}

export function nextLifecycleAction(
  status: ContentVersionStatus,
): "submit-review" | "approve" | "publish" | "archive" | null {
  const actionByStatus = {
    DRAFT: "submit-review",
    REVIEW: "approve",
    APPROVED: "publish",
    PUBLISHED: "archive",
    ARCHIVED: null,
  } as const;
  return actionByStatus[status];
}

function nextActionHeading(status: ContentVersionStatus): string {
  const copy = {
    DRAFT: "Siap dibekukan untuk review?",
    REVIEW: "Validasi sumber dan makna naskah.",
    APPROVED: "Persetujuan lengkap—siap diterbitkan.",
    PUBLISHED: "Versi ini sedang digunakan untuk siklus baru.",
    ARCHIVED: "Riwayat snapshot",
  } as const;
  return copy[status];
}

function nextActionDescription(status: ContentVersionStatus): string {
  const copy = {
    DRAFT:
      "Setelah masuk REVIEW, judul, isi, placeholder, dan referensi sumber tidak dapat diubah.",
    REVIEW:
      "Approval membutuhkan referensi dokumen terkendali dan wewenang Clinical/Program Owner.",
    APPROVED: "Publikasi akan mengarsipkan versi terbit sebelumnya pada template lokal yang sama.",
    PUBLISHED:
      "Arsipkan hanya ketika versi ini tidak boleh lagi dipilih untuk siklus reminder baru.",
    ARCHIVED: "Snapshot tetap dipertahankan untuk histori reminder yang telah mengikat versi ini.",
  } as const;
  return copy[status];
}

function transitionSuccessMessage(
  action: "submit-review" | "approve" | "publish" | "archive",
): string {
  const copy = {
    "submit-review": "Naskah masuk REVIEW dan snapshot kontennya kini terkunci.",
    approve: "Naskah disetujui dengan referensi governance yang tercatat.",
    publish: "Versi PUBLISHED kini eligible untuk siklus reminder baru.",
    archive: "Versi diarsipkan dan tidak akan dipilih untuk siklus baru.",
  } as const;
  return copy[action];
}

async function fetchContentTemplates(signal?: AbortSignal): Promise<ContentTemplateListResponse> {
  return requestJson("/api/staff-proxy/content/templates", contentTemplateListResponseSchema, {
    cache: "no-store",
    signal,
  });
}

async function requestJson<T>(
  path: string,
  schema: {
    readonly safeParse: (
      value: unknown,
    ) => { readonly success: true; readonly data: T } | { readonly success: false };
  },
  init: RequestInit,
): Promise<T> {
  const response = await fetch(path, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const upstreamMessage = readUpstreamMessage(body);
    throw new Error(upstreamMessage ?? "Permintaan konten ditolak oleh server.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error("Server mengembalikan kontrak konten yang tidak valid.");
  return parsed.data;
}

function readUpstreamMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  const error = (body as { readonly error?: unknown }).error;
  if (typeof error !== "object" || error === null || !("message" in error)) return null;
  const message = (error as { readonly message?: unknown }).message;
  return typeof message === "string" ? message : null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Layanan konten belum dapat dihubungi.";
}

function firstValidationMessage(issues: readonly { readonly message: string }[]): string {
  return issues[0]?.message ?? "Naskah belum memenuhi aturan konten.";
}
