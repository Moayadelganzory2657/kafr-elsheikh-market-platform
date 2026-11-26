#!/usr/bin/env python3
"""
Build script for Kafr El-Sheikh Commercial Platform V5 (Institutional Investor Edition).
Reads V4 platform_data.json and outputs V5 platform_data_v5.json with all V4 fields
preserved plus institutional financial, market sizing, concentration, and data quality metrics.
"""

import json
import math
from pathlib import Path
from collections import defaultdict

INPUT_PATH = Path("/home/antigravity/project/platform/platform_data.json")
OUTPUT_PATH = Path("/home/antigravity/project/platform_v5/platform_data_v5.json")

FX_RATE_EGP_PER_USD = 50.0
DISCOUNT_RATE = 0.18
DISCOUNT_RATE_PCT = 18.0

GROWTH_RATES = {
    "متنامي بقوة": 0.06,
    "مستقر": 0.03,
    "موسمي": 0.04,
}


def compute_hhi(counts):
    """Compute Herfindahl-Hirschman Index (0 - 10000) from a sequence of counts."""
    total = sum(counts)
    if total <= 0:
        return 0.0
    return round(sum(((c / total) * 100.0) ** 2 for c in counts), 1)


def compute_npv(capex, annual_net_y1, growth_rate, discount_rate=DISCOUNT_RATE, years=5):
    """Compute 5-year NPV at the given discount rate."""
    npv = -float(capex)
    for t in range(1, years + 1):
        cf_t = annual_net_y1 * ((1.0 + growth_rate) ** (t - 1))
        npv += cf_t / ((1.0 + discount_rate) ** t)
    return round(npv)


def compute_irr(capex, annual_net_y1, growth_rate, years=5):
    """Compute 5-year IRR (%) using bisection solver on [-capex, cf_1, ..., cf_5]."""
    if capex <= 0:
        return 0.0
    if annual_net_y1 <= 0:
        return -99.9

    cfs = [-float(capex)] + [
        annual_net_y1 * ((1.0 + growth_rate) ** (t - 1)) for t in range(1, years + 1)
    ]

    def npv_at(r):
        total = 0.0
        for t, cf in enumerate(cfs):
            total += cf / ((1.0 + r) ** t)
        return total

    low = -0.95
    high = 10.0
    f_low = npv_at(low)
    f_high = npv_at(high)

    # Expand upper bound if IRR > 1000%
    while f_high > 0 and high < 1000.0:
        high *= 2.0
        f_high = npv_at(high)

    if f_low * f_high > 0:
        # Either always negative or always positive
        return -95.0 if f_low < 0 else round(high * 100.0, 1)

    for _ in range(100):
        mid = (low + high) / 2.0
        f_mid = npv_at(mid)
        if abs(f_mid) < 1e-6:
            break
        if f_low * f_mid <= 0:
            high = mid
            f_high = f_mid
        else:
            low = mid
            f_low = f_mid

    return round(((low + high) / 2.0) * 100.0, 1)


def compute_data_quality(records):
    """
    Compute confidence breakdown and 0-100 data quality score from business records.
    Record layout: [name, sector, category, markaz, locality, street, phone, notes, confidence]
    """
    high = 0
    medium = 0
    low = 0
    street_filled = 0
    phone_filled = 0

    for r in records:
        conf = (r[8] or "").strip().lower()
        if conf == "high":
            high += 1
        elif conf == "medium":
            medium += 1
        else:
            low += 1

        if r[5] and str(r[5]).strip():
            street_filled += 1
        if r[6] and str(r[6]).strip():
            phone_filled += 1

    n = len(records)
    breakdown = {"high": high, "medium": medium, "low": low}
    if n == 0:
        return breakdown, 50.0

    conf_score = (high * 100.0 + medium * 65.0 + low * 30.0) / n
    street_pct = (street_filled / n) * 100.0
    phone_pct = (phone_filled / n) * 100.0
    dq_score = round(0.65 * conf_score + 0.20 * street_pct + 0.15 * phone_pct, 1)
    return breakdown, dq_score


def validate_no_nan_inf(obj, path="root"):
    """Recursively verify no NaN or Infinity float values exist."""
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            raise ValueError(f"Invalid float {obj} at {path}")
    elif isinstance(obj, dict):
        for k, v in obj.items():
            validate_no_nan_inf(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            validate_no_nan_inf(v, f"{path}[{i}]")


def main():
    with INPUT_PATH.open("r", encoding="utf-8") as f:
        data = json.load(f)

    businesses = data.get("businesses", [])
    matrix = data.get("matrix", {})
    markaz_info = data.get("markaz_info", [])
    sectors_summary = data.get("sectors_summary", [])
    activities_catalog = data.get("activities_catalog", [])

    # Group businesses by markaz and by sector
    biz_by_markaz = defaultdict(list)
    biz_by_sector = defaultdict(list)
    for b in businesses:
        biz_by_markaz[b[3]].append(b)
        biz_by_sector[b[1]].append(b)

    # 1. Enrich markaz_info
    total_tam_egp_m = 0.0
    dq_scores = []
    for m in markaz_info:
        name = m["name"]
        pop = m.get("population_est", 0)
        b_count = m.get("business_count", 0)

        per_10k_density = round(b_count / (pop / 10000.0), 2) if pop > 0 else 0.0
        sector_counts = [v.get("count", 0) for v in matrix.get(name, {}).values()]
        hhi_index = compute_hhi(sector_counts)

        # Institutional TAM estimate (million EGP/year):
        # Base annual commercial spend per capita (~18,500 EGP) scaled by commercial density
        density_factor = min(1.65, max(0.75, 0.85 + (per_10k_density / 40.0)))
        tam_egp_m = round((pop * 18500.0 * density_factor) / 1_000_000.0, 1)

        conf_breakdown, dq_score = compute_data_quality(biz_by_markaz.get(name, []))

        m["per_10k_density"] = per_10k_density
        m["hhi_index"] = hhi_index
        m["tam_egp_m"] = tam_egp_m
        m["confidence_breakdown"] = conf_breakdown
        m["data_quality_score"] = dq_score

        total_tam_egp_m += tam_egp_m
        dq_scores.append(dq_score)

    total_tam_egp_m = round(total_tam_egp_m, 1)
    avg_data_quality_score = round(sum(dq_scores) / len(dq_scores), 1) if dq_scores else 0.0

    # Pre-compute sector data quality scores for provenance & sectors_summary
    sector_dq_map = {}
    for s in sectors_summary:
        s_name = s["sector"]
        _, s_dq = compute_data_quality(biz_by_sector.get(s_name, []))
        sector_dq_map[s_name] = s_dq

    # 2. Enrich activities_catalog
    sector_irrs = defaultdict(list)
    for act in activities_catalog:
        cap_min = act["capital_min_egp"]
        cap_max = act["capital_max_egp"]
        monthly_rev = act["monthly_revenue_est_egp"]
        margin_pct = act["profit_margin_pct"]
        demand_trend = act.get("demand_trend", "مستقر")
        sat_level = act.get("saturation_level", "متوسط")
        opp_score = act.get("opportunity_score", 70)
        risks = act.get("risks", [])
        existing_count = act.get("existing_count", 0)
        sector_name = act.get("sector", "")

        capex_egp = round((cap_min + cap_max) / 2.0)
        monthly_opex_egp = round(monthly_rev * (1.0 - margin_pct / 100.0))
        ebitda_margin_pct = round(margin_pct + 4.5, 1)

        monthly_net_base = monthly_rev * (margin_pct / 100.0)
        annual_net_base = monthly_net_base * 12.0
        roi_annual_pct = round((annual_net_base / capex_egp) * 100.0, 1) if capex_egp > 0 else 0.0

        growth_rate = GROWTH_RATES.get(demand_trend, 0.03)
        irr_5yr_pct = compute_irr(capex_egp, annual_net_base, growth_rate, years=5)
        npv_egp = compute_npv(capex_egp, annual_net_base, growth_rate, DISCOUNT_RATE, years=5)
        break_even_months = round(capex_egp / max(1.0, monthly_net_base), 1)

        # Risk score (1-100, higher = riskier)
        sat_base = {"منخفض": 24, "متوسط": 44, "مرتفع": 66}.get(sat_level, 44)
        capex_risk = min(18, round((capex_egp / 1_000_000.0) * 3.5))
        season_risk = 10 if demand_trend == "موسمي" else (3 if demand_trend == "متنامي بقوة" else 0)
        risks_count_penalty = min(12, len(risks) * 3)
        risk_score = max(1, min(100, int(sat_base + capex_risk + season_risk + risks_count_penalty)))

        # 2x2 Quadrant classification
        high_opp = opp_score >= 76
        low_risk = risk_score <= 48
        if high_opp and low_risk:
            quadrant = "الفرص الذهبية"
        elif high_opp and not low_risk:
            quadrant = "نمو انتقائي"
        elif not high_opp and low_risk:
            quadrant = "سيولة مستقرة"
        else:
            quadrant = "تحوط ومراقبة"

        # Activity TAM / SAM / SOM (million EGP)
        som_egp_m = round(((monthly_rev * 12.0) / 1_000_000.0) * 2.5, 2)
        sam_egp_m = round(som_egp_m * 4.5, 2)
        tam_egp_m = round(sam_egp_m * 2.8, 2)

        # Scenarios: conservative, base, optimistic
        scenario_specs = {
            "conservative": (0.78, 1.05),
            "base": (1.00, 1.00),
            "optimistic": (1.22, 0.96),
        }
        scenarios = {}
        for s_key, (rev_mult, opex_mult) in scenario_specs.items():
            s_rev = monthly_rev * rev_mult
            s_opex = monthly_opex_egp * opex_mult
            s_net = s_rev - s_opex
            s_annual_net = s_net * 12.0
            s_irr = compute_irr(capex_egp, s_annual_net, growth_rate, years=5)
            s_npv = compute_npv(capex_egp, s_annual_net, growth_rate, DISCOUNT_RATE, years=5)
            s_payback = round(capex_egp / s_net, 1) if s_net > 0 else 999.0
            scenarios[s_key] = {
                "monthly_rev_egp": round(s_rev),
                "monthly_net_egp": round(s_net),
                "irr_pct": s_irr,
                "npv_egp": s_npv,
                "payback_months": s_payback,
            }

        # Data provenance
        s_dq = sector_dq_map.get(sector_name, avg_data_quality_score)
        model_conf = int(max(72, min(94, round(74 + min(12, existing_count * 0.4) + (s_dq - 50.0) * 0.25))))
        data_provenance = {
            "verified_records": existing_count,
            "model_confidence_pct": model_conf,
            "sources": [
                "حصر كفر الشيخ التجاري (3,534 سجل)",
                "الجرائد الرسمية وخرائط جوجل",
                "نموذج تقدير مالي معياري",
            ],
        }

        act["capex_egp"] = capex_egp
        act["monthly_opex_egp"] = monthly_opex_egp
        act["ebitda_margin_pct"] = ebitda_margin_pct
        act["roi_annual_pct"] = roi_annual_pct
        act["irr_5yr_pct"] = irr_5yr_pct
        act["npv_egp"] = npv_egp
        act["break_even_months"] = break_even_months
        act["risk_score"] = risk_score
        act["quadrant"] = quadrant
        act["tam_egp_m"] = tam_egp_m
        act["sam_egp_m"] = sam_egp_m
        act["som_egp_m"] = som_egp_m
        act["scenarios"] = scenarios
        act["data_provenance"] = data_provenance

        sector_irrs[sector_name].append(irr_5yr_pct)

    # 3. Enrich sectors_summary
    total_biz = max(1, sum(s.get("count", 0) for s in sectors_summary))
    sum_opp = max(1, sum(s.get("opportunity_score", 50) for s in sectors_summary))

    for s in sectors_summary:
        s_name = s["sector"]
        s_count = s.get("count", 0)
        s_opp = s.get("opportunity_score", 50)

        # Allocate total_tam_egp_m across sectors by blended market presence + opportunity
        weight = 0.55 * (s_count / total_biz) + 0.45 * (s_opp / sum_opp)
        s_tam = round(total_tam_egp_m * weight, 1)
        s_sam = round(s_tam * (0.32 + 0.0025 * s_opp), 1)
        s_som = round(s_sam * (0.10 + 0.0012 * s_opp), 1)

        # HHI of how concentrated this sector is across the 14 Markaz
        markaz_counts = [
            matrix.get(m["name"], {}).get(s_name, {}).get("count", 0) for m in markaz_info
        ]
        hhi_markaz_conc = compute_hhi(markaz_counts)

        # Average 5-year IRR of activities in this sector (or realistic benchmark)
        if sector_irrs.get(s_name):
            avg_irr_pct = round(sum(sector_irrs[s_name]) / len(sector_irrs[s_name]), 1)
        else:
            avg_irr_pct = round(max(18.0, min(55.0, 24.0 + (s_opp - 50) * 0.45)), 1)

        s["tam_egp_m"] = s_tam
        s["sam_egp_m"] = s_sam
        s["som_egp_m"] = s_som
        s["hhi_markaz_concentration"] = hhi_markaz_conc
        s["avg_irr_pct"] = avg_irr_pct
        s["data_quality_score"] = sector_dq_map.get(s_name, avg_data_quality_score)

    # 4. Enrich meta
    meta = data["meta"]
    meta["version"] = "V5 Institutional Investor Edition"
    meta["fx_rate_egp_per_usd"] = FX_RATE_EGP_PER_USD
    meta["discount_rate_pct"] = DISCOUNT_RATE_PCT
    meta["total_tam_egp_m"] = total_tam_egp_m
    meta["avg_data_quality_score"] = avg_data_quality_score

    # Validate no NaN or Infinity
    validate_no_nan_inf(data)

    # Write compact JSON
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)

    # Print summary verification
    quadrants = defaultdict(int)
    for act in activities_catalog:
        quadrants[act["quadrant"]] += 1

    print(f"Successfully generated: {OUTPUT_PATH}")
    print(f"File size: {OUTPUT_PATH.stat().st_size:,} bytes")
    print(f"Meta: {json.dumps(meta, ensure_ascii=False)}")
    print(f"Total TAM (EGP M): {total_tam_egp_m:,.1f} (~${total_tam_egp_m / FX_RATE_EGP_PER_USD:,.1f}M USD)")
    print(f"Avg Data Quality Score: {avg_data_quality_score}/100")
    print(f"Quadrant distribution: {dict(quadrants)}")
    top_irr = sorted(activities_catalog, key=lambda x: x["irr_5yr_pct"], reverse=True)[:3]
    print("Top 3 activities by 5-yr IRR:")
    for a in top_irr:
        print(f"  - {a['name']} | IRR: {a['irr_5yr_pct']}% | NPV: {a['npv_egp']:,} EGP | Risk: {a['risk_score']} | {a['quadrant']}")


if __name__ == "__main__":
    main()
