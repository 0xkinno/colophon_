import type { ElementType } from "react";

export function HeadlineBlur({ text, as: Tag = "h1", className = "display" }: { text: string; as?: ElementType; className?: string }) {
  const words = text.split(" ");
  return (
    <Tag className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} aria-hidden className="blur-word" style={{ ["--i" as string]: i }}>
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}
