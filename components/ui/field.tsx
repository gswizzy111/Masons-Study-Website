import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

type ControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  required?: boolean;
};

export type FieldControlProps = {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
  required: boolean | undefined;
};

type FieldProps = {
  label: ReactNode;
  /** Help text under the label. */
  hint?: ReactNode;
  /** Error text under the control. Also marks the control aria-invalid. */
  error?: ReactNode;
  /** The control's id. Generated when left out. */
  id?: string;
  required?: boolean;
  /** Shows "(optional)" after the label. */
  optional?: boolean;
  /** Keep the label for screen readers only. */
  hideLabel?: boolean;
  className?: string;
  /**
   * One control element (Input, Textarea, a native select...). Field adds
   * id, aria-describedby, aria-invalid and required to it. For composite
   * controls (Select, Segmented), pass a function and spread what you need:
   *   <Field label="Course">{(p) => <SelectTrigger {...p} />}</Field>
   */
  children: ReactElement<ControlProps> | ((props: FieldControlProps) => ReactNode);
};

/** Label above, hint under the label, control, error under the control. */
export function Field({
  label,
  hint,
  error,
  id,
  required,
  optional,
  hideLabel,
  className,
  children,
}: FieldProps) {
  const autoId = useId();
  const child = typeof children !== "function" && isValidElement(children) ? children : null;
  const controlId = id ?? child?.props.id ?? `field-${autoId}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const hasError = Boolean(error);

  const ownDescribedBy = child?.props["aria-describedby"];
  const describedBy =
    [hintId, errorId, ownDescribedBy].filter(Boolean).join(" ") || undefined;

  const controlProps: FieldControlProps = {
    id: controlId,
    "aria-describedby": describedBy,
    "aria-invalid": hasError ? true : undefined,
    required: required || undefined,
  };

  let control: ReactNode;
  if (typeof children === "function") {
    control = children(controlProps);
  } else if (child) {
    control = cloneElement(child, {
      ...controlProps,
      required: child.props.required ?? controlProps.required,
    });
  } else {
    control = children;
  }

  return (
    <div data-slot="field" className={cn("flex flex-col", className)}>
      <div className={cn("mb-2 flex flex-col gap-1", hideLabel && "sr-only")}>
        <Label htmlFor={controlId}>
          {label}
          {optional ? <span className="font-normal text-ink-2">(optional)</span> : null}
        </Label>
        {hint ? (
          <p id={hintId} className="text-sm leading-snug text-ink-2">
            {hint}
          </p>
        ) : null}
      </div>
      {control}
      <div aria-live="polite">
        {error ? (
          <p id={errorId} className="mt-2 flex items-start gap-1.5 text-sm leading-snug text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
