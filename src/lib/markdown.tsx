// A small, safe Markdown renderer (D7): headings, paragraphs, bullet and numbered lists,
// **bold**, *italic* / _italic_ and `code`. It builds React elements from the text and never
// injects HTML, so the output is sanitised by construction.
import type { ReactNode } from "react";

function inline(text: string, keyBase: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyBase}-${i++}`;
    if (token.startsWith("**")) parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`"))
      parts.push(
        <code key={key} className="rounded bg-muted px-1 pmo-num text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      );
    else parts.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const cls =
        level === 1 ? "text-base font-semibold" : level === 2 ? "text-sm font-semibold" : "text-sm font-medium";
      blocks.push(
        <p key={i} className={cls}>
          {inline(heading[2], `h${i}`)}
        </p>,
      );
      i++;
      continue;
    }
    const bullet = /^\s*[-*]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const rule = ordered ? numbered : bullet;
      const items: ReactNode[] = [];
      while (i < lines.length && rule.test(lines[i])) {
        items.push(<li key={i}>{inline(lines[i].replace(rule, ""), `li${i}`)}</li>);
        i++;
      }
      blocks.push(
        ordered ? (
          <ol key={`l${i}`} className="list-decimal space-y-1 pl-5">
            {items}
          </ol>
        ) : (
          <ul key={`l${i}`} className="list-disc space-y-1 pl-5">
            {items}
          </ul>
        ),
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3})\s/.test(lines[i]) && !bullet.test(lines[i]) && !numbered.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(<p key={`p${i}`}>{inline(para.join(" "), `p${i}`)}</p>);
  }
  return <div className="space-y-2 text-sm leading-6 text-pmo-text">{blocks}</div>;
}
