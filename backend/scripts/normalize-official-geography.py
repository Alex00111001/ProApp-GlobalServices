"""Normalize approved official geography snapshots into F8.5 import manifests.

This script never downloads data. Operators first retrieve the exact allowlisted
artifacts listed in docs/runbooks/MARKETS_IDENTITY_GEOGRAPHY.md, verify their raw
SHA-256 values, and then run this parser against that immutable input directory.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd


PARSER_VERSION = "f8.5-geography-normalizer-v1"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def normalized_digest(records: list[dict]) -> str:
    canonical = []
    for item in sorted(records, key=lambda row: row["code"]):
        canonical.append(
            {
                "code": item["code"],
                "name": item["name"],
                "type": item["type"],
                "level": item["level"],
                "parentCode": item.get("parentCode"),
                "displayNames": item.get("displayNames"),
            }
        )
    payload = json.dumps(canonical, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def record(code: str, name: str, type_key: str, level: int, locale: str, parent: str | None = None) -> dict:
    value = {
        "code": code,
        "name": str(name).strip(),
        "type": type_key,
        "level": level,
        "displayNames": {locale: str(name).strip()},
    }
    if parent:
        value["parentCode"] = parent
    return value


def normalize_es(source_dir: Path) -> tuple[list[dict], list[dict]]:
    municipalities_path = source_dir / "es-26codmun.xlsx"
    mapping_path = source_dir / "es-ccaa-province.html"
    mapping = pd.read_html(mapping_path)[0]
    mapping = mapping[pd.to_numeric(mapping["CPRO"], errors="coerce").notna()].copy()
    mapping["CPRO"] = mapping["CPRO"].astype(int).map(lambda value: f"{value:02d}")
    mapping["CODAUTO"] = mapping["CODAUTO"].astype(str).str.zfill(2)

    records: list[dict] = []
    for community_code, rows in mapping.groupby("CODAUTO", sort=True):
        name = rows.iloc[0]["Comunidad Autónoma"]
        records.append(record(f"CCAA:{community_code}", name, "AUTONOMOUS_COMMUNITY", 1, "es-ES"))
    for _, row in mapping.sort_values("CPRO").iterrows():
        records.append(record(f"PROVINCE:{row['CPRO']}", row["Provincia"], "PROVINCE", 2, "es-ES", f"CCAA:{row['CODAUTO']}"))

    workbook = pd.ExcelFile(municipalities_path)
    for sheet_name in sorted(workbook.sheet_names):
        frame = pd.read_excel(municipalities_path, sheet_name=sheet_name, header=2, dtype=str)
        frame = frame.dropna(subset=["CPRO", "CMUN", "NOMBRE"])
        for _, row in frame.iterrows():
            province = str(row["CPRO"]).zfill(2)
            municipality = str(row["CMUN"]).zfill(3)
            records.append(record(f"MUNICIPALITY:{province}{municipality}", row["NOMBRE"], "MUNICIPALITY", 3, "es-ES", f"PROVINCE:{province}"))

    artifacts = [
        {"url": "https://www.ine.es/daco/daco42/codmun/26codmun.xlsx", "mediaType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "sha256": sha256(municipalities_path)},
        {"url": "https://www.ine.es/daco/daco42/codmun/cod_ccaa_provincia.htm", "mediaType": "text/html", "sha256": sha256(mapping_path)},
    ]
    return records, artifacts


def normalize_br(source_dir: Path) -> tuple[list[dict], list[dict]]:
    states_path = source_dir / "br-states.json"
    municipalities_path = source_dir / "br-municipalities.json"
    states = json.loads(states_path.read_text(encoding="utf-8-sig"))
    municipalities = json.loads(municipalities_path.read_text(encoding="utf-8-sig"))
    records = [record(f"FEDERATIVE_UNIT:{int(item['id']):02d}", item["nome"], "FEDERATIVE_UNIT", 1, "pt-BR") for item in sorted(states, key=lambda row: int(row["id"]))]
    for item in sorted(municipalities, key=lambda row: int(row["id"])):
        if item.get("microrregiao"):
            state = item["microrregiao"]["mesorregiao"]["UF"]
        else:
            state = item["regiao-imediata"]["regiao-intermediaria"]["UF"]
        records.append(record(f"MUNICIPALITY:{int(item['id']):07d}", item["nome"], "MUNICIPALITY", 2, "pt-BR", f"FEDERATIVE_UNIT:{int(state['id']):02d}"))
    artifacts = [
        {"url": "https://servicodados.ibge.gov.br/api/v1/localidades/estados", "mediaType": "application/json", "sha256": sha256(states_path)},
        {"url": "https://servicodados.ibge.gov.br/api/v1/localidades/municipios", "mediaType": "application/json", "sha256": sha256(municipalities_path)},
    ]
    return records, artifacts


def normalize_cl(source_dir: Path) -> tuple[list[dict], list[dict]]:
    path = source_dir / "cl-cut-2018-v04.xls"
    frame = pd.read_excel(path, sheet_name="Sheet 1", dtype=str)
    columns = {
        "Código Región": "region_code",
        "Nombre Región": "region_name",
        "Código Provincia": "province_code",
        "Nombre Provincia": "province_name",
        "Código Comuna 2018": "commune_code",
        "Nombre Comuna": "commune_name",
    }
    frame = frame.rename(columns=columns)
    records: list[dict] = []
    for region_code, rows in frame.groupby("region_code", sort=True):
        records.append(record(f"REGION:{region_code}", rows.iloc[0]["region_name"], "REGION", 1, "es-CL"))
    for province_code, rows in frame.groupby("province_code", sort=True):
        records.append(record(f"PROVINCE:{province_code}", rows.iloc[0]["province_name"], "PROVINCE", 2, "es-CL", f"REGION:{rows.iloc[0]['region_code']}"))
    for _, row in frame.sort_values("commune_code").iterrows():
        records.append(record(f"COMMUNE:{row['commune_code']}", row["commune_name"], "COMMUNE", 3, "es-CL", f"PROVINCE:{row['province_code']}"))
    artifacts = [{"url": "https://www.subdere.gov.cl/sites/default/files/documentos/CUT_2018_v04.xls", "mediaType": "application/vnd.ms-excel", "sha256": sha256(path)}]
    return records, artifacts


def manifest(country: str, source_key: str, source_url: str, source_version: str, reference_date: str, retrieved_at: str, records: list[dict], artifacts: list[dict]) -> dict:
    return {
        "countryCode": country,
        "sourceKey": source_key,
        "sourceUrl": source_url,
        "sourceVersion": source_version,
        "referenceDate": reference_date,
        "retrievedAt": retrieved_at,
        "checksumSha256": normalized_digest(records),
        "parserVersion": PARSER_VERSION,
        "completeSnapshot": True,
        "sourceArtifacts": artifacts,
        "records": records,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--retrieved-at", default=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    jobs = [
        ("ES", "INE_ES", "https://www.ine.es/daco/daco42/codmun/26codmun.xlsx", "2026-01-01", "2026-01-01", normalize_es),
        ("BR", "IBGE_DTB", "https://servicodados.ibge.gov.br/api/v1/localidades/municipios", "IBGE-localidades-2026-09-09", "2026-09-09", normalize_br),
        ("CL", "INE_CL_SUBDERE", "https://www.subdere.gov.cl/sites/default/files/documentos/CUT_2018_v04.xls", "CUT_2018_v04", "2018-09-06", normalize_cl),
    ]
    summary = {}
    for country, source_key, source_url, source_version, reference_date, normalizer in jobs:
        records, artifacts = normalizer(args.source_dir)
        output = manifest(country, source_key, source_url, source_version, reference_date, args.retrieved_at, records, artifacts)
        destination = args.output_dir / f"{country.lower()}.json"
        destination.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        summary[country] = {"records": len(records), "checksumSha256": output["checksumSha256"], "output": str(destination)}
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
