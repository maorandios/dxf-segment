import type { SimpleIntakeSession, SimpleIntakeStatus } from "../types";

/** User-facing presentation stages (derived; not a second business state). */
export type OmegaWorkflowStage =
  | "WORKBOOK_UPLOAD"
  | "WORKBOOK_ANALYSIS"
  | "MATERIAL_REVIEW"
  | "DXF_UPLOAD"
  | "DXF_PROCESSING"
  | "DXF_REVIEW"
  | "COMPLETION_REQUEST"
  | "READY_FOR_PRICING";

export type WorkflowStepperId =
  | "MATERIAL_LIST"
  | "DXF_FILES"
  | "REVIEW"
  | "READY";

export type StepperStepState =
  | "current"
  | "completed"
  | "future"
  | "attention";

export function deriveOmegaWorkflowStage(
  status: SimpleIntakeStatus,
  opts?: { readinessView?: string | null }
): OmegaWorkflowStage {
  switch (status) {
    case "IDLE":
    case "FILES_READY":
      return "WORKBOOK_UPLOAD";
    case "ANALYZING":
      return "WORKBOOK_ANALYSIS";
    case "MATERIAL_LIST_REVIEW":
    case "MATERIAL_LIST_QUALITY_FAILED":
      return "MATERIAL_REVIEW";
    case "DXF_UPLOAD":
      return "DXF_UPLOAD";
    case "DXF_PROCESSING":
      return "DXF_PROCESSING";
    case "DXF_REVIEW":
    case "READY":
      return opts?.readinessView === "FINAL_TABLE"
        ? "READY_FOR_PRICING"
        : "DXF_REVIEW";
    case "FINAL_PRICING_TABLE":
      return "READY_FOR_PRICING";
    case "FAILED":
      return "WORKBOOK_UPLOAD";
    default:
      return "WORKBOOK_UPLOAD";
  }
}

export function deriveStepperState(
  stage: OmegaWorkflowStage,
  attention?: {
    materialNeedsCompletion?: boolean;
    dxfNeedsAttention?: boolean;
  }
): Record<WorkflowStepperId, StepperStepState> {
  const order: WorkflowStepperId[] = [
    "MATERIAL_LIST",
    "DXF_FILES",
    "REVIEW",
    "READY",
  ];

  const currentIndex =
    stage === "WORKBOOK_UPLOAD" ||
    stage === "WORKBOOK_ANALYSIS" ||
    stage === "MATERIAL_REVIEW"
      ? 0
      : stage === "DXF_UPLOAD" || stage === "DXF_PROCESSING"
        ? 1
        : stage === "DXF_REVIEW" || stage === "COMPLETION_REQUEST"
          ? 2
          : 3;

  const result = {} as Record<WorkflowStepperId, StepperStepState>;
  for (let i = 0; i < order.length; i++) {
    const id = order[i]!;
    if (i < currentIndex) {
      if (id === "MATERIAL_LIST" && attention?.materialNeedsCompletion) {
        result[id] = "attention";
      } else if (id === "DXF_FILES" && attention?.dxfNeedsAttention) {
        result[id] = "attention";
      } else if (id === "REVIEW" && attention?.dxfNeedsAttention) {
        result[id] = "attention";
      } else {
        result[id] = "completed";
      }
    } else if (i === currentIndex) {
      result[id] = "current";
    } else {
      result[id] = "future";
    }
  }
  return result;
}

export function deriveHeaderStatus(session: SimpleIntakeSession): string {
  switch (session.status) {
    case "IDLE":
      return "מוכן להתחלה";
    case "FILES_READY":
      return "הקובץ מוכן";
    case "ANALYZING":
      return "מכינים את הרשימה";
    case "MATERIAL_LIST_REVIEW":
      return "הניתוח הושלם";
    case "MATERIAL_LIST_QUALITY_FAILED":
      return "נדרשת בדיקה";
    case "DXF_UPLOAD":
      return "ממתין לקובצי DXF";
    case "DXF_PROCESSING":
      return "מחברים קבצים";
    case "DXF_REVIEW":
    case "READY":
      return "ההתאמות נשמרו מקומית";
    case "FINAL_PRICING_TABLE":
      return "מוכן לתמחור";
    case "FAILED":
      return "הניתוח לא הושלם";
    default:
      return "";
  }
}

export const STEPPER_LABELS: Record<WorkflowStepperId, string> = {
  MATERIAL_LIST: "רשימת חומר",
  DXF_FILES: "קובצי DXF",
  REVIEW: "בדיקה",
  READY: "מוכן לתמחור",
};

export type ActivityStepStatus =
  | "PENDING"
  | "ACTIVE"
  | "COMPLETED"
  | "ATTENTION"
  | "FAILED";

export type ActivityStepModel = {
  id: string;
  label: string;
  detail?: string | null;
  status: ActivityStepStatus;
};

/** Minimum visible duration per analysis timeline phase (ms). */
export const ACTIVITY_PHASE_MIN_MS = 2000;

export function buildWorkbookActivitySteps(args: {
  analyzingLabel: string | null;
  elapsedSec: number;
  sheetCount?: number | null;
  populatedRows?: number | null;
  sourceType?: "EXCEL" | "PDF" | null;
  pdfPageCount?: number | null;
}): ActivityStepModel[] {
  const isPdf = args.sourceType === "PDF";

  const sheetHint =
    args.sheetCount != null && args.populatedRows != null
      ? `${args.sheetCount === 1 ? "גיליון אחד" : `${args.sheetCount} גיליונות`} ו-${args.populatedRows.toLocaleString("he-IL")} שורות מאוכלסות נקלטו`
      : "קוראים את מבנה הקובץ והגיליונות";

  const pageHint =
    args.pdfPageCount != null && args.pdfPageCount > 0
      ? `${args.pdfPageCount.toLocaleString("he-IL")} עמודים במסמך`
      : "סורקים את עמודי המסמך";

  const defs = isPdf
    ? [
        {
          id: "read",
          label: "קוראים את מסמך ה-PDF",
          detail: "מעלים את המסמך לניתוח",
        },
        {
          id: "scan",
          label: "סורקים את כל העמודים",
          detail: pageHint,
        },
        {
          id: "identify",
          label: "מזהים פריטים ונתוני תמחור",
          detail: "מאתרים חלקים, כמויות, חומרים ומידות",
        },
        {
          id: "missing",
          label: "בודקים נתונים חסרים",
          detail: "בודקים סוג חומר, עובי, כמות ומידות",
        },
        {
          id: "prepare",
          label: "מכינים את הטבלה",
          detail: "מארגנים את הפריטים לטבלה אחידה",
        },
      ]
    : [
        {
          id: "read",
          label: "קוראים את קובץ האקסל",
          detail: sheetHint,
        },
        {
          id: "identify",
          label: "מזהים פריטים ונתוני תמחור",
          detail: "מאתרים חלקים, כמויות, חומרים ומידות",
        },
        {
          id: "missing",
          label: "בודקים נתונים חסרים",
          detail: "בודקים סוג חומר, עובי, כמות ומידות",
        },
        {
          id: "verify",
          label: "מאמתים ערכים לא חד-משמעיים",
          detail: "נמצאו מספר נתונים שדורשים בדיקה נוספת",
        },
        {
          id: "prepare",
          label: "מכינים את הטבלה",
          detail: "מארגנים את הפריטים לטבלה אחידה",
        },
      ];

  // Pace strictly by elapsed time — at least 2s per phase so fast AI calls
  // still show a readable animated progression.
  const phaseSec = ACTIVITY_PHASE_MIN_MS / 1000;
  const activeIndex = Math.min(
    Math.floor(args.elapsedSec / phaseSec),
    defs.length - 1
  );

  return defs.map((d, i) => ({
    ...d,
    status:
      i < activeIndex
        ? ("COMPLETED" as const)
        : i === activeIndex
          ? ("ACTIVE" as const)
          : ("PENDING" as const),
    detail: i < activeIndex || i === activeIndex ? d.detail : null,
  }));
}

export function workbookActivityMinDurationMs(phaseCount = 5): number {
  return phaseCount * ACTIVITY_PHASE_MIN_MS;
}

export function buildDxfActivitySteps(args: {
  analyzingLabel: string | null;
  elapsedSec: number;
  dxfFileCount: number;
  certain?: number | null;
  suggested?: number | null;
  checking?: number | null;
}): ActivityStepModel[] {
  const defs = [
    {
      id: "read",
      label: "קוראים את קובצי ה-DXF",
      detail:
        args.dxfFileCount > 0
          ? `${args.dxfFileCount.toLocaleString("he-IL")} מתוך ${args.dxfFileCount.toLocaleString("he-IL")} קבצים נקראו בהצלחה`
          : "קוראים את קובצי ה-DXF",
    },
    {
      id: "geometry",
      label: "מפיקים גאומטריה ומידות",
      detail: "מחלצים מידות ושטח מכל קובץ",
    },
    {
      id: "link",
      label: "מחברים קבצים לפריטים",
      detail: "בודקים תחילה שמות קבצים ולאחר מכן התאמות מוצעות",
    },
    {
      id: "ambiguous",
      label: "בודקים התאמות לא חד-משמעיות",
      detail: "מסמנים מקרים שדורשים החלטה",
    },
    {
      id: "calc",
      label: "מחשבים שטחים ומשקלים",
      detail: "מכינים את נתוני התמחור",
    },
  ];

  const phaseSec = ACTIVITY_PHASE_MIN_MS / 1000;
  const activeIndex = Math.min(
    Math.floor(args.elapsedSec / phaseSec),
    defs.length - 1
  );

  return defs.map((d, i) => ({
    ...d,
    status:
      i < activeIndex
        ? ("COMPLETED" as const)
        : i === activeIndex
          ? ("ACTIVE" as const)
          : ("PENDING" as const),
    detail: i <= activeIndex ? d.detail : null,
  }));
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
