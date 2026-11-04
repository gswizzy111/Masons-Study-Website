"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FormAlert } from "@/components/profile/form-alert";
import { PasswordInput } from "@/components/profile/password-input";
import { focusFirstError } from "@/components/profile/focus-first-error";
import {
  collectErrors,
  text,
  validateEmail,
  type FormState,
} from "@/components/profile/form-state";
import { signIn } from "../actions";
import type { LoginField } from "../fields";

const initial: FormState<LoginField> = { status: "idle" };

export function LoginForm({ next }: { next: string | null }) {
  const [state, formAction, pending] = useActionState(signIn, initial);
  const [clientErrors, setClientErrors] = useState<Partial<Record<LoginField, string>>>({});
  const formRef = useRef<HTMLFormElement>(null);

  // Server-side field errors: put focus on the first one.
  useEffect(() => {
    if (state.fieldErrors) focusFirstError(formRef.current, state.fieldErrors);
  }, [state]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const data = new FormData(e.currentTarget);
    const errors = collectErrors<LoginField>({
      email: validateEmail(text(data, "email")),
      password: text(data, "password") ? undefined : "Enter your password.",
    });
    setClientErrors(errors ?? {});
    if (errors) {
      e.preventDefault();
      focusFirstError(e.currentTarget, errors);
    }
  };

  const errorFor = (f: LoginField) => clientErrors[f] ?? state.fieldErrors?.[f];

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5"
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <Field label="Email" error={errorFor("email")} required>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.values?.email ?? ""}
        />
      </Field>

      <div className="relative">
        <Field label="Password" error={errorFor("password")} required>
          <PasswordInput name="password" autoComplete="current-password" />
        </Field>
        <Link
          href="/forgot-password"
          className="absolute top-0 right-0 rounded-xs text-sm font-medium text-accent-strong underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
      </div>

      {state.status === "error" && state.message ? <FormAlert>{state.message}</FormAlert> : null}

      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
        {pending ? "Logging in" : "Log in"}
      </Button>
    </form>
  );
}
