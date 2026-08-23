import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "portfolio-data.js");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(dataPath, "utf8"), context, { filename: dataPath });

const stageOrder = ["final", "alternate-final", "video", "turntable", "texture-lookdev", "process", "wip"];
const projectMetadata = {
  "dont-fret": { roles: ["3D Character Artist"], gameCredit: true },
  "dead-by-daylight-charm": { collaborators: ["Kobo — texturing"], roles: ["Modeling"], categories: ["Character Art", "Prop"] },
  "amazing-digital-circus-ghostlike": { client: "Ghostlike", roles: ["3D Character Modeling"], categories: ["Character Art", "Commission"] },
  "color-simulator": { roles: ["Creator", "Developer"], categories: ["Game Development", "3D Assets"], gameCredit: true },
  "xanniban": { roles: ["3D Character Artist"], categories: ["Character Art", "Game Development"], gameCredit: true },
  "little-nightmares-shes-here": { client: "Rockit Music", roles: ["3D Character Modeling", "Scene Assembly"], categories: ["Character Art", "Scene"] },
  "sprunki-variants-rockit": { client: "Rockit Music", roles: ["3D Character Modeling"], categories: ["Character Art"] },
  "rainbow-friends-characters-fabvl": { client: "FABVL", roles: ["3D Character Modeling"], categories: ["Character Art", "Commission"] },
  "rainbow-friends-environments-rockit": { client: "Rockit Music", roles: ["Environment Art"], categories: ["Environment"] },
  "resident-evil-character-rockit": { client: "Rockit Music", roles: ["3D Character Modeling"], categories: ["Character Art"] },
  "doors-models-environments-rockit": { client: "Rockit Music", roles: ["3D Character Modeling", "Environment Art"], categories: ["Character Art", "Environment"] },
  "bendy-models-rockit": { client: "Rockit Music", roles: ["3D Character Modeling"], categories: ["Character Art"] },
  "poppy-playtime-environment-rockit": { client: "Rockit Music", roles: ["Environment Art"], categories: ["Environment"] },
  "saber-simulator-toy-set": { roles: ["Pet Artist"], categories: ["Character Art", "Game Production"], gameCredit: true },
  "saber-simulator-core-rarity-set": { roles: ["Pet Artist"], categories: ["Character Art", "Game Production"], gameCredit: true },
  "saber-simulator-themed-pets": { roles: ["Pet Artist"], categories: ["Character Art", "Game Production"], gameCredit: true },
};
const items = context.window.portfolioItems.map((project) => {
  const media = project.media
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftRank = stageOrder.indexOf(left.entry.stage);
      const rightRank = stageOrder.indexOf(right.entry.stage);
      return (leftRank < 0 ? stageOrder.length : leftRank) - (rightRank < 0 ? stageOrder.length : rightRank) || left.index - right.index;
    })
    .map(({ entry }) => entry);

  const year = String(project.dateLabel || "").match(/\b(?:19|20)\d{2}\b/)?.[0] || "";
  const explicitMonth = /^January /.test(project.dateLabel || "") ? "01" : /^October /.test(project.dateLabel || "") ? "10" : "";
  const metadata = projectMetadata[project.slug] || {};

  return {
    ...project,
    year,
    sortDate: year ? `${year}${explicitMonth ? `-${explicitMonth}` : ""}` : "",
    description: project.text || "",
    client: "",
    collaborators: [],
    roles: [],
    tags: [],
    categories: [],
    gameCredit: false,
    ...metadata,
    media,
    thumbnail: media[0].poster || media[0].src,
    cover: media[0].poster || media[0].src,
  };
}).sort((left, right) => Number(right.sortOrder || 0) - Number(left.sortOrder || 0));

items.forEach((project) => project.media.forEach((entry, index) => { entry.order = index + 1; }));
const credits = context.window.portfolioCredits || [];
const revision = context.window.PORTFOLIO_DATA_REVISION;
const output = [
  "// Canonical public portfolio data. Reconciled against the repository and source archive on 2026-08-23.",
  "// Media order is deliberate: strongest final first, then alternate finals, videos, look development, process, and WIPs.",
  `window.PORTFOLIO_DATA_REVISION = ${JSON.stringify(revision)};`,
  `window.portfolioItems = ${JSON.stringify(items, null, 2)};`,
  `window.portfolioCredits = ${JSON.stringify(credits, null, 2)};`,
  "",
].join("\n");

fs.writeFileSync(dataPath, output, "utf8");
console.log(`Normalized ${items.length} project covers and stage order.`);
