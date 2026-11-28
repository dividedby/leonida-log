import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isAreaVisible, nextGate } from "@/lib/gates";
import { placedData } from "@/lib/test-fixtures/placed";

const state = vi.hoisted(() => ({
  current: null as string | null,
  checked: new Set<string>(),
}));
const data = placedData();

vi.mock("server-only", () => ({}));
vi.mock("@/app/actions", () => ({
  setItemChecked: vi.fn(),
  markMissionDone: vi.fn(),
}));
vi.mock("@/lib/server/data", () => ({
  getCurated: () => data,
  getRepository: () => ({
    getProgress: () => ({ currentMission: state.current }),
    checkedItemIds: () => state.checked,
  }),
}));

const { default: MapPage } = await import("./page");
const { default: AreaPage } = await import("./[area]/page");

const renderMap = () => renderToStaticMarkup(MapPage());
const renderArea = async (slug: string) =>
  renderToStaticMarkup(
    await AreaPage({ params: Promise.resolve({ area: slug }) }),
  );

/** The digest Next puts on the error `notFound()` or `redirect()` throws. */
async function thrownDigest(run: () => unknown): Promise<string> {
  try {
    await run();
  } catch (error) {
    return String((error as { digest?: string }).digest);
  }
  throw new Error("did not throw");
}

beforeEach(() => {
  state.current = "m1";
  state.checked = new Set();
});

describe("/map", () => {
  it("sends a visitor with no story position to onboarding", async () => {
    state.current = null;
    expect(await thrownDigest(renderMap)).toMatch(
      /^NEXT_REDIRECT;.*\/onboarding/,
    );
  });

  it("shows the five-tab bar with Map current", () => {
    const markup = renderMap();
    const nav = /<nav .*?<\/nav>/.exec(markup)?.[0] ?? "";
    expect(nav.match(/<a /g)).toHaveLength(5);
    expect(nav).toMatch(
      /aria-current="page"[^>]*>(<svg.*?<\/svg>)?<span[^>]*>Map</,
    );
  });

  it("links a reached region and names no later one, at every mission", () => {
    for (const mission of data.missions) {
      state.current = mission.slug;
      const markup = renderMap();
      for (const area of data.areas) {
        if (isAreaVisible(data, area, mission.slug)) continue;
        for (const text of [area.name, ...(area.aliases ?? [])]) {
          expect(markup, `${mission.slug}: ${text}`).not.toContain(text);
        }
        expect(markup).not.toContain(`/map/${area.slug}`);
      }
    }
  });

  it("names no later mission and shows no locked count, at every mission", () => {
    for (const mission of data.missions) {
      state.current = mission.slug;
      const markup = renderMap();
      const gate = nextGate(data, mission.slug);
      for (const later of data.missions) {
        if (later.order <= mission.order || later.slug === gate?.mission) {
          continue;
        }
        expect(markup, `${mission.slug}: ${later.title}`).not.toContain(
          later.title,
        );
      }
      expect(markup).not.toMatch(/unlock|locked/i);
    }
  });
});

describe("/map/[area]", () => {
  it("shows a reached region's own rows without an area tag on them", async () => {
    state.current = "m1";
    const markup = await renderArea("r1");
    expect(markup).toContain("Region One");
    expect(markup).toContain("Item a");
    expect(markup).not.toContain("·");
    expect(markup).toContain('href="/map"');
  });

  it("tags rows that sit in another area", async () => {
    state.current = "m7";
    const markup = await renderArea("r2");
    // r2's sheet holds d (in r2) and e (in its district d1).
    expect(markup).toContain("Item d");
    expect(markup).toContain("Item e");
    expect(markup).toContain("District One");
    // The sheet's own area is the header only: no tag on its own rows.
    expect(markup.split("Region Two")).toHaveLength(2);
  });

  it("answers a hidden area and an unknown slug with the same 404", async () => {
    state.current = "m1";
    const hidden = await thrownDigest(() => renderArea("r2"));
    const unknown = await thrownDigest(() => renderArea("not-a-region"));
    expect(hidden).toMatch(/404/);
    expect(hidden).toBe(unknown);
  });

  it("sends a visitor with no story position to onboarding", async () => {
    state.current = null;
    expect(await thrownDigest(() => renderArea("r1"))).toMatch(
      /^NEXT_REDIRECT;.*\/onboarding/,
    );
  });

  it("names nothing past the current mission at any mission", async () => {
    for (const mission of data.missions) {
      state.current = mission.slug;
      const gate = nextGate(data, mission.slug);
      for (const area of data.areas) {
        if (!isAreaVisible(data, area, mission.slug)) continue;
        let markup: string;
        try {
          markup = await renderArea(area.slug);
        } catch {
          continue;
        }
        for (const hidden of data.areas) {
          if (isAreaVisible(data, hidden, mission.slug)) continue;
          expect(markup, `${mission.slug}/${area.slug}`).not.toContain(
            hidden.name,
          );
        }
        for (const later of data.missions) {
          if (later.order <= mission.order || later.slug === gate?.mission) {
            continue;
          }
          expect(markup).not.toContain(later.title);
        }
        expect(markup).not.toMatch(/unlock|locked/i);
      }
    }
  });
});
