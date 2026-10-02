"use strict";

/**
 * One active mother record per NIK per health center.
 *
 * nik_ciphertext is randomized encryption, so two records of the same person cannot be compared
 * and the same woman could be registered twice. nik_fingerprint is a keyed HMAC computed by the
 * application (never the NIK itself); the partial unique index makes the database enforce it.
 * Rows registered before this migration keep NULL until scripts/backfill-nik-fingerprints.mjs
 * fills them in, and NULLs are exempt from the index. Archived records do not hold their NIK, so
 * a person can be registered again after the old record was archived.
 */
exports.up = (pgm) => {
  pgm.sql(String.raw`
    ALTER TABLE mothers
      ADD COLUMN nik_fingerprint text,
      ADD CONSTRAINT mothers_nik_fingerprint_format CHECK (
        nik_fingerprint IS NULL OR nik_fingerprint ~ '^[a-f0-9]{64}$'
      );

    CREATE UNIQUE INDEX mothers_active_nik_unique_idx
      ON mothers (health_center_id, nik_fingerprint)
      WHERE archived_at IS NULL AND nik_fingerprint IS NOT NULL;

    COMMENT ON COLUMN mothers.nik_fingerprint IS
      'Keyed HMAC-SHA-256 of the NIK (HKDF-derived key); only for duplicate detection, not reversible without the key.';
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    DROP INDEX IF EXISTS mothers_active_nik_unique_idx;
    ALTER TABLE mothers
      DROP CONSTRAINT IF EXISTS mothers_nik_fingerprint_format,
      DROP COLUMN IF EXISTS nik_fingerprint;
  `);
};
