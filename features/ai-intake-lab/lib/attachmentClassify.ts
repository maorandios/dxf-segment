export type IntakeAttachmentKind = "dxf" | "excel" | "pdf" | "unsupported";

export interface IntakeAttachment {
  id: string;
  file: File;
  kind: IntakeAttachmentKind;
}

export function classifyAttachmentName(fileName: string): IntakeAttachmentKind {
  const name = fileName.toLowerCase();
  if (name.endsWith(".dxf")) return "dxf";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "excel";
  if (name.endsWith(".pdf")) return "pdf";
  return "unsupported";
}

export function classifyFile(file: File): IntakeAttachmentKind {
  return classifyAttachmentName(file.name);
}

export function groupAttachments(attachments: IntakeAttachment[]): Record<
  IntakeAttachmentKind,
  IntakeAttachment[]
> {
  return {
    dxf: attachments.filter((a) => a.kind === "dxf"),
    excel: attachments.filter((a) => a.kind === "excel"),
    pdf: attachments.filter((a) => a.kind === "pdf"),
    unsupported: attachments.filter((a) => a.kind === "unsupported"),
  };
}

export function formatFileSizeBytes(bytes: number): {
  key: "aiIntake.fileSizeBytes" | "aiIntake.fileSizeKb" | "aiIntake.fileSizeMb";
  size: string;
} {
  if (bytes < 1024) {
    return { key: "aiIntake.fileSizeBytes", size: String(bytes) };
  }
  if (bytes < 1024 * 1024) {
    return {
      key: "aiIntake.fileSizeKb",
      size: (bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0),
    };
  }
  return {
    key: "aiIntake.fileSizeMb",
    size: (bytes / (1024 * 1024)).toFixed(1),
  };
}
