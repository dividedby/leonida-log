import { describe, expect, it } from "vitest";
import { diffExtracts } from "./diff";

describe("diffExtracts", () => {
  it("treats a page with no previous extract as new", () => {
    const d = diffExtracts(null, "# Title\nOne.\n- Two.");
    expect(d).toMatchObject({
      kind: "new",
      headingsAdded: ["Title"],
      paragraphsAdded: 2,
      paragraphsRemoved: 0,
    });
  });

  it("reports added and removed headings and paragraphs, with at most 3 snippets of 160 characters", () => {
    const long = "x".repeat(300);
    const d = diffExtracts(
      "# Keep\n## Gone\nSame.\nOld one.",
      `# Keep\n## Fresh\nSame.\nNew a.\n- New b.\nNew c.\n${long}`,
    );
    expect(d.kind).toBe("modified");
    expect(d.headingsAdded).toEqual(["Fresh"]);
    expect(d.headingsRemoved).toEqual(["Gone"]);
    expect(d.paragraphsAdded).toBe(4);
    expect(d.paragraphsRemoved).toBe(1);
    expect(d.snippets).toEqual(["New a.", "New b.", "New c."]);
    const longSnippet = diffExtracts("a", long).snippets[0];
    expect(longSnippet.length).toBeLessThanOrEqual(160);
  });

  it("counts a repeated line only as often as it was added", () => {
    const d = diffExtracts("Same.\nSame.", "Same.\nSame.\nSame.");
    expect(d.paragraphsAdded).toBe(1);
  });
});
