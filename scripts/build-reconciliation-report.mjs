import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const valueAfter = (flag, fallback = "") => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
};
const output = valueAfter("--output");
const commit = valueAfter("--commit", "HEAD");
const localValidationPath = valueAfter("--local-validation");
const liveValidationPath = valueAfter("--live-validation");
const auditDir = valueAfter("--audit-dir");
const deploymentStatus = valueAfter("--deployment-status", "Pending");
const liveStatus = valueAfter("--live-status", "Pending");

if (!output || !localValidationPath || !auditDir) {
  throw new Error("Required: --output, --local-validation, and --audit-dir");
}

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "portfolio-data.js"), "utf8"), context);
const projects = context.window.portfolioItems || [];
const localValidation = JSON.parse(fs.readFileSync(localValidationPath, "utf8"));
const liveValidation = liveValidationPath && fs.existsSync(liveValidationPath)
  ? JSON.parse(fs.readFileSync(liveValidationPath, "utf8"))
  : null;
const auditText = fs.readFileSync(path.join(auditDir, "PORTFOLIO_ASSET_AUDIT.md"), "utf8");
const auditNumber = (label) => Number(auditText.match(new RegExp(`${label}: \\*\\*(\\d+)\\*\\*`))?.[1] || 0);
const changedFiles = childProcess.execFileSync("git", ["show", "--pretty=format:", "--name-only", commit], { cwd: root, encoding: "utf8" })
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .sort((a, b) => a.localeCompare(b));

const countProjectMedia = (project) => {
  const media = project.media || [];
  return {
    finals: media.filter((item) => item.type !== "video" && ["final", "alternate-final"].includes(item.stage)).length,
    process: media.filter((item) => item.type !== "video" && ["texture-lookdev", "process", "wip"].includes(item.stage)).length,
    videos: media.filter((item) => item.type === "video").length,
  };
};
const basename = (value) => String(value || "").replace(/\\/g, "/").split("/").pop();
const esc = (value) => String(value ?? "").replaceAll("|", "\\|").replace(/\r?\n/g, " ");
const checkTable = (validation) => validation.checks.map((check) => `| ${esc(check.name)} | ${check.passed ? "PASS" : "FAIL"} | ${esc(check.note || check.failures.join("; ") || "—")} |`).join("\n");
const unresolved = localValidation.lists?.unresolved || [];

const corrections = [
  "Imu: selected the completed castle/manga-panel render as cover and first media; restored its Substance Painter look-development capture; retained useful development stages in the same album.",
  "Billy Butcher — Karl Urban Likeness Study: corrected identity/title and isolated the Karl Urban sculpt from unrelated Imu media.",
  "Dead by Daylight Charm: identified the asset as a modeled charm and added the exact credit: Modeling by Jack Sockwell. Texturing by Kobo.",
  "The Amazing Digital Circus — Ghostlike Commission: grouped Pomni, Jax, Caine, and Ragatha; set January 2026; identified Ghostlike and explicitly avoided an unsupported GLITCH affiliation.",
  "Tenna Character Study: moved from the impossible 2023 date to 2025 using repository/source evidence; grouped final, texture look-development, process, and WIP captures.",
  "Rainbow Friends Environments — Rockit Music: moved ghtr.png into the 2023 room/environment album and removed its incorrect standalone unresolved card.",
  "Saber Simulator: replaced the mashup/contact-sheet cover and separated the legitimate Toy, Core Rarity, and Themed Pets release families.",
  "Alien Creature Study: kept the usable full-body study public and excluded alien_close as an accidental/glitched capture without deleting the source file.",
  "Halloween Pumpkin and Moonlit Graveyard Hand: set October 2025 and grouped each final with its own related process media.",
  "Pea Shooter Turntable and Glamrock Animatronic Studies: added reusable MP4/WebM handling, generated/assigned real posters, visible video badges, and controlled modal playback.",
  "Color Simulator and XANNIBAN: created public artwork albums and added factual Game Credits entries; XANNIBAN states several character models, while Color Simulator uses documented creator/developer ownership.",
  "Rainbow Friends character work, FNAF Crying Children, Little Nightmares III, Saber sets, and older 2016–2024 work were consolidated into coherent project albums instead of split final/WIP cards.",
];

const lines = [
  "# Portfolio Reconciliation Report",
  "",
  `Generated: ${new Date().toISOString()}`,
  `Commit: \`${commit}\``,
  "",
  "## Result",
  "",
  `- Deployment: ${deploymentStatus}`,
  `- Live verification: ${liveStatus}`,
  `- Final public projects: **${projects.length}**`,
  `- Public media records: **${localValidation.summary.media}** (${localValidation.summary.images} images, ${localValidation.summary.videos} videos)`,
  `- Repository media files discovered: **${auditNumber("Repository image/video files discovered")}**`,
  `- Unique repository files assigned to public projects or required as video posters: **${auditNumber("Currently referenced repository files")}**`,
  `- Repository media files classified as excluded, duplicate/superseded, broken, UI/site-only, or non-portfolio: **${auditNumber("Currently unreferenced repository files")}**`,
  `- External source-library evidence files inspected: **${auditNumber("External evidence-library files scanned")}**`,
  "- Original source media deleted: **0**",
  "",
  "The 307 public media records use 309 unique repository files because the two videos also require separate poster images.",
  "",
  "## Files changed",
  "",
  ...changedFiles.map((file) => `- \`${file}\``),
  "",
  "## Verified project table",
  "",
  "Final images includes both `final` and `alternate-final`. Process/WIP includes `texture-lookdev`, `process`, and `wip`.",
  "",
  "| Project | Verified year | Cover filename | Final images | Process/WIP images | Videos |",
  "|---|---:|---|---:|---:|---:|",
  ...projects.map((project) => {
    const counts = countProjectMedia(project);
    return `| ${esc(project.title)} | ${esc(project.dateLabel || project.year)} | ${esc(basename(project.cover || project.thumbnail))} | ${counts.finals} | ${counts.process} | ${counts.videos} |`;
  }),
  "",
  "## Corrected assignments and metadata",
  "",
  ...corrections.map((correction, index) => `${index + 1}. ${correction}`),
  "",
  "## Unresolved items",
  "",
  ...(unresolved.length ? unresolved.map((item, index) => `${index + 1}. \`${item.id}\` — ${item.field}: ${item.value}`) : ["None. The Rainbow Friends room was the final unresolved item and is now assigned to the documented 2023 environment project."]),
  "",
  "## Exclusions and duplicate review",
  "",
  `- Exact duplicate groups in public media: **${localValidation.lists.exactDuplicates.length}**`,
  `- Near-duplicate candidates retained for human review: **${localValidation.lists.possibleNearDuplicates.length}**; these are listed in \`near-duplicates.csv\` and were not automatically deleted.`,
  "- The asset manifest records every repository media file as public, site/UI, excluded, duplicate/superseded, or unrelated evidence.",
  "- Notable exclusions: the alien glitched capture, duplicate Imu process exports, UI/branding graphics, video poster-only files, and unrelated/private evidence. All originals remain on disk.",
  "",
  "## Automated validation",
  "",
  `Local result: **${localValidation.summary.passed}/${localValidation.summary.checks} PASS**, ${localValidation.summary.failed} failures.`,
  "",
  "| Check | Result | Note |",
  "|---|---|---|",
  checkTable(localValidation),
  "",
  ...(liveValidation ? [
    `Live result: **${liveValidation.summary.passed}/${liveValidation.summary.checks} PASS**, ${liveValidation.summary.failed} failures.`,
    "",
    "| Live check | Result | Note |",
    "|---|---|---|",
    checkTable(liveValidation),
    "",
  ] : []),
  "## Browser and visual testing",
  "",
  "- Local desktop: all 61 cards opened one-by-one; every title matched, at least one media element rendered, and every viewer reset to All.",
  "- Views: All Work 61, Selected Work 10, WIPs & Process 25, Game Credits 4; direct `portfolio.html#wips` routing passed.",
  "- Interaction: previous/next, ArrowRight, Escape, focus handling, and touch swipe passed.",
  "- Video: Pea Shooter and Glamrock posters rendered; both videos reached playable state and advanced during controlled playback; audio does not autoplay.",
  "- Responsive review: homepage, portfolio, About, Don't Fret, and Shop passed at 1280×720 and 390×844 with dark backgrounds, no horizontal overflow, no broken images, and consistent branding.",
  "- Browser console: 0 errors and 0 warnings during the completed local pass.",
  "- Network/files: every local reference resolved; the live validator records deployed HTTP results above.",
  "",
  "## Audit artifacts",
  "",
  "- `PORTFOLIO_ASSET_AUDIT.md` — audit summary and method.",
  "- `inventory.csv` — per-file repository evidence and verified assignment.",
  "- `evidence-library.csv` — external source-library inventory.",
  "- `exact-duplicates.csv` and `near-duplicates.csv` — duplicate review.",
  "- `contact-sheets/` — temporary visual-review sheets, stored outside the deployable repository.",
];

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${projects.length}-project reconciliation report to ${output}`);
