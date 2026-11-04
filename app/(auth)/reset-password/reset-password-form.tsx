"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/profile/form-alert";
import { PasswordInput } from "@/components/profile/password-input";
import { focusFirstError } from "@/components/profile/focus-first-error";
import {
  PASSWORD_MIN,
  text,
  validatePassword,
  type FormState,
} from "@/components/profile/form-state";
import { updatePassword } from "../actions";
import type { ResetField } from "../fields";

const initial: FormState<ResetField> = { status: "idle" };

export function ResetPasswordForm({ email }: { email: string | null }) {
  const [state, formAction, pending] = useActionState(updatePassword, initial);
  const [clientError, setClientError] = useState<string | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.fieldErrors) focusFirstError(formRef.current, state.fieldErrors);
  }, [state]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const error = validatePassword(text(new FormData(e.currentTarget), "password"), "new password");
    setClientError(error);
    if (error) {
      e.preventDefault();
      focusFirstError(e.currentTarget, { password: error });
    }
  };

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
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={email}
          readOnly
          hidden
        />
      ) : null}

      <Field
        label="New password"
        hint={`At least ${PASSWORD_MIN} characters.`}
        error={clientError ?? state.fieldErrors?.password}
        required
      >
        <PasswordInput name="password" autoComplete="new-password" minLength={PASSWORD_MIN} />
      </Field>

      {state.status === "error" && state.message ? (
        <FormAlert>
          {state.message}
          {state.code === "link_expired" ? (
            <>
              {" "}
              <Link href="/forgot-password" className="font-medium underline underline-offset-2">
                Get a new link
              </Link>
            </>
          ) : null}
        </FormAlert>
      ) : null}

      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
        {pending ? "Saving" : "Save new password"}
      </Button>
    </form>
  );
}
