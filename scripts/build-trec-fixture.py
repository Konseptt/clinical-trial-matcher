"""Build a TREC Clinical Trials 2021 benchmark fixture from public data.

Usage: python3 scripts/build-trec-fixture.py <topics2021.xml> <qrels2021.txt> <out.json>
Sources: https://www.trec-cds.org/topics2021.xml, https://trec.nist.gov/data/trials/qrels2021.txt
Per topic keeps up to 15 eligible (2), 15 excluded (1), 10 not-relevant (0) judged trials
(deterministic: sorted by NCT id) and fetches their records from ClinicalTrials.gov API v2.
"""
import json, sys, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from collections import defaultdict

topics_path, qrels_path, out_path = sys.argv[1:4]
topics = {t.get("number"): (t.text or "").strip() for t in ET.parse(topics_path).getroot()}
qrels = defaultdict(dict)
for line in open(qrels_path):
    tid, _, nct, rel = line.split()
    qrels[tid][nct] = int(rel)

CAP = {2: 15, 1: 15, 0: 10}
picked = {}
for tid, judged in qrels.items():
    sel = []
    for rel, cap in CAP.items():
        sel += sorted(n for n, r in judged.items() if r == rel)[:cap]
    picked[tid] = {n: judged[n] for n in sel}

ids = sorted({n for v in picked.values() for n in v})
FIELDS = "NCTId,BriefTitle,OfficialTitle,OverallStatus,Phase,BriefSummary,EligibilityCriteria,Sex,MinimumAge,MaximumAge,LocationFacility,LocationCity,LocationState,LocationCountry"
studies = {}
for i in range(0, len(ids), 200):
    q = urllib.parse.urlencode({"filter.ids": ",".join(ids[i:i + 200]), "pageSize": "1000", "fields": FIELDS, "format": "json"})
    with urllib.request.urlopen(f"https://clinicaltrials.gov/api/v2/studies?{q}", timeout=60) as r:
        for s in json.load(r)["studies"]:
            studies[s["protocolSection"]["identificationModule"]["nctId"]] = s
    time.sleep(0.3)

out = {"topics": [{"id": t, "text": topics[t], "judgments": {n: r for n, r in picked[t].items() if n in studies}} for t in sorted(picked, key=int)],
       "studies": studies}
json.dump(out, open(out_path, "w"))
print(f"{len(out['topics'])} topics, {len(studies)}/{len(ids)} studies fetched")
