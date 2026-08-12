/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(String.raw`
    ALTER TABLE pregnancy_milestones
      ADD CONSTRAINT pregnancy_milestones_id_code_unique UNIQUE (id, code);

    ALTER TABLE k1_k6_records
      ADD COLUMN milestone_code milestone_code,
      ADD COLUMN created_at timestamptz;

    UPDATE k1_k6_records AS record
       SET milestone_code = milestone.code,
           created_at = record.updated_at
      FROM pregnancy_milestones AS milestone
     WHERE milestone.id = record.milestone_id;

    ALTER TABLE k1_k6_records
      ALTER COLUMN milestone_code SET NOT NULL,
      ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
      ALTER COLUMN created_at SET NOT NULL,
      DROP CONSTRAINT k1_k6_records_validation_pair,
      ADD CONSTRAINT k1_k6_records_validation_pair CHECK (
        (
          status = 'INCOMPLETE'
          AND validated_at IS NULL
          AND validated_by IS NULL
        )
        OR
        (
          status = 'VALIDATED'
          AND validated_at IS NOT NULL
          AND validated_by IS NOT NULL
        )
      ),
      ADD CONSTRAINT k1_k6_records_code_supported CHECK (
        milestone_code IN ('K1', 'K2', 'K3', 'K4', 'K5', 'K6')
      ),
      ADD CONSTRAINT k1_k6_records_milestone_code_fk
        FOREIGN KEY (milestone_id, milestone_code)
        REFERENCES pregnancy_milestones(id, code)
        ON DELETE RESTRICT,
      ADD CONSTRAINT k1_k6_records_id_milestone_unique UNIQUE (id, milestone_id);

    CREATE TABLE k1_k6_record_revisions (
      id uuid PRIMARY KEY,
      record_id uuid NOT NULL,
      milestone_id uuid NOT NULL,
      revision_no integer NOT NULL CHECK (revision_no > 0),
      actor_staff_id uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      schema_version text NOT NULL CHECK (btrim(schema_version) <> ''),
      record_payload jsonb NOT NULL CHECK (jsonb_typeof(record_payload) = 'object'),
      occurred_at timestamptz NOT NULL,
      CONSTRAINT k1_k6_record_revisions_record_same_milestone_fk
        FOREIGN KEY (record_id, milestone_id)
        REFERENCES k1_k6_records(id, milestone_id)
        ON DELETE RESTRICT,
      CONSTRAINT k1_k6_record_revisions_record_number_unique UNIQUE (record_id, revision_no),
      CONSTRAINT k1_k6_record_revisions_id_record_unique UNIQUE (id, record_id)
    );

    INSERT INTO k1_k6_record_revisions (
      id, record_id, milestone_id, revision_no, actor_staff_id,
      schema_version, record_payload, occurred_at
    )
    SELECT md5(record.id::text || ':legacy-revision-1')::uuid,
           record.id,
           record.milestone_id,
           1,
           record.validated_by,
           record.schema_version,
           record.record_payload,
           record.updated_at
      FROM k1_k6_records AS record;

    UPDATE pregnancy_milestones AS milestone
       SET record_validation_status = record.status::text::record_validation_status
      FROM k1_k6_records AS record
     WHERE record.milestone_id = milestone.id
       AND milestone.record_validation_status IS DISTINCT FROM record.status::text::record_validation_status;

    ALTER TABLE record_validation_events
      ADD COLUMN revision_id uuid,
      ADD COLUMN resulting_status k1_k6_record_status,
      ADD COLUMN validated_at_snapshot timestamptz,
      ADD COLUMN validated_by_snapshot uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      ADD CONSTRAINT record_validation_events_revision_same_record_fk
        FOREIGN KEY (revision_id, record_id)
        REFERENCES k1_k6_record_revisions(id, record_id)
        ON DELETE RESTRICT,
      ADD CONSTRAINT record_validation_events_state_snapshot CHECK (
        (
          revision_id IS NULL
          AND resulting_status IS NULL
          AND validated_at_snapshot IS NULL
          AND validated_by_snapshot IS NULL
        )
        OR
        (
          revision_id IS NOT NULL
          AND resulting_status IS NOT NULL
          AND (
            (
              resulting_status = 'INCOMPLETE'
              AND validated_at_snapshot IS NULL
              AND validated_by_snapshot IS NULL
            )
            OR
            (
              resulting_status = 'VALIDATED'
              AND validated_at_snapshot IS NOT NULL
              AND validated_by_snapshot IS NOT NULL
            )
          )
        )
      );

    CREATE INDEX k1_k6_record_revisions_history_idx
      ON k1_k6_record_revisions (record_id, revision_no DESC);

    CREATE TRIGGER k1_k6_record_revisions_append_only
      BEFORE UPDATE OR DELETE ON k1_k6_record_revisions
      FOR EACH ROW EXECUTE FUNCTION anc_reject_append_only_mutation();

    COMMENT ON TABLE k1_k6_record_revisions IS
      'Append-only sensitive record snapshots. Nullable actor exists only for migrated legacy history; new API revisions always store the Puskesmas actor. Payloads must never be copied into generic audit metadata or logs.';
    COMMENT ON COLUMN k1_k6_records.schema_version IS
      'Opaque version identifier for separately governed detail structure; it does not itself imply clinical approval.';
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    ALTER TABLE record_validation_events
      DROP CONSTRAINT IF EXISTS record_validation_events_state_snapshot,
      DROP CONSTRAINT IF EXISTS record_validation_events_revision_same_record_fk,
      DROP COLUMN IF EXISTS validated_by_snapshot,
      DROP COLUMN IF EXISTS validated_at_snapshot,
      DROP COLUMN IF EXISTS resulting_status,
      DROP COLUMN IF EXISTS revision_id;

    DROP TABLE IF EXISTS k1_k6_record_revisions;

    ALTER TABLE k1_k6_records
      DROP CONSTRAINT IF EXISTS k1_k6_records_id_milestone_unique,
      DROP CONSTRAINT IF EXISTS k1_k6_records_milestone_code_fk,
      DROP CONSTRAINT IF EXISTS k1_k6_records_code_supported,
      DROP CONSTRAINT IF EXISTS k1_k6_records_validation_pair,
      DROP COLUMN IF EXISTS created_at,
      DROP COLUMN IF EXISTS milestone_code;

    ALTER TABLE k1_k6_records
      ADD CONSTRAINT k1_k6_records_validation_pair CHECK (
        (validated_at IS NULL AND validated_by IS NULL)
        OR (validated_at IS NOT NULL AND validated_by IS NOT NULL)
      );

    ALTER TABLE pregnancy_milestones
      DROP CONSTRAINT IF EXISTS pregnancy_milestones_id_code_unique;
  `);
};
