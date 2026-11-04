import { CircleAlert, FilePlus2 } from "lucide-react";
import type { SetStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

/** Badge for sets that aren't ready yet. Renders nothing for ready sets. */
export function SetStatusBadge({ status, className }: { status: SetStatus; className?: string }) {
  if (status === "building") {
    return (
      <Badge variant="accent" className={className}>
        <Spinner size="xs" />
        Building
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="danger" className={className}>
        <CircleAlert strokeWidth={1.75} aria-hidden />
        Build stopped
      </Badge>
    );
  }
  if (status === "draft") {
    return (
      <Badge variant="outline" className={className}>
        <FilePlus2 strokeWidth={1.75} aria-hidden />
        Draft
      </Badge>
    );
  }
  return null;
}
