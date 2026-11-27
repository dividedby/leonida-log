import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";

export const GITHUB_CONFIG_PATH = fileURLToPath(
  new URL("../config/github.yaml", import.meta.url),
);

const repo = z.string().regex(/^[\w.-]+\/[\w.-]+$/, "expected owner/name");
const repoPath = z
  .string()
  .min(1)
  .refine(
    (p) => !p.startsWith("/") && !p.split("/").includes(".."),
    "a relative path inside the repo",
  );
const pattern = z.string().refine((p) => {
  try {
    new RegExp(p, "i");
    return true;
  } catch {
    return false;
  }
}, "not a valid regular expression");

const schema = z
  .strictObject({
    watch: z.array(z.strictObject({ repo, paths: z.array(repoPath).min(1) })),
    discovery: z.strictObject({
      query: z.string().min(1),
      every_days: z.number().int().positive(),
      keywords: z.array(z.string().min(1)).min(1),
      exclude_patterns: z.array(pattern),
      blocklist: z.array(repo),
    }),
    max_inline_bytes: z.number().int().positive(),
  })
  .superRefine((cfg, ctx) => {
    const blocked = new Set(
      cfg.discovery.blocklist.map((r) => r.toLowerCase()),
    );
    cfg.watch.forEach((w, i) => {
      if (blocked.has(w.repo.toLowerCase())) {
        ctx.addIssue({
          code: "custom",
          path: ["watch", i, "repo"],
          message: `${w.repo} is in the discovery blocklist`,
        });
      }
    });
  });

export type GithubConfig = z.infer<typeof schema>;

export function parseGithubConfig(raw: unknown): GithubConfig {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
    );
    throw new Error(`Invalid github.yaml: ${issues.join("; ")}`);
  }
  return parsed.data;
}

export function loadGithubConfig(
  file: string = GITHUB_CONFIG_PATH,
): GithubConfig {
  return parseGithubConfig(parse(readFileSync(file, "utf8")));
}
