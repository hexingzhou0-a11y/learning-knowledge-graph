# Learning Knowledge Graph · Curriculum Dependency Explorer

English | **[中文](README.md)**

A **pure static web page**: type in any topic and instantly see its **prerequisites** (what must be learned first) and **what it unlocks** (what becomes available once it's mastered).

- 📚 1,590 topics and 3,216 dependency links, **fully embedded — works offline**, no internet needed
- 🌐 Bilingual interface: topics are shown in **Chinese** with **Chinese synonym search** (e.g. "一元一次方程", "正负数", "同类项"); English names also searchable
- 🚀 **Zero install** — unzip and double-click `index.html` to open in any browser
- 🎯 Built on the [Marble Skill Taxonomy](https://github.com/withmarbleapp/os-taxonomy) (UK/US ages 4–15 math & science); **highly applicable to 7th-grade math**

---

## Quick Start

**Easiest — grab the offline bundle:**

1. Go to this repo's [Releases](../../releases) page and download `学习知识图谱-离线版.zip` (offline version)
2. Unzip it anywhere
3. Double-click **`index.html`** inside the folder — it opens in your default browser

**Or use a local server (recommended for the smoothest experience):**

```bash
cd curriculum-graph
python -m http.server 8000
# then open http://localhost:8000 in your browser
```

---

## How to use it

1. **Search**: type a topic (Chinese or English) in the top search box, e.g. `一元一次方程`, `正负数`, `力`, `linear equations`, then click a result.
2. **7th-grade focus**: the default left-hand tab lists the most essential 7th-grade math topics — click to open.
3. **Browse by subject**: switch to the "📚 Browse by subject" tab to drill down by subject → domain (shows ages 9+ only).

When you select a topic, you'll see:

- 🟦 **Prerequisites** (each marked **hard / soft**, with a reason)
- 🟩 **Unlocks** (what becomes available after mastering it)
- ✅ **Mastery criteria** · 🗣️ **Quick verbal check** · **Related standards**

> 💡 **Core use case**: when a student is stuck on a topic, open it and follow the **prerequisites** upward to find the actual missing foundation — then patch that gap. Every dependency is clickable, so you can keep tracing back.

---

## Project structure

The main code lives in the [`curriculum-graph/`](curriculum-graph/) directory:

```
curriculum-graph/
├── index.html              ← entry point (double-click to open)
├── app.js / viz.js         ← core logic (search, graph traversal, visualization, rendering)
├── style.css               ← styles
├── data/                   ← embedded data (topics, dependencies, standards, Chinese translations)
├── scripts/                ← data-build scripts + translation sources
└── 部署说明.md             ← deployment notes (in Chinese)
```

For detailed developer notes, see [`curriculum-graph/README.md`](curriculum-graph/README.md).

---

## Editing / adding Chinese translations

Chinese translations live in `curriculum-graph/data/glossary.zh.js`. Each topic looks like:

```js
"mt_QhFEDyIwSO": {
  n: "解一元一次方程",                 // n: Chinese name (primary search key)
  a: ["一元一次方程", "解方程"],        // a: synonyms (optional, aids search)
  d: "用代数方法解…",                  // d: Chinese description (optional)
  e: ["能解一步…", "能解需要去括号…"]  // e: Chinese mastery criteria (optional)
}
```

To rebuild after an upstream os-taxonomy update: `cd curriculum-graph && node scripts/build-data.mjs`

---

## Data source & license

- Data from the [Marble Skill Taxonomy (os-taxonomy)](https://github.com/withmarbleapp/os-taxonomy)
- Based on the **UK/US IB system** — no Chinese national curriculum. **Math is highly transferable**; science is a useful supplement; English/history/language arts are not applicable.
- This is a **learning-path reference tool, not a question bank** — its value is in visualizing how topics depend on each other so you can pinpoint gaps.
- License: ODbL 1.0 (database) + CC BY-SA 4.0 (text content); attribution to Marble is required. See the source project for details.
