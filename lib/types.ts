// Shared data types. These mirror supabase/migrations/20261104000000_init.sql.
// Change both together.

export type Topic = {
  id: string; // stable within a set, e.g. "t1"
  title: string;
  summary: string;
};

export type LearningProfile = {
  /** Where they are in school. */
  level?: "undergrad" | "premed" | "med" | "other";
  /** What they are studying for. */
  goals?: Array<"course_exams" | "mcat" | "usmle" | "understanding">;
  /** Big picture first, or build up from details. */
  approach?: "big_picture_first" | "details_first";
  /** How long explanations should be. */
  depth?: "concise" | "balanced" | "deep";
  /** Explanation tools that work for them. */
  explain_with?: Array<
    | "analogies"
    | "step_by_step"
    | "clinical"
    | "mnemonics"
    | "tables"
    | "examples"
    | "visual_descriptions"
  >;
  /** Kinds of practice they want. */
  practice?: Array<"recall" | "application" | "vignettes" | "compare_contrast">;
  /** Free text: anything else about how they learn. */
  notes?: string;
};

export type Profile = {
  id: string;
  display_name: string | null;
  learning_profile: LearningProfile;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CourseColor = "teal" | "blue" | "violet" | "rose" | "amber" | "green" | "slate";

export type Course = {
  id: string;
  user_id: string;
  name: string;
  color: CourseColor;
  created_at: string;
};

export type SetStatus = "draft" | "building" | "ready" | "error";

export type StudySet = {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  description: string | null;
  exam_date: string | null; // YYYY-MM-DD
  status: SetStatus;
  topics: Topic[];
  last_studied_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MaterialStatus = "pending" | "processing" | "ready" | "error";

export type Material = {
  id: string;
  user_id: string;
  set_id: string;
  kind: "file" | "text";
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  content_text: string | null;
  char_count: number | null;
  status: MaterialStatus;
  error: string | null;
  created_at: string;
};

export type GuideSection = {
  id: string;
  user_id: string;
  set_id: string;
  position: number;
  topic_id: string;
  title: string;
  content_md: string;
  status: "pending" | "writing" | "ready" | "error";
  created_at: string;
  updated_at: string;
};

export type Card = {
  id: string;
  user_id: string;
  set_id: string;
  term: string;
  definition: string;
  topic_id: string | null;
  hint: string | null;
  source: "ai" | "manual";
  starred: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

/** 0 not studied, 1 still learning, 2 familiar, 3 mastered */
export type MasteryLevel = 0 | 1 | 2 | 3;

export type CardProgress = {
  card_id: string;
  user_id: string;
  set_id: string;
  level: MasteryLevel;
  streak: number;
  times_seen: number;
  times_correct: number;
  times_wrong: number;
  interval_days: number;
  ease: number;
  due_at: string | null;
  last_result: "correct" | "wrong" | null;
  last_seen_at: string | null;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  user_id: string;
  set_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type JobKind = "build_set" | "exam_questions";
export type JobStatus = "queued" | "running" | "done" | "error";

export type Job = {
  id: string;
  user_id: string;
  set_id: string;
  kind: JobKind;
  status: JobStatus;
  progress: number; // 0-100
  message: string | null;
  error: string | null;
  options: Record<string, unknown>;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExamQuestion = {
  id: string;
  user_id: string;
  set_id: string;
  topic_id: string | null;
  stem: string;
  choices: string[];
  answer_index: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  created_at: string;
};

export type TestAttempt = {
  id: string;
  user_id: string;
  set_id: string;
  kind: "cards" | "exam";
  score: number;
  total: number;
  details: unknown[];
  created_at: string;
};

export type GameName = "meteor" | "match";

export type GameScore = {
  id: string;
  user_id: string;
  set_id: string;
  game: GameName;
  score: number;
  meta: Record<string, unknown>;
  created_at: string;
};

export type VideoResult = {
  id: string; // YouTube video id
  title: string;
  channel: string;
  thumbnail: string;
  publishedAt: string;
};

export type VideoSuggestion = {
  id: string;
  user_id: string;
  set_id: string;
  topic_id: string | null;
  topic_title: string;
  query: string;
  reason: string | null;
  videos: VideoResult[];
  created_at: string;
};
