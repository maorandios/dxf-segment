import { parseDxfFile } from "@/lib/parsers/dxfParser";
import { nanoid } from "@/lib/utils/nanoid";
import {
  applyCrossFileIdentityValidation,
  buildRegistryItemFromParsed,
} from "@/lib/ai-intake/buildDxfRegistry";
import { DXF_ISSUE, type DxfPartRegistryItem } from "@/lib/ai-intake/types";

export type LocalDxfRegistryProgressPhase =
  | "reading"
  | "geometry"
  | "building"
  | "duplicates"
  | "done"
  | "failed";

export type LocalDxfRegistryProgress = {
  phase: LocalDxfRegistryProgressPhase;
  /** 1-based index of current file, when applicable. */
  currentIndex?: number;
  total?: number;
  filename?: string;
  messageKey: string;
  messageVars?: Record<string, string | number>;
};

export type RunLocalDxfRegistryResult = {
  items: DxfPartRegistryItem[];
};

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("FileReader failed"));
    };
    reader.readAsText(file);
  });
}

/**
 * Browser-only: parse DXF attachments with the existing pipeline and build a registry.
 * Non-DXF files must be filtered out by the caller.
 */
export async function runLocalDxfRegistry(
  dxfFiles: File[],
  onProgress?: (progress: LocalDxfRegistryProgress) => void
): Promise<RunLocalDxfRegistryResult> {
  const total = dxfFiles.length;
  const draft: DxfPartRegistryItem[] = [];

  for (let i = 0; i < dxfFiles.length; i++) {
    const file = dxfFiles[i]!;
    const currentIndex = i + 1;

    onProgress?.({
      phase: "reading",
      currentIndex,
      total,
      filename: file.name,
      messageKey: "aiIntake.progress.readingFile",
      messageVars: { current: currentIndex, total, name: file.name },
    });

    let content: string;
    try {
      content = await readFileAsText(file);
    } catch {
      draft.push(
        buildRegistryItemFromParsed({
          id: nanoid(),
          filename: file.name,
          layers: [],
          processedGeometry: null,
          parseWarnings: [],
          fatalIssue: DXF_ISSUE.READ_FAILED,
        })
      );
      continue;
    }

    onProgress?.({
      phase: "geometry",
      currentIndex,
      total,
      filename: file.name,
      messageKey: "aiIntake.progress.geometry",
      messageVars: { current: currentIndex, total, name: file.name },
    });

    try {
      const fileId = nanoid();
      const result = parseDxfFile(
        content,
        fileId,
        file.name,
        "ai-intake",
        "ai-intake"
      );

      const parseFailed =
        result.geometry.entityCount === 0 &&
        result.warnings.some((w) => /parse error/i.test(w));

      onProgress?.({
        phase: "building",
        currentIndex,
        total,
        filename: file.name,
        messageKey: "aiIntake.progress.building",
        messageVars: { current: currentIndex, total },
      });

      draft.push(
        buildRegistryItemFromParsed({
          id: nanoid(),
          filename: file.name,
          layers: result.geometry.layers ?? [],
          processedGeometry: result.geometry.processedGeometry,
          parseWarnings: result.warnings,
          fatalIssue: parseFailed ? DXF_ISSUE.PARSE_FAILED : undefined,
        })
      );
    } catch {
      draft.push(
        buildRegistryItemFromParsed({
          id: nanoid(),
          filename: file.name,
          layers: [],
          processedGeometry: null,
          parseWarnings: [],
          fatalIssue: DXF_ISSUE.PARSE_FAILED,
        })
      );
    }
  }

  onProgress?.({
    phase: "duplicates",
    total,
    messageKey: "aiIntake.progress.duplicates",
  });

  const items = applyCrossFileIdentityValidation(draft);

  onProgress?.({
    phase: "done",
    total,
    messageKey: "aiIntake.progress.done",
  });

  return { items };
}
