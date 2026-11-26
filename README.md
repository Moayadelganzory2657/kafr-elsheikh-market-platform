# منصة كفر الشيخ الذكية لدراسة السوق والأنشطة التجارية (الإصدار السادس V6)
# Kafr El-Sheikh Market Platform V6 — Institutional & Investor Edition

[**🌐 Live Platform Link / رابط المنصة المباشر**](https://moayadelganzory2657.github.io/kafr-elsheikh-market-platform/)

---

## 📖 نظرة عامة باللغة العربية (Arabic Overview)

منصة استثمارية تفاعلية شاملة مبنية لدراسة السوق والأنشطة التجارية في محافظة كفر الشيخ، مصر. يوفر الإصدار السادس (V6) تعداداً تجارياً شاملاً وموثقاً بالأدلة عبر كافة المراكز والمدن والقرى التابعة للمحافظة، مع تحليل الجدوى المالية وحساب الفجوات الاستثمارية.

### 🌟 أبرز مميزات المنصة وبياناتها:
1. **تعداد تجاري شامل (3,661 منشأة تجارية موثقة)**:
   - تغطية شاملة لكافة المراكز الإدارية الـ 14 بمحافظة كفر الشيخ (كفر الشيخ، دسوق، فوة، مطوبس، سيدي سالم، بيلا، الحامول، الرياض، قلين، بلطيم، مصيف بلطيم، برج البرلس، سيدي غازي، وغيرها).
   - تصنيف دقيق للأنشطة وفق القطاعات الاقتصادية (التجزئة، الجملة، الخدمات، الصحة، التعليم، الصناعة، الأغذية والمشروبات، واللوجستيات).
2. **تحليلات الجدوى المالية والاستثمارية**:
   - مؤشرات العائد الداخلي على الاستثمار (IRR).
   - صافي القيمة الحالية (NPV).
   - فترات استرداد رأس المال (Payback Periods).
   - أحجام الأسواق الكلية والمستهدفة (TAM, SAM, SOM) لكل نشاط تجاري.
3. **أدوات تفاعلية متقدمة**:
   - خرائط جغرافية تفاعلية مبنية بواسطة Leaflet لتحديد مواقع الأنشطة وتوزيع الكثافات.
   - رسوم بيانية ديناميكية بواسطة Chart.js لتحليل الحصص السوقية والإيرادات المتوقعة.
   - محرك بحث وتصفية متقدم مع إمكانية تصدير البيانات إلى جداول CSV.
   - منصة مستقلة تماماً (Standalone Client-Side Architecture) تعمل مباشرة في المتصفح بأقصى سرعة ودون الحاجة لخوادم خلفية.

---

## 🌐 English Overview

The **Kafr El-Sheikh Market Platform V6 (Institutional & Investor Edition)** is an advanced, evidence-based commercial intelligence and investment decision-support platform for Kafr El-Sheikh Governorate, Egypt.

### 🌟 Key Platform Capabilities & Highlights:
- **3,661 Verified Commercial Entities**: Complete enumeration across all 14 administrative markaz and municipal centers.
- **Financial Feasibility Modeling**: Real-world benchmarks for Internal Rate of Return (IRR), Net Present Value (NPV), Payback Periods, and Market Size estimations (TAM, SAM, SOM).
- **Interactive Geospatial & Visual Analytics**: Interactive Leaflet maps with cluster analysis, and dynamic Chart.js dashboards.
- **100% Client-Side Standalone Execution**: All datasets are embedded directly, ensuring zero-latency offline and online execution via GitHub Pages.

---

## 🚀 Live Access / رابط الاستعراض المباشر

- **GitHub Pages Live URL**: [https://moayadelganzory2657.github.io/kafr-elsheikh-market-platform/](https://moayadelganzory2657.github.io/kafr-elsheikh-market-platform/)
- **Direct V6 HTML File**: [https://moayadelganzory2657.github.io/kafr-elsheikh-market-platform/platform_v6/Kafr_ElSheikh_Market_Platform_V6_Investor.html](https://moayadelganzory2657.github.io/kafr-elsheikh-market-platform/platform_v6/Kafr_ElSheikh_Market_Platform_V6_Investor.html)

---

## 📁 هيكل المشروع / Directory Structure

```text
kafr-elsheikh-market-platform/
├── index.html                   # Entrypoint for GitHub Pages (V6 Investor Edition)
├── README.md                    # Bilingual Project Documentation
├── .gitignore                   # Standard development & OS ignores
├── GOAL.md                      # Commercial census project charter and objectives
├── platform_v6/                 # V6 Release Files
│   ├── Kafr_ElSheikh_Market_Platform_V6_Investor.html  # Standalone standalone platform file
│   ├── platform_data_v6.json    # Structured JSON platform dataset (3,661 businesses)
│   └── enriched_businesses_v6.csv # Enriched CSV census export
├── files/                       # Core census datasets & analytical reports
│   ├── master_business_database_v6.csv
│   └── ...
├── census_v6/                   # Data pipelines and batch ETL scripts
│   ├── build_pipeline_v6.py
│   ├── update_master_and_platform.py
│   └── batches/
├── platform_v5/                 # Historical V5 release
└── platform/                    # Historical V4 release
```

---

## 🛠️ التشغيل المحلي / Local Development

لتشغيل المنصة محلياً على جهازك:
```bash
# Clone the repository
git clone https://github.com/Moayadelganzory2657/kafr-elsheikh-market-platform.git
cd kafr-elsheikh-market-platform

# Open index.html directly in any browser, or run a lightweight local HTTP server:
python3 -m http.server 8080
# Open http://localhost:8080 in your browser
```

---

## 📊 البيانات والحقوق / Data & Attribution
تم جمع وإعداد وتحليل هذه البيانات كجزء من التعداد التجاري لمحافظة كفر الشيخ (Kafr El-Sheikh Commercial Census Project). جميع الحقوق محفوظة © 2026.
