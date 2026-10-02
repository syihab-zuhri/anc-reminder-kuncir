"use strict";

/**
 * Address and facility code of a health center, for the printed ANC record and the screens that
 * name the Puskesmas. Both stay optional: the UI leaves them out until the Puskesmas fills them in.
 */
exports.up = (pgm) => {
  pgm.sql(String.raw`
    ALTER TABLE health_centers
      ADD COLUMN address text,
      ADD COLUMN facility_code text,
      ADD CONSTRAINT health_centers_address_nonblank CHECK (address IS NULL OR btrim(address) <> ''),
      ADD CONSTRAINT health_centers_facility_code_nonblank CHECK (
        facility_code IS NULL OR btrim(facility_code) <> ''
      );

    COMMENT ON COLUMN health_centers.facility_code IS
      'Official facility code (e.g. the BPJS faskes code) shown on printed records; not the internal code.';
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    ALTER TABLE health_centers
      DROP CONSTRAINT IF EXISTS health_centers_facility_code_nonblank,
      DROP CONSTRAINT IF EXISTS health_centers_address_nonblank,
      DROP COLUMN IF EXISTS facility_code,
      DROP COLUMN IF EXISTS address;
  `);
};
