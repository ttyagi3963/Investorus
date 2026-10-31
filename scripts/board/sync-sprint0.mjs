#!/usr/bin/env node
// Mirror the Sprint 0 tasks from tasks.md onto the GitHub Projects board (T228).
//
// tasks.md is the single source of truth. This script only creates or updates GitHub items
// to match it, and is safe to re-run: existing issues are found by their "T### " title prefix.
//
// Prerequisites (once):
//   winget install --id GitHub.cli        # then open a new terminal
//   gh auth login                         # GitHub.com, HTTPS, sign in with the browser
//   gh auth refresh -s project            # lets gh manage Projects
//
// Usage (from the repo root):
//   node scripts/board/sync-sprint0.mjs --print-tasks      # parse tasks.md only (no gh needed)
//   node scripts/board/sync-sprint0.mjs                    # dry run: prints what it would do
//   node scripts/board/sync-sprint0.mjs --apply            # creates the board, labels, issues
//   node scripts/board/sync-sprint0.mjs --test-workflows   # checks auto-add and closed -> Done
//
// The board is created private (the GitHub default). The repo is private too, because the
// specs describe Clever's confidential scenario.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TASKS_FILE = "specs/001-investor-platform-prototype/tasks.md";
const PROJECT_TITLE = "Investorus";
const STATUS_OPTIONS = [
  { name: "Backlog", color: "GRAY", description: "Not ready to start" },
  { name: "Ready", color: "BLUE", description: "Dependencies done; can start" },
  { name: "In progress", color: "YELLOW", description: "Being worked on" },
  { name: "In review", color: "PURPLE", description: "PR open" },
  { name: "Done", color: "GREEN", description: "Merged or closed" },
];
const CUSTOM_FIELDS = [
  { name: "Task ID", type: "TEXT" },
  { name: "Sprint", type: "SINGLE_SELECT", options: ["Sprint 0", "Sprint 1", "Sprint 2"] },
  { name: "Phase", type: "TEXT" },
  { name: "User story", type: "TEXT" },
  { name: "Parallel", type: "SINGLE_SELECT", options: ["Yes", "No"] },
];
const LABELS = [
  { name: "task", color: "c5def5", description: "Mirrors a task in tasks.md" },
  { name: "sprint-0", color: "5319e7", description: "Sprint 0: delivery pipeline" },
  {
    name: "parallel",
    color: "0e8a16",
    description: "[P] in tasks.md: no dependency on unfinished tasks",
  },
  {
    name: "board-test",
    color: "ededed",
    description: "Throwaway issue for checking board workflows",
  },
];

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const TEST = args.has("--test-workflows");
const tmp = mkdtempSync(join(tmpdir(), "board-"));

// ---------- gh helpers ----------

function gh(argv, { json = false, allowFail = false } = {}) {
  try {
    const out = execFileSync("gh", argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return json ? JSON.parse(out) : out.trim();
  } catch (err) {
    if (allowFail) return null;
    const msg = (err.stderr || err.message || "").toString().trim();
    throw new Error(`gh ${argv.join(" ")}\n${msg}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function repoFromRemote() {
  const url = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim();
  const m = url.match(/github\.com[/:]([^/]+)\/([^/.]+)(\.git)?$/);
  if (!m) throw new Error(`origin is not a GitHub URL: ${url}`);
  return { owner: m[1], name: m[2], full: `${m[1]}/${m[2]}` };
}

// ---------- tasks.md parsing ----------

function parseSprint0(markdown) {
  const start = markdown.indexOf("## Sprint 0");
  if (start < 0) throw new Error(`No "## Sprint 0" section in ${TASKS_FILE}`);
  const end = markdown.indexOf("\n---\n", start);
  const lines = markdown.slice(start, end < 0 ? undefined : end).split("\n");

  const tasks = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(/^- \[([ xX])\] (T\d{3}) (\[P\] )?(.*)$/);
    if (m) {
      current = { done: m[1] !== " ", id: m[2], parallel: Boolean(m[3]), lines: [m[4]] };
      tasks.push(current);
    } else if (current && line.startsWith("  ")) {
      current.lines.push(line.slice(2));
    } else {
      current = null;
    }
  }
  return tasks.map((t) => {
    // Short title: the task text up to its first ":", " (", " in ", or ", ".
    const whole = t.lines.join(" ").replace(/\*\*|`/g, "");
    const cuts = [":", " (", " in ", ", "].map((s) => whole.indexOf(s)).filter((i) => i > 10);
    const summary = whole.slice(0, Math.min(...cuts, 80)).trim();
    const depends = (t.lines.join(" ").match(/\(depends on ([^)]*)\)/) || [])[1] || "";
    return { ...t, title: `${t.id} ${summary}`, text: t.lines.join("\n"), depends };
  });
}

function issueBody(task) {
  return [
    `**${task.id}** (Sprint 0${task.parallel ? ", parallel" : ""})`,
    "",
    "- [" + (task.done ? "x" : " ") + "] " + task.text,
    "",
    task.depends ? `Depends on: ${task.depends}` : "",
    "",
    "---",
    `Source of truth: \`${TASKS_FILE}\`, section "Sprint 0". Change the task there and re-run`,
    "`node scripts/board/sync-sprint0.mjs --apply`; this issue mirrors it.",
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
}

// ---------- project setup ----------

function findOrCreateProject(owner) {
  const list = gh(["project", "list", "--owner", owner, "--format", "json", "--limit", "100"], {
    json: true,
  });
  const found = list.projects.find((p) => p.title === PROJECT_TITLE);
  if (found) return found;
  console.log(`+ create private project "${PROJECT_TITLE}"`);
  if (!APPLY) return { number: "<new>", id: "<new>", url: "<new>" };
  return gh(["project", "create", "--owner", owner, "--title", PROJECT_TITLE, "--format", "json"], {
    json: true,
  });
}

function fieldList(project, owner) {
  if (!APPLY && project.number === "<new>") return [];
  return gh(
    [
      "project",
      "field-list",
      String(project.number),
      "--owner",
      owner,
      "--format",
      "json",
      "--limit",
      "50",
    ],
    {
      json: true,
    },
  ).fields;
}

function ensureStatusOptions(project, owner) {
  const status = fieldList(project, owner).find((f) => f.name === "Status");
  const have = status?.options?.map((o) => o.name) ?? [];
  const want = STATUS_OPTIONS.map((o) => o.name);
  if (want.every((n) => have.includes(n))) return;
  console.log(`~ set Status columns to: ${want.join(", ")} (was: ${have.join(", ") || "none"})`);
  if (!APPLY) return;
  const opts = STATUS_OPTIONS.map(
    (o) =>
      `{name: ${JSON.stringify(o.name)}, color: ${o.color}, description: ${JSON.stringify(o.description)}}`,
  ).join(", ");
  const query = `mutation { updateProjectV2Field(input: {fieldId: ${JSON.stringify(status.id)}, singleSelectOptions: [${opts}]}) { projectV2Field { ... on ProjectV2SingleSelectField { id } } } }`;
  const ok = gh(["api", "graphql", "-f", `query=${query}`], { allowFail: true });
  if (!ok) {
    console.warn(
      "! Could not change the Status options through the API. On the board, open the Status field\n" +
        `  settings and make the options exactly: ${want.join(", ")}. Then re-run with --apply.`,
    );
  }
}

function ensureCustomFields(project, owner) {
  const existing = new Set(fieldList(project, owner).map((f) => f.name));
  for (const f of CUSTOM_FIELDS) {
    if (existing.has(f.name)) continue;
    console.log(`+ field "${f.name}" (${f.type})`);
    if (!APPLY) continue;
    const argv = [
      "project",
      "field-create",
      String(project.number),
      "--owner",
      owner,
      "--name",
      f.name,
      "--data-type",
      f.type,
    ];
    if (f.options) argv.push("--single-select-options", f.options.join(","));
    gh(argv);
  }
}

function ensureLabels(repo) {
  for (const l of LABELS) {
    console.log(`= label ${l.name}`);
    if (APPLY)
      gh([
        "label",
        "create",
        l.name,
        "--repo",
        repo.full,
        "--color",
        l.color,
        "--description",
        l.description,
        "--force",
      ]);
  }
}

// ---------- issues and items ----------

// Listed once, not searched: GitHub search lags behind new issues, which would let a quick
// re-run create duplicates.
let issueCache = null;
function findIssue(repo, taskId) {
  issueCache ??= gh(
    [
      "issue",
      "list",
      "--repo",
      repo.full,
      "--state",
      "all",
      "--label",
      "task",
      "--json",
      "number,title,url,state",
      "--limit",
      "1000",
    ],
    { json: true },
  );
  return issueCache.find((i) => i.title.startsWith(`${taskId} `)) || null;
}

function upsertIssue(repo, task) {
  const bodyFile = join(tmp, `${task.id}.md`);
  writeFileSync(bodyFile, issueBody(task));
  const labels = ["task", "sprint-0", ...(task.parallel ? ["parallel"] : [])];
  const existing = findIssue(repo, task.id);

  if (!existing) {
    console.log(
      `+ issue "${task.title}" [${labels.join(", ")}]${task.done ? " (closed: done in tasks.md)" : ""}`,
    );
    if (!APPLY) return null;
    const argv = [
      "issue",
      "create",
      "--repo",
      repo.full,
      "--title",
      task.title,
      "--body-file",
      bodyFile,
    ];
    for (const l of labels) argv.push("--label", l);
    const url = gh(argv).split("\n").pop();
    if (task.done) gh(["issue", "close", url, "--repo", repo.full, "--reason", "completed"]);
    return url;
  }

  console.log(`~ issue #${existing.number} "${task.title}" (update body, title, labels, state)`);
  if (!APPLY) return existing.url;
  const argv = [
    "issue",
    "edit",
    String(existing.number),
    "--repo",
    repo.full,
    "--title",
    task.title,
    "--body-file",
    bodyFile,
  ];
  for (const l of labels) argv.push("--add-label", l);
  gh(argv);
  if (task.done && existing.state === "OPEN")
    gh(["issue", "close", String(existing.number), "--repo", repo.full, "--reason", "completed"]);
  if (!task.done && existing.state === "CLOSED")
    gh(["issue", "reopen", String(existing.number), "--repo", repo.full]);
  return existing.url;
}

function setFields(project, owner, itemId, task) {
  const fields = fieldList(project, owner);
  const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
  const edit = (name, value) => {
    const f = byName[name];
    if (!f) return console.warn(`! field "${name}" missing; skipped`);
    const base = [
      "project",
      "item-edit",
      "--id",
      itemId,
      "--project-id",
      project.id,
      "--field-id",
      f.id,
    ];
    if (f.options) {
      const opt = f.options.find((o) => o.name === value);
      if (!opt) return console.warn(`! "${name}" has no option "${value}"; skipped`);
      gh([...base, "--single-select-option-id", opt.id]);
    } else {
      gh([...base, "--text", value]);
    }
  };
  edit("Task ID", task.id);
  edit("Sprint", "Sprint 0");
  edit("Phase", "Sprint 0");
  edit("Parallel", task.parallel ? "Yes" : "No");
  edit("Status", task.done ? "Done" : "Backlog");
}

async function testWorkflows(repo, project, owner) {
  const items = () =>
    gh(
      [
        "project",
        "item-list",
        String(project.number),
        "--owner",
        owner,
        "--format",
        "json",
        "--limit",
        "500",
      ],
      { json: true },
    ).items;
  const waitFor = async (pred, seconds) => {
    for (let s = 0; s < seconds; s += 5) {
      const hit = items().find(pred);
      if (hit) return hit;
      await sleep(5000);
    }
    return null;
  };

  const title = `Board workflow test ${new Date().toISOString().slice(0, 16)} (safe to delete)`;
  console.log(`+ test issue "${title}" (not added by this script, so auto-add must pick it up)`);
  const url = gh([
    "issue",
    "create",
    "--repo",
    repo.full,
    "--title",
    title,
    "--body",
    "Checks the board's auto-add and closed -> Done workflows.",
    "--label",
    "board-test",
  ])
    .split("\n")
    .pop();

  let item = await waitFor((i) => i.content?.url === url, 90);
  if (item) {
    console.log("  ok: auto-add put the new issue on the board");
  } else {
    console.log(
      "  FAIL: auto-add did not pick it up within 90 s (check the Auto-add workflow filter); adding it by hand",
    );
    item = gh(
      [
        "project",
        "item-add",
        String(project.number),
        "--owner",
        owner,
        "--url",
        url,
        "--format",
        "json",
      ],
      { json: true },
    );
  }

  gh(["issue", "close", url, "--repo", repo.full, "--reason", "completed"]);
  const done = await waitFor((i) => i.content?.url === url && i.status === "Done", 90);
  console.log(
    done
      ? "  ok: closing the issue moved its card to Done"
      : '  FAIL: the card did not reach Done within 90 s (check the "Item closed" workflow)',
  );
  return Boolean(item && done);
}

// ---------- main ----------

async function main() {
  if (args.has("--print-tasks")) {
    for (const t of parseSprint0(readFileSync(TASKS_FILE, "utf8"))) {
      console.log(
        `${t.done ? "[done]" : "[open]"} ${t.parallel ? "[P] " : ""}${t.title}${t.depends ? `  (depends on ${t.depends})` : ""}`,
      );
    }
    return;
  }
  const repo = repoFromRemote();
  const scopes = gh(["auth", "status"], { allowFail: true });
  if (scopes === null)
    throw new Error("gh is not signed in. Run: gh auth login, then gh auth refresh -s project");

  const tasks = parseSprint0(readFileSync(TASKS_FILE, "utf8"));
  console.log(
    `${APPLY ? "APPLY" : TEST ? "TEST" : "DRY RUN"}: ${repo.full}, project "${PROJECT_TITLE}", ${tasks.length} Sprint 0 tasks\n`,
  );

  const project = findOrCreateProject(repo.owner);

  if (TEST) {
    if (project.number === "<new>")
      throw new Error(`No project "${PROJECT_TITLE}" yet. Run with --apply first.`);
    const ok = await testWorkflows(repo, project, repo.owner);
    process.exit(ok ? 0 : 1);
  }

  if (APPLY && project.number !== "<new>")
    gh(["project", "link", String(project.number), "--owner", repo.owner, "--repo", repo.full], {
      allowFail: true,
    });
  ensureStatusOptions(project, repo.owner);
  ensureCustomFields(project, repo.owner);
  ensureLabels(repo);

  for (const task of tasks) {
    const url = upsertIssue(repo, task);
    if (!APPLY || !url) continue;
    const item = gh(
      [
        "project",
        "item-add",
        String(project.number),
        "--owner",
        repo.owner,
        "--url",
        url,
        "--format",
        "json",
      ],
      { json: true },
    );
    setFields(project, repo.owner, item.id, task);
  }

  console.log(
    APPLY
      ? `\nDone. Board: ${project.url}\nNext: turn on the built-in workflows (see T228), then run with --test-workflows.`
      : "\nDry run only. Re-run with --apply to make these changes.",
  );
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
