export function invoiceDescriptionLines(value: string): string[] {
  const maxLength = 32;
  const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return value.split("\n").flatMap(line => {
    let remaining = Array.from(graphemes.segment(line), part => part.segment);
    if (!remaining.length) return [""];
    const lines: string[] = [];
    while (remaining.length > maxLength) {
      let end = maxLength;
      while (end > 0 && !/\s/u.test(remaining[end - 1])) end--;
      if (end === 0) end = maxLength;
      lines.push(remaining.slice(0, end).join(""));
      remaining = remaining.slice(end);
    }
    lines.push(remaining.join(""));
    return lines;
  });
}
