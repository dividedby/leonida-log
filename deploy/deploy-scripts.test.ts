import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Runs the real deploy and apply scripts against stubbed docker, sudo, runuser, curl and sqlite3. The stubs
// record every call in calls.log; files in the stub folder switch their behavior.

const haveTools = ["bash", "git", "flock"].every(
  (tool) => spawnSync("sh", ["-c", `command -v ${tool}`]).status === 0,
);

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const IMAGE = "ghcr.io/dividedby/leonida-log";

// compose.yaml's `scraper` command. `docker compose run scraper <args>` replaces it, so the scrape script must pass
// it itself, followed by its own arguments.
function composeScraperCommand(): string {
  const compose = readFileSync(
    fileURLToPath(new URL("../compose.yaml", import.meta.url)),
    "utf8",
  );
  const block = compose.slice(compose.indexOf("\n  scraper:"));
  const match = block.match(/\n\s+command:\s*\[([^\]]*)\]/);
  if (!match) throw new Error("no scraper command in compose.yaml");
  return JSON.parse(`[${match[1]}]`).join(" ");
}

const scriptPath = (name: string) =>
  fileURLToPath(new URL(name, import.meta.url));

const STUBS: Record<string, string> = {
  docker: String.raw`#!/usr/bin/env bash
echo "docker IMAGE_TAG=$IMAGE_TAG $*" >>"$STUB_DIR/calls.log"
case "$*" in
*" pull app"*) [[ -e $STUB_DIR/fail-pull ]] && exit 1 ;;
*" run --rm -T migrate"*) [[ -e $STUB_DIR/fail-migrate ]] && exit 1 ;;
*" up -d app"*) printf '%s' "$IMAGE_TAG" >"$STUB_DIR/running" ;;
*" stop app"*) rm -f "$STUB_DIR/running" ;;
"image ls"*) cat "$STUB_DIR/images" 2>/dev/null ;;
esac
exit 0
`,
  curl: String.raw`#!/usr/bin/env bash
echo "curl $*" >>"$STUB_DIR/calls.log"
[[ -r $STUB_DIR/running ]] || exit 7
running=$(cat "$STUB_DIR/running")
if [[ -r $STUB_DIR/unhealthy && $running == "$(cat "$STUB_DIR/unhealthy")" ]]; then
  exit 22
fi
printf '{"ok":true,"revision":"%s"}' "$running"
`,
  sudo: String.raw`#!/usr/bin/env bash
echo "sudo $*" >>"$STUB_DIR/calls.log"
[[ $1 == -n ]] && shift
exec "$@"
`,
  runuser: String.raw`#!/usr/bin/env bash
echo "runuser $*" >>"$STUB_DIR/calls.log"
shift 3
exec "$@"
`,
  sqlite3: String.raw`#!/usr/bin/env bash
echo "sqlite3 $*" >>"$STUB_DIR/calls.log"
: >"$(printf '%s' "$2" | sed "s/.*INTO '\\(.*\\)'.*/\\1/")"
`,
  systemctl: String.raw`#!/usr/bin/env bash
echo "systemctl $*" >>"$STUB_DIR/calls.log"
[[ -e $STUB_DIR/fail-systemctl ]] && exit 1
exit 0
`,
  // Stands in for leonida-log-apply when only the deploy script is under test.
  apply: String.raw`#!/usr/bin/env bash
echo "apply $*" >>"$STUB_DIR/calls.log"
exit "$(cat "$STUB_DIR/apply-status" 2>/dev/null || echo 0)"
`,
};

interface Sandbox {
  root: string;
  stub: string;
  state: string;
  data: string;
  env: Record<string, string>;
}

const sandboxes: string[] = [];

function makeSandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "leonida-deploy-test-"));
  sandboxes.push(root);
  const bin = join(root, "bin");
  const stub = join(root, "stub");
  const state = join(root, "state");
  const data = join(root, "data");
  for (const dir of [bin, stub, state, data]) mkdirSync(dir);
  for (const [name, body] of Object.entries(STUBS)) {
    writeFileSync(join(bin, name), body, { mode: 0o755 });
  }
  writeFileSync(join(root, "compose.yaml"), "name: leonida-log\n");
  writeFileSync(join(root, "compose.env"), "LEONIDA_PORT=5187\n");
  return {
    root,
    stub,
    state,
    data,
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      HOME: root,
      STUB_DIR: stub,
      COMPOSE_FILE: join(root, "compose.yaml"),
      ENV_FILE: join(root, "compose.env"),
      STATE_DIR: state,
      DATA_DIR: data,
      REPO: join(root, "no-clone"),
      HEALTH_TRIES: "2",
      HEALTH_PAUSE: "0",
    },
  };
}

function run(
  sb: Sandbox,
  script: string,
  args: string[],
  extraEnv: Record<string, string> = {},
) {
  const result = spawnSync("bash", [scriptPath(script), ...args], {
    encoding: "utf8",
    env: { ...sb.env, ...extraEnv } as NodeJS.ProcessEnv,
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

const calls = (sb: Sandbox): string =>
  existsSync(join(sb.stub, "calls.log"))
    ? readFileSync(join(sb.stub, "calls.log"), "utf8")
    : "";
const current = (sb: Sandbox): string | null =>
  existsSync(join(sb.state, "current"))
    ? readFileSync(join(sb.state, "current"), "utf8").trim()
    : null;
const running = (sb: Sandbox): string | null =>
  existsSync(join(sb.stub, "running"))
    ? readFileSync(join(sb.stub, "running"), "utf8")
    : null;

/** A release already live: recorded as current and answering health. */
function deployedAlready(sb: Sandbox, sha: string) {
  writeFileSync(join(sb.state, "current"), `${sha}\n`);
  writeFileSync(join(sb.stub, "running"), sha);
}

afterEach(() => {
  for (const dir of sandboxes.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

const BAD_SHAS: [string, string][] = [
  ["empty", ""],
  ["not hex", "x".repeat(40)],
  ["uppercase", "A".repeat(40)],
  ["39 characters", "a".repeat(39)],
  ["41 characters", "a".repeat(41)],
  ["a shell command", "id"],
  ["a SHA followed by a command", `${SHA_A}; id`],
];

describe.skipIf(!haveTools)("leonida-log-apply", { timeout: 30_000 }, () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = makeSandbox();
  });

  it.each(BAD_SHAS)("refuses %s without touching docker", (_name, arg) => {
    const { status, output } = run(sb, "leonida-log-apply.sh", [arg]);

    expect(status).toBe(1);
    expect(output).toContain("40-character");
    expect(calls(sb)).toBe("");
  });

  it.each([
    ["the image cannot be pulled", "fail-pull"],
    ["the migration fails", "fail-migrate"],
  ])("leaves the running app alone when %s", (_name, flag) => {
    deployedAlready(sb, SHA_A);
    writeFileSync(join(sb.stub, flag), "");

    const { status } = run(sb, "leonida-log-apply.sh", [SHA_B]);

    expect(status).toBe(1);
    expect(calls(sb)).not.toContain("up -d");
    expect(calls(sb)).not.toContain("stop app");
    expect(running(sb)).toBe(SHA_A);
    expect(current(sb)).toBe(SHA_A);
  });

  it("rolls back to the previous release and exits 1 when the new image is unhealthy", () => {
    deployedAlready(sb, SHA_A);
    writeFileSync(join(sb.stub, "unhealthy"), SHA_B);

    const { status, output } = run(sb, "leonida-log-apply.sh", [SHA_B]);

    expect(status).toBe(1);
    expect(output).toContain("rolled back, healthy");
    expect(running(sb)).toBe(SHA_A);
    expect(current(sb)).toBe(SHA_A);
  });

  it("stops the app on a first deploy that never becomes healthy", () => {
    writeFileSync(join(sb.stub, "unhealthy"), SHA_B);

    const { status, output } = run(sb, "leonida-log-apply.sh", [SHA_B]);

    expect(status).toBe(1);
    expect(output).toContain("no previous release");
    expect(running(sb)).toBeNull();
    expect(current(sb)).toBeNull();
  });

  it("records the release, snapshots the database and prunes old images on success", () => {
    deployedAlready(sb, SHA_A);
    writeFileSync(join(sb.data, "leonida.db"), "");
    writeFileSync(
      join(sb.stub, "images"),
      `${IMAGE}:${SHA_A}\n${IMAGE}:${SHA_B}\n`,
    );

    const { status, output } = run(sb, "leonida-log-apply.sh", [SHA_B]);

    expect(status).toBe(0);
    expect(output).toContain(`done: running ${SHA_B}`);
    expect(current(sb)).toBe(SHA_B);
    expect(running(sb)).toBe(SHA_B);
    expect(existsSync(join(sb.data, "pre-deploy", `${SHA_B}.db`))).toBe(true);
    expect(calls(sb)).toContain("runuser -u leonida-log -- sqlite3");
    expect(calls(sb)).toContain(
      "curl -fsS --max-time 3 http://127.0.0.1:5187/",
    );
    expect(calls(sb)).toContain(`rmi ${IMAGE}:${SHA_A}`);
    expect(calls(sb)).not.toContain(`rmi ${IMAGE}:${SHA_B}`);
  });

  it("takes no snapshot before the database exists", () => {
    const { status } = run(sb, "leonida-log-apply.sh", [SHA_B]);

    expect(status).toBe(0);
    expect(calls(sb)).not.toContain("sqlite3");
    expect(current(sb)).toBe(SHA_B);
  });

  it("keeps the newest three snapshots", () => {
    writeFileSync(join(sb.data, "leonida.db"), "");
    const dir = join(sb.data, "pre-deploy");
    mkdirSync(dir);
    const old = ["1", "2", "3", "4"].map((c) => `${c.repeat(40)}.db`);
    old.forEach((name, i) => {
      writeFileSync(join(dir, name), "");
      const when = new Date(Date.UTC(2026, 0, 1 + i));
      utimesSync(join(dir, name), when, when);
    });

    const { status } = run(sb, "leonida-log-apply.sh", [SHA_B]);

    expect(status).toBe(0);
    expect(readdirSync(dir).sort()).toEqual(
      [old[3], old[2], `${SHA_B}.db`].sort(),
    );
  });

  it("warns when an installed file lags the clone, and skips sources reached through a symlink", () => {
    const repo = join(sb.root, "repo");
    const elsewhere = join(sb.root, "elsewhere");
    const sbin = join(sb.root, "sbin");
    for (const dir of [repo, elsewhere, sbin]) mkdirSync(dir);
    writeFileSync(join(repo, "compose.yaml"), "name: newer\n");
    writeFileSync(join(elsewhere, "leonida-log-scrape.sh"), "#!/bin/sh\n");
    symlinkSync(elsewhere, join(repo, "deploy"));
    writeFileSync(join(sbin, "leonida-log-scrape"), "installed\n");

    const { status, output } = run(sb, "leonida-log-apply.sh", [SHA_B], {
      REPO: repo,
      SBIN_DIR: sbin,
      UNIT_DIR: sbin,
    });

    expect(status).toBe(0);
    expect(output).toContain("differs from compose.yaml");
    expect(output).not.toContain("differs from deploy/");
  });
});

describe.skipIf(!haveTools)("leonida-log-scrape", { timeout: 30_000 }, () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = makeSandbox();
  });

  it("refuses to run before any release is recorded", () => {
    const { status, output } = run(sb, "leonida-log-scrape.sh", []);

    expect(status).toBe(1);
    expect(output).toContain("no deployed release");
    expect(calls(sb)).toBe("");
  });

  it("runs the scraper from the deployed image and passes its arguments and exit status on", () => {
    deployedAlready(sb, SHA_A);

    const { status } = run(sb, "leonida-log-scrape.sh", ["--dry-run"]);

    expect(status).toBe(0);
    expect(calls(sb)).toContain(
      `docker IMAGE_TAG=${SHA_A} compose -f ${sb.env.COMPOSE_FILE} --env-file ${sb.env.ENV_FILE} run --rm -T --pull never scraper ${composeScraperCommand()} --dry-run`,
    );
  });
});

describe.skipIf(!haveTools)("leonida-log-scrape --feed-only", () => {
  it("gives way when a deploy or scrape holds the lock: exits 75 without starting the container", async () => {
    const sb = makeSandbox();
    deployedAlready(sb, SHA_A);
    const holder = spawn(
      "bash",
      ["-c", 'exec 9>"$1"; flock -x 9; echo held; sleep 30', "holder"].concat(
        join(sb.state, "apply.lock"),
      ),
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    try {
      await new Promise((resolve) => holder.stdout.once("data", resolve));

      const { status, output } = run(
        sb,
        "leonida-log-scrape.sh",
        ["--feed-only"],
        {
          FEED_LOCK_WAIT: "1",
        },
      );

      expect(status).toBe(75);
      expect(output).toContain("feed poll skipped");
      expect(calls(sb)).toBe("");
    } finally {
      holder.kill();
    }
  });

  it("polls once it has the lock", () => {
    const sb = makeSandbox();
    deployedAlready(sb, SHA_A);

    const { status } = run(sb, "leonida-log-scrape.sh", ["--feed-only"]);

    expect(status).toBe(0);
    expect(calls(sb)).toContain(
      `run --rm -T --pull never scraper ${composeScraperCommand()} --feed-only`,
    );
  });
});

// What systemd hands ExecStopPost for each way a feed poll can end. SuccessExitStatus=75 makes a lock-yield a
// "success" result, so it is told apart by EXIT_STATUS.
const POLL_RESULTS = {
  ok: { SERVICE_RESULT: "success", EXIT_CODE: "exited", EXIT_STATUS: "0" },
  skipped: {
    SERVICE_RESULT: "success",
    EXIT_CODE: "exited",
    EXIT_STATUS: "75",
  },
  fail: { SERVICE_RESULT: "exit-code", EXIT_CODE: "exited", EXIT_STATUS: "2" },
  timeout: {
    SERVICE_RESULT: "timeout",
    EXIT_CODE: "killed",
    EXIT_STATUS: "TERM",
  },
  signal: {
    SERVICE_RESULT: "signal",
    EXIT_CODE: "killed",
    EXIT_STATUS: "KILL",
  },
} as const;
type PollResult = keyof typeof POLL_RESULTS;

describe.skipIf(!haveTools)(
  "leonida-log-feed-result",
  { timeout: 30_000 },
  () => {
    let sb: Sandbox;
    beforeEach(() => {
      sb = makeSandbox();
    });

    const poll = (result: PollResult) =>
      run(sb, "leonida-log-feed-result.sh", [], POLL_RESULTS[result]);
    const alerts = () =>
      calls(sb)
        .split("\n")
        .filter((line) => line.includes("host-alert@"));

    it.each<[string, PollResult[], number]>([
      ["no alert on the first failed poll", ["fail"], 0],
      ["one alert on the second consecutive failure", ["fail", "fail"], 1],
      [
        "no repeat alert on the third and fourth",
        ["fail", "fail", "fail", "fail"],
        1,
      ],
      ["a success in between resets the count", ["fail", "ok", "fail"], 0],
      [
        "two failures after a reset alert again",
        ["fail", "ok", "fail", "fail"],
        1,
      ],
      [
        "a new alert after the count was reset",
        ["fail", "fail", "ok", "fail", "fail"],
        2,
      ],
      [
        "a skipped poll (75) neither resets nor counts",
        ["fail", "skipped", "fail"],
        1,
      ],
      ["skipped polls alone never alert", ["skipped", "skipped", "skipped"], 0],
      ["a timeout counts as a failure", ["fail", "timeout"], 1],
      ["a kill signal counts as a failure", ["signal", "fail"], 1],
    ])("%s", (_name, sequence, expected) => {
      for (const result of sequence) expect(poll(result).status).toBe(0);

      expect(alerts()).toHaveLength(expected);
    });

    it("starts the same alert instance the weekly scrape unit uses, without blocking", () => {
      poll("fail");
      poll("fail");

      expect(alerts()).toEqual([
        "systemctl start --no-block host-alert@attention:leonida-log-feed.service.service",
      ]);
    });

    it("does nothing when systemd gave it no result (run by hand)", () => {
      for (let i = 0; i < 3; i++) {
        expect(run(sb, "leonida-log-feed-result.sh", []).status).toBe(0);
      }

      expect(alerts()).toEqual([]);
      expect(readdirSync(sb.state)).toEqual([]);
    });

    it("treats a corrupt state file as zero failures", () => {
      writeFileSync(join(sb.state, "feed-failures"), "not a number");

      poll("fail");

      expect(alerts()).toEqual([]);
      poll("fail");
      expect(alerts()).toHaveLength(1);
    });

    it("never fails the unit, even when the state folder is missing or the alert cannot start", () => {
      rmSync(sb.state, { recursive: true });
      expect(poll("fail").status).toBe(0);
      expect(poll("ok").status).toBe(0);

      mkdirSync(sb.state);
      writeFileSync(join(sb.stub, "fail-systemctl"), "");
      poll("fail");
      const { status, output } = poll("fail");

      expect(status).toBe(0);
      expect(output).toContain("alert");
    });

    it("leaves no temporary files behind", () => {
      poll("fail");
      poll("fail");
      poll("ok");
      poll("fail");

      expect(readdirSync(sb.state)).toEqual(["feed-failures"]);
    });
  },
);

describe.skipIf(!haveTools)("leonida-log-deploy", { timeout: 30_000 }, () => {
  let sb: Sandbox;
  let clone: string;
  let sideSha: string;

  const git = (cwd: string, ...args: string[]) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=test",
        "-c",
        "user.email=test@example.com",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();

  /** A real origin with `main` at the SHA the tests deploy (shaMain) and a side branch the clone also holds. */
  let shaMain: string;
  beforeEach(() => {
    sb = makeSandbox();
    const origin = join(sb.root, "origin.git");
    const work = join(sb.root, "work");
    clone = join(sb.root, "srv");
    git(sb.root, "init", "--bare", "-b", "main", origin);
    git(sb.root, "init", "-b", "main", work);
    git(work, "commit", "--allow-empty", "-m", "first");
    git(work, "remote", "add", "origin", origin);
    git(work, "push", "origin", "main");
    git(work, "checkout", "-b", "side");
    git(work, "commit", "--allow-empty", "-m", "side");
    sideSha = git(work, "rev-parse", "HEAD");
    git(work, "push", "origin", "side");
    git(work, "checkout", "main");
    git(sb.root, "clone", "--quiet", origin, clone);
    // main moves after the clone was made: the script has to fetch it.
    git(work, "commit", "--allow-empty", "-m", "second");
    git(work, "push", "origin", "main");
    shaMain = git(work, "rev-parse", "HEAD");
    sb.env.REPO = clone;
    sb.env.APPLY = scriptPath("leonida-log-apply.sh");
  });

  const deploy = (sha: string, extra: Record<string, string> = {}) =>
    run(sb, "leonida-log-deploy.sh", [], {
      SSH_ORIGINAL_COMMAND: sha,
      ...extra,
    });

  it.each(BAD_SHAS)("refuses %s", (_name, arg) => {
    const { status, output } = deploy(arg);

    expect(status).toBe(1);
    expect(output).toContain("40-character");
    expect(calls(sb)).toBe("");
  });

  it("refuses a SHA the repo does not have", () => {
    const { status, output } = deploy("0".repeat(40));

    expect(status).toBe(1);
    expect(output).toContain("commit not found");
    expect(calls(sb)).not.toContain("sudo");
  });

  it("refuses a SHA that is in the clone but not on main", () => {
    const { status, output } = deploy(sideSha);

    expect(status).toBe(1);
    expect(output).toContain("not on origin/main");
    expect(calls(sb)).not.toContain("sudo");
  });

  it("fetches main, checks the commit out detached and hands it to apply", () => {
    sb.env.APPLY = join(sb.root, "bin", "apply");

    const { status } = deploy(shaMain);

    expect(status).toBe(0);
    expect(calls(sb)).toContain(`sudo -n ${sb.env.APPLY} ${shaMain}`);
    expect(calls(sb)).toContain(`apply ${shaMain}`);
    expect(git(clone, "rev-parse", "HEAD")).toBe(shaMain);
    expect(git(clone, "branch", "--show-current")).toBe("");
  });

  it("ignores a git config file in the service user's home, even one inside the clone", () => {
    // Worst case for a home inside the clone: a ~/.gitconfig that main (or anyone with write access) controls.
    const marker = join(sb.root, "fsmonitor-ran");
    writeFileSync(
      join(clone, ".gitconfig"),
      `[core]\n\tfsmonitor = touch ${marker}; echo\n`,
    );
    sb.env.APPLY = join(sb.root, "bin", "apply");

    const { status } = deploy(shaMain, { HOME: clone });

    expect(status).toBe(0);
    expect(existsSync(marker)).toBe(false);
  });

  it("exits with the failure status of apply", () => {
    sb.env.APPLY = join(sb.root, "bin", "apply");
    writeFileSync(join(sb.stub, "apply-status"), "1");

    expect(deploy(shaMain).status).toBe(1);
  });

  it("deploys end to end: the new release is running and recorded", () => {
    const { status, output } = deploy(shaMain);

    expect(status).toBe(0);
    expect(output).toContain(`done: running ${shaMain}`);
    expect(current(sb)).toBe(shaMain);
    expect(running(sb)).toBe(shaMain);
  });
});
