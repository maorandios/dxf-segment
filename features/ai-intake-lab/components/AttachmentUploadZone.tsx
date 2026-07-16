"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { nanoid } from "@/lib/utils/nanoid";
import {
  classifyFile,
  type IntakeAttachment,
} from "../lib/attachmentClassify";

interface AttachmentUploadZoneProps {
  onAddFiles: (attachments: IntakeAttachment[]) => void;
}

export function AttachmentUploadZone({ onAddFiles }: AttachmentUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const ingestFiles = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;
      onAddFiles(
        files.map((file) => ({
          id: nanoid(),
          file,
          kind: classifyFile(file),
        }))
      );
    },
    [onAddFiles]
  );

  return (
    <div
      className={cn(
        "rounded-[12px] border border-dashed px-4 py-8 text-center transition-colors",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-white/15 bg-white/[0.02]"
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        ingestFiles(e.dataTransfer.files);
      }}
    >
      <Upload
        className="mx-auto mb-3 h-8 w-8 text-muted-foreground"
        aria-hidden
        strokeWidth={1.5}
      />
      <p className="text-sm font-medium text-foreground">
        {t("aiIntake.dropPrimary")}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("aiIntake.dropSecondary")}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={() => inputRef.current?.click()}
      >
        {t("aiIntake.chooseFiles")}
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) ingestFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
