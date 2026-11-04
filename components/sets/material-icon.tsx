import {
  File,
  FileImage,
  FileText,
  FileType2,
  NotebookPen,
  Presentation,
  type LucideProps,
} from "lucide-react";
import type { MaterialType } from "@/components/sets/material-files";

/** The icon for a kind of material. Decorative. */
export function MaterialIcon({ type, ...props }: { type: MaterialType } & LucideProps) {
  const common = { strokeWidth: 1.75, "aria-hidden": true as const, ...props };
  switch (type) {
    case "pdf":
      return <FileType2 {...common} />;
    case "word":
    case "text":
      return <FileText {...common} />;
    case "slides":
      return <Presentation {...common} />;
    case "image":
      return <FileImage {...common} />;
    case "notes":
      return <NotebookPen {...common} />;
    default:
      return <File {...common} />;
  }
}
