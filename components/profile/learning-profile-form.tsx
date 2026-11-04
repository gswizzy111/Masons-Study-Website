"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import type { LearningProfile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { CheckboxCards, RadioCards } from "@/components/profile/choice-group";
import { FormAlert } from "@/components/profile/form-alert";
import { NOTES_MAX, type FormState } from "@/components/profile/form-state";
import {
  APPROACH_OPTIONS,
  DEPTH_OPTIONS,
  EXPLAIN_OPTIONS,
  GOAL_OPTIONS,
  LEVEL_OPTIONS,
  normalizeLearningProfile,
  PRACTICE_OPTIONS,
} from "@/components/profile/learning-profile-options";

export type ProfileField = "profile";
export type LearningProfileAction = (
  prev: FormState<ProfileField>,
  formData: FormData,
) => Promise<FormState<ProfileField>>;

type LearningProfileFormProps = {
  /** "steps": the onboarding questionnaire. "single": everything on one page (settings). */
  mode: "steps" | "single";
  initialProfile: LearningProfile;
  /** Server Action that saves the profile. Receives `profile` (JSON) in the form data. */
  action: LearningProfileAction;
  className?: string;
};

type Update = <K extends keyof LearningProfile>(key: K, value: LearningProfile[K]) => void;

type Step = {
  id: string;
  title: string;
  /** Label under the progress bar (desktop). */
  short: string;
  description: string;
  render: (p: LearningProfile, set: Update, hideLegend: boolean) => ReactNode;
};

const NOTES_PLACEHOLDER =
  "For example: I need the why behind a mechanism. I mix up similar enzymes.";

/* Each question, so steps mode and single mode render the same controls. */

function LevelAndGoals(p: LearningProfile, set: Update) {
  return (
    <>
      <RadioCards
        legend="Where are you in school?"
        name="level"
        options={LEVEL_OPTIONS}
        value={p.level}
        onChange={(v) => set("level", v)}
      />
      <CheckboxCards
        legend="What are you studying for?"
        hint="Pick any that apply."
        options={GOAL_OPTIONS}
        value={p.goals}
        onChange={(v) => set("goals", v)}
        variant="chips"
      />
    </>
  );
}

function ApproachAndDepth(p: LearningProfile, set: Update) {
  return (
    <>
      <RadioCards
        legend="When you meet a new topic, what helps first?"
        name="approach"
        options={APPROACH_OPTIONS}
        value={p.approach}
        onChange={(v) => set("approach", v)}
      />
      <RadioCards
        legend="How long should explanations be?"
        name="depth"
        options={DEPTH_OPTIONS}
        value={p.depth}
        onChange={(v) => set("depth", v)}
        columns={3}
      />
    </>
  );
}

function ExplainWith(p: LearningProfile, set: Update, hideLegend: boolean) {
  return (
    <CheckboxCards
      legend="Which explanations help you understand?"
      hint="Pick any that apply. Each line is an example."
      legendClassName={hideLegend ? "sr-only" : undefined}
      options={EXPLAIN_OPTIONS}
      value={p.explain_with}
      onChange={(v) => set("explain_with", v)}
    />
  );
}

function PracticeKinds(p: LearningProfile, set: Update, hideLegend: boolean) {
  return (
    <CheckboxCards
      legend="Which kinds of questions do you want?"
      hint="Pick any that apply. Each line is an example question."
      legendClassName={hideLegend ? "sr-only" : undefined}
      options={PRACTICE_OPTIONS}
      value={p.practice}
      onChange={(v) => set("practice", v)}
    />
  );
}

function Notes(p: LearningProfile, set: Update) {
  const length = p.notes?.length ?? 0;
  return (
    <div>
      <Field
        label="Anything else about how you learn?"
        hint="Optional. Your own words go straight to Claude with every request."
      >
        <Textarea
          rows={5}
          maxLength={NOTES_MAX}
          placeholder={NOTES_PLACEHOLDER}
          value={p.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>
      <p className="mt-1.5 text-right font-mono text-xs text-ink-2 tabular-nums" aria-hidden>
        {length.toLocaleString()} / {NOTES_MAX.toLocaleString()}
      </p>
    </div>
  );
}

const STEPS: Step[] = [
  {
    id: "where",
    title: "Where you are",
    short: "School",
    description: "This sets the level everything is written at and the exams it aims for.",
    render: LevelAndGoals,
  },
  {
    id: "approach",
    title: "How you like to learn",
    short: "Style",
    description: "This shapes how your study guides are organized.",
    render: ApproachAndDepth,
  },
  {
    id: "explain",
    title: "Explanations that click",
    short: "Explanations",
    description: "Your study guides and tutor answers will lean on these.",
    render: ExplainWith,
  },
  {
    id: "practice",
    title: "How you like to practice",
    short: "Practice",
    description: "Practice tests and Learn will lean on these.",
    render: PracticeKinds,
  },
  {
    id: "notes",
    title: "Anything else",
    short: "Notes",
    description: "A sentence or two in your own words. Skip it if nothing comes to mind.",
    render: Notes,
  },
];

const serialize = (p: LearningProfile) => JSON.stringify(normalizeLearningProfile(p));

const initialState: FormState<ProfileField> = { status: "idle" };

/**
 * The learning profile questionnaire. Steps mode is the onboarding flow
 * (progress, Back, Next, Skip for now); single mode puts every question on
 * one page with a Save button (settings). Both post `profile` as JSON.
 */
export function LearningProfileForm({ mode, initialProfile, action, className }: LearningProfileFormProps) {
  const [profile, setProfile] = useState<LearningProfile>(() => normalizeLearningProfile(initialProfile));
  const [state, formAction, pending] = useActionState(action, initialState);

  const set: Update = (key, value) => setProfile((prev) => ({ ...prev, [key]: value }));

  const submit = (formData: FormData) => {
    // Dispatch by hand (not through <form action>) so React does not reset
    // the form: every control here is controlled by `profile`.
    startTransition(() => formAction(formData));
  };

  if (mode === "single") {
    return (
      <SingleForm
        profile={profile}
        set={set}
        state={state}
        pending={pending}
        submit={submit}
        initialJson={serialize(initialProfile)}
        className={className}
      />
    );
  }

  return (
    <StepsForm
      profile={profile}
      set={set}
      state={state}
      pending={pending}
      submit={submit}
      className={className}
    />
  );
}

type InnerProps = {
  profile: LearningProfile;
  set: Update;
  state: FormState<ProfileField>;
  pending: boolean;
  submit: (formData: FormData) => void;
  className?: string;
};

function StepsForm({ profile, set, state, pending, submit, className }: InnerProps) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [navigated, setNavigated] = useState(false);
  const skipRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reduce = useReducedMotion();

  const total = STEPS.length;
  const current = STEPS[step] ?? STEPS[0];
  const last = step === total - 1;

  // After moving between steps, put focus on the new step's heading so
  // keyboard and screen reader users start at the top of it.
  useEffect(() => {
    if (navigated) headingRef.current?.focus();
  }, [step, navigated]);

  const go = (to: number) => {
    const target = Math.min(total - 1, Math.max(0, to));
    if (target === step) return;
    setDirection(target > step ? 1 : -1);
    setNavigated(true);
    setStep(target);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Enter on an earlier step moves on instead of saving.
    if (!last && !skipRef.current) {
      go(step + 1);
      return;
    }
    skipRef.current = false;
    submit(new FormData(e.currentTarget));
  };

  const skipForNow = (form: HTMLFormElement | null) => {
    if (!form) return;
    skipRef.current = true;
    form.requestSubmit();
  };

  return (
    <form onSubmit={onSubmit} noValidate className={cn("w-full", className)}>
      <input type="hidden" name="profile" value={serialize(profile)} />

      <div className="rounded-lg border border-line bg-surface shadow-md">
        <div className="px-5 pt-5 sm:px-8 sm:pt-7">
          <StepProgress step={step} />
        </div>

        <motion.div
          key={current.id}
          initial={navigated && !reduce ? { opacity: 0, x: direction * 16 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          className="px-5 pt-6 pb-7 sm:px-8 sm:pt-7 sm:pb-8"
        >
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-[1.375rem] leading-tight font-semibold tracking-[-0.015em] text-ink outline-none sm:text-2xl"
          >
            {current.title}
          </h2>
          <p className="mt-1.5 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-2">
            {current.description}
          </p>
          <div className="mt-6 flex flex-col gap-7">{current.render(profile, set, true)}</div>
        </motion.div>

        {state.status === "error" && state.message ? (
          <div className="px-5 pb-5 sm:px-8">
            <FormAlert>{state.message}</FormAlert>
          </div>
        ) : null}

        <div className="flex items-center gap-2 border-t border-line px-5 py-4 sm:px-8">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => go(step - 1)} disabled={pending} className="-ml-2 px-3">
              <ArrowLeft strokeWidth={1.75} aria-hidden />
              Back
            </Button>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            {!last ? (
              <Button
                variant="ghost"
                onClick={(e) => skipForNow(e.currentTarget.form)}
                loading={pending}
                className="px-3"
              >
                Skip for now
              </Button>
            ) : null}
            {/* Distinct keys so React swaps the element rather than turning
                the clicked Next button into a submit button mid-click, which
                made the browser submit the form from step 4. */}
            {last ? (
              <Button key="finish" type="submit" loading={pending}>
                {pending ? "Saving" : "Finish"}
              </Button>
            ) : (
              <Button key="next" onClick={() => go(step + 1)} disabled={pending}>
                Next
                <ArrowRight strokeWidth={1.75} aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-sm text-ink-2">
        Nothing here is required. You can change all of it later in Settings.
      </p>
    </form>
  );
}

function StepProgress({ step }: { step: number }) {
  const total = STEPS.length;
  const current = STEPS[step] ?? STEPS[0];
  return (
    <div>
      <p className="text-sm text-ink-2">
        <span className="font-mono text-[0.8125rem] tabular-nums">
          Step {step + 1} of {total}
        </span>
        <span className="sr-only">: {current.title}</span>
      </p>
      <ol aria-label="Steps" className="mt-3 grid grid-cols-5 gap-1.5">
        {STEPS.map((s, i) => {
          const state = i < step ? "done" : i === step ? "current" : "upcoming";
          return (
            <li key={s.id} aria-current={i === step ? "step" : undefined} className="min-w-0">
              <span
                aria-hidden
                className={cn(
                  "block h-1.5 rounded-full transition-colors duration-200 ease-out",
                  state === "upcoming" ? "bg-line" : "bg-accent",
                  state === "done" && "opacity-55",
                )}
              />
              <span
                aria-hidden
                className={cn(
                  "mt-2 hidden truncate text-xs sm:block",
                  state === "current" ? "font-medium text-ink" : "text-ink-2",
                )}
              >
                {s.short}
              </span>
              <span className="sr-only">
                {s.title}
                {state === "done" ? ", done" : state === "current" ? ", current step" : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SingleForm({
  profile,
  set,
  state,
  pending,
  submit,
  initialJson,
  className,
}: InnerProps & { initialJson: string }) {
  // The last saved version: the server echoes what it stored.
  const savedJson =
    state.status === "success" && state.values?.profile ? state.values.profile : initialJson;
  const dirty = serialize(profile) !== savedJson;

  useEffect(() => {
    if (state.status === "success") toast.success("Learning profile saved");
    else if (state.status === "error" && state.message) toast.error(state.message);
  }, [state]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submit(new FormData(e.currentTarget));
  };

  const sections: Array<{ id: string; title: string; body: ReactNode }> = [
    { id: "where", title: "Where you are", body: LevelAndGoals(profile, set) },
    { id: "approach", title: "How you like to learn", body: ApproachAndDepth(profile, set) },
    { id: "explain", title: "Explanations that click", body: ExplainWith(profile, set, false) },
    { id: "practice", title: "How you like to practice", body: PracticeKinds(profile, set, false) },
    { id: "notes", title: "Anything else", body: Notes(profile, set) },
  ];

  return (
    <form onSubmit={onSubmit} noValidate className={cn("w-full", className)}>
      <input type="hidden" name="profile" value={serialize(profile)} />
      <div className="flex flex-col divide-y divide-line">
        {sections.map((s) => (
          <section key={s.id} aria-labelledby={`lp-${s.id}`} className="py-7 first:pt-0">
            <h3
              id={`lp-${s.id}`}
              className="mb-5 text-xs font-semibold tracking-[0.08em] text-ink-2 uppercase"
            >
              {s.title}
            </h3>
            <div className="flex flex-col gap-7">{s.body}</div>
          </section>
        ))}
      </div>

      <div className="sticky bottom-0 z-10 -mx-5 flex flex-wrap items-center justify-end gap-3 rounded-b-lg border-t border-line bg-surface px-5 py-4 sm:-mx-6 sm:px-6">
        <p className="mr-auto text-sm text-ink-2" aria-live="polite">
          {dirty ? "You have unsaved changes." : ""}
        </p>
        <Button type="submit" loading={pending}>
          {pending ? "Saving" : "Save learning profile"}
        </Button>
      </div>
    </form>
  );
}
