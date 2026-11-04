"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FormAlert } from "@/components/profile/form-alert";
import { PasswordInput } from "@/components/profile/password-input";
import { focusFirstError } from "@/components/profile/focus-first-error";
import {
  collectErrors,
  NAME_MAX,
  PASSWORD_MIN,
  text,
  validateDisplayName,
  validateEmail,
  validatePassword,
  type FormState,
} from "@/components/profile/form-state";
import { signUp } from "../actions";
import { AuthCard } from "../auth-card";
import type { SignupField } from "../fields";

const initial: FormState<SignupField> = { status: "idle" };

const linkClass = "rounded-xs font-medium text-accent-strong underline-offset-4 hover:underline";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUp, initial);
  const [clientErrors, setClientErrors] = useState<Partial<Record<SignupField, string>>>({});
  const [dismissedAt, setDismissedAt] = useState<number | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.fieldErrors) focusFirstError(formRef.current, state.fieldErrors);
  }, [state]);

  if (state.status === "success" && state.at !== dismissedAt) {
    return (
      <CheckEmail
        email={state.values?.email ?? ""}
        onStartOver={() => setDismissedAt(state.at)}
      />
    );
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const data = new FormData(e.currentTarget);
    const errors = collectErrors<SignupField>({
      displayName: validateDisplayName(text(data, "displayName")),
      email: validateEmail(text(data, "email")),
      password: validatePassword(text(data, "password")),
    });
    setClientErrors(errors ?? {});
    if (errors) {
      e.preventDefault();
      focusFirstError(e.currentTarget, errors);
    }
  };

  const errorFor = (f: SignupField) => clientErrors[f] ?? state.fieldErrors?.[f];
  // After "Use a different email", keep the name but clear the email.
  const restarted = state.status === "success";

  return (
    <AuthCard
      title="Create your account"
      description="It takes a minute. Then a few quick questions about how you learn, so everything is written your way."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className={linkClass}>
            Log in
          </Link>
        </>
      }
    >
      <form
        ref={formRef}
        action={formAction}
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-5"
      >
        <Field
          label="Your name"
          hint="What the site calls you. A first name is fine."
          error={errorFor("displayName")}
          required
        >
          <Input
            name="displayName"
            autoComplete="name"
            maxLength={NAME_MAX}
            defaultValue={state.values?.displayName ?? ""}
          />
        </Field>

        <Field label="Email" error={errorFor("email")} required>
          <Input
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={restarted ? "" : (state.values?.email ?? "")}
          />
        </Field>

        <Field
          label="Password"
          hint={`At least ${PASSWORD_MIN} characters.`}
          error={errorFor("password")}
          required
        >
          <PasswordInput name="password" autoComplete="new-password" minLength={PASSWORD_MIN} />
        </Field>

        {state.status === "error" && state.code === "account_exists" ? (
          <FormAlert>
            An account with this email already exists.{" "}
            <Link href="/login" className="font-medium underline underline-offset-2">
              Log in instead
            </Link>
            .
          </FormAlert>
        ) : state.status === "error" && state.message ? (
          <FormAlert>{state.message}</FormAlert>
        ) : null}

        <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
          {pending ? "Creating your account" : "Create account"}
        </Button>
      </form>
    </AuthCard>
  );
}

function CheckEmail({ email, onStartOver }: { email: string; onStartOver: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  // Move focus here so screen readers announce the new screen.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div ref={ref} tabIndex={-1} className="outline-none">
      <AuthCard
        icon={<MailCheck strokeWidth={1.75} aria-hidden />}
        title="Check your email"
        description={
          <>
            We sent a confirmation link to{" "}
            <span className="font-medium break-all text-ink">{email || "your email"}</span>. Open
            it to finish creating your account.
          </>
        }
        footer={
          <>
            Already confirmed?{" "}
            <Link href="/login" className={linkClass}>
              Log in
            </Link>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-ink-2">
            It can take a minute to arrive. If you don’t see it, check your spam folder. Opening
            the link in this browser works best.
          </p>
          <Button variant="outline" className="w-full" onClick={onStartOver}>
            Use a different email
          </Button>
        </div>
      </AuthCard>
    </div>
  );
}
