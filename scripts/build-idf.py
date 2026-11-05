"""Build lib/trial-idf.json: document frequencies over a broad ClinicalTrials.gov sample.

Usage: python3 scripts/build-idf.py <out.json> [exclude_fixture.json]
Pages the CT.gov v2 API (10 x 1000 studies, any status), tokenizes title + summary +
eligibility exactly like lib/lexical.ts, and keeps terms with df >= 3. NCT ids in the
optional exclude fixture (the TREC benchmark pool) are skipped so evaluation is not leaked.
"""
import json, re, sys, time, urllib.parse, urllib.request
from collections import Counter

out_path = sys.argv[1]
exclude = set(json.load(open(sys.argv[2]))["studies"]) if len(sys.argv) > 2 else set()
TOKEN = re.compile(r"[a-z][a-z0-9\-]{2,}")
df, n, token = Counter(), 0, None
for _ in range(10):
    q = {"pageSize": "1000", "format": "json", "fields": "NCTId,BriefTitle,OfficialTitle,BriefSummary,EligibilityCriteria"}
    if token: q["pageToken"] = token
    with urllib.request.urlopen("https://clinicaltrials.gov/api/v2/studies?" + urllib.parse.urlencode(q), timeout=90) as r:
        page = json.load(r)
    for s in page["studies"]:
        p = s["protocolSection"]
        if p["identificationModule"]["nctId"] in exclude: continue
        text = " ".join([p["identificationModule"].get("briefTitle", ""), p["identificationModule"].get("officialTitle", ""),
                         p.get("descriptionModule", {}).get("briefSummary", ""), p.get("eligibilityModule", {}).get("eligibilityCriteria", "")])
        df.update(set(TOKEN.findall(text.lower()))); n += 1
    token = page.get("nextPageToken")
    if not token: break
    time.sleep(0.3)
json.dump({"n": n, "df": {w: c for w, c in sorted(df.items()) if c >= 3}}, open(out_path, "w"), separators=(",", ":"))
print(n, "docs", sum(1 for c in df.values() if c >= 3), "terms")
