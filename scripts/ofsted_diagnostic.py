#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

import requests
from bs4 import BeautifulSoup

URNS = ["105576", "138409", "140679"]
OUT = Path("ofsted-diagnostic")
OUT.mkdir(exist_ok=True)

session = requests.Session()
session.headers.update({
    "User-Agent": "HeadteacherChat Ofsted research pipeline/1.0 (public research; low-rate diagnostic)",
    "Accept-Language": "en-GB,en;q=0.9",
})

records = []
for urn in URNS:
    urls = [
        f"https://reports.ofsted.gov.uk/provider/23/{urn}",
        f"http://www.ofsted.gov.uk/inspection-reports/find-inspection-report/provider/ELS/{urn}",
    ]
    for source_url in urls:
        try:
            response = session.get(source_url, timeout=45, allow_redirects=True)
            html_path = OUT / f"{urn}-{len(records)}.html"
            html_path.write_text(response.text, encoding="utf-8")
            soup = BeautifulSoup(response.text, "html.parser")
            links = []
            for a in soup.find_all("a", href=True):
                href = a.get("href", "").strip()
                text = " ".join(a.get_text(" ", strip=True).split())
                if re.search(r"(?:files\.ofsted\.gov\.uk|\.pdf(?:$|\?)|report)", href, re.I) or "report" in text.lower():
                    links.append({"text": text, "href": href})
            records.append({
                "urn": urn,
                "source_url": source_url,
                "status": response.status_code,
                "final_url": response.url,
                "content_type": response.headers.get("content-type"),
                "length": len(response.content),
                "title": soup.title.get_text(" ", strip=True) if soup.title else "",
                "links": links,
            })
            print(json.dumps(records[-1], ensure_ascii=False)[:12000])
        except Exception as exc:
            records.append({"urn": urn, "source_url": source_url, "error": repr(exc)})
            print(json.dumps(records[-1]))

(OUT / "diagnostic.json").write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")
