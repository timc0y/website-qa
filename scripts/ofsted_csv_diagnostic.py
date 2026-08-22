#!/usr/bin/env python3
import csv
import io
import json
import requests

URLS = [
    "https://www.gov.uk/csv-preview/6a75d6a9ff25cc81486b24df/Management_information_-_state-funded_schools_-_all_inspections_-_year_to_date_published_by_31_July_2026.csv",
    "https://assets.publishing.service.gov.uk/media/6a75d6a9ff25cc81486b24df/Management_information_-_state-funded_schools_-_all_inspections_-_year_to_date_published_by_31_July_2026.csv",
]
for url in URLS:
    try:
        response = requests.get(url, timeout=60, allow_redirects=True)
        text = response.content.decode("utf-8-sig", errors="replace")
        rows = list(csv.DictReader(io.StringIO(text))) if response.status_code == 200 else []
        print(json.dumps({"url": url, "status": response.status_code, "final_url": response.url, "content_type": response.headers.get("content-type"), "bytes": len(response.content), "rows": len(rows), "headers": list(rows[0]) if rows else []}))
    except Exception as exc:
        print(json.dumps({"url": url, "error": repr(exc)}))
