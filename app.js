/* 学习知识图谱 · 前端逻辑（纯原生，无依赖，可离线）
 * 数据来自 window.CG_DATA（topics/dependencies/standards）与 window.CG_GLOSSARY（中文词条表）
 */
(function () {
  "use strict";

  const D = window.CG_DATA || {};
  const G = window.CG_GLOSSARY || { subjects: {}, domains: {}, topics: {} };
  const NAMES = window.CG_NAMES || {};

  const TYPES = {
    CONCEPTUAL: "概念性", PROCEDURAL: "程序性", REPRESENTATIONAL: "表征性",
    LANGUAGE: "语言性", META: "元认知",
  };

  // ---------- 学习阶段（多年龄用户）----------
  const STAGES = [
    { key: "k", label: "学前", min: 4, max: 5 },
    { key: "p1", label: "小学低", min: 6, max: 8 },
    { key: "p2", label: "小学高", min: 9, max: 10 },
    { key: "j", label: "初中", min: 11, max: 99 },
  ];
  const stageOf = (age) => STAGES.find((s) => age >= s.min && age <= s.max) || STAGES[3];
  let currentStage = (() => { try { return localStorage.getItem("cg_stage") || "j"; } catch (e) { return "j"; } })();

  // ---------- 索引 ----------
  const topics = D.topics || [];
  const deps = D.dependencies || [];
  const standards = D.standards || {};
  const reasonZh = D.reasons || {}; // 英文原因 -> 中文翻译
  const EXTRA = window.CG_EXTRA || {}; // 补充的中文描述/掌握标准（id -> {d, e})
  const byId = new Map(topics.map((t) => [t.id, t]));

  // topicId -> 它依赖哪些前置（边：topicId 依赖 prerequisiteId）
  const prereqMap = new Map(); // id -> [{to, strength, reason}]
  // prerequisiteId -> 哪些后续以它为前置（反向：解锁）
  const unlockMap = new Map();
  for (const d of deps) {
    (prereqMap.get(d.topicId) || prereqMap.set(d.topicId, []).get(d.topicId))
      .push({ to: d.prerequisiteId, strength: d.strength, reason: d.reason });
    (unlockMap.get(d.prerequisiteId) || unlockMap.set(d.prerequisiteId, []).get(d.prerequisiteId))
      .push({ to: d.topicId, strength: d.strength, reason: d.reason });
  }

  // ---------- 翻译助手 ----------
  const gz = (id) => G.topics[id];
  function name(t) {
    const g = gz(t.id);
    if (g && g.n) return { zh: g.n, en: t.name, translated: true };
    if (NAMES[t.id]) return { zh: NAMES[t.id], en: t.name, translated: true };
    return { zh: null, en: t.name, translated: false };
  }
  const showName = (t) => { const n = name(t); return n.zh || n.en; };
  const domainZh = (t) => G.domains[t.domain] || t.domain;
  const subjectZh = (t) => G.subjects[t.subject] || t.subject;

  // ---------- DOM ----------
  const $ = (s) => document.querySelector(s);
  const search = $("#search");
  const suggest = $("#suggest");
  const detail = $("#detail");
  const tabs = $("#tabs");
  const curatedView = $("#curatedView");
  const browseView = $("#browseView");
  const graphPane = $("#graph");
  const viewtabs = $("#viewtabs");
  const subjFilter = $("#subjFilter");
  const stagebar = $("#stagebar");
  let currentId = null;
  let currentView = "detail";

  // ---------- 搜索 ----------
  let searchTimer = null;
  let activeIdx = -1;
  let currentMatches = [];

  function score(t, q) {
    const n = name(t);
    let s = 0;
    const enLow = (t.name || "").toLowerCase();
    const dz = domainZh(t), sz = subjectZh(t);
    const g = gz(t.id);
    const aliases = (g && g.a) || [];
    if (n.zh) {
      if (n.zh.startsWith(q)) s += 130;
      else if (n.zh.includes(q)) s += 100;
    }
    for (const a of aliases) {
      if (a.startsWith(q)) s += 125;
      else if (a.includes(q)) s += 95;
    }
    if (enLow.startsWith(q)) s += 70;
    else if (enLow.includes(q)) s += 50;
    if (dz.includes(q)) s += 30;
    if ((t.domain || "").toLowerCase().includes(q)) s += 18;
    if (sz.includes(q)) s += 15;
    if (n.translated) s += 6;
    return s;
  }

  function doSearch(q) {
    if (!q) { suggest.hidden = true; currentMatches = []; return; }
    const ranked = topics
      .map((t) => ({ t, s: score(t, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12);
    currentMatches = ranked.map((x) => x.t);
    activeIdx = -1;
    if (!currentMatches.length) {
      suggest.innerHTML = '<div class="item" style="cursor:default;color:#94a3b8">没有匹配的知识点（试试英文，如 linear equations）</div>';
      suggest.hidden = false;
      return;
    }
    suggest.innerHTML = currentMatches
      .map((t, i) => {
        const n = name(t);
        return `<div class="item${i === 0 ? " active" : ""}" data-i="${i}">
          <div class="n">${n.zh ? esc(n.zh) : esc(n.en)} ${n.translated ? "" : '<span class="badge badge-en">EN</span>'}</div>
          <div class="m">${esc(subjectZh(t))} · ${esc(domainZh(t))} · 年龄 ${t.ageStart}–${t.ageEnd}</div>
        </div>`;
      })
      .join("");
    suggest.hidden = false;
  }

  suggest.addEventListener("click", (e) => {
    const it = e.target.closest(".item");
    if (!it || it.dataset.i == null) return;
    selectTopic(currentMatches[+it.dataset.i].id);
    suggest.hidden = true;
    search.value = "";
  });

  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const q = search.value.trim();
    searchTimer = setTimeout(() => doSearch(q), 120);
  });
  search.addEventListener("keydown", (e) => {
    if (suggest.hidden || !currentMatches.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, currentMatches.length - 1); paintActive(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); paintActive(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const id = currentMatches[Math.max(0, activeIdx)].id;
      selectTopic(id); suggest.hidden = true; search.value = "";
    } else if (e.key === "Escape") { suggest.hidden = true; }
  });
  function paintActive() {
    [...suggest.querySelectorAll(".item")].forEach((el, i) =>
      el.classList.toggle("active", i === activeIdx));
    const el = suggest.querySelector(".item.active");
    if (el) el.scrollIntoView({ block: "nearest" });
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".searchwrap")) suggest.hidden = true;
  });

  // ---------- Tabs ----------
  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (!btn) return;
    [...tabs.children].forEach((b) => b.classList.toggle("active", b === btn));
    const tab = btn.dataset.tab;
    curatedView.hidden = tab !== "curated";
    browseView.hidden = tab !== "browse";
  });

  // ---------- 学习阶段切换 ----------
  function syncStageBtns() {
    [...stagebar.querySelectorAll(".stage")].forEach((b) => b.classList.toggle("on", b.dataset.stage === currentStage));
  }
  function setStage(key) {
    currentStage = key;
    try { localStorage.setItem("cg_stage", key); } catch (e) {}
    syncStageBtns();
    renderCurated();
    renderBrowse();
    renderBrowseBody(browseView.querySelector(".b-subj.on") ? browseView.querySelector(".b-subj.on").dataset.s : "全部");
  }
  stagebar.addEventListener("click", (e) => {
    const btn = e.target.closest("button.stage");
    if (btn) setStage(btn.dataset.stage);
  });

  // ---------- 本阶段重点（数据驱动：按重要性 centrality）----------
  function rowHtml(t) {
    const n = name(t);
    return `<button class="row" data-id="${t.id}">
      <div class="n">${n.zh ? esc(n.zh) : esc(n.en)} ${n.translated ? "" : '<span class="badge badge-en">EN</span>'}
        <span class="age">${t.ageStart}–${t.ageEnd}岁</span></div>
      <div class="m">${esc(subjectZh(t))} · ${esc(domainZh(t))}</div>
    </button>`;
  }
  function renderCurated() {
    const st = STAGES.find((s) => s.key === currentStage);
    const list = topics
      .filter((t) => (t.subject === "Mathematics" || t.subject === "Science") && t.ageStart >= st.min && t.ageStart <= st.max)
      .sort((a, b) => (b.centrality || 0) - (a.centrality || 0))
      .slice(0, 15);
    curatedView.innerHTML =
      `<div class="curated-intro"><strong>${st.label}重点</strong> · 按重要性选取的 ${list.length} 个核心知识点，点开查看前后依赖。</div>` +
      list.map(rowHtml).join("");
  }
  curatedView.addEventListener("click", (e) => {
    const r = e.target.closest(".row");
    if (r) selectTopic(r.dataset.id);
  });

  // ---------- Browse ----------
  const BROWSE_SUBJECTS = ["全部", "数学", "科学"];
  function renderBrowse() {
    const st = STAGES.find((s) => s.key === currentStage);
    browseView.innerHTML =
      `<div class="grouphead" style="padding-bottom:10px">学科：
        ${BROWSE_SUBJECTS.map((s, i) => `<button class="b-subj${i === 0 ? " on" : ""}" data-s="${esc(s)}" style="border:1px solid var(--line);background:#fff;border-radius:8px;padding:4px 10px;cursor:pointer;margin-right:6px;font-family:inherit;font-size:12.5px">${esc(s)}</button>`).join("")}
        <span style="display:block;margin-top:8px;color:#94a3b8;font-weight:400">仅显示 ${esc(st.label)}（${st.min}–${st.max}岁）知识点</span>
      </div>
      <div id="browseBody"></div>`;
    const subjBtns = browseView.querySelectorAll(".b-subj");
    subjBtns.forEach((b) => b.addEventListener("click", () => {
      subjBtns.forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      b.style.background = "var(--accent-soft)";
      b.style.borderColor = "var(--accent)";
      subjBtns.forEach((x) => { if (!x.classList.contains("on")) { x.style.background = "#fff"; x.style.borderColor = "var(--line)"; } });
      renderBrowseBody(b.dataset.s);
    }));
    // 初始高亮
    subjBtns[0].click();
  }
  function renderBrowseBody(subj) {
    const body = browseView.querySelector("#browseBody");
    const st = STAGES.find((s) => s.key === currentStage);
    let list = topics.filter((t) => t.ageStart >= st.min && t.ageStart <= st.max && (t.subject === "Mathematics" || t.subject === "Science"));
    if (subj !== "全部") list = list.filter((t) => subjectZh(t) === subj);
    // 按领域分组
    const groups = {};
    list.forEach((t) => { (groups[domainZh(t)] = groups[domainZh(t)] || []).push(t); });
    body.innerHTML = Object.keys(groups)
      .sort()
      .map((dom) => {
        const rows = groups[dom]
          .sort((a, b) => a.ageStart - b.ageStart)
          .map((t) => {
            const n = name(t);
            return `<button class="row" data-id="${t.id}">
              <div class="n">${n.zh ? esc(n.zh) : esc(n.en)} ${n.translated ? "" : '<span class="badge badge-en">EN</span>'}
                <span class="age">${t.ageStart}–${t.ageEnd}岁</span></div>
              <div class="m">${esc(subjectZh(t))}</div>
            </button>`;
          }).join("");
        return `<div class="grouphead">${esc(dom)} · ${groups[dom].length}</div>${rows}`;
      }).join("");
  }
  browseView.addEventListener("click", (e) => {
    const r = e.target.closest(".row");
    if (r && r.dataset.id) selectTopic(r.dataset.id);
  });

  // ---------- 详情 ----------
  // 年龄段（蓝色顺序色阶：越深越高阶；文本始终用主墨色，色块承载层级）
  // 注：数据为英制学段，ageStart 11 = 英国 Year 7 = 中国初一，故 11+ 归"初中"
  const BANDS = [
    { min: 4, max: 5, key: "k", label: "学前", color: "#9ec5f4" },
    { min: 6, max: 8, key: "p1", label: "小学低", color: "#5598e7" },
    { min: 9, max: 10, key: "p2", label: "小学高", color: "#256abf" },
    { min: 11, max: 99, key: "j", label: "初中", color: "#104281" },
  ];
  function ageBand(t) { const a = t.ageStart; return BANDS.find((b) => a >= b.min && a <= b.max) || BANDS[BANDS.length - 1]; }

  // 多跳可达（追溯全部祖先 / 后代）
  function reach(start, map) {
    const seen = new Set(), q = [start], out = new Set();
    while (q.length) { const c = q.shift(); for (const e of (map.get(c) || [])) { if (!seen.has(e.to)) { seen.add(e.to); out.add(e.to); q.push(e.to); } } }
    return out;
  }

  // 掌握度（浏览器本地保存）：todo | learning | done
  const MKEY = "cg_mastery_v1";
  let mastery = {};
  try { mastery = JSON.parse(localStorage.getItem(MKEY) || "{}"); } catch (e2) {}
  function saveMastery() { try { localStorage.setItem(MKEY, JSON.stringify(mastery)); } catch (e2) {} }
  function masteryState(id) { return mastery[id] || "todo"; }
  function cycleMastery(id) { const c = masteryState(id); mastery[id] = c === "todo" ? "learning" : c === "learning" ? "done" : "todo"; saveMastery(); }
  const MGLYPH = { todo: "☐", learning: "◐", done: "☑" };
  const MLABEL = { todo: "待学", learning: "学习中", done: "已掌握" };
  function mchk(id) { const s = masteryState(id); return `<span class="mchk m-${s}" data-mid="${id}" title="点击切换：待学→学习中→已掌握">${MGLYPH[s]}</span>`; }
  const ageTag = (t) => `<span class="age">${t.ageStart}–${t.ageEnd}岁</span>`;
  function nmSpan(t) {
    const n = name(t);
    return `<span class="nm" data-id="${t.id}">${n.zh ? esc(n.zh) : esc(n.en)}</span>${n.translated ? "" : ' <span class="badge badge-en">EN</span>'}`;
  }

  function edgeHtml(e) {
    const t = byId.get(e.to); if (!t) return "";
    const reason = e.reason ? (reasonZh[e.reason] || e.reason) : "";
    return `<div class="edge"><div class="top"><span class="badge ${e.strength === "hard" ? "badge-hard" : "badge-soft"}">${e.strength === "hard" ? "硬性" : "软性"}</span>${nmSpan(t)}${ageTag(t)}</div>${reason ? `<div class="rs"><b>如何承接：</b>${esc(reason)}</div>` : ""}</div>`;
  }
  function prereqItemHtml(e) {
    const t = byId.get(e.to); if (!t) return "";
    const reason = e.reason ? (reasonZh[e.reason] || e.reason) : "";
    return `<div class="edge pedge"><div class="top">${mchk(e.to)}<span class="badge ${e.strength === "hard" ? "badge-hard" : "badge-soft"}">${e.strength === "hard" ? "硬性" : "软性"}</span>${nmSpan(t)}${ageTag(t)}</div>${reason ? `<div class="rs"><b>为什么是前置：</b>${esc(reason)}</div>` : ""}</div>`;
  }
  // 深层基础链（按年龄段分组）
  function deepChainHtml(ids) {
    const groups = {};
    for (const pid of ids) { const t = byId.get(pid); if (!t) continue; const b = ageBand(t); (groups[b.key] = groups[b.key] || { b, items: [] }).items.push(t); }
    return ["k", "p1", "p2", "j"].filter((k) => groups[k]).map((k) => {
      const g = groups[k]; g.items.sort((a, b) => a.ageStart - b.ageStart);
      return `<div class="dc-group"><div class="dc-head"><i style="background:${g.b.color}"></i>${g.b.label} · ${g.items.length}</div><div class="dc-items">${g.items.map(nmSpan).join("")}</div></div>`;
    }).join("");
  }
  // 同级相关（同领域、年龄相近，排除已出现的）
  function relatedHtml(t, excl) {
    const list = topics.filter((x) => x.id !== t.id && !excl.has(x.id) && x.subject === t.subject && x.domain === t.domain && Math.abs(x.ageStart - t.ageStart) <= 2)
      .sort((a, b) => a.ageStart - b.ageStart).slice(0, 8);
    if (!list.length) return "";
    return `<div class="block"><h3>🔗 同级相关 <span class="hint">— 同领域、年龄相近</span></h3><div class="rel-list">${list.map((x) => `<span class="rel">${nmSpan(x)}</span>`).join("")}</div></div>`;
  }

  function selectTopic(id) {
    const t = byId.get(id);
    if (!t) return;
    currentId = id;
    const n = name(t);
    const g = gz(id);
    const direct = (prereqMap.get(id) || []).slice().sort((a, b) => (a.strength === b.strength ? 0 : a.strength === "hard" ? -1 : 1));
    const unlocks = unlockMap.get(id) || [];
    const directIds = new Set(direct.map((e) => e.to));
    const unlockIds = new Set(unlocks.map((e) => e.to));

    const ancestors = reach(id, prereqMap);
    const descendants = reach(id, unlockMap);
    const deepIds = [...ancestors].filter((pid) => !directIds.has(pid));

    const descZh = (g && g.d) || (EXTRA[id] && EXTRA[id].d) || null;
    const descEn = t.description ? t.description : null;
    const evZh = (g && g.e) || (EXTRA[id] && EXTRA[id].e) || null;
    const evEn = t.evidence && t.evidence.length ? t.evidence : null;
    const promptText = (EXTRA[id] && EXTRA[id].p) || t.assessmentPrompt;

    const band = ageBand(t);
    const doneN = direct.filter((e) => masteryState(e.to) === "done").length;
    const selfM = masteryState(id);

    const assess = promptText ? `<div class="block"><h3>🗣️ 口头检验</h3><div class="assess"><span class="label">可以这样问孩子：</span>${esc(promptText.replace(/\{\{name\}\}/g, "孩子"))}</div></div>` : "";
    const stdHtml = (t.standards && t.standards.length) ? `<div class="stdlist"><b>对应课标：</b> ${t.standards.slice(0, 8).map((k) => { const s = standards[k]; const label = s ? `${esc(s.code)}${s.title ? " · " + esc(s.title) : ""}` : esc(k); return `<code title="${esc(s ? s.curriculum : "")}">${label}</code>`; }).join(" ")}</div>` : "";

    detail.innerHTML = `
      <div class="d-head">
        <div class="d-title-row">
          <h2 class="d-title">${n.zh ? esc(n.zh) : esc(n.en)}${n.translated && n.zh !== n.en ? ` <span class="d-en">${esc(n.en)}</span>` : ""}${n.translated ? "" : ' <span class="badge badge-en">英文原文·待翻译</span>'}</h2>
          <button class="self-mastery m-${selfM}" title="标记此知识点的掌握度">${MGLYPH[selfM]} ${MLABEL[selfM]}</button>
        </div>
        <div class="d-meta">
          <span class="band" style="--bc:${band.color}"><i></i>${band.label} · ${t.ageStart}–${t.ageEnd}岁</span>
          <span class="pill">${esc(subjectZh(t))}</span>
          <span class="pill">${esc(domainZh(t))}</span>
          <span class="pill">${esc(TYPES[t.type] || t.type)}</span>
        </div>
      </div>

      ${(descZh || descEn) ? `<div class="d-desc"><span class="label">${descZh ? "中文说明" : "英文说明（原文）"}</span>${esc(descZh || descEn)}</div>` : ""}

      <div class="block">
        <h3>🟦 学前基础 <span class="hint">— 必须先掌握</span>${direct.length ? `<span class="prog" id="dprog">已掌握 ${doneN}/${direct.length}</span>` : ""}</h3>
        ${direct.length ? direct.map((e) => prereqItemHtml(e)).join("") : '<div class="empty-edge">这个知识点没有前置依赖，是基础起点。</div>'}
        ${deepIds.length ? `<button class="deepbtn">展开完整基础链（共 ${ancestors.size} 个） ▾</button><div class="deepchain" hidden>${deepChainHtml(deepIds)}</div><div class="deep-hint">或在 <b>🛤️路径图</b> 查看完整学习路线</div>` : ""}
      </div>

      <div class="block">
        <h3>🟩 学会后解锁 <span class="hint">— 掌握后能学这些</span></h3>
        ${unlocks.length ? unlocks.map((e) => edgeHtml(e)).join("") : '<div class="empty-edge">暂时没有以它为前置的后续知识点。</div>'}
        ${descendants.size ? `<div class="deep-hint">共可解锁 <b>${descendants.size}</b> 个后续知识点（含间接）</div>` : ""}
      </div>

      ${(evZh || evEn) ? `<div class="block"><h3>✅ 掌握标准 <span class="hint">— 怎么算"学会了"</span></h3><ol class="list-evidence">${(evZh || evEn).map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>` : ""}

      ${assess}
      ${relatedHtml(t, new Set([...directIds, ...unlockIds, id]))}
      ${stdHtml}
    `;

    // 名字点击跳转
    detail.querySelectorAll(".nm").forEach((el) => el.addEventListener("click", () => selectTopic(el.dataset.id)));
    // 前置基础掌握度勾选
    detail.querySelectorAll(".mchk").forEach((el) => {
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const mid = el.dataset.mid;
        cycleMastery(mid);
        const s = masteryState(mid);
        el.className = "mchk m-" + s; el.textContent = MGLYPH[s];
        const prog = detail.querySelector("#dprog");
        if (prog) { const dn = direct.filter((e) => masteryState(e.to) === "done").length; prog.textContent = "已掌握 " + dn + "/" + direct.length; }
      });
    });
    // 当前知识点掌握度
    const sm = detail.querySelector(".self-mastery");
    if (sm) sm.addEventListener("click", () => { cycleMastery(id); const s = masteryState(id); sm.className = "self-mastery m-" + s; sm.textContent = MGLYPH[s] + " " + MLABEL[s]; });
    // 深层基础链展开/收起
    const dc = detail.querySelector(".deepchain"), dcb = detail.querySelector(".deepbtn");
    if (dcb) dcb.addEventListener("click", () => {
      const willOpen = dc.hasAttribute("hidden");
      dc.hidden = !willOpen;
      dcb.textContent = willOpen ? "收起 ▴" : `展开完整基础链（共 ${ancestors.size} 个） ▾`;
    });

    // 联动可视化（聚焦/路径随选中节点刷新；全景高亮该节点）
    if (window.VIZ) VIZ.onTopicSelected(id);
  }

  // 点击详情里的名字后，在移动端滚到详情
  detail.addEventListener("click", () => {
    if (window.innerWidth <= 880) detail.scrollIntoView({ behavior: "smooth" });
  });

  // ---------- utils ----------
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ---------- 可视化：四视图切换 ----------
  function setView(view) {
    currentView = view;
    [...viewtabs.children].forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    const showGraph = view !== "detail";
    document.body.classList.toggle("graph-mode", showGraph); // 先切布局，让容器已是全尺寸
    graphPane.hidden = !showGraph;
    detail.hidden = showGraph; // 详情与图谱互斥显示
    if (subjFilter) subjFilter.hidden = view !== "overview"; // 学科筛选仅全景显示
    if (showGraph && window.VIZ) {
      const id = currentId || "mt_QhFEDyIwSO";
      VIZ.show(view === "overview" ? "overview" : view, id);
    }
  }
  viewtabs.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (btn) setView(btn.dataset.view);
  });
  subjFilter && subjFilter.addEventListener("click", (e) => {
    const btn = e.target.closest("button.sf");
    if (!btn || !window.VIZ) return;
    [...subjFilter.querySelectorAll(".sf")].forEach((b) => b.classList.toggle("on", b === btn));
    VIZ.setOverviewFilter(btn.dataset.area);
  });
  function buildLegend() {
    const legend = $("#legend");
    if (!legend) return;
    const C = (window.VIZ && VIZ.COLORS) || { math: "#2a78d6", phys: "#eb6834", life: "#1baf7a" };
    const L = (window.VIZ && VIZ.AREA_LABEL) || { math: "数学", phys: "物理科学", life: "生物·地球" };
    legend.innerHTML =
      ["math", "phys", "life"].map((k) => `<span class="lg"><i style="background:${C[k]}"></i>${L[k]}</span>`).join("") +
      `<span class="lg lg-edge"><i class="lg-line"></i>硬性依赖</span>` +
      `<span class="lg lg-edge"><i class="lg-line dashed"></i>软性依赖</span>` +
      `<span class="lg-tip">箭头＝学习先后；点节点看详情，聚焦/路径下点节点即跳转</span>`;
  }

  // ---------- 启动 ----------
  syncStageBtns();
  renderCurated();
  renderBrowse();
  if (window.VIZ) {
    VIZ.init(document.getElementById("viz"), selectTopic);
    buildLegend();
  }
  // 默认选中本阶段最重要的知识点
  const _st = STAGES.find((s) => s.key === currentStage);
  const _top = topics.filter((t) => (t.subject === "Mathematics" || t.subject === "Science") && t.ageStart >= _st.min && t.ageStart <= _st.max).sort((a, b) => (b.centrality || 0) - (a.centrality || 0))[0];
  selectTopic(_top ? _top.id : "mt_QhFEDyIwSO");
})();
