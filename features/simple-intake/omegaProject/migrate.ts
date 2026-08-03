/**
 * Schema-version gate for project/state.json payloads.
 * Add future `omega-project-state/v2`, `/v3`, ... migrations here as
 * additional branches — always keep the newer-than-supported check first so
 * users on an older app build get a clear "upgrade OMEGA" message instead of
 * a generic validation error.
 */

import {
  OMEGA_PROJECT_SNAPSHOT_SCHEMA_VERSION,
  type OmegaQuotationProjectSnapshotV1,
} from "./types";
import { parseSnapshotV1, readSchemaVersionLoosely } from "./schemas";

const NEWER_VERSION_MESSAGE =
  "לא ניתן לפתוח את ההצעה — הקובץ נוצר בגרסה חדשה יותר של OMEGA.";

function currentVersionNumber(): number {
  const match = /\/v(\d+)$/.exec(OMEGA_PROJECT_SNAPSHOT_SCHEMA_VERSION);
  return match ? Number(match[1]) : 1;
}

export function migrateOmegaProject(
  input: unknown
): OmegaQuotationProjectSnapshotV1 {
  const version = readSchemaVersionLoosely(input);

  if (version === OMEGA_PROJECT_SNAPSHOT_SCHEMA_VERSION) {
    return parseSnapshotV1(input);
  }

  const match = version ? /\/v(\d+)$/.exec(version) : null;
  if (match && Number(match[1]) > currentVersionNumber()) {
    throw new Error(NEWER_VERSION_MESSAGE);
  }

  if (!version) {
    throw new Error(
      "לא ניתן לפתוח את ההצעה — הקובץ אינו קובץ הצעת מחיר תקין של OMEGA. / " +
        "not a recognized OMEGA quotation project file."
    );
  }

  throw new Error(
    `לא ניתן לפתוח את ההצעה — גרסת קובץ לא נתמכת (${version}). / ` +
      `unsupported project file schemaVersion: ${version}.`
  );
}
