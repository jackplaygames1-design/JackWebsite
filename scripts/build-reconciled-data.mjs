import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "portfolio-data.js");
const archivePath = path.join(root, "portfolio-archive-data.js");
const original = fs.readFileSync(dataPath, "utf8");

if (original.includes("PORTFOLIO_DATA_REVISION")) {
  throw new Error("portfolio-data.js has already been reconciled; refusing to run the one-time migration twice.");
}

const context = { window: {} };
vm.createContext(context);
vm.runInContext(original, context, { filename: dataPath });
vm.runInContext(fs.readFileSync(archivePath, "utf8"), context, { filename: archivePath });

const base = Array.isArray(context.window.portfolioItems) ? context.window.portfolioItems : [];
const archive = Array.isArray(context.window.portfolioArchiveItems) ? context.window.portfolioArchiveItems : [];
const additions = context.window.portfolioMediaAdditions || {};
const source = [...base, ...archive.filter((item) => !base.some((baseItem) => baseItem.title === item.title))];

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";
}

function normalizeMedia(asset, fallbackStage = "final") {
  const item = typeof asset === "string" ? { src: asset } : { ...asset };
  const stageMap = { finished: "final", bts: "process", final: "final", wip: "wip" };
  item.type = item.type === "video" || /\.(mp4|webm)$/i.test(item.src || "") ? "video" : "image";
  item.stage = stageMap[item.stage] || item.stage || fallbackStage;
  item.alt = item.alt || item.caption || "Portfolio artwork by Jack Sockwell";
  if (!item.caption) delete item.caption;
  if (!item.poster) delete item.poster;
  return item;
}

function project(title) {
  const item = source.find((entry) => entry.title === title);
  if (!item) throw new Error(`Missing source project: ${title}`);
  const media = [...(item.media || item.images || []), ...(additions[title] || [])];
  return {
    ...item,
    id: item.slug || slugify(item.title),
    slug: item.slug || slugify(item.title),
    section: item.section === "wips" ? "wips" : "art",
    publicationStatus: "published",
    media: media.map((entry) => normalizeMedia(entry, item.section === "wips" ? "wip" : "final")),
  };
}

function make(title, dateLabel, sortOrder, media, options = {}) {
  const slug = options.slug || slugify(title);
  return {
    id: slug,
    slug,
    section: options.section || "art",
    publicationStatus: "published",
    title,
    text: options.text || "",
    dateLabel,
    sortOrder,
    madeIn: options.madeIn || ["Blender"],
    featured: Boolean(options.featured),
    status: options.status || "",
    link: options.link,
    linkLabel: options.linkLabel,
    thumbnail: options.thumbnail || media[0]?.poster || media[0]?.src || "",
    media: media.map((entry) => normalizeMedia(entry, options.section === "wips" ? "wip" : "final")),
    credit: options.credit,
  };
}

function media(src, alt, stage = "final", caption = "", extra = {}) {
  return { src, alt, stage, ...(caption ? { caption } : {}), ...extra };
}

function reset(item, overrides = {}) {
  const next = { ...item, ...overrides };
  next.id = overrides.slug || next.slug || slugify(next.title);
  next.slug = overrides.slug || next.slug || slugify(next.title);
  next.section = overrides.section || next.section || "art";
  next.featured = Boolean(overrides.featured ?? next.featured);
  next.thumbnail = overrides.thumbnail || next.thumbnail?.src || next.thumbnail || next.media?.[0]?.poster || next.media?.[0]?.src || "";
  next.media = (overrides.media || next.media || []).map((entry) => normalizeMedia(entry, next.section === "wips" ? "wip" : "final"));
  return next;
}

const dontFret = reset(project("Don't Fret"), {
  slug: "dont-fret",
  featured: true,
  sortOrder: 202612,
  status: "Upcoming",
  text: "Featured production work spanning character modeling, sculpting, retopology, optimization, and game-ready delivery for the stylized horror game Don't Fret.",
  link: "dont-fret.html",
  linkLabel: "Open Featured Project",
  thumbnail: "dont-fret-banner.webp",
});

const yhwach = reset(project("Yhwach"), {
  slug: "yhwach",
  featured: true,
  sortOrder: 202611,
  text: "A complete character study developed from blockout and head sculpt through hair, costume, eye effects, look development, and the final graphic presentation.",
});

const imu = reset(project("Imu"), {
  slug: "imu",
  featured: true,
  sortOrder: 202610,
  text: "A stylized Imu character project developed through full-body sculpting, the eye halo and staff, texture look development, and dramatic final presentation.",
  media: [
    ...project("Imu").media.filter((entry) => !["portfolio-assets/2026/imu/imu_sculpt.webp", "portfolio-assets/2026/imu/imu_alt.webp"].includes(entry.src)).map(normalizeMedia),
    media("portfolio-assets/2026/studies/musub.webp", "Imu character shown in Substance 3D Painter", "texture-lookdev", "Substance 3D Painter texture and material pass."),
  ],
});

const charm = reset(project("Charm"), {
  slug: "dead-by-daylight-charm",
  title: "Dead by Daylight Charm",
  featured: true,
  sortOrder: 202609,
  text: "A stylized wooden guitar charm developed from blockout through clean modeling, topology, and final material presentation.",
  credit: "Modeling by Jack Sockwell. Texturing by Kobo.",
});

const digitalCircus = make(
  "The Amazing Digital Circus — Ghostlike Commission",
  "January 2026",
  202601,
  [
    media("portfolio-assets/2026/amazing-digital-circus/pomni.webp", "Pomni character model", "final", "Pomni final model."),
    media("portfolio-assets/2026/amazing-digital-circus/jax.webp", "Jax character model", "final", "Jax final model."),
    media("portfolio-assets/2026/amazing-digital-circus/caine.webp", "Caine character model", "final", "Caine final model."),
    media("portfolio-assets/2026/amazing-digital-circus/ragatha.webp", "Ragatha character model", "final", "Ragatha final model."),
  ],
  {
    slug: "amazing-digital-circus-ghostlike",
    featured: true,
    text: "Four character models commissioned by Ghostlike in January 2026: Pomni, Jax, Caine, and Ragatha. This was not work for GLITCH Productions.",
    credit: "Commissioned by Ghostlike.",
  },
);

const colorSimulator = make(
  "Color Simulator",
  "2026",
  202608,
  [1, 2, 3, 4, 5, 6].map((number) => media(
    `portfolio-assets/2026/color-simulator/asset-${String(number).padStart(2, "0")}.webp`,
    `Color Simulator 3D game asset ${number}`,
    "final",
    `A production asset created for Color Simulator.`,
  )),
  {
    slug: "color-simulator",
    featured: true,
    madeIn: ["Roblox Studio", "Blender"],
    text: "End-to-end Roblox development and art ownership across 3D assets, interface, gameplay systems, and implementation.",
    credit: "Role: Creator / Developer.",
  },
);

const xanniban = make(
  "XANNIBAN",
  "2026",
  202607,
  [
    media("xxannibann.png", "Bronze antlered XANNIBAN character model", "final", "Finished antlered character model."),
    media("trdfhrtdfh.png", "XANNIBAN character running in the game engine", "process", "In-engine character test."),
    media("tbedtr.png", "Additional XANNIBAN character lineup", "process", "Additional character development lineup."),
    media("99.png", "Earlier antlered XANNIBAN character set", "process", "Earlier character exploration."),
  ],
  {
    slug: "xanniban",
    featured: true,
    madeIn: ["Blender", "Godot"],
    text: "Character work for XANNIBAN, including several modeled characters and in-engine presentation tests.",
    credit: "Role: 3D Character Artist — created several character models.",
  },
);

const peaShooter = make(
  "Pea Shooter Turntable",
  "2026",
  202606,
  [
    media("0101-0254.mp4", "Pea Shooter character model turntable", "turntable", "Finished Pea Shooter model turntable.", {
      type: "video",
      poster: "portfolio-assets/2026/pea-shooter/pea-shooter-poster.webp",
      label: "Play turntable",
    }),
  ],
  {
    slug: "pea-shooter-turntable",
    text: "A complete character presentation shown as a first-class video turntable.",
    thumbnail: "portfolio-assets/2026/pea-shooter/pea-shooter-poster.webp",
  },
);

const karl = reset(project("Male Likeness Study"), {
  slug: "billy-butcher-karl-urban-likeness",
  title: "Billy Butcher — Karl Urban Likeness Study",
  sortOrder: 202605,
  text: "A likeness sculpt studying Karl Urban as Billy Butcher.",
  thumbnail: "portfolio-assets/2026/studies/karlurbansculpt.webp",
  media: [media("portfolio-assets/2026/studies/karlurbansculpt.webp", "Karl Urban likeness sculpt as Billy Butcher", "wip", "Likeness sculpt in progress.")],
});

const alien = reset(project("Alien Creature Study"), {
  slug: "alien-creature-study",
  sortOrder: 202604,
  text: "A full-body creature blockout retained from the viable presentation capture.",
  thumbnail: "portfolio-assets/2026/studies/alien_full.webp",
  media: [media("portfolio-assets/2026/studies/alien_full.webp", "Full-body alien creature blockout", "wip", "Full-body blockout.")],
});

const dawktrap = reset(project("Dawktrap"), { slug: "dawktrap", sortOrder: 202603, featured: true });
const lantern = reset(project("Lantern Prop Study"), { slug: "lantern-prop-study", sortOrder: 202602 });
const rigging = reset(project("Character Rigging Study"), { slug: "character-rigging-study", sortOrder: 202600 });

const littleNightmares = reset(project("Little Nightmares 3 - She's Here!"), {
  slug: "little-nightmares-shes-here",
  featured: true,
  sortOrder: 202512,
  title: "Little Nightmares III — She’s Here!",
  text: "Alone, Low, The Supervisor, and The Doll modeled for a Rockit Music video, presented with the completed scene and layout process.",
});

const tenna = reset(project("Tenna Study"), {
  slug: "tenna-study",
  title: "Tenna Character Study",
  dateLabel: "2025",
  sortOrder: 202511,
  text: "A Deltarune-inspired character study documented from clay and sculpt stages through texture look development and final presentation.",
  media: [
    media("tennnna.jpg", "Tenna full-color final character presentation", "final", "Final character presentation."),
    media("tenna.jpg", "Tenna clay character presentation", "process", "Clay presentation."),
    media("dat tang.png", "Early Tenna sculpt pose", "wip", "Early sculpt stage."),
    media("ten.png", "Tenna in Substance 3D Painter", "texture-lookdev", "Texture look-development stage."),
    media("GstHl1JWsAEHGiI.jpg", "Tenna television-face development render", "wip", "Television-face development pass."),
  ],
});

const pumpkin = reset(project("Pumpkin Study"), {
  slug: "halloween-pumpkin",
  title: "Halloween Pumpkin",
  dateLabel: "October 2025",
  sortOrder: 202510,
  text: "A Halloween pumpkin study grouped with its related final presentation and clay/process stage.",
  thumbnail: "pump.png",
  media: [
    media("pump.png", "Finished carved Halloween pumpkin model", "final", "Final pumpkin model."),
    media("hallo.png", "Halloween pumpkin shown in the finished scene", "alternate-final", "Finished scene presentation."),
    media("pump2.png", "Clay render of the Halloween pumpkin", "wip", "Clay and modeling stage."),
  ],
});

const moonlit = reset(project("Moonlit Graveyard Hand"), {
  slug: "moonlit-graveyard-hand",
  dateLabel: "October 2025",
  sortOrder: 202509,
  text: "A moonlit graveyard composition and its hand character study, created as part of the same Halloween work period.",
  thumbnail: "5.png",
  media: [
    media("5.png", "Moonlit graveyard scene with a hand emerging from the ground", "final", "Final graveyard composition."),
    media("GKfGAn9WkAEV8AI.jpg", "Close presentation of the stylized graveyard hand", "process", "Hand model presentation."),
  ],
});

const saberToy = make("Saber Simulator — Toy Set", "2025", 202508, [
  media("portfolio-assets/2025/saber_toy.webp", "Saber Simulator toy pet lineup", "final", "Toy-set lineup."),
  media("portfolio-assets/2025/saber_toy_windup.webp", "Saber Simulator wind-up toy pet", "final", "Wind-up toy pet."),
  media("portfolio-assets/2025/saber_toy_car.webp", "Saber Simulator toy car pet", "final", "Toy car pet."),
  media("portfolio-assets/2025/saber_toy_dragon.webp", "Saber Simulator toy dragon pet", "final", "Toy dragon pet."),
  media("portfolio-assets/2025/saber_toys_group.webp", "Saber Simulator toy set group reference", "alternate-final", "Secondary group overview; not used as the cover."),
], { slug: "saber-simulator-toy-set", featured: true, text: "A coherent toy-themed pet release set for Saber Simulator.", credit: "Saber Simulator production art." });

const saberCore = make("Saber Simulator — Core Rarity Set", "2025", 202507, [1, 2, 3, "4a", 5].map((name, index) => media(
  `portfolio-assets/2025/saber_${name}.webp`,
  `Saber Simulator core rarity pet ${index + 1}`,
  "final",
  `Core rarity pet ${index + 1}.`,
)), { slug: "saber-simulator-core-rarity-set", text: "Five related core-rarity pets presented as their actual release family.", thumbnail: "portfolio-assets/2025/saber_3.webp", credit: "Saber Simulator production art." });

const saberThemed = make("Saber Simulator — Themed Pets", "2025", 202506, [
  media("portfolio-assets/2025/saber_mad_scientist.webp", "Saber Simulator mad scientist themed pet", "final", "Mad scientist themed pet."),
  media("portfolio-assets/2025/saber_magma.webp", "Saber Simulator magma themed pet", "final", "Magma themed pet."),
  media("portfolio-assets/2025/saber_dream.webp", "Saber Simulator dream themed pet", "final", "Dream themed pet."),
  media("portfolio-assets/2025/saber_4b.webp", "Saber Simulator alternate themed rarity pet", "final", "Alternate themed rarity pet."),
], { slug: "saber-simulator-themed-pets", text: "Themed Saber Simulator pets grouped as a related production set.", credit: "Saber Simulator production art." });

const springtrap = reset(project("Springtrap Fan Model"), { slug: "springtrap-fan-model", sortOrder: 202505, dateLabel: "2025", featured: false });
const sprunki = reset(project("Sprunki Variants for Rockit"), { slug: "sprunki-variants-rockit", sortOrder: 202504, featured: false });

const studies2024 = reset(project("2024 Character and Creature Studies"), {
  slug: "character-creature-studies-2024",
  sortOrder: 202412,
  media: [
    ...project("2024 Character and Creature Studies").media,
    media("dl.png", "Expressive stylized head sculpt", "wip", "Expression sculpt study."),
    media("debts.png", "Stylized hand and sleeve sculpt study", "process", "Hand and sleeve sculpt process study."),
  ],
});

const fnafChildren = reset(project("Crying Children from the FNAF Movie"), {
  slug: "fnaf-movie-crying-children",
  dateLabel: "2023",
  sortOrder: 202312,
  text: "A complete commissioned fan-art character set for a TryHardNinja video, with final renders and viewport/process passes.",
});

const rainbowCharacters = reset(project("Rainbow Friends"), {
  slug: "rainbow-friends-characters-fabvl",
  title: "Rainbow Friends Characters — FABVL",
  sortOrder: 202311,
  text: "Commissioned Rainbow Friends character remakes for FABVL, grouped with their final renders and viewport or topology passes.",
  media: project("Rainbow Friends").media.filter((entry) => !["Fy9BTxnWAAML02a.jpg"].includes(entry.src)),
});

const rainbowEnvironments = make("Rainbow Friends Environments — Rockit Music", "2023", 202310, [
  media("portfolio-assets/2023/rainbow-friends-environments/ferris-wheel.webp", "Rainbow Friends ferris wheel environment", "final", "Ferris wheel environment."),
  media("portfolio-assets/2023/rainbow-friends-environments/castle-courtyard.webp", "Rainbow Friends castle courtyard environment", "final", "Castle courtyard environment."),
  media("portfolio-assets/2023/rainbow-friends-environments/stone-corridor.webp", "Rainbow Friends stone corridor environment", "final", "Stone corridor environment."),
  media("portfolio-assets/2023/rainbow-friends-environments/throne-room.webp", "Rainbow Friends throne room environment", "final", "Throne room environment."),
  media("ghtr.png", "Rainbow Friends room environment", "final", "Rainbow Friends room environment."),
  media("Fy9BTxnWAAML02a.jpg", "Alternate Rainbow Friends ferris wheel scene render", "alternate-final", "Alternate ferris wheel presentation."),
], { slug: "rainbow-friends-environments-rockit", madeIn: ["Blender"], text: "A connected set of Rainbow Friends environments built for Rockit Music, including the ferris wheel, castle courtyard, corridor, throne room, and interior room.", credit: "Environment work for Rockit Music." });

const dhmis = reset(project("Don't Hug Me I'm Scared Studies"), {
  slug: "dhmis-studies",
  sortOrder: 202309,
  media: [
    ...project("Don't Hug Me I'm Scared Studies").media,
    media("fbdxf.png", "Don't Hug Me I'm Scared living room environment", "process", "Living-room environment pass."),
    media("fdnbfd.png", "Don't Hug Me I'm Scared living room character scene", "final", "Living-room character scene."),
    media("ger.png", "Yellow character gore scene", "final", "Yellow character scene."),
    media("hbdhderfthbdre.png", "Don't Hug Me I'm Scared graveyard environment", "final", "Graveyard environment."),
    media("reherdh.png", "Duck character gore scene", "final", "Duck character scene."),
    media("efvewrsf.png", "Alternate Duck character model", "process", "Alternate Duck character pass."),
    media("20233.png", "Red character scene", "final", "Red character scene."),
    media("wgsveswgw.png", "Alternate Red character scene", "alternate-final", "Alternate Red character presentation."),
    media("hmnhgm.png", "Duck character development render", "process", "Duck development pass."),
  ],
});

const colossal = reset(project("Colossal Titan Study"), { slug: "colossal-titan-study", sortOrder: 202308 });
const attackTitan = reset(project("Attack Titan Studies"), {
  slug: "attack-titan-eren-study",
  title: "Attack Titan / Eren Study",
  sortOrder: 202307,
  media: [media("E9NYM0KWQAIl4E8.jpg", "Attack Titan inspired Eren character study", "final", "Finished character study.")],
});
const d4c = reset(project("D4C Timed Sculpt"), { slug: "d4c-timed-sculpt", sortOrder: 202306 });
const ruinFreddy = reset(project("Ruin Freddy Head Study"), { slug: "ruin-freddy-head-study", sortOrder: 202305 });
const cyn = reset(project("Cyn Fan Art"), { slug: "cyn-fan-art", sortOrder: 202304 });
const glamrock = reset(project("Glamrock Animatronic Studies"), {
  slug: "glamrock-animatronic-studies",
  sortOrder: 202303,
  media: [
    ...project("Glamrock Animatronic Studies").media.map((entry) => entry.src === "Jack_Sockwell_-_FNAF_Animation_practice_wit_Glamrock_Bonnie____BBVZTA.mp4"
      ? media(entry.src, entry.alt, "video", "Glamrock Bonnie animation practice clip.", { type: "video", poster: "portfolio-assets/2023/glamrock/glamrock-bonnie-animation-poster.webp" })
      : entry),
    media("FVwehOuWQAArHmo.jpg", "Glamrock character modeling process", "process", "Blender process capture."),
  ],
});
const witheredFreddy = reset(project("Withered Freddy Study"), { slug: "withered-freddy-study", sortOrder: 202302 });
const circusAnimatronic = reset(project("Circus Animatronic Study"), { slug: "circus-animatronic-study", sortOrder: 202301 });
const characterExperiments = reset(project("Character Experiments"), {
  slug: "character-studies-2023",
  title: "2023 Character Studies",
  sortOrder: 202300,
  media: project("Character Experiments").media.filter((entry) => !["dhmis.png", "hmnhgm.png", "sdd.png", "Fb_syD9XkAAaQYL.jpg", "FcXKAmSXEAA8qYy.jpg"].includes(entry.src)),
});
const akatsuki = make("Akatsuki Character Study", "2023", 202299, [
  media("Fb_syD9XkAAaQYL.jpg", "Akatsuki-inspired character front pose", "final", "Front presentation."),
  media("FcXKAmSXEAA8qYy.jpg", "Akatsuki-inspired character alternate pose", "alternate-final", "Alternate pose."),
], { slug: "akatsuki-character-study" });

const doors = reset(project("Doors Scene Studies"), {
  slug: "doors-models-environments-rockit",
  title: "DOORS Models & Environments — Rockit Music",
  sortOrder: 202212,
  text: "Characters and environments built for Rockit Music's DOORS videos, including Seek, Figure, Screech, the hotel, and scene props.",
  media: [
    media("jyttj.png", "Seek character model from DOORS", "final", "Seek character model."),
    media("wcvws.png", "Alternate Seek character presentation from DOORS", "alternate-final", "Alternate Seek presentation."),
    media("thrrht.png", "Figure character model from DOORS", "final", "Figure character model."),
    media("vdrfgv.png", "Screech character model from DOORS", "final", "Screech character model."),
    media("ewfefv.png", "DOORS hotel environment", "final", "Hotel environment."),
    ...project("Doors Scene Studies").media,
  ],
  credit: "Character and environment work for Rockit Music.",
});

const bendy = make("Bendy Models — Rockit Music", "2022", 202211, [
  media("bend 2022.png", "Bendy character model", "final", "Finished Bendy character."),
  media("bendy 2022.png", "Alternate Bendy character model", "alternate-final", "Alternate Bendy character."),
], { slug: "bendy-models-rockit", credit: "Character work for Rockit Music." });
const poppyRoom = make("Poppy Playtime Environment — Rockit Music", "2022", 202210, [
  media("poppy room.png", "Large Poppy Playtime room environment", "final", "Finished environment presentation."),
], { slug: "poppy-playtime-environment-rockit", credit: "Environment work for Rockit Music." });
const residentEvil = make("Resident Evil Character — Rockit Music", "2023", 202298, [
  media("ewtgwstg.png", "Resident Evil chainsaw character model", "final", "Finished character presentation."),
], { slug: "resident-evil-character-rockit", credit: "Character work for Rockit Music." });

const bert = reset(project("Bert Study"), {
  slug: "bert-study",
  sortOrder: 202208,
  media: [
    media("dfgsed.png", "Finished Bert character model", "final", "Finished character render."),
    media("Fnk6ez9X0AESS8c.jpg", "Graphic Bert character presentation", "alternate-final", "Graphic presentation."),
    media("jack-sockwell-vcbvcb.jpg", "Seated Bert character model", "process", "Alternate pose and topology presentation."),
    media("jack-sockwell-zxczx.jpg", "Dark Bert character presentation", "alternate-final", "Dark presentation."),
  ],
  thumbnail: "dfgsed.png",
});

const alphabet = make("Alphabet & Number Character Set", "2022", 202207, [
  media("A 2022.png", "Letter character A", "final", "Letter A character."),
  media("A 2022 2.png", "Alternate presentation of the letter A character", "alternate-final", "Alternate letter A presentation."),
  ...["B 2022.png", "C 2022.png", "D 2022.png", "E 2022.png", "F 2022.png", "G.png"].map((src, index) => media(src, `Letter character ${String.fromCharCode(66 + index)}`, "final", `Letter ${String.fromCharCode(66 + index)} character.`)),
  media("regwsreg.png", "Number character lineup", "final", "Number character lineup."),
], { slug: "alphabet-number-character-set" });

const rooster = reset(project("Commissioned Character Lineup"), {
  slug: "rooster-character-commissions",
  title: "Rooster Character Commission Set",
  sortOrder: 202206,
  text: "Five commissioned rooster characters grouped as their original coherent set.",
  media: project("Commissioned Character Lineup").media.filter((entry) => entry.src !== "portfolio-assets/2022/tealer.webp"),
});
const tealer = make("TEALERLAND — Classic Tealer", "2022", 202205, [
  media("portfolio-assets/2022/tealer.webp", "Classic Tealer character model", "final", "Classic Tealer model."),
], { slug: "tealerland-classic-tealer", text: "Classic Tealer character model created for TEALERLAND.", credit: "Character modeling by Jack Sockwell." });
const stylizedWoman = make("Stylized Woman Study", "2022", 202204, [media("2022.png", "Stylized woman character model", "final", "Finished character presentation.")], { slug: "stylized-woman-study" });
const bmo = reset(project("BMO"), { slug: "bmo", sortOrder: 202203 });
const finnJake = reset(project("Finn and Jake"), { slug: "finn-and-jake", sortOrder: 202202 });
const lemongrab = reset(project("Lemongrab"), { slug: "lemongrab", sortOrder: 202201 });
const animatronics2022 = reset(project("Stylized Animatronic Studies"), { slug: "stylized-animatronic-studies-2022", sortOrder: 202200 });
const headStudies = reset(project("Head and Bust Studies"), {
  slug: "head-bust-studies-2022",
  sortOrder: 202199,
  media: [...project("Head and Bust Studies").media.filter((entry) => !["GKekVqUXIAE8WRR.jpg", "D4C 1 MIN 10 MIN 30 MINDD.jpg", "D4C 1 MIN 10 MIN 30 MINF.jpg"].includes(entry.src)), media("th.png", "Stylized portrait head study", "final", "Portrait head study.")],
});
const characterStudies2022 = reset(project("Additional Character Studies"), {
  slug: "additional-character-studies-2022",
  sortOrder: 202198,
  media: [
    ...project("Additional Character Studies").media,
    media("FKyN-kfXIAEIXuS.png", "Realistic animatronic modeling variation", "process", "Additional modeling variation retained as process evidence."),
  ],
});

const props = reset(project("Material and Prop Tests"), {
  slug: "material-prop-tests-2021",
  sortOrder: 202112,
  media: [
    ...project("Material and Prop Tests").media,
    media("shoe topology.png", "Shoe topology study", "process", "Shoe topology study."),
    media("yjktykgf.png", "Clothing model and material study", "process", "Clothing model and material study."),
  ],
});
const portraits = reset(project("Portrait Head Studies"), { slug: "portrait-head-studies-2021", sortOrder: 202111 });
const butter = reset(project("Butter Robot Rick and Morty"), { slug: "butter-robot", sortOrder: 202110 });
const early2021 = reset(project("More Early Character Work"), { slug: "early-character-work-2021", sortOrder: 202109 });
const passthrough = [
  ["Commission Sheet", "commission-sheet-2020"],
  ["Early Commissions and Studies", "early-commissions-studies-2019"],
  ["Characters, Portraits, and Environments", "characters-portraits-environments-2018"],
  ["Early Character Remakes", "early-character-remakes-2017"],
  ["The Beginning", "the-beginning-2016"],
].map(([title, slug]) => reset(project(title), { slug }));

const items = [
  dontFret, yhwach, imu, charm, colorSimulator, xanniban, peaShooter, karl, alien, dawktrap, lantern, rigging, digitalCircus,
  littleNightmares, tenna, pumpkin, moonlit, saberToy, saberCore, saberThemed, springtrap, sprunki,
  studies2024,
  fnafChildren, rainbowCharacters, rainbowEnvironments, dhmis, colossal, attackTitan, d4c, ruinFreddy, cyn, glamrock, witheredFreddy, circusAnimatronic, characterExperiments, akatsuki, residentEvil,
  doors, bendy, poppyRoom, bert, alphabet, rooster, tealer, stylizedWoman, bmo, finnJake, lemongrab, animatronics2022, headStudies, characterStudies2022,
  props, portraits, butter, early2021,
  ...passthrough,
]
  .map((item) => {
    const cleaned = { ...item };
    ["images"].forEach((key) => delete cleaned[key]);
    Object.keys(cleaned).forEach((key) => cleaned[key] === undefined && delete cleaned[key]);
    return cleaned;
  })
  .sort((a, b) => b.sortOrder - a.sortOrder);

const slugs = new Set();
for (const item of items) {
  if (slugs.has(item.slug)) throw new Error(`Duplicate slug: ${item.slug}`);
  slugs.add(item.slug);
}

const header = `// Canonical public portfolio data. Reconciled against the repository and source archive on 2026-08-23.\n// Media order is deliberate: strongest final first, then alternate finals, videos, look development, process, and WIPs.\nwindow.PORTFOLIO_DATA_REVISION = "2026-08-23T10:34:23-04:00";\nwindow.portfolioItems = `;
fs.writeFileSync(dataPath, `${header}${JSON.stringify(items, null, 2)};\n`, "utf8");
console.log(`Wrote ${items.length} reconciled projects to ${path.relative(root, dataPath)}.`);
