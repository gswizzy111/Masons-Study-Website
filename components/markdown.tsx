import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type MarkdownProps = {
  /** Markdown source. */
  children: string | null | undefined;
  className?: string;
  /** Smaller type and tighter spacing, for chat answers and explanations. */
  compact?: boolean;
  /** Override or add element renderers. */
  components?: Components;
};

// "~5 mM" is common in science notes: only "~~text~~" strikes through.
const remarkPlugins: NonNullable<Parameters<typeof ReactMarkdown>[0]["remarkPlugins"]> = [
  [remarkGfm, { singleTilde: false }],
];

/** The bits of a hast node this file reads (react-markdown passes the node). */
type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  children?: HastNode[];
};

/** Plain text of a hast node and everything under it. */
function hastText(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(hastText).join("");
}

/** First child element with this tag name. */
function childElement(node: HastNode | undefined, tagName: string): HastNode | undefined {
  return node?.children?.find((child) => child.type === "element" && child.tagName === tagName);
}

/**
 * A name for a table from its header row, so each scrollable table has its
 * own label ("Table: Enzyme, Where, Regulation") instead of every one being
 * called "Table".
 */
function tableLabel(table: HastNode | undefined): string {
  const row = childElement(childElement(table, "thead"), "tr");
  const headers = (row?.children ?? [])
    .filter((cell) => cell.type === "element")
    .map((cell) => hastText(cell).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (headers.length === 0) return "Table";
  const label = `Table: ${headers.join(", ")}`;
  return label.length > 120 ? `${label.slice(0, 117).trimEnd()}...` : label;
}

/**
 * Links that stay on this site: in-page anchors and root-relative paths.
 * "//host/path" and "/\host/path" are protocol-relative (browsers read a
 * backslash as a slash), so they leave the site and count as external.
 */
export function isInternalHref(href: unknown): href is string {
  if (typeof href !== "string") return false;
  if (href.startsWith("#")) return true;
  return href.startsWith("/") && href[1] !== "/" && href[1] !== "\\";
}

const baseComponents: Components = {
  a({ node: _node, href, children, ...props }) {
    void _node;
    if (isInternalHref(href)) {
      return (
        <a href={href} {...props}>
          {children}
        </a>
      );
    }
    return (
      <a href={href} target="_blank" rel="noreferrer" {...props}>
        {children}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  },
  table({ node, ...props }) {
    return (
      // Focusable so keyboard users can scroll wide tables sideways. A named
      // group (not a region) so a guide with many tables doesn't fill the
      // landmark list with near-identical entries.
      <div className="table-wrap" role="group" aria-label={tableLabel(node as HastNode | undefined)} tabIndex={0}>
        <table {...props} />
      </div>
    );
  },
  th({ node, children, ...props }) {
    // Compare tables often leave the corner cell empty; give it a name for
    // screen readers so the column still has a header.
    if (!hastText(node as HastNode | undefined).trim()) {
      return (
        <th {...props}>
          <span className="sr-only">Item</span>
        </th>
      );
    }
    return <th {...props}>{children}</th>;
  },
  // Claude writes guides, answers and explanations from uploaded material,
  // which can carry hidden instructions. A remote image would load on its
  // own and could send whatever is in its address (the student's notes or
  // question) to another site, so images never load: the alt text shows
  // instead. Nothing on this site needs pictures inside Markdown.
  img({ alt }) {
    const text = typeof alt === "string" ? alt.trim() : "";
    if (!text) return null;
    return <span className="text-ink-2">[Image: {text}]</span>;
  },
};

/**
 * Renders markdown (GitHub flavored: tables, task lists, strikethrough,
 * footnotes) with the `.prose-study` styles. Raw HTML in the source is
 * dropped, never rendered, and images show as their alt text (nothing loads
 * from another site).
 */
export function Markdown({ children, className, compact = false, components }: MarkdownProps) {
  return (
    <div className={cn("prose-study", compact && "prose-compact", className)}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        skipHtml
        components={components ? { ...baseComponents, ...components } : baseComponents}
      >
        {children ?? ""}
      </ReactMarkdown>
    </div>
  );
}
