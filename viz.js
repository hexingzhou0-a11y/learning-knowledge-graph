/* viz.js — 知识图谱可视化（基于本地 vis-network，离线可用）
 * 三视图：①聚焦(1跳邻居) ②路径(祖先+后代) ③全景(全部已译知识点)
 * 配色按 dataviz 规范：数学/物理/生物·地球 三色（已验证色盲安全）。
 * 数据来自 window.CG_DATA / CG_GLOSSARY / CG_EXTRA。
 */
(function () {
  "use strict";
  const D = window.CG_DATA || {};
  const G = window.CG_GLOSSARY || { topics: {} };
  const X = window.CG_EXTRA || {};
  const NAMES = window.CG_NAMES || {};
  const vis = window.vis;
  if (!vis) { console.error("vis-network 未加载"); return; }

  const topics = D.topics || [];
  const deps = D.dependencies || [];
  const reasonZh = D.reasons || {};
  const byId = new Map(topics.map((t) => [t.id, t]));
  const translated = new Set(Object.keys(G.topics));

  // ---- 图索引：prereqMap(id)->[前置id] ；unlockMap(id)->[后续id] ----
  const prereqMap = new Map(), unlockMap = new Map(), edgeLookup = new Map();
  const push = (m, k, v) => { (m.get(k) || m.set(k, []).get(k)).push(v); };
  for (const d of deps) {
    push(prereqMap, d.topicId, d.prerequisiteId);
    push(unlockMap, d.prerequisiteId, d.topicId);
    edgeLookup.set(d.prerequisiteId + "→" + d.topicId, d);
  }
  // BFS 收集祖先 / 后代
  function reach(start, map, cap) {
    const seen = new Set(), q = [start], out = new Set();
    while (q.length) {
      const n = q.shift();
      for (const m of (map.get(n) || [])) {
        if (!seen.has(m)) { seen.add(m); out.add(m); q.push(m); if (out.size > cap) return out; }
      }
    }
    return out;
  }

  // ---- 学科分组与配色 ----
  const PHYS = new Set(["Forces & Motion", "Energy", "Matter & Materials", "Waves, Light & Sound"]);
  function areaOf(t) {
    if (t.subject === "Mathematics") return "math";
    if (t.subject === "Science") return PHYS.has(t.domain) ? "phys" : "life";
    return "other";
  }
  const COLORS = { math: "#2a78d6", phys: "#eb6834", life: "#1baf7a", other: "#898781" };
  const AREA_LABEL = { math: "数学", phys: "物理科学", life: "生物·地球", other: "其他" };

  // 路径/聚焦显示哪些节点：选中点本身，或（数学/科学 且 年龄≥8）—— 过滤掉幼儿园级与英语/历史等无关学科
  function showable(id, selId) {
    if (id === selId) return true;
    const t = byId.get(id);
    return !!t && t.ageStart >= 8 && (t.subject === "Mathematics" || t.subject === "Science");
  }

  const labelOf = (t) => { const g = G.topics[t.id]; return (g && g.n) || NAMES[t.id] || t.name; };
  const isZh = (t) => !!(G.topics[t.id] && G.topics[t.id].n) || !!NAMES[t.id];
  const descOf = (t) => { const g = G.topics[t.id]; const x = X[t.id]; return (g && g.d) || (x && x.d) || t.description || ""; };
  const reasonOf = (r) => (r && reasonZh[r]) || r || "";

  // ---- 节点/边构造 ----
  function bigNode(t, selected, compact) {
    return {
      id: t.id,
      label: labelOf(t),
      title: tipOf(t),
      shape: "box", margin: compact ? 6 : 8,
      color: { background: COLORS[areaOf(t)], border: selected ? "#0b0b0b" : COLORS[areaOf(t)], highlight: { background: COLORS[areaOf(t)], border: "#0b0b0b" } },
      font: { color: "#ffffff", size: compact ? 13 : 15, face: "PingFang SC, Microsoft YaHei, sans-serif" },
      borderWidth: selected ? 4 : 1,
      shadow: selected ? { enabled: true, color: "rgba(11,11,11,0.25)", size: 12, x: 0, y: 2 } : false,
    };
  }
  function dotNode(t) {
    return {
      id: t.id,
      label: labelOf(t),
      title: tipOf(t),
      shape: "dot", size: 13,
      color: { background: COLORS[areaOf(t)], border: COLORS[areaOf(t)], highlight: { background: COLORS[areaOf(t)], border: "#0b0b0b" } },
      font: { color: "#52514e", size: 12, face: "PingFang SC, Microsoft YaHei, sans-serif", vadjust: -2 },
      borderWidth: 1,
    };
  }
  function tipOf(t) {
    const a = AREA_LABEL[areaOf(t)];
    const g = G.topics[t.id];
    const d = descOf(t);
    const en = (g && g.n) ? t.name : "";
    return `${labelOf(t)}${en ? " (" + en + ")" : ""}\n${a} · ${G.domains[t.domain] || t.domain} · ${t.ageStart}–${t.ageEnd}岁` + (d ? "\n\n" + d : "");
  }
  function edgeOf(d) {
    // 学习方向：前置 → 后续（箭头指向"接下来学的"）
    return {
      id: d.prerequisiteId + "→" + d.topicId,
      from: d.prerequisiteId, to: d.topicId,
      arrows: "to",
      title: reasonOf(d.reason) + (d.strength === "soft" ? "（软性依赖）" : "（硬性依赖）"),
      color: { color: d.strength === "soft" ? "#c3c2b7" : "#898781", highlight: "#2a78d6", opacity: 0.7 },
      width: d.strength === "soft" ? 1.2 : 2,
      dashes: d.strength === "soft",
      smooth: { enabled: true, type: "cubicBezier", forceDirection: "horizontal", roundness: 0.5 },
    };
  }

  // ---- 网络实例 ----
  let network = null, container = null, onSelect = () => {}, currentView = "overview", currentId = null;
  function destroy() { if (network) { network.destroy(); network = null; } }
  function build(nodes, edges, options) {
    destroy();
    network = new vis.Network(container, { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) }, options);
    network.on("click", (p) => {
      if (p.nodes && p.nodes.length) {
        const id = p.nodes[0];
        onSelect(id);
        if (currentView !== "overview") show(currentView, id);
      }
    });
    return network;
  }

  // ① 聚焦：1 跳邻居（前置在左、后续在右），层次 LR 布局
  function renderFocused(id) {
    const t = byId.get(id); if (!t) return;
    const nodeSet = new Set([id, ...(prereqMap.get(id) || []), ...(unlockMap.get(id) || [])]);
    for (const nid of [...nodeSet]) if (!showable(nid, id)) nodeSet.delete(nid); // 仅数学/科学/age≥8
    const nodes = [...nodeSet].map((nid) => bigNode(byId.get(nid), nid === id));
    const edges = [];
    for (const e of deps) if (nodeSet.has(e.prerequisiteId) && nodeSet.has(e.topicId)) edges.push(edgeOf(e));
    build(nodes, edges, {
      layout: { hierarchical: { enabled: true, direction: "LR", sortMethod: "directed", nodeSpacing: 140, levelGap: 180, treeSpacing: 130 } },
      physics: { enabled: false },
      interaction: { hover: true, tooltipDelay: 120 },
      nodes: { borderWidth: 1 },
    });
    setTimeout(() => network && network.fit({ animation: { duration: 300 }, maxZoomLevel: 1.2 }), 120);
  }

  // ② 路径：全部祖先 + 全部后代，层次 UD 布局
  function renderPath(id) {
    const t = byId.get(id); if (!t) return;
    const anc = reach(id, prereqMap, 60), des = reach(id, unlockMap, 40);
    const nodeSet = new Set([id, ...anc, ...des]);
    for (const nid of [...nodeSet]) if (!showable(nid, id)) nodeSet.delete(nid); // 仅数学/科学/age≥8
    const nodes = [...nodeSet].map((nid) => bigNode(byId.get(nid), nid === id, true));
    const edges = [];
    for (const e of deps) if (nodeSet.has(e.prerequisiteId) && nodeSet.has(e.topicId)) edges.push(edgeOf(e));
    build(nodes, edges, {
      layout: { hierarchical: { enabled: true, direction: "UD", sortMethod: "directed", nodeSpacing: 120, levelGap: 110, treeSpacing: 130, blockShifting: true, edgeMinimization: true } },
      physics: { enabled: false },
      interaction: { hover: true, tooltipDelay: 120 },
    });
    setTimeout(() => network && network.fit({ animation: { duration: 300 }, maxZoomLevel: 1.2 }), 120);
  }

  // ③ 全景：所有已译知识点，力导向（稳定后冻结成静态地图）；支持按学科筛选
  let overviewFilter = "all"; // all | math | phys | life
  function renderOverview() {
    const want = (t) => translated.has(t.id) && (overviewFilter === "all" || areaOf(t) === overviewFilter);
    const inc = new Set(topics.filter(want).map((t) => t.id));
    const nodes = topics.filter(want).map(dotNode);
    const edges = [];
    for (const e of deps) if (inc.has(e.prerequisiteId) && inc.has(e.topicId)) edges.push(edgeOf(e));
    const net = build(nodes, edges, {
      nodes: { scaling: { min: 8, max: 18 } },
      edges: { smooth: { enabled: false } },
      physics: {
        enabled: true, solver: "forceAtlas2Based",
        forceAtlas2Based: { gravitationalConstant: -55, centralGravity: 0.012, springLength: 70, springConstant: 0.05, damping: 0.5 },
        stabilization: { enabled: true, iterations: 220, fit: true },
      },
      interaction: { hover: true, tooltipDelay: 200, navigationButtons: false, keyboard: false },
    });
    net.once("stabilizationIterationsDone", () => net.setOptions({ physics: { enabled: false } }));
    if (currentId && inc.has(currentId)) setTimeout(() => net.selectNodes([currentId]), 150);
  }

  function show(view, id) {
    currentView = view;
    // 等一帧，确保容器布局（graph-mode 切换、hidden 移除）完成后再读取尺寸画图
    requestAnimationFrame(() => {
      if (view === "focused" && id) renderFocused(id);
      else if (view === "path" && id) renderPath(id);
      else renderOverview();
    });
  }
  function onTopicSelected(id) {
    currentId = id;
    if (currentView === "focused") renderFocused(id);
    else if (currentView === "path") renderPath(id);
    else if (network) { try { network.selectNodes([id]); network.focus(id, { scale: 1.1, animation: { duration: 400 } }); } catch (e) {} }
  }

  window.VIZ = {
    init(c, cb) { container = c; onSelect = cb || (() => {}); },
    show,
    onTopicSelected,
    setOverviewFilter: (area) => { overviewFilter = area; if (currentView === "overview") renderOverview(); },
    areaColor: (t) => COLORS[areaOf(t)],
    areaLabel: (t) => AREA_LABEL[areaOf(t)],
    COLORS, AREA_LABEL,
  };
})();
