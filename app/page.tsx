import { SimpleIntakeShell } from "@/features/simple-intake";
import "@/features/simple-intake/ui/omega-workflow.css";
import "@/features/simple-intake/workbookUpload/upload-screen.css";

/** Segment product entry — same workflow as `/quotes/simple`. */
export default function HomePage() {
  return <SimpleIntakeShell />;
}
