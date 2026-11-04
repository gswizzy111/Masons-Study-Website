"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/profile/form-alert";
import { PasswordInput } from "@/components/profile/password-input";
import { focusFirstError } from "@/components/profile/focus-first-error";
import {
  collectErrors,
  PASSWORD_MIN,
  text,
  validatePassword,
  type FormState,
} from "@/components/profile/form-state";
import { changePassword } from "./actions";
import type { PasswordField } from "./fields";

const initial: FormState<PasswordField> = { status: "idle" };

export function PasswordForm({ email }: { email: string | null }) {
  const [state, formAction, pending] = useActionState(changePassword, initial);
  const [clientErrors, setClientErrors] = useState<Partial<Record<PasswordField, string>>>({});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") toast.success("Password changed");
    if (state.fieldErrors) focusFirstError(formRef.current, state.fieldErrors);
  }, [state]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const data = new FormData(e.currentTarget);
    const errors = collectErrors<PasswordField>({
      currentPassword: text(data, "currentPassword") ? undefined : "Enter your current password.",
      newPassword: validatePassword(text(data, "newPassword"), "new password"),
    });
    setClientErrors(errors ?? {});
    if (errors) {
      e.preventDefault();
      focusFirstError(e.currentTarget, errors);
    }
  };

  const errorFor = (f: PasswordField) => clientErrors[f] ?? state.fieldErrors?.[f];

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5"
    >
      {/* Tells password managers which account the new password belongs to. */}
      {email ? (
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      ) : null}

      <div className="flex max-w-md flex-col gap-5">
        <Field label="Current password" error={errorFor("currentPassword")} required>
          <PasswordInput name="currentPassword" autoComplete="current-password" />
        </Field>
        <Field
          label="New password"
          hint={`At least ${PASSWORD_MIN} characters.`}
          error={errorFor("newPassword")}
          required
        >
          <PasswordInput name="newPassword" autoComplete="new-password" minLength={PASSWORD_MIN} />
        </Field>
      </div>

      {state.status === "error" && state.message ? <FormAlert>{state.message}</FormAlert> : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button type="submit" variant="outline" loading={pending}>
          {pending ? "Changing password" : "Change password"}
        </Button>
        <Link
          href="/forgot-password"
          className="rounded-xs text-sm font-medium text-accent-strong underline-offset-4 hover:underline"
        >
          Forgot your current password?
        </Link>
      </div>
    </form>
  );
}
