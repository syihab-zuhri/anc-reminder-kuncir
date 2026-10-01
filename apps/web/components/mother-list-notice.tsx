import { MOTHER_LIST_MAX } from "../lib/mothers-api";

/** Shown only when a picker could not load every mother, so a missing name is never a mystery. */
export function MotherListNotice({ truncated }: { readonly truncated: boolean }) {
  if (!truncated) return null;
  return (
    <small className="field-hint" role="status">
      Hanya {MOTHER_LIST_MAX.toLocaleString("id-ID")} pasien pertama yang ditampilkan. Jumlah di
      bawah belum mencakup semua pasien.
    </small>
  );
}
