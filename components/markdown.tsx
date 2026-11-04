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

const baseComponents: Components = {
  a({ node: _node, href, children, ...props }) {
    void _node;
    const internal = typeof href === "string" && (href.startsWith("#") || href.startsWith("/"));
    if (internal) {
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
  table({ node: _node, ...props }) {
    void _node;
    return (
      // Focusable so keyboard users can scroll wide tables sideways.
      <div className="table-wrap" role="region" aria-label="Table" tabIndex={0}>
        <table {...props} />
      </div>
    );
  },
  img({ node: _node, alt, ...props }) {
    void _node;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt ?? ""} loading="lazy" decoding="async" {...props} />;
  },
};

/**
 * Renders markdown (GitHub flavored: tables, task lists, strikethrough,
 * footnotes) with the `.prose-study` styles. Raw HTML in the source is
 * dropped, never rendered.
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
