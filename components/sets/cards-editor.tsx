"use client";

import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Pencil, Plus, Search, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Card as StudyCard, CardProgress, Topic } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { cn, pluralize } from "@/lib/utils";
import { OTHER_TOPIC } from "@/lib/mastery";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const NO_TOPIC = "__none";

type Draft = { term: string; definition: string; hint: string; topicId: string };
type DraftErrors = Partial<Record<"term" | "definition" | "hint", string>>;

function validateDraft(d: Draft): DraftErrors {
  const errors: DraftErrors = {};
  const term = d.term.trim();
  const definition = d.definition.trim();
  if (!term) errors.term = "Add the term or question.";
  else if (term.length > 500) errors.term = "Keep the term under 500 characters.";
  if (!definition) errors.definition = "Add the definition or answer.";
  else if (definition.length > 4000) errors.definition = "Keep the definition under 4,000 characters.";
  if (d.hint.trim().length > 1000) errors.hint = "Keep the hint under 1,000 characters.";
  return errors;
}

function draftToRow(d: Draft) {
  return {
    term: d.term.trim(),
    definition: d.definition.trim(),
    hint: d.hint.trim() || null,
    topic_id: d.topicId === NO_TOPIC ? null : d.topicId,
  };
}

function sortCards(list: StudyCard[]): StudyCard[] {
  return [...list].sort(
    (a, b) =>
      a.position - b.position ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id),
  );
}

function focusById(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}

/**
 * Edit a set's flashcards: grouped by topic, searchable, with add, inline
 * edit, star and delete (with undo).
 */
export function CardsEditor({
  setId,
  topics,
  initialCards,
  building,
}: {
  setId: string;
  topics: Topic[];
  initialCards: StudyCard[];
  building: boolean;
}) {
  const baseId = useId();
  const [cards, setCards] = useState<StudyCard[]>(() => sortCards(initialCards));
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<"all" | "starred">("all");
  const [adding, setAdding] = useState(initialCards.length === 0 && !building);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const topicIds = useMemo(() => new Set(topics.map((t) => t.id)), [topics]);
  const starredCount = cards.filter((c) => c.starred).length;

  const groups = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const matches = (c: StudyCard) =>
      (filter === "all" || c.starred) &&
      (!q ||
        c.term.toLowerCase().includes(q) ||
        c.definition.toLowerCase().includes(q) ||
        (c.hint ?? "").toLowerCase().includes(q));

    const keyOf = (c: StudyCard) =>
      c.topic_id && topicIds.has(c.topic_id) ? c.topic_id : OTHER_TOPIC.id;
    const totals = new Map<string, number>();
    const shown = new Map<string, StudyCard[]>();
    for (const c of cards) {
      const key = keyOf(c);
      totals.set(key, (totals.get(key) ?? 0) + 1);
      if (!matches(c)) continue;
      const list = shown.get(key);
      if (list) list.push(c);
      else shown.set(key, [c]);
    }
    const ordered = topics.some((t) => t.id === OTHER_TOPIC.id) ? topics : [...topics, OTHER_TOPIC];
    return ordered
      .filter((t) => t.id !== OTHER_TOPIC.id || (totals.get(t.id) ?? 0) > 0)
      .map((t) => ({ topic: t, all: totals.get(t.id) ?? 0, shown: shown.get(t.id) ?? [] }));
  }, [cards, topics, topicIds, deferredQuery, filter]);

  const shownCount = groups.reduce((n, g) => n + g.shown.length, 0);
  const filtering = deferredQuery.trim() !== "" || filter === "starred";

  // ---- Mutations -------------------------------------------------------

  async function addCard(draft: Draft): Promise<boolean> {
    const supabase = createClient();
    const position = cards.reduce((max, c) => Math.max(max, c.position), 0) + 1;
    const { data, error } = await supabase
      .from("cards")
      .insert({ set_id: setId, source: "manual", position, ...draftToRow(draft) })
      .select("*")
      .single();
    if (error || !data) {
      toast.error("Couldn't add the card. Try again in a moment.");
      return false;
    }
    setCards((prev) => sortCards([...prev, data as StudyCard]));
    setAnnouncement(`Card added: ${(data as StudyCard).term}`);
    return true;
  }

  async function saveCard(id: string, draft: Draft): Promise<boolean> {
    const supabase = createClient();
    const row = draftToRow(draft);
    const { data, error } = await supabase.from("cards").update(row).eq("id", id).select("*").single();
    if (error || !data) {
      toast.error("Couldn't save the card. Try again in a moment.");
      return false;
    }
    setCards((prev) => prev.map((c) => (c.id === id ? (data as StudyCard) : c)));
    setAnnouncement("Card saved");
    return true;
  }

  async function toggleStar(card: StudyCard) {
    const next = !card.starred;
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, starred: next } : c)));
    const supabase = createClient();
    const { error } = await supabase.from("cards").update({ starred: next }).eq("id", card.id);
    if (error) {
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, starred: !next } : c)));
      toast.error("Couldn't update the star. Try again.");
    }
  }

  async function deleteCard(card: StudyCard, nextFocusId: string | null) {
    const supabase = createClient();
    // Keep its progress so Undo can bring the card back exactly as it was.
    const { data: progress } = await supabase
      .from("card_progress")
      .select("*")
      .eq("card_id", card.id)
      .maybeSingle();

    setCards((prev) => prev.filter((c) => c.id !== card.id));
    focusById(nextFocusId ?? `${baseId}-add`);

    const { error } = await supabase.from("cards").delete().eq("id", card.id);
    if (error) {
      setCards((prev) => sortCards([...prev, card]));
      toast.error("Couldn't delete the card. Try again.");
      return;
    }

    toast("Card deleted", {
      description: card.term.length > 80 ? `${card.term.slice(0, 77)}...` : card.term,
      duration: 8000,
      action: {
        label: "Undo",
        onClick: () => void restoreCard(card, (progress as CardProgress | null) ?? null),
      },
    });
  }

  async function restoreCard(card: StudyCard, progress: CardProgress | null) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("cards")
      .insert({
        id: card.id,
        set_id: card.set_id,
        term: card.term,
        definition: card.definition,
        topic_id: card.topic_id,
        hint: card.hint,
        source: card.source,
        starred: card.starred,
        position: card.position,
        created_at: card.created_at,
      })
      .select("*")
      .single();
    if (error || !data) {
      toast.error("Couldn't bring the card back.");
      return;
    }
    if (progress) {
      await supabase.from("card_progress").insert({
        card_id: progress.card_id,
        set_id: progress.set_id,
        level: progress.level,
        streak: progress.streak,
        times_seen: progress.times_seen,
        times_correct: progress.times_correct,
        times_wrong: progress.times_wrong,
        interval_days: progress.interval_days,
        ease: progress.ease,
        due_at: progress.due_at,
        last_result: progress.last_result,
        last_seen_at: progress.last_seen_at,
      });
    }
    setCards((prev) => sortCards([...prev.filter((c) => c.id !== card.id), data as StudyCard]));
    setAnnouncement(`Card restored: ${card.term}`);
  }

  // ---- Render ------------------------------------------------------------

  const flatShown = groups.flatMap((g) => g.shown);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-[-0.015em] text-ink">Cards</h2>
          <p className="mt-1 text-sm text-ink-2">
            {pluralize(cards.length, "card")}
            <span aria-hidden> · </span>
            {starredCount.toLocaleString("en-US")} starred
            {topics.length > 0 ? (
              <>
                <span aria-hidden> · </span>
                {pluralize(topics.length, "topic")}
              </>
            ) : null}
          </p>
        </div>
        <Button
          id={`${baseId}-add`}
          onClick={() => {
            setAdding(true);
            focusById(`${baseId}-new-term`);
          }}
          aria-expanded={adding}
        >
          <Plus strokeWidth={1.75} aria-hidden />
          Add card
        </Button>
      </div>

      {adding ? (
        <AddCardForm
          idBase={baseId}
          topics={topics}
          onAdd={addCard}
          onClose={() => {
            setAdding(false);
            focusById(`${baseId}-add`);
          }}
        />
      ) : null}

      {cards.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
              strokeWidth={1.75}
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search terms, definitions and hints"
              aria-label="Search cards"
              className="pl-9"
            />
          </div>
          <Segmented
            className="self-start sm:self-auto"
            value={filter}
            onValueChange={setFilter}
            aria-label="Which cards to show"
            options={[
              { value: "all", label: "All" },
              { value: "starred", label: `Starred (${starredCount})` },
            ]}
          />
        </div>
      ) : null}

      <p role="status" aria-live="polite" className={cn("text-sm text-ink-2", !filtering && "sr-only")}>
        {filtering
          ? `Showing ${shownCount.toLocaleString("en-US")} of ${pluralize(cards.length, "card")}`
          : announcement}
      </p>
      {filtering && announcement ? (
        <p role="status" className="sr-only">
          {announcement}
        </p>
      ) : null}

      {cards.length === 0 ? (
        <EmptyState
          headingLevel="h3"
          title="No cards yet"
          body={
            building
              ? "Claude is writing cards for each topic. They show up here as each one finishes. You can also add your own."
              : "Cards appear here after the set is built. You can also write your own: a term or question on one side, the answer on the other."
          }
          action={
            !adding ? (
              <Button onClick={() => setAdding(true)}>
                <Plus strokeWidth={1.75} aria-hidden />
                Add card
              </Button>
            ) : null
          }
        />
      ) : shownCount === 0 ? (
        <EmptyState
          size="sm"
          headingLevel="h3"
          icon={<Search />}
          title="No cards match"
          body={
            filter === "starred" && !deferredQuery.trim()
              ? "You haven't starred any cards yet. Star the ones you want to drill."
              : "Try a different word, or clear the search."
          }
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              Show all cards
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {groups
            .filter((g) => g.shown.length > 0)
            .map((g) => {
              const headingId = `${baseId}-topic-${g.topic.id}`;
              return (
                <section key={g.topic.id} aria-labelledby={headingId}>
                  <h3
                    id={headingId}
                    className="mb-2.5 flex items-baseline justify-between gap-3 px-1 text-[0.9375rem] font-semibold text-ink"
                  >
                    <span className="min-w-0 break-words">{g.topic.title}</span>
                    <span className="shrink-0 font-mono text-xs font-medium text-ink-2 tabular-nums">
                      {filtering ? `${g.shown.length} of ${g.all}` : pluralize(g.all, "card")}
                    </span>
                  </h3>
                  <Card variant="flat" className="overflow-hidden">
                    <ul className="divide-y divide-line">
                      {g.shown.map((card) => {
                        const index = flatShown.indexOf(card);
                        const neighbor = flatShown[index + 1] ?? flatShown[index - 1] ?? null;
                        return editingId === card.id ? (
                          <EditCardRow
                            key={card.id}
                            card={card}
                            topics={topics}
                            onCancel={() => {
                              setEditingId(null);
                              focusById(`${baseId}-edit-${card.id}`);
                            }}
                            onSave={async (draft) => {
                              const ok = await saveCard(card.id, draft);
                              if (ok) {
                                setEditingId(null);
                                focusById(`${baseId}-edit-${card.id}`);
                              }
                              return ok;
                            }}
                          />
                        ) : (
                          <CardRow
                            key={card.id}
                            card={card}
                            idBase={baseId}
                            onStar={() => toggleStar(card)}
                            onEdit={() => setEditingId(card.id)}
                            onDelete={() =>
                              deleteCard(card, neighbor ? `${baseId}-edit-${neighbor.id}` : null)
                            }
                          />
                        );
                      })}
                    </ul>
                  </Card>
                </section>
              );
            })}
        </div>
      )}
    </div>
  );
}

function CardRow({
  card,
  idBase,
  onStar,
  onEdit,
  onDelete,
}: {
  card: StudyCard;
  idBase: string;
  onStar: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-4 py-3.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] sm:gap-x-6 sm:px-5">
      <p className="font-medium leading-snug break-words whitespace-pre-wrap text-ink">{card.term}</p>
      <div className="col-start-1 row-start-2 min-w-0 sm:col-start-2 sm:row-start-1">
        <p className="text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap text-ink-2">
          {card.definition}
        </p>
        {card.hint ? (
          <p className="mt-1.5 text-sm leading-snug break-words text-ink-2">
            <span className="font-medium text-ink">Hint:</span> {card.hint}
          </p>
        ) : null}
      </div>
      <div className="col-start-2 row-span-2 row-start-1 flex items-start gap-0.5 sm:col-start-3 sm:row-span-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={onStar}
          aria-pressed={card.starred}
          aria-label={`Star: ${card.term}`}
        >
          <Star
            strokeWidth={1.75}
            aria-hidden
            className={cn(card.starred && "fill-current text-ink")}
          />
        </Button>
        <Button
          id={`${idBase}-edit-${card.id}`}
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={onEdit}
          aria-label={`Edit: ${card.term}`}
        >
          <Pencil strokeWidth={1.75} aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 hover:bg-danger-soft hover:text-danger"
          onClick={onDelete}
          aria-label={`Delete: ${card.term}`}
        >
          <Trash2 strokeWidth={1.75} aria-hidden />
        </Button>
      </div>
    </li>
  );
}

function CardFields({
  idBase,
  draft,
  setDraft,
  errors,
  topics,
  disabled,
  termId,
}: {
  idBase: string;
  draft: Draft;
  setDraft: (d: Draft) => void;
  errors: DraftErrors;
  topics: Topic[];
  disabled?: boolean;
  termId?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Term or question" required error={errors.term} id={termId ?? `${idBase}-term`}>
        <Textarea
          value={draft.term}
          onChange={(e) => setDraft({ ...draft, term: e.target.value })}
          rows={2}
          maxLength={500}
          disabled={disabled}
          className="min-h-20"
        />
      </Field>
      <Field label="Definition or answer" required error={errors.definition}>
        <Textarea
          value={draft.definition}
          onChange={(e) => setDraft({ ...draft, definition: e.target.value })}
          rows={3}
          maxLength={4000}
          disabled={disabled}
          className="min-h-20"
        />
      </Field>
      <Field label="Hint" optional error={errors.hint}>
        <Input
          value={draft.hint}
          onChange={(e) => setDraft({ ...draft, hint: e.target.value })}
          maxLength={1000}
          disabled={disabled}
          autoComplete="off"
        />
      </Field>
      <Select
        value={draft.topicId}
        onValueChange={(v) => setDraft({ ...draft, topicId: v })}
        disabled={disabled}
      >
        <Field label="Topic" optional>
          {(p) => (
            <SelectTrigger id={p.id} aria-describedby={p["aria-describedby"]}>
              <SelectValue placeholder="No topic">
                {topics.find((t) => t.id === draft.topicId)?.title ?? "No topic"}
              </SelectValue>
            </SelectTrigger>
          )}
        </Field>
        <SelectContent>
          <SelectItem value={NO_TOPIC}>No topic</SelectItem>
          {topics.length > 0 ? <SelectSeparator /> : null}
          {topics.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function submitOnModEnter(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    e.currentTarget.requestSubmit();
  }
}

function AddCardForm({
  idBase,
  topics,
  onAdd,
  onClose,
}: {
  idBase: string;
  topics: Topic[];
  onAdd: (draft: Draft) => Promise<boolean>;
  onClose: () => void;
}) {
  const empty: Draft = { term: "", definition: "", hint: "", topicId: NO_TOPIC };
  const [draft, setDraft] = useState<Draft>(empty);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saving, setSaving] = useState(false);
  const termId = `${idBase}-new-term`;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    const ok = await onAdd(draft);
    setSaving(false);
    if (ok) {
      // Keep the topic so a run of cards for one topic is quick.
      setDraft({ ...empty, topicId: draft.topicId });
      focusById(termId);
    }
  }

  return (
    <Card variant="sunken" className="p-4 sm:p-5">
      <form
        onSubmit={onSubmit}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !saving) {
            e.preventDefault();
            onClose();
          } else submitOnModEnter(e);
        }}
        noValidate
        aria-label="Add a card"
        className="flex flex-col gap-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-ink">New card</h3>
          <Button type="button" variant="ghost" size="icon" className="size-9" onClick={onClose} aria-label="Close the new card form">
            <X strokeWidth={1.75} aria-hidden />
          </Button>
        </div>
        <CardFields
          idBase={idBase}
          termId={termId}
          draft={draft}
          setDraft={setDraft}
          errors={errors}
          topics={topics}
          disabled={saving}
        />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="hidden items-center gap-1.5 text-xs text-ink-2 sm:flex">
            <Kbd>Ctrl</Kbd>
            <span>+</span>
            <Kbd>Enter</Kbd>
            <span>to add,</span>
            <Kbd>Esc</Kbd>
            <span>to close</span>
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Done
            </Button>
            <Button type="submit" loading={saving}>
              Add card
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}

function EditCardRow({
  card,
  topics,
  onCancel,
  onSave,
}: {
  card: StudyCard;
  topics: Topic[];
  onCancel: () => void;
  onSave: (draft: Draft) => Promise<boolean>;
}) {
  const idBase = useId();
  const knownTopic = card.topic_id && topics.some((t) => t.id === card.topic_id);
  const [draft, setDraft] = useState<Draft>({
    term: card.term,
    definition: card.definition,
    hint: card.hint ?? "",
    topicId: knownTopic ? card.topic_id! : NO_TOPIC,
  });
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saving, setSaving] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    rowRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    const ok = await onSave(draft);
    if (!ok) setSaving(false);
  }

  return (
    <li ref={rowRef} className="bg-surface-2/60 px-4 py-4 sm:px-5">
      <form
        onSubmit={onSubmit}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !saving) {
            e.preventDefault();
            onCancel();
          } else submitOnModEnter(e);
        }}
        noValidate
        aria-label={`Edit card: ${card.term}`}
        className="flex flex-col gap-4"
      >
        <CardFields
          idBase={idBase}
          draft={draft}
          setDraft={setDraft}
          errors={errors}
          topics={topics}
          disabled={saving}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save
          </Button>
        </div>
      </form>
    </li>
  );
}
