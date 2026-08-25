import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("public tracking timeline layout", () => {
  it("keeps the marker in the public grid flow and lets event text use the flexible column", () => {
    const cssPath = fileURLToPath(new URL("./globals.css", import.meta.url));
    const css = readFileSync(cssPath, "utf8");

    expect(css).toMatch(/\.public-timeline li\s*{[^}]*grid-template-columns:\s*18px minmax\(0, 1fr\);/);
    expect(css).toMatch(/\.public-timeline \.timeline-dot\s*{[^}]*position:\s*static;/);
    expect(css).toMatch(/\.public-timeline-event\s*{[^}]*min-width:\s*0;/);
    expect(css).toMatch(/\.public-timeline-event\s*{[^}]*overflow-wrap:\s*anywhere;/);
    expect(css).toMatch(/\.public-timeline li::before\s*{[^}]*left:\s*8px;/);
  });
});
