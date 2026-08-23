import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : "";
};
const outputPath = valueAfter("--output");
const auditDir = valueAfter("--audit-dir");
const baseUrl = valueAfter("--base-url").replace(/\/$/, "");
const mediaExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".mp4", ".webm"]);
const videoExtensions = new Set([".mp4", ".webm"]);
const stageOrder = ["final", "alternate-final", "video", "turntable", "texture-lookdev", "process", "wip"];
const results = [];
const brokenAssets = [];
const unresolved = [];

function check(name, failures, note = "") {
  results.push({ name, passed: failures.length === 0, failures, note });
}

function normalizeRelative(value) {
  return decodeURIComponent(String(value || "").split("?")[0].split("#")[0])
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");
}

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function listFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function readData() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "portfolio-data.js"), "utf8"), context, { filename: "portfolio-data.js" });
  return {
    projects: context.window.portfolioItems || [],
    credits: context.window.portfolioCredits || [],
    revision: context.window.PORTFOLIO_DATA_REVISION || "",
  };
}

function projectBySlug(projects, slug) {
  return projects.find((project) => project.slug === slug);
}

async function validateHttpLinks(localReferences) {
  if (!baseUrl) return { failures: [], note: "Skipped until --base-url is supplied." };
  const failures = [];
  const paths = [...new Set(localReferences)].filter(Boolean);
  for (const relative of paths) {
    const url = `${baseUrl}/${relative.split("/").map(encodeURIComponent).join("/")}`;
    try {
      const response = await fetch(url, { method: "GET", redirect: "follow" });
      if (!response.ok) failures.push(`${response.status} ${relative}`);
      await response.body?.cancel();
    } catch (error) {
      failures.push(`${relative}: ${error.message}`);
    }
  }
  return { failures, note: `Checked ${paths.length} deployed pages and assets against ${baseUrl}.` };
}

const data = readData();
const projects = data.projects;
const credits = data.credits;
const allMedia = projects.flatMap((project) => (project.media || []).map((media) => ({ project, media })));
const localMedia = allMedia.filter(({ media }) => !/^https?:\/\//i.test(media.src || ""));
const referencedPaths = new Set(localMedia.flatMap(({ media }) => [media.src, media.poster].filter(Boolean).map(normalizeRelative)));
const localReferences = [...referencedPaths, "index.html", "portfolio.html", "about.html", "dont-fret.html", "shop.html", "portfolio-v3.js", "portfolio-data.js", "portfolio-loader.js", "site-v2.css"];

check("01 canonical data loads", projects.length ? [] : ["portfolioItems is empty"], `${projects.length} projects; revision ${data.revision || "missing"}.`);

check("02 required project fields", projects.flatMap((project, index) => {
  const missing = ["id", "slug", "title", "dateLabel"].filter((field) => !String(project[field] || "").trim());
  const normalizedFields = ["year", "sortDate", "description", "client", "collaborators", "roles", "tags", "categories", "featured", "gameCredit", "cover"];
  normalizedFields.forEach((field) => {
    if (!Object.hasOwn(project, field)) missing.push(field);
  });
  if (!Array.isArray(project.media) || !project.media.length) missing.push("media");
  return missing.length ? [`Project ${index + 1}: ${missing.join(", ")}`] : [];
}));

const ids = projects.map((project) => project.id);
const slugs = projects.map((project) => project.slug);
check("03 unique stable ids and slugs", [
  ...ids.filter((id, index) => ids.indexOf(id) !== index).map((id) => `Duplicate id: ${id}`),
  ...slugs.filter((slug, index) => slugs.indexOf(slug) !== index).map((slug) => `Duplicate slug: ${slug}`),
]);

check("04 newest-first chronology", projects.flatMap((project, index) => index && Number(project.sortOrder) > Number(projects[index - 1].sortOrder)
  ? [`${project.title} (${project.sortOrder}) appears after lower sort order ${projects[index - 1].sortOrder}`]
  : []));

check("05 cover exists and belongs to project", projects.flatMap((project) => {
  const cover = normalizeRelative(project.thumbnail);
  const member = (project.media || []).some((media) => normalizeRelative(media.src) === cover || normalizeRelative(media.poster) === cover);
  const exists = cover && fs.existsSync(path.join(root, cover));
  return [!member ? `${project.title}: cover is not a media member` : "", !exists ? `${project.title}: missing cover ${cover}` : ""].filter(Boolean);
}));

check("06 every local media file resolves", localMedia.flatMap(({ project, media }) => {
  const paths = [media.src, media.poster].filter(Boolean).map(normalizeRelative);
  return paths.filter((relative) => !fs.existsSync(path.join(root, relative))).map((relative) => {
    brokenAssets.push({ project: project.title, path: relative });
    return `${project.title}: ${relative}`;
  });
}));

check("07 canonical stage taxonomy", allMedia.flatMap(({ project, media }) => stageOrder.includes(media.stage)
  ? []
  : [`${project.title}: ${media.src} has stage ${media.stage || "missing"}`]));

check("08 deliberate stage ordering", projects.flatMap((project) => {
  const ranks = project.media.map((media) => stageOrder.indexOf(media.stage));
  const failures = [];
  if (ranks.some((rank, index) => index && rank < ranks[index - 1])) failures.push(`${project.title}: media stages are out of order`);
  if (project.media.some((media, index) => media.order !== index + 1)) failures.push(`${project.title}: media order fields are not sequential`);
  return failures;
}));

const sourceOwners = new Map();
for (const { project, media } of localMedia) {
  const source = normalizeRelative(media.src);
  if (!sourceOwners.has(source)) sourceOwners.set(source, new Set());
  sourceOwners.get(source).add(project.slug);
}
check("09 no media reused across projects", [...sourceOwners.entries()].filter(([, owners]) => owners.size > 1).map(([source, owners]) => `${source}: ${[...owners].join(", ")}`));

const hashes = new Map();
for (const source of referencedPaths) {
  const filePath = path.join(root, source);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).size) continue;
  const hash = hashFile(filePath);
  if (!hashes.has(hash)) hashes.set(hash, []);
  hashes.get(hash).push(source);
}
const exactDuplicates = [...hashes.values()].filter((group) => group.length > 1);
check("10 no exact duplicate content in public media", exactDuplicates.map((group) => group.join(" = ")));

check("11 supported public video formats", allMedia.flatMap(({ project, media }) => media.type === "video" && !videoExtensions.has(path.extname(normalizeRelative(media.src)).toLowerCase())
  ? [`${project.title}: ${media.src}`]
  : []));

check("12 every video has a real poster", allMedia.flatMap(({ project, media }) => {
  if (media.type !== "video") return [];
  const poster = normalizeRelative(media.poster);
  return !poster || !fs.existsSync(path.join(root, poster)) || !fs.statSync(path.join(root, poster)).size
    ? [`${project.title}: ${media.src}`]
    : [];
}));

const corrections = [];
const adc = projectBySlug(projects, "amazing-digital-circus-ghostlike");
if (!adc || adc.dateLabel !== "January 2026" || !/Ghostlike/.test(`${adc.title} ${adc.text}`) || /GLITCH Productions/i.test(adc.credit || "")) corrections.push("Amazing Digital Circus date/client correction missing");
const tenna = projectBySlug(projects, "tenna-study");
if (!tenna || tenna.dateLabel === "2023" || !tenna.media.some((entry) => entry.src === "ten.png")) corrections.push("Tenna year/process correction missing");
const pumpkin = projectBySlug(projects, "halloween-pumpkin");
if (!pumpkin || pumpkin.dateLabel !== "October 2025") corrections.push("Pumpkin date correction missing");
const karl = projectBySlug(projects, "billy-butcher-karl-urban-likeness");
if (!karl || karl.media.some((entry) => /musub/i.test(entry.src)) || karl.media.length !== 1) corrections.push("Billy Butcher / Karl Urban media isolation missing");
const imu = projectBySlug(projects, "imu");
if (!imu || !imu.media.some((entry) => /musub/i.test(entry.src))) corrections.push("Imu Substance Painter media missing");
if (allMedia.some(({ media }) => /alien_close/i.test(media.src))) corrections.push("Failed alien capture remains public");
const charm = projectBySlug(projects, "dead-by-daylight-charm");
if (!charm || !/Modeling by Jack Sockwell\. Texturing by Kobo\./.test(charm.credit || "")) corrections.push("Dead by Daylight charm credit is inaccurate");
if (projects.some((project) => /^saber-simulator/.test(project.slug) && /saber_toys_group/.test(project.thumbnail))) corrections.push("Saber contact sheet is still a cover");
const rainbowEnvironments = projectBySlug(projects, "rainbow-friends-environments-rockit");
if (!rainbowEnvironments || !rainbowEnvironments.media.some((entry) => entry.src === "ghtr.png") || projects.some((project) => project.slug === "stylized-interior-environment")) corrections.push("Rainbow Friends room environment is not grouped correctly");
check("13 named reconciliation corrections", corrections);

const creditTitles = new Set(credits.map((item) => item.title));
check("14 required game credits", ["Don't Fret", "Saber Simulator", "Color Simulator", "XANNIBAN"].filter((title) => !creditTitles.has(title)).map((title) => `Missing credit: ${title}`));

const publicPages = ["index.html", "portfolio.html", "about.html", "dont-fret.html", "shop.html"];
const pageText = Object.fromEntries(publicPages.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
check("15 global branding and homepage curation", [
  ...publicPages.filter((file) => !pageText[file].includes("JSICON_500x500.png")).map((file) => `${file}: real header icon missing`),
  ...publicPages.filter((file) => !pageText[file].includes("3D Generalist / Game Dev")).map((file) => `${file}: subtitle missing`),
  /sprunki|tenna|springtrap/i.test(pageText["index.html"]) ? "Homepage contains excluded front-page projects" : "",
  !/featured-2026-ywach\.webp/.test(pageText["about.html"]) ? "About page is not using Yhwach" : "",
].filter(Boolean));

const portfolioHtml = pageText["portfolio.html"];
const portfolioScript = fs.readFileSync(path.join(root, "portfolio-v3.js"), "utf8");
check("16 All Work default and WIP route", [
  !/data-portfolio-v3-view="all"[^>]*is-active|class="portfolio-tab is-active"[^>]*data-portfolio-v3-view="all"/.test(portfolioHtml) ? "All Work tab is not initially active" : "",
  !/"all", "artwork", "wips", "resume"/.test(portfolioScript) ? "Expected portfolio views missing" : "",
  !/location\.hash/.test(portfolioScript) ? "Hash routing missing" : "",
].filter(Boolean));

check("17 project viewer always opens on All", [/state\.activeStage = "all";\s*state\.lastTrigger/.test(portfolioScript) ? "" : "openProject does not reset the stage filter to All"].filter(Boolean));

const manifest = JSON.parse(fs.readFileSync(path.join(root, "portfolio-asset-manifest.json"), "utf8"));
const classified = new Set([
  ...referencedPaths,
  ...manifest.siteAssets.map((entry) => normalizeRelative(entry.path)),
  ...manifest.excluded.map((entry) => normalizeRelative(entry.path)),
]);
const repoMedia = listFiles(root)
  .filter((file) => mediaExtensions.has(path.extname(file).toLowerCase()))
  .map((file) => normalizeRelative(path.relative(root, file)));
check("18 every repository media file is classified", repoMedia.filter((relative) => !classified.has(relative)));

const localLinkFailures = [];
for (const [file, html] of Object.entries(pageText)) {
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const raw = match[1];
    if (!raw || /^(?:https?:|mailto:|#|data:)/i.test(raw)) continue;
    const relative = normalizeRelative(raw);
    if (!relative || !fs.existsSync(path.join(root, relative))) localLinkFailures.push(`${file}: ${raw}`);
  }
}
check("19 local page links and assets resolve", localLinkFailures);

for (const project of projects) {
  if (/unresolved/i.test(project.dateLabel || "")) unresolved.push({ id: project.id, field: "dateLabel", value: project.dateLabel });
}
const liveCheck = await validateHttpLinks(localReferences);
check("20 deployed HTTP assets resolve", liveCheck.failures, liveCheck.note);

let possibleNearDuplicates = [];
if (auditDir) {
  const csvPath = path.join(auditDir, "near-duplicates.csv");
  if (fs.existsSync(csvPath)) {
    possibleNearDuplicates = fs.readFileSync(csvPath, "utf8").trim().split(/\r?\n/).slice(1);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    checks: results.length,
    projects: projects.length,
    media: allMedia.length,
    images: allMedia.filter(({ media }) => media.type === "image").length,
    videos: allMedia.filter(({ media }) => media.type === "video").length,
    featuredProjects: projects.filter((project) => project.featured).length,
    processProjects: projects.filter((project) => project.media.some((media) => ["texture-lookdev", "process", "wip"].includes(media.stage))).length,
    credits: credits.length,
  },
  checks: results,
  lists: {
    brokenAssets,
    exactDuplicates,
    possibleNearDuplicates,
    unresolved,
  },
};

const rendered = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) fs.writeFileSync(path.resolve(outputPath), rendered, "utf8");
process.stdout.write(rendered);
process.exitCode = report.summary.failed ? 1 : 0;
