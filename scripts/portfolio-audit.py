#!/usr/bin/env python3
"""Build a temporary, evidence-first inventory for the portfolio repository."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
import subprocess
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".m4v", ".ogg"}
MEDIA_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS
EXCLUDED_DIRS = {".git", "node_modules"}
NEAR_DUPLICATE_DISTANCE = 6
CONTACT_SHEET_COLUMNS = 5
CONTACT_SHEET_PAGE_SIZE = 30
THUMBNAIL_SIZE = (220, 170)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--evidence-root", type=Path)
    return parser.parse_args()


def load_local_data(repo: Path) -> dict:
    node_script = r"""
const fs = require('fs');
const vm = require('vm');
const root = process.argv[1];
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const file of ['portfolio-data.js', 'portfolio-archive-data.js']) {
  vm.runInContext(fs.readFileSync(root + '/' + file, 'utf8'), sandbox, { filename: file });
}
process.stdout.write(JSON.stringify({
  local: sandbox.window.portfolioItems || [],
  archive: sandbox.window.portfolioArchiveItems || [],
  additions: sandbox.window.portfolioMediaAdditions || {},
  revision: sandbox.window.PORTFOLIO_DATA_REVISION || ""
}));
"""
    completed = subprocess.run(
        ["node", "-e", node_script, str(repo)],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return json.loads(completed.stdout)


def fetch_remote_projects(repo: Path) -> list[dict]:
    config_text = (repo / "supabase-config.js").read_text(encoding="utf-8")
    url_match = re.search(r'url:\s*"([^"]+)"', config_text)
    key_match = re.search(r'anonKey:\s*"([^"]+)"', config_text)
    if not url_match or not key_match:
        return []

    endpoint = (
        f"{url_match.group(1)}/rest/v1/portfolio_projects?"
        + urllib.parse.urlencode(
            {
                "select": "*",
                "status": "eq.published",
                "order": "sort_order.desc,updated_at.desc",
            }
        )
    )
    request = urllib.request.Request(
        endpoint,
        headers={
            "apikey": key_match.group(1),
            "Authorization": f"Bearer {key_match.group(1)}",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            rows = json.load(response)
    except Exception:
        return []

    projects = []
    for row in rows:
        media = row.get("media") or []
        thumbnail = row.get("thumbnail")
        if isinstance(media, str):
            try:
                media = json.loads(media)
            except json.JSONDecodeError:
                media = []
        if isinstance(thumbnail, str):
            try:
                thumbnail = json.loads(thumbnail)
            except json.JSONDecodeError:
                thumbnail = None
        projects.append(
            {
                "id": row.get("id") or "",
                "slug": row.get("slug") or "",
                "section": row.get("section") or "art",
                "status": row.get("badge_label") or "",
                "title": row.get("title") or "",
                "text": row.get("description") or "",
                "dateLabel": row.get("date_label") or "",
                "sortOrder": row.get("sort_order") or 0,
                "madeIn": row.get("made_in") or [],
                "thumbnail": thumbnail,
                "media": media,
            }
        )
    return projects


def media_src(media) -> str:
    if isinstance(media, str):
        return media
    if isinstance(media, dict):
        return str(media.get("src") or "")
    return ""


def merge_projects(data: dict, remote: list[dict]) -> tuple[list[dict], str]:
    if data.get("revision"):
        projects = [dict(project) for project in data["local"]]
        projects.sort(key=lambda project: float(project.get("sortOrder") or 0), reverse=True)
        return projects, "canonical-local"

    projects = [dict(project) for project in (remote or data["local"])]
    source = "supabase+archive" if remote else "local+archive"
    additions = data.get("additions") or {}

    def apply_additions(project: dict) -> dict:
        extra = additions.get(project.get("title"), [])
        existing = list(project.get("media") or project.get("images") or [])
        seen = {media_src(item) for item in existing if media_src(item)}
        for item in extra:
            src = media_src(item)
            if src and src not in seen:
                seen.add(src)
                existing.append(item)
        project["media"] = existing
        return project

    projects = [apply_additions(project) for project in projects]
    titles = {project.get("title") for project in projects}
    for project in data.get("archive") or []:
        if project.get("title") and project.get("title") not in titles:
            titles.add(project.get("title"))
            projects.append(apply_additions(dict(project)))

    projects.sort(key=lambda project: float(project.get("sortOrder") or 0), reverse=True)
    return projects, source


def normalize_repo_src(src: str) -> str:
    if not src:
        return ""
    parsed = urllib.parse.urlparse(src)
    if parsed.scheme in {"http", "https"}:
        return src
    return urllib.parse.unquote(src).replace("/", "\\").lstrip(".\\")


def scan_media(root: Path) -> list[Path]:
    files = []
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in MEDIA_EXTENSIONS:
            continue
        if any(part in EXCLUDED_DIRS for part in path.relative_to(root).parts):
            continue
        files.append(path)
    return sorted(files, key=lambda path: str(path).lower())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
    except OSError:
        return f"unreadable:{hashlib.sha1(str(path).encode('utf-8')).hexdigest()}"


def image_info(path: Path) -> tuple[int, int, str]:
    if path.suffix.lower() in VIDEO_EXTENSIONS:
        command = [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,codec_name",
            "-of",
            "json",
            str(path),
        ]
        try:
            result = subprocess.run(command, check=True, capture_output=True, text=True)
            stream = json.loads(result.stdout).get("streams", [{}])[0]
            return int(stream.get("width") or 0), int(stream.get("height") or 0), stream.get("codec_name") or "video"
        except Exception:
            return 0, 0, "video"
    try:
        with Image.open(path) as image:
            return image.width, image.height, image.format or path.suffix.lstrip(".").upper()
    except Exception:
        return 0, 0, "unreadable"


def difference_hash(path: Path) -> str:
    if path.suffix.lower() not in IMAGE_EXTENSIONS:
        return ""
    try:
        with Image.open(path) as image:
            gray = ImageOps.exif_transpose(image).convert("L").resize((9, 8), Image.Resampling.LANCZOS)
            pixels = np.asarray(gray, dtype=np.int16)
            bits = pixels[:, 1:] > pixels[:, :-1]
            value = 0
            for bit in bits.flatten():
                value = (value << 1) | int(bit)
            return f"{value:016x}"
    except Exception:
        return ""


def hamming(left: str, right: str) -> int:
    return (int(left, 16) ^ int(right, 16)).bit_count()


def build_assignment_map(projects: list[dict]) -> tuple[dict[str, list[dict]], list[dict]]:
    assignments: dict[str, list[dict]] = defaultdict(list)
    references = []
    for project in projects:
        candidates = []
        thumbnail = project.get("thumbnail")
        if thumbnail:
            candidates.append(("cover", thumbnail))
        for index, media in enumerate(project.get("media") or project.get("images") or []):
            candidates.append((f"media:{index + 1}", media))
            if isinstance(media, dict) and media.get("poster"):
                candidates.append((f"poster:{index + 1}", {"src": media.get("poster")}))
        for role, media in candidates:
            src = media_src(media)
            if not src:
                continue
            normalized = normalize_repo_src(src)
            entry = {
                "project": project.get("title") or "Untitled",
                "year": project.get("dateLabel") or "",
                "role": role,
                "src": src,
                "stage": media.get("stage", "") if isinstance(media, dict) else "",
            }
            references.append(entry)
            if not urllib.parse.urlparse(normalized).scheme:
                assignments[normalized.lower()].append(entry)
    return assignments, references


def suspect_group(relative: str, assignments: list[dict]) -> str:
    if assignments:
        return assignments[0]["project"]
    name = relative.lower()
    keywords = [
        ("imu", "Imu candidate"),
        ("yhwach", "Yhwach candidate"),
        ("ywach", "Yhwach candidate"),
        ("charm", "Dead by Daylight charm candidate"),
        ("tenna", "Tenna candidate"),
        ("pump", "Halloween pumpkin candidate"),
        ("saber", "Saber Simulator candidate"),
        ("alien", "Alien candidate"),
        ("rainbow", "Rainbow Friends candidate"),
        ("pea", "Pea Shooter candidate"),
        ("xanniban", "XANNIBAN candidate"),
        ("color", "Color Simulator candidate"),
    ]
    for token, label in keywords:
        if token in name:
            return label
    return "Unresolved candidate"


def slug(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return cleaned[:90] or "group"


def load_preview(path: Path, size: tuple[int, int], video_frames: Path) -> Image.Image:
    if path.suffix.lower() in VIDEO_EXTENSIONS:
        frame_path = video_frames / f"{hashlib.sha1(str(path).encode()).hexdigest()}.jpg"
        if not frame_path.exists():
            subprocess.run(
                ["ffmpeg", "-y", "-ss", "0.25", "-i", str(path), "-frames:v", "1", "-vf", "scale=640:-2", str(frame_path)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
        if frame_path.exists():
            path = frame_path
    try:
        with Image.open(path) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            return ImageOps.contain(image, size, Image.Resampling.LANCZOS)
    except Exception:
        return Image.new("RGB", size, "#321d2a")


def write_contact_sheets(groups: dict[str, list[dict]], destination: Path, video_frames: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default()
    cell_width, cell_height = 240, 222
    for group, records in sorted(groups.items(), key=lambda item: item[0].lower()):
        for page_index in range(math.ceil(len(records) / CONTACT_SHEET_PAGE_SIZE)):
            page_records = records[page_index * CONTACT_SHEET_PAGE_SIZE : (page_index + 1) * CONTACT_SHEET_PAGE_SIZE]
            rows = math.ceil(len(page_records) / CONTACT_SHEET_COLUMNS)
            sheet = Image.new("RGB", (CONTACT_SHEET_COLUMNS * cell_width, 46 + rows * cell_height), "#100e14")
            draw = ImageDraw.Draw(sheet)
            draw.text((12, 12), f"{group}  |  {len(records)} items  |  page {page_index + 1}", fill="#f4eef6", font=font)
            for index, record in enumerate(page_records):
                x = (index % CONTACT_SHEET_COLUMNS) * cell_width
                y = 46 + (index // CONTACT_SHEET_COLUMNS) * cell_height
                preview = load_preview(Path(record["absolute"]), THUMBNAIL_SIZE, video_frames)
                px = x + (cell_width - preview.width) // 2
                py = y + 4 + (THUMBNAIL_SIZE[1] - preview.height) // 2
                sheet.paste(preview, (px, py))
                number = page_index * CONTACT_SHEET_PAGE_SIZE + index + 1
                label = f"{number:03d} {Path(record['relative']).name}"
                if len(label) > 34:
                    label = label[:31] + "..."
                draw.text((x + 8, y + 182), label, fill="#f4eef6", font=font)
                draw.text((x + 8, y + 198), f"{record['width']}x{record['height']}  {record['stage'] or 'unclassified'}", fill="#aaa1af", font=font)
            suffix = f"-{page_index + 1:02d}" if len(records) > CONTACT_SHEET_PAGE_SIZE else ""
            sheet.save(destination / f"{slug(group)}{suffix}.jpg", quality=88)


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    args = parse_args()
    repo = args.repo.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    video_frames = output / "video-frames"
    video_frames.mkdir(exist_ok=True)

    data = load_local_data(repo)
    remote = fetch_remote_projects(repo)
    projects, source = merge_projects(data, remote)
    assignments, references = build_assignment_map(projects)

    files = scan_media(repo)
    records = []
    for path in files:
        relative = str(path.relative_to(repo)).replace("/", "\\")
        width, height, detected_type = image_info(path)
        assigned = assignments.get(relative.lower(), [])
        record = {
            "filename": path.name,
            "relative": relative,
            "absolute": str(path),
            "width": width,
            "height": height,
            "file_type": path.suffix.lower().lstrip("."),
            "detected_type": detected_type,
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "dhash": difference_hash(path),
            "current_project": " | ".join(sorted({item["project"] for item in assigned})),
            "verified_project": "",
            "current_year": " | ".join(sorted({str(item["year"]) for item in assigned if item["year"]})),
            "verified_year": "",
            "stage": " | ".join(sorted({item["stage"] for item in assigned if item["stage"]})),
            "duplicate_status": "",
            "public_status": "referenced" if assigned else "unreferenced",
            "evidence": "Current live assignment; pending visual verification" if assigned else "Repository inventory; pending visual verification",
        }
        record["suspected_project"] = suspect_group(relative, assigned)
        records.append(record)

    exact_groups = defaultdict(list)
    for record in records:
        exact_groups[record["sha256"]].append(record)
    exact_duplicates = []
    for digest, group in exact_groups.items():
        if len(group) < 2:
            continue
        for record in group:
            record["duplicate_status"] = f"exact duplicate group {digest[:12]} ({len(group)} files)"
        exact_duplicates.append({"sha256": digest, "count": len(group), "paths": " | ".join(item["relative"] for item in group)})

    near_duplicates = []
    hash_records = [record for record in records if record["dhash"] and record["width"] and record["height"]]
    for index, left in enumerate(hash_records):
        left_ratio = left["width"] / left["height"]
        for right in hash_records[index + 1 :]:
            if left["sha256"] == right["sha256"]:
                continue
            right_ratio = right["width"] / right["height"]
            if abs(math.log(left_ratio / right_ratio)) > 0.12:
                continue
            distance = hamming(left["dhash"], right["dhash"])
            if distance <= NEAR_DUPLICATE_DISTANCE:
                near_duplicates.append(
                    {
                        "distance": distance,
                        "left": left["relative"],
                        "right": right["relative"],
                        "left_project": left["current_project"],
                        "right_project": right["current_project"],
                    }
                )

    fields = [
        "filename", "relative", "width", "height", "file_type", "detected_type", "bytes", "sha256", "dhash",
        "current_project", "verified_project", "current_year", "verified_year", "stage", "duplicate_status",
        "public_status", "suspected_project", "evidence",
    ]
    write_csv(output / "inventory.csv", fields, records)
    write_csv(output / "exact-duplicates.csv", ["sha256", "count", "paths"], exact_duplicates)
    write_csv(output / "near-duplicates.csv", ["distance", "left", "right", "left_project", "right_project"], near_duplicates)
    (output / "current-projects.json").write_text(json.dumps(projects, indent=2), encoding="utf-8")
    (output / "references.json").write_text(json.dumps(references, indent=2), encoding="utf-8")

    assignment_groups = defaultdict(list)
    folder_groups = defaultdict(list)
    suspected_groups = defaultdict(list)
    year_groups = defaultdict(list)
    for record in records:
        assignment_groups[record["current_project"] or "Unreferenced repository media"].append(record)
        parent = str(Path(record["relative"]).parent)
        folder_groups[parent].append(record)
        suspected_groups[record["suspected_project"]].append(record)
        year_groups[record["current_year"] or "Unresolved year"].append(record)
    write_contact_sheets(assignment_groups, output / "contact-sheets" / "current-assignment", video_frames)
    write_contact_sheets(folder_groups, output / "contact-sheets" / "source-folder", video_frames)
    write_contact_sheets(suspected_groups, output / "contact-sheets" / "suspected-project", video_frames)
    write_contact_sheets(year_groups, output / "contact-sheets" / "year", video_frames)

    evidence_count = 0
    if args.evidence_root and args.evidence_root.exists():
        evidence_files = scan_media(args.evidence_root)
        evidence_count = len(evidence_files)
        evidence_rows = []
        evidence_groups = defaultdict(list)
        for path in evidence_files:
            relative = str(path.relative_to(args.evidence_root)).replace("/", "\\")
            width, height, detected_type = image_info(path)
            record = {
                "filename": path.name,
                "relative": relative,
                "absolute": str(path),
                "width": width,
                "height": height,
                "file_type": path.suffix.lower().lstrip("."),
                "detected_type": detected_type,
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
                "dhash": difference_hash(path),
                "stage": "evidence-only",
            }
            evidence_rows.append(record)
            top_folder = relative.split("\\", 1)[0]
            evidence_groups[top_folder].append(record)
        write_csv(output / "evidence-library.csv", ["filename", "relative", "width", "height", "file_type", "detected_type", "bytes", "sha256", "dhash"], evidence_rows)
        write_contact_sheets(evidence_groups, output / "contact-sheets" / "evidence-library", video_frames)

    referenced_local = sum(1 for record in records if record["public_status"] == "referenced")
    unresolved_local = len(records) - referenced_local
    audit_lines = [
        "# PORTFOLIO ASSET AUDIT",
        "",
        "> Temporary working audit. Verified fields remain blank until visual reconciliation is complete.",
        "",
        "## Baseline",
        "",
        f"- Current data source: `{source}`",
        f"- Current merged projects: **{len(projects)}**",
        f"- Repository image/video files discovered: **{len(records)}**",
        f"- Currently referenced repository files: **{referenced_local}**",
        f"- Currently unreferenced repository files: **{unresolved_local}**",
        f"- Exact duplicate groups: **{len(exact_duplicates)}**",
        f"- Possible near-duplicate pairs: **{len(near_duplicates)}**",
        f"- External evidence-library files scanned: **{evidence_count}**",
        "",
        "## Current project assignments",
        "",
        "| Project | Current year | Media | Cover |",
        "|---|---:|---:|---|",
    ]
    for project in projects:
        cover = media_src(project.get("thumbnail")) or media_src((project.get("media") or [""])[0])
        audit_lines.append(f"| {project.get('title', '')} | {project.get('dateLabel', '')} | {len(project.get('media') or [])} | `{Path(cover).name}` |")
    audit_lines.extend(
        [
            "",
            "## Unresolved and excluded items",
            "",
            "- Pending contact-sheet review.",
            "",
            "## Per-file inventory",
            "",
            "The complete per-file evidence table is in `inventory.csv`; duplicate candidates are in `exact-duplicates.csv` and `near-duplicates.csv`.",
        ]
    )
    (output / "PORTFOLIO_ASSET_AUDIT.md").write_text("\n".join(audit_lines) + "\n", encoding="utf-8")

    print(json.dumps({
        "source": source,
        "projects": len(projects),
        "repo_media": len(records),
        "referenced_repo_media": referenced_local,
        "unreferenced_repo_media": unresolved_local,
        "exact_duplicate_groups": len(exact_duplicates),
        "near_duplicate_pairs": len(near_duplicates),
        "evidence_media": evidence_count,
        "output": str(output),
    }, indent=2))


if __name__ == "__main__":
    main()
