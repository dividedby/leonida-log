import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChecklistRow } from "./ChecklistRow";

const render = (tag?: string) =>
  renderToStaticMarkup(
    <ChecklistRow id="a" label="Find the thing" checked={false} tag={tag} />,
  );

describe("ChecklistRow area tag", () => {
  it("shows the tag inline after the label, inside the label element", () => {
    const markup = render("Vice City");
    expect(markup.indexOf("Find the thing")).toBeLessThan(
      markup.indexOf("Vice City"),
    );
    expect(markup.indexOf("Vice City")).toBeLessThan(
      markup.indexOf("</label>"),
    );
  });

  it("hides the separator dot from assistive tech", () => {
    expect(render("Vice City")).toContain('<span aria-hidden="true">·</span>');
  });

  it("shows no tag text when none is given", () => {
    const markup = render();
    expect(markup).toContain("Find the thing");
    expect(markup).not.toContain("·");
  });
});
