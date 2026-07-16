import {
  emptyDocumentGeometry,
  type ExtractedDocumentGeometry,
  type ExtractedDocumentRow,
} from "../schemas";

/** Empty structured geometry for commercial-only document fixtures. */
export function noGeometry(): ExtractedDocumentGeometry {
  return emptyDocumentGeometry();
}

export function mmGeometry(
  width: number,
  height: number,
  extras?: Partial<ExtractedDocumentGeometry>
): ExtractedDocumentGeometry {
  return {
    ...emptyDocumentGeometry(),
    width,
    widthUnit: "MM",
    height,
    heightUnit: "MM",
    ...extras,
  };
}

export function withGeometry(
  row: Omit<ExtractedDocumentRow, "documentGeometry"> & {
    documentGeometry?: ExtractedDocumentGeometry;
  }
): ExtractedDocumentRow {
  return {
    ...row,
    documentGeometry: row.documentGeometry ?? emptyDocumentGeometry(),
  };
}
