"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { focusFirstError } from "@/components/profile/focus-first-error";
import { NAME_MAX, text, validateDisplayName, type FormState } from "@/components/profile/form-state";
import { updateDisplayName } from "./actions";
import type { NameField } from "./fields";

export function DisplayNameForm({ initialName }: { initialName: string }) {
  const [state, formAction, pending] = useActionState(updateDisplayName, {
    status: "idle",
    values: { displayName: initialName },
  } satisfies FormState<NameField>);
  const [clientError, setClientError] = useState<string | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") toast.success("Name saved");
    else if (state.status === "error" && state.message) toast.error(state.message);
    if (state.fieldErrors) focusFirstError(formRef.current, state.fieldErrors);
  }, [state]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const error = validateDisplayName(text(new FormData(e.currentTarget), "displayName"));
    setClientError(error);
    if (error) {
      e.preventDefault();
      focusFirstError(e.currentTarget, { displayName: error });
    }
  };

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate>
      <Field
        label="Your name"
        hint="Shown in the header. A first name is fine."
        error={clientError ?? state.fieldErrors?.displayName}
        required
      >
        {(control) => (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              {...control}
              name="displayName"
              autoComplete="name"
              maxLength={NAME_MAX}
              defaultValue={state.values?.displayName ?? initialName}
              className="sm:max-w-sm"
            />
            <Button type="submit" variant="outline" loading={pending} className="self-start">
              {pending ? "Saving" : "Save name"}
            </Button>
          </div>
        )}
      </Field>
    </form>
  );
}
