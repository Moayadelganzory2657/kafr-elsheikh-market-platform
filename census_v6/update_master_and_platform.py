#!/usr/bin/env python3
"""
Update Master Database V2, V4, and Platform Data with Census V6 Missing Localities Batch.
Preserves existing records, appends verified establishments for the previously uncovered
localities across Desouk and Kafr El Sheikh, updates all consolidated files and triggers
platform data rebuild.
"""

import csv
import json
import os
import re
from collections import Counter, defaultdict

BASE_DIR = "/home/antigravity/project"
BATCH_FILE = os.path.join(BASE_DIR, "census_v6/batches/batch_missing14.csv")
MASTER_V2 = os.path.join(BASE_DIR, "files/master_business_database_v2.csv")
ENRICHED_V4 = os.path.join(BASE_DIR, "platform/enriched_businesses_v4.csv")
PLATFORM_DATA_V4 = os.path.join(BASE_DIR, "platform/platform_data.json")
PLATFORM_DATA_V5 = os.path.join(BASE_DIR, "platform_v5/platform_data_v5.json")

CATEGORY_TO_SECTOR = {
    "صيدلية": "الصيدليات والأدوية",
    "سوبر ماركت وبقالة": "السوبر ماركت والمواد الغذائية",
    "ملابس": "الملابس والأزياء والمفروشات",
    "عيادة ومعمل تحاليل": "العيادات والمراكز الطبية والمعامل",
    "مطعم": "المطاعم والكافيهات والحلويات",
    "كافيه": "المطاعم والكافيهات والحلويات",
    "أثاث وأجهزة منزلية": "الأثاث والأجهزة والأدوات المنزلية",
    "سيارات وورش وقطع غيار": "السيارات وقطع الغيار والصيانة",
    "موبايلات وإلكترونيات": "الموبايلات والإلكترونيات والاتصالات",
    "عقارات": "العقارات والمقاولات ومواد البناء",
    "مخبز وحلويات": "المطاعم والكافيهات والحلويات",
    "سنتر تعليمي": "التعليم والتدريب والحضانات",
    "حلاق وكوافير": "التجميل والعناية الشخصية والرياضة",
    "ورش ومصانع": "الورش والمصانع والصناعات الحرفية",
    "مقاولات عامة": "العقارات والمقاولات ومواد البناء",
    "استيراد وتصدير": "الاستيراد والتصدير والتجارة العامة",
    "أسماك": "الأسماك والاستزراع السمكي",
    "ورش": "الورش والمصانع والصناعات الحرفية",
    "بنك وصرافة ومحفظة مالية": "الخدمات المالية والبنوك والصرافة",
    "مزرعة دواجن": "الزراعة والأعلاف والثروة الحيوانية",
    "نقل بري للبضائع": "الزراعة والأعلاف والثروة الحيوانية",
    "مستلزمات زراعية وأعلاف": "الزراعة والأعلاف والثروة الحيوانية",
    "مضرب أرز": "الورش والمصانع والصناعات الحرفية",
}

def norm_name(s):
    if not s: return ""
    s = s.strip().lower()
    s = re.sub(r"[ً-ٰٟـ]", "", s)
    s = s.replace("أ","ا").replace("إ","ا").replace("آ","ا").replace("ى","ي").replace("ة","ه")
    s = re.sub(r"[^0-9a-zء-ي]+", "", s)
    return s

def run_update():
    print("Reading new batch entries...")
    new_rows = []
    with open(BATCH_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            new_rows.append(r)
    print(f"Loaded {len(new_rows)} records from batch.")

    # 1. Update Master Database V2
    print(f"Updating {MASTER_V2}...")
    v2_rows = []
    with open(MASTER_V2, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        v2_fields = reader.fieldnames
        for r in reader:
            v2_rows.append(r)
    
    existing_v2_keys = set(norm_name(r["Business_Name"]) for r in v2_rows)
    added_v2 = 0
    for r in new_rows:
        k = norm_name(r["Business_Name"])
        if k not in existing_v2_keys:
            row_dict = {f: r.get(f, "") for f in v2_fields}
            row_dict["Origin_Files"] = "batch_missing14.csv"
            row_dict["Sources_Count"] = "1"
            v2_rows.append(row_dict)
            existing_v2_keys.add(k)
            added_v2 += 1
    
    with open(MASTER_V2, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=v2_fields)
        writer.writeheader()
        writer.writerows(v2_rows)
    print(f"Master V2 updated: added {added_v2} new rows (Total: {len(v2_rows)})")

    # 2. Update Enriched Businesses V4
    print(f"Updating {ENRICHED_V4}...")
    v4_rows = []
    with open(ENRICHED_V4, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        v4_fields = reader.fieldnames
        for r in reader:
            v4_rows.append(r)
    
    clean_v4_fields = [f.lstrip("\ufeff") for f in v4_fields]
    existing_v4_keys = set(norm_name(r.get("Business_Name") or r.get("\ufeffBusiness_Name")) for r in v4_rows)
    added_v4 = 0
    for r in new_rows:
        k = norm_name(r["Business_Name"])
        if k not in existing_v4_keys:
            cat = r["Main_Category"]
            sector = CATEGORY_TO_SECTOR.get(cat, "أخرى")
            row_dict = {
                "Business_Name": r["Business_Name"],
                "Main_Category": cat,
                "City_Village": r["City_Village"],
                "Markaz": r["Markaz"],
                "Street": r.get("Street", ""),
                "Phone": r.get("Phone", ""),
                "Rating": r.get("Rating", ""),
                "Review_Count": r.get("Review_Count", ""),
                "Source_URL": r.get("Source_URL", ""),
                "Confidence": r.get("Confidence", "Medium"),
                "Origin_Files": "batch_missing14.csv",
                "Sources_Count": "1",
                "Normalized_Sector": sector
            }
            v4_rows.append(row_dict)
            existing_v4_keys.add(k)
            added_v4 += 1
            
    with open(ENRICHED_V4, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=clean_v4_fields)
        writer.writeheader()
        writer.writerows(v4_rows)
    print(f"Enriched V4 updated: added {added_v4} new rows (Total: {len(v4_rows)})")

    # 3. Update platform_data.json
    print(f"Updating {PLATFORM_DATA_V4}...")
    with open(PLATFORM_DATA_V4, "r", encoding="utf-8") as f:
        pdata = json.load(f)
        
    p_biz = pdata.get("businesses", [])
    existing_p_names = set(norm_name(b[0]) for b in p_biz)
    added_p = 0
    for r in new_rows:
        k = norm_name(r["Business_Name"])
        if k not in existing_p_names:
            cat = r["Main_Category"]
            sector = CATEGORY_TO_SECTOR.get(cat, "أخرى")
            # format: [name, sector, category, markaz, locality, street, phone, notes, confidence]
            p_rec = [
                r["Business_Name"],
                sector,
                cat,
                r["Markaz"],
                r["City_Village"],
                r.get("Street", ""),
                r.get("Phone", ""),
                f"Source: {r.get('Source_URL', '')}",
                r.get("Confidence", "Medium")
            ]
            p_biz.append(p_rec)
            existing_p_names.add(k)
            added_p += 1
            
    pdata["businesses"] = p_biz
    pdata["meta"]["total_businesses"] = len(p_biz)
    
    # Recalculate localities count
    localities = set(b[4] for b in p_biz if b[4])
    pdata["meta"]["total_localities"] = len(localities)

    with open(PLATFORM_DATA_V4, "w", encoding="utf-8") as f:
        json.dump(pdata, f, ensure_ascii=False, indent=2)
    print(f"platform_data.json updated: added {added_p} businesses (Total: {len(p_biz)}, Localities: {len(localities)})")

    # 4. Trigger build_data_v5.py
    print("Rebuilding V5 platform data...")
    ret = os.system("python3 /home/antigravity/project/platform_v5/build_data_v5.py")
    if ret == 0:
        print("V5 build succeeded!")
    else:
        print(f"V5 build exited with code {ret}")
    print("Update process completed successfully.")

if __name__ == "__main__":
    run_update()
