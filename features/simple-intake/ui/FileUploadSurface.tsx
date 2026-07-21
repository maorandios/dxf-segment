"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function FileUploadSurface({
  accept,
  multiple,
  title,
  subtitle,
  hint,
  onFiles,
  disabled,
  className,
}: {
  accept: string;
  multiple?: boolean;
  title: string;
  subtitle: string;
  hint?: string;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      onFiles(Array.from(list));
    },
    [onFiles]
  );

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--ow-radius-lg)] border-2 border-dashed px-6 py-12 text-center transition-colors duration-150",
        className
      )}
      style={{
        borderColor: dragging ? "var(--ow-accent)" : "var(--ow-border-strong)",
        backgroundColor: dragging
          ? "var(--ow-accent-soft)"
          : "var(--ow-surface)",
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (disabled) return;
        handleFiles(e.dataTransfer.files);
      }}
    >
      <div
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--ow-accent-soft)" }}
      >
        <Upload
          className="h-5 w-5"
          style={{ color: "var(--ow-accent)" }}
          aria-hidden
        />
      </div>
      <p
        className="text-[16px] font-medium"
        style={{ color: "var(--ow-text)" }}
      >
        {title}
      </p>
      <p
        className="mt-1 text-[13px]"
        style={{ color: "var(--ow-text-muted)" }}
      >
        {subtitle}
      </p>
      {hint && (
        <p
          className="mt-2 text-[12px]"
          style={{ color: "var(--ow-text-muted)" }}
        >
          {hint}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        className="mt-5"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        בחר קובץ מהמחשב
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
