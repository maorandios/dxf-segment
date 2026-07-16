"use client";

import { FileText, FileSpreadsheet, FileWarning, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  formatFileSizeBytes,
  groupAttachments,
  type IntakeAttachment,
  type IntakeAttachmentKind,
} from "../lib/attachmentClassify";

const GROUP_ORDER: IntakeAttachmentKind[] = [
  "dxf",
  "excel",
  "pdf",
  "unsupported",
];

const GROUP_TITLE_KEY: Record<IntakeAttachmentKind, string> = {
  dxf: "aiIntake.groupDxf",
  excel: "aiIntake.groupExcel",
  pdf: "aiIntake.groupPdf",
  unsupported: "aiIntake.groupUnsupported",
};

function GroupIcon({ kind }: { kind: IntakeAttachmentKind }) {
  const className = "h-4 w-4 shrink-0 text-muted-foreground";
  switch (kind) {
    case "dxf":
      return <FileText className={className} aria-hidden />;
    case "excel":
      return <FileSpreadsheet className={className} aria-hidden />;
    case "pdf":
      return <File className={className} aria-hidden />;
    case "unsupported":
      return <FileWarning className={className} aria-hidden />;
  }
}

interface AttachmentListProps {
  attachments: IntakeAttachment[];
  onRemove: (id: string) => void;
}

export function AttachmentList({ attachments, onRemove }: AttachmentListProps) {
  if (attachments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("aiIntake.emptyAttachments")}</p>
    );
  }

  const grouped = groupAttachments(attachments);

  return (
    <div className="space-y-4">
      {GROUP_ORDER.map((kind) => {
        const items = grouped[kind];
        return (
          <section key={kind} className="space-y-2">
            <div className="flex items-center gap-2">
              <GroupIcon kind={kind} />
              <h3 className="text-sm font-medium text-foreground">
                {t(GROUP_TITLE_KEY[kind])}
              </h3>
              <Badge
                variant={kind === "unsupported" ? "destructive" : "secondary"}
                className="rounded-md font-normal"
              >
                {items.length}
              </Badge>
            </div>

            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground ps-6">
                {t("aiIntake.emptyGroup")}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {items.map((item) => {
                  const size = formatFileSizeBytes(item.file.size);
                  return (
                    <li
                      key={item.id}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2",
                        kind === "unsupported"
                          ? "border-destructive/40 bg-destructive/5"
                          : "border-white/[0.08] bg-white/[0.02]"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {item.file.name}
                          </span>
                          {kind === "unsupported" && (
                            <Badge
                              variant="destructive"
                              className="rounded-md text-[10px] font-normal"
                            >
                              {t("aiIntake.unsupportedBadge")}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t(size.key, { size: size.size })}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => onRemove(item.id)}
                        aria-label={t("aiIntake.removeFileAria", {
                          name: item.file.name,
                        })}
                      >
                        {t("common.delete")}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
