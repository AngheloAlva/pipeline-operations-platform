/**
 * IssueList — renders MV-6 capture validation issues at entry time.
 *
 * Hard blocks use the critical tokens; soft warnings use the warning tokens.
 * Every issue carries a human-readable WHY (already Spanish, from
 * lib/capture/validate.ts) — this component only gives it a visual severity.
 */

import { CaptureIssueSeverity } from "@/lib/capture/validate";
import type { CaptureIssue } from "@/lib/capture/validate";
import { cn } from "@/lib/cn";

export interface IssueListProps {
  issues: CaptureIssue[];
  className?: string;
}

export function IssueList({ issues, className }: IssueListProps) {
  if (issues.length === 0) return null;

  return (
    <ul className={cn("flex flex-col gap-1.5", className)} aria-live="polite">
      {issues.map((issue) => {
        const isBlock = issue.severity === CaptureIssueSeverity.BLOCK;
        return (
          <li
            key={`${issue.code}:${issue.message}`}
            role="alert"
            className={cn(
              "border-l-2 px-3 py-2 text-[13px] leading-snug",
              isBlock
                ? "border-status-critical bg-status-critical-bg text-status-critical"
                : "border-status-warning bg-status-warning-bg text-status-warning",
            )}
          >
            <span className="mr-1.5 text-[11px] font-medium uppercase tracking-[0.08em]">
              {isBlock ? "Bloqueado" : "Advertencia"}
            </span>
            {issue.message}
          </li>
        );
      })}
    </ul>
  );
}
