"use strict";

let DATA = null;
let currentAgentFilter = "all";
let toastTimer = null;

const SECURE_DECISION_CENTER_URL = "https://rowan-control-panel.netlify.app/";
const SECURE_DECISION_IDS = new Set([
  "owned-site-cleanup-preview",
  "digital-product-flagship-private-test",
  "etsy-source-rights-attestation",
  "etsy-pause-onsite-ads",
  "etsy-legal-form-deactivation",
  "etsy-plus-cancellation",
  "etsy-offsite-ads-opt-out",
  "etsy-caregiver-daily-log-unpublished-draft",
  "etsy-caregiver-daily-log-public-launch",
  "etsy-mileage-log-remediation",
  "owned-site-legal-policy-adoption",
  "netlify-private-release"
]);
const RISK_DECISION_MAP = new Map([
  ["Pause unproductive Etsy Ads", "etsy-pause-onsite-ads"],
  ["Deactivate two unreviewed legal-form listings", "etsy-legal-form-deactivation"],
  ["Active listings held out of growth", "etsy-mileage-log-remediation"],
  ["Etsy Plus cancellation is prepared, not active", "etsy-plus-cancellation"],
  ["Optional Offsite Ads makes the 70% floor impossible at every price", "etsy-offsite-ads-opt-out"],
  ["Safe flagship test needs a new exact approval", "digital-product-flagship-private-test"],
  ["Safe flagship test evidence remains incomplete", "digital-product-flagship-private-test"],
  ["Current production deploy needs a controlled cleanup", "owned-site-cleanup-preview"]
]);

const TEMPLATE = `
<div class="rowan-v3">
  <div class="app-shell-v3">
    <aside class="sidebar-v3" aria-label="Primary navigation">
      <a class="brand-v3" href="#overview"><span class="brand-mark-v3">R</span><span><strong>ROWAN</strong><small>Profit operating system</small></span></a>
      <nav class="nav-list-v3">
        <button class="nav-item-v3 active" data-view-target="overview"><span>⌂</span>Overview</button>
        <button class="nav-item-v3" data-view-target="profit"><span>↗</span>Profit</button>
        <button class="nav-item-v3" data-view-target="assets"><span>◆</span>Assets</button>
        <button class="nav-item-v3" data-view-target="agents"><span>◎</span>Agents</button>
        <button class="nav-item-v3" data-view-target="city"><span>▥</span>Agent City</button>
        <button class="nav-item-v3" data-view-target="systems"><span>⚙</span>Systems</button>
        <button class="nav-item-v3 nav-attention" data-view-target="attention"><span>!</span>Needs attention <i id="attentionNavCount">—</i></button>
      </nav>
      <div class="sidebar-status-v3"><span class="live-dot-v3" id="sidebarDot"></span><div><strong id="sidebarPresence">Checking Rowan…</strong><small id="sidebarModel">Loading model route…</small></div></div>
    </aside>
    <div class="app-main-v3">
      <header class="topbar-v3">
        <button class="mobile-menu-v3" id="mobileMenu" type="button" aria-label="Open navigation">☰</button>
        <div class="topbar-mission-v3"><span>Mission</span><strong>$20,000 verified monthly net profit</strong></div>
        <div class="topbar-facts-v3"><span class="top-pill-v3" id="topUsage">Usage loading…</span><span class="top-pill-v3" id="topFreshness">Snapshot loading…</span><button class="refresh-button-v3" id="refreshButton" type="button">Refresh</button></div>
      </header>
      <div class="truth-banner-v3" id="dataBanner" hidden></div>
      <main class="content-v3">
        <section class="view-v3 active" id="view-overview" data-view="overview">
          <header class="hero-v3"><div><span class="eyebrow-v3">Executive command</span><h1>Build profit.<br><em>Prove every dollar.</em></h1><p id="executiveSummary">Loading the latest sanitized company snapshot.</p></div><div class="mission-seal-v3"><span>MONTHLY TARGET</span><strong>$20K</strong><small>verified net profit</small></div></header>
          <section class="metric-grid-v3" id="overviewMetrics"></section>
          <section class="overview-grid-v3"><article class="panel-v3"><div class="panel-heading-v3"><div><span class="eyebrow-v3 amber">Highest leverage</span><h2>What matters now</h2></div><span class="truth-chip-v3">evidence ranked</span></div><div class="priority-list-v3" id="priorityList"></div></article><article class="panel-v3"><div class="panel-heading-v3"><div><span class="eyebrow-v3 jade">Operating boundary</span><h2>Autonomy that stays safe</h2></div></div><div id="autonomySummary"></div></article></section>
          <section class="panel-v3"><div class="panel-heading-v3"><div><span class="eyebrow-v3 ice">Executive team</span><h2>Who is active and what they own</h2></div><button class="text-button-v3" data-view-target="agents">See every agent →</button></div><div class="executive-strip-v3" id="executiveStrip"></div></section>
          <section class="overview-grid-v3"><article class="panel-v3"><div class="panel-heading-v3"><div><span class="eyebrow-v3">Verified operations</span><h2>Recent recorded outcomes</h2></div></div><div class="timeline-v3" id="overviewActivity"></div></article><article class="panel-v3"><div class="panel-heading-v3"><div><span class="eyebrow-v3 coral">Owner queue</span><h2>Decisions only you can make</h2></div><span class="count-chip-v3" id="ownerQueueCount">—</span></div><div class="decision-list-v3" id="overviewApprovals"></div></article></section>
        </section>

        <section class="view-v3" id="view-profit" data-view="profit">
          <header class="page-header-v3"><span class="eyebrow-v3 jade">Financial truth</span><h1>Profit</h1><p>Cash, costs, and channel evidence. Pipeline, forecasts, and platform counters never become profit.</p></header>
          <section class="metric-grid-v3" id="financeMetrics"></section>
          <section class="panel-v3 formula-panel-v3"><span>PROFIT FORMULA</span><strong>settled revenue − refunds − fees − ads − software − fulfillment − operating costs</strong><small>Agent towers grow only after this result is reconciled and attributed.</small></section>
          <section class="panel-v3"><div class="panel-heading-v3"><div><span class="eyebrow-v3">Revenue lanes</span><h2>Where money can come from</h2></div><span class="truth-chip-v3">proof before scale</span></div><div class="lane-grid-v3" id="revenueLanes"></div></section>
          <section class="panel-v3"><div class="panel-heading-v3"><div><span class="eyebrow-v3 amber">Evidence gap</span><h2>What blocks a true profit number</h2></div></div><div class="quality-grid-v3" id="profitQuality"></div></section>
        </section>

        <section class="view-v3" id="view-assets" data-view="assets">
          <header class="page-header-v3"><span class="eyebrow-v3">Company inventory</span><h1>Assets &amp; channels</h1><p>Existing leverage, its evidence level, and the next useful gate.</p></header>
          <div class="asset-grid-v3" id="businessAssets"></div>
          <section class="panel-v3"><div class="panel-heading-v3"><div><span class="eyebrow-v3 coral">YouTube ventures</span><h2>Identity, rights, and publication readiness</h2></div><span class="truth-chip-v3">no invented reach</span></div><div class="venture-grid-v3" id="ventureGrid"></div></section>
        </section>

        <section class="view-v3" id="view-agents" data-view="agents">
          <header class="page-header-v3 split-header-v3"><div><span class="eyebrow-v3 ice">Company roster</span><h1>Agents</h1><p>Every named agent, department, assignment, model, work record, performance evidence, and authority boundary.</p></div><div class="agent-summary-v3" id="agentSummary"></div></header>
          <div class="toolbar-v3"><label class="search-box-v3"><span>⌕</span><input id="agentSearch" type="search" placeholder="Search name, department, task, or role"></label><div class="filter-pills-v3" id="agentFilters"><button class="active" data-agent-filter="all">All</button><button data-agent-filter="active">Active executives</button><button data-agent-filter="attention">Needs attention</button><button data-agent-filter="on-demand">On demand</button></div></div>
          <div class="team-grid-v3" id="teamGrid"></div>
          <section class="panel-v3"><div class="panel-heading-v3"><div><span class="eyebrow-v3">Responsibility matrix</span><h2>One accountable owner per outcome</h2></div></div><div class="table-wrap-v3" id="responsibilityMatrix"></div></section>
        </section>

        <section class="view-v3" id="view-city" data-view="city">
          <header class="page-header-v3 split-header-v3"><div><span class="eyebrow-v3 amber">Profit League</span><h1>Agent City</h1><p>All agent towers begin equal. Only reconciled, agent-attributed net profit creates height.</p></div><div class="league-status-v3" id="leagueStatus">Loading league…</div></header>
          <section class="city-rules-v3"><article><span>01</span><strong>Profit builds</strong><small>Every reconciled attributable dollar increases tower height.</small></article><article><span>02</span><strong>Sales illuminate</strong><small>Verified sales light windows, but loss-making sales do not buy height.</small></article><article><span>03</span><strong>Proof wins</strong><small>Tokens, drafts, busywork, forecasts, and unverified sales earn zero floors.</small></article><article><span>04</span><strong>The crown is scarce</strong><small>It appears only for one unique leader with positive verified profit.</small></article></section>
          <section class="city-layout-v3"><div class="city-stage-v3 panel-v3"><div class="panel-heading-v3"><div><span class="eyebrow-v3">Interactive skyline</span><h2 id="cityHeadline">Starting line</h2></div><span class="truth-chip-v3" id="citySnapshotStatus">snapshot pending</span></div><div class="city-viewport"><div class="city-loading-v3" id="cityLoading">Building the verified skyline…</div><div class="city-world" id="cityWorld"></div></div></div><aside class="panel-v3 city-inspector-v3" id="cityInspector"><span class="eyebrow-v3">Tower inspector</span><h2>Select a building</h2><p>Click an agent tower to inspect verified sales, profit, and current work.</p></aside></section>
          <section class="panel-v3"><div class="panel-heading-v3"><div><span class="eyebrow-v3 amber">Live standings</span><h2>Profit League leaderboard</h2></div><span class="truth-chip-v3" id="leaderboardTruth">verified attribution only</span></div><div class="profit-war-grid-v3" id="profitWarGrid"></div></section>
          <section class="panel-v3"><div class="panel-heading-v3"><div><span class="eyebrow-v3 ice">Expansion milestones</span><h2>Worlds unlock from verified monthly profit</h2></div></div><div class="milestone-grid-v3" id="worldMilestones"></div></section>
        </section>

        <section class="view-v3" id="view-systems" data-view="systems">
          <header class="page-header-v3"><span class="eyebrow-v3">Control plane</span><h1>Systems</h1><p>Gateway, model routing, usage protection, automations, errors, and data freshness.</p></header>
          <section class="system-hero-grid-v3" id="systemHeroGrid"></section>
          <section class="panel-v3"><div class="panel-heading-v3"><div><span class="eyebrow-v3 jade">Enabled work</span><h2>Automation schedule</h2></div><span class="truth-chip-v3" id="automationSummary">loading</span></div><div class="table-wrap-v3" id="automationTable"></div></section>
          <section class="panel-v3"><div class="panel-heading-v3"><div><span class="eyebrow-v3">Health register</span><h2>What is healthy, held, or failing</h2></div></div><div class="health-grid-v3" id="systemHealth"></div></section>
          <section class="panel-v3"><div class="panel-heading-v3"><div><span class="eyebrow-v3 amber">Data quality</span><h2>Freshness and blind spots</h2></div></div><div class="quality-grid-v3" id="dataQuality"></div></section>
        </section>

        <section class="view-v3" id="view-attention" data-view="attention">
          <header class="page-header-v3"><span class="eyebrow-v3 coral">Action center</span><h1>Needs attention</h1><p>Owner decisions, failing controls, and material business risks—ranked without pretending work is complete.</p></header>
          <section class="panel-v3"><div class="panel-heading-v3"><div><span class="eyebrow-v3 coral">Owner approvals</span><h2>Consequential actions remain locked</h2></div><span class="truth-chip-v3">protected owner flow</span></div><div class="approval-grid-v3" id="approvalGrid"></div></section>
          <section class="panel-v3"><div class="panel-heading-v3"><div><span class="eyebrow-v3 amber">System exceptions</span><h2>Automations that need repair</h2></div></div><div class="exception-grid-v3" id="systemExceptions"></div></section>
          <section class="panel-v3"><div class="panel-heading-v3"><div><span class="eyebrow-v3">Risk register</span><h2>Material evidence and operating risks</h2></div></div><div class="risk-grid-v3" id="riskGrid"></div></section>
        </section>
      </main>
    </div>
  </div>
  <div class="toast-v3" id="toast" role="status" aria-live="polite"></div>
</div>`;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function money(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "Unavailable";
  return Number(value).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function number(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "Unavailable";
  return Number(value).toLocaleString("en-US");
}

function fmtMetric(metric) {
  if (!metric) return "Unavailable";
  if (metric.value === null || metric.value === undefined) return "Unavailable";
  if (metric.format === "money") return money(metric.value);
  if (metric.format === "percent") return `${Number(metric.value).toFixed(metric.decimals ?? 1)}%`;
  return number(metric.value);
}

function dateText(value) {
  if (!value) return "Unavailable";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unavailable";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function ageText(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "age unavailable";
  const seconds = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function tone(value) {
  const text = String(value || "").toLowerCase();
  if (/critical|error|failed|blocked|incident|paused/.test(text)) return "critical";
  if (/attention|warning|pending|required|missing|unavailable|stale|hold|on demand/.test(text)) return "attention";
  if (/healthy|ok|success|running|working|active|verified|online|conserve/.test(text)) return "healthy";
  return "neutral";
}

function statusPill(value) {
  return `<span class="status-pill-v3 ${tone(value)}">${esc(String(value || "unknown").replaceAll("_", " "))}</span>`;
}

function empty(message) {
  return `<div class="empty-v3">${esc(message)}</div>`;
}

function metricCard(label, value, note, state = "neutral") {
  return `<article class="metric-card-v3 ${esc(state)}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`;
}

function table(headers, rows) {
  if (!rows.length) return empty("No sourced rows available.");
  return `<table><thead><tr>${headers.map(x => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell ?? "Unavailable")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function financeMetric(label) {
  return (DATA.finance?.metrics || []).find(item => item.label === label);
}

function openApprovals() {
  return (DATA.approvals || []).filter(item => item.active !== false && /needs_decision|pending|required/i.test(String(item.status || "")) && !currentDecision(item));
}

function currentDecision(item) {
  const status = String(item?.status || "").toLowerCase();
  if (status.startsWith("approved")) return "approved";
  if (status.startsWith("declined") || status.startsWith("denied")) return "declined";
  return null;
}

function ownerDecisionItems(data = DATA) {
  return (data?.approvals || []).filter(item => item.execution_status !== "verified_complete" && (
    item.active !== false || (Boolean(currentDecision(item)) && SECURE_DECISION_IDS.has(item.id))
  ));
}

function secureDecisionUrl(item, action) {
  if (!item || !SECURE_DECISION_IDS.has(item.id) || !["approved", "declined"].includes(action)) return null;
  const url = new URL(SECURE_DECISION_CENTER_URL);
  url.searchParams.set("decision", item.id);
  url.searchParams.set("intent", action);
  url.hash = "approvals";
  return url.toString();
}

function decisionControls(item) {
  if (!item || !SECURE_DECISION_IDS.has(item.id)) {
    return `<div class="decision-control-note-v3">Decision record only · no secure web control configured</div>`;
  }
  const selected = currentDecision(item);
  return `<div class="decision-actions-v3" aria-label="Owner decision controls for ${esc(item.title)}">
    <button class="decision-button-v3 approve ${selected === "approved" ? "selected" : ""}" type="button" data-secure-decision-id="${esc(item.id)}" data-decision-action="approved" ${selected === "approved" ? "disabled" : ""}>${selected === "approved" ? "Approved" : "Approve"}</button>
    <button class="decision-button-v3 deny ${selected === "declined" ? "selected" : ""}" type="button" data-secure-decision-id="${esc(item.id)}" data-decision-action="declined" ${selected === "declined" ? "disabled" : ""}>${selected === "declined" ? "Denied" : "Deny"}</button>
    <small>Opens the protected owner console for confirmation.</small>
  </div>`;
}

function decisionForRisk(risk, data = DATA) {
  const id = RISK_DECISION_MAP.get(String(risk?.title || ""));
  return id ? (data?.approvals || []).find(item => item.id === id && (item.active !== false || Boolean(currentDecision(item)))) || null : null;
}

function openSecureDecision(item, action) {
  const target = secureDecisionUrl(item, action);
  if (!target) {
    showToast("This item has no protected web decision control");
    return;
  }
  window.open(target, "_blank", "noopener,noreferrer");
  showToast(`${action === "approved" ? "Approve" : "Deny"} selected · finish confirmation in the protected owner console`);
}

function importantRisks() {
  const rank = { critical: 0, attention: 1, healthy: 2 };
  return [...(DATA.risks || [])].sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3));
}

function automationExceptions() {
  return (DATA.systems?.automations || []).filter(item => !/^(ok|success|succeeded)$/i.test(String(item.status || "")) || Number(item.error_streak || 0) > 0);
}

function renderOverview() {
  $("#executiveSummary").textContent = DATA.meta?.executive_summary || "Executive summary unavailable.";
  const net = financeMetric("Net profit");
  const customers = financeMetric("Paid customers");
  const usage = DATA.ai_usage || {};
  const netValue = Number.isFinite(Number(net?.value)) ? Number(net.value) : null;
  const gap = netValue === null ? null : Math.max(0, 20000 - netValue);
  $("#overviewMetrics").innerHTML = [
    metricCard("Verified net profit", fmtMetric(net), `${net?.confidence || "Unavailable"} · ${net?.note || "No source note"}`, netValue !== null && netValue >= 0 ? "healthy" : "critical"),
    metricCard("Gap to $20K", gap === null ? "Unavailable" : money(gap), netValue === null ? "Reconcile profit before measuring the gap" : "Target minus verified net profit", gap === 0 ? "healthy" : "attention"),
    metricCard("Paid customers", fmtMetric(customers), customers?.note || "Settled delivered sales only", Number(customers?.value || 0) > 0 ? "healthy" : "attention"),
    metricCard("Weekly AI reserve", usage.remaining_percent == null ? "Unavailable" : `${usage.remaining_percent}% left`, `${usage.autonomy_used_percent_estimate ?? "—"}% estimated since activation · stop at ${usage.absolute_stop_used_percent ?? "—"}% used`, tone(usage.mode))
  ].join("");

  const priorities = [
    ...automationExceptions().map(item => ({ title: item.name, detail: `${item.status} · ${item.error_streak || 0} consecutive errors`, kind: "System" })),
    ...importantRisks().filter(item => item.severity !== "healthy").slice(0, 6).map(item => ({ title: item.title, detail: item.detail, kind: item.category }))
  ].slice(0, 6);
  $("#priorityList").innerHTML = priorities.length ? priorities.map((item, index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><div><small>${esc(item.kind)}</small><strong>${esc(item.title)}</strong><p>${esc(item.detail)}</p></div></article>`).join("") : empty("No current priority exceptions.");

  $("#autonomySummary").innerHTML = `<div class="boundary-grid-v3"><article class="boundary-open-v3"><span>Runs automatically</span><strong>Research · analysis · private asset work · diagnostics · prioritization</strong><small>Only inside the allowlist, usage guard, and existing accounts.</small></article><article class="boundary-locked-v3"><span>Owner-gated</span><strong>Spend · publish · messages · accounts · security · contracts · refunds · deletion</strong><small>Approval is not completion; evidence must verify every consequential action.</small></article></div><div class="guard-line-v3"><span>Usage guard</span><strong>${esc(usage.mode || "unavailable")}</strong><small>${usage.remaining_percent ?? "—"}% remaining · ${usage.enabled_model_job_count ?? "—"} model job · heartbeats ${usage.heartbeat_disabled ? "off" : "not verified off"}</small></div>`;

  const executives = (DATA.team || []).filter(item => item.configured);
  $("#executiveStrip").innerHTML = executives.map(item => `<article><div class="agent-avatar-v3">${esc(item.name.slice(0, 1))}</div><div><span>${esc(item.department)}</span><strong>${esc(item.name)} · ${esc(item.role)}</strong><p>${esc(item.city?.current_activity || item.mission)}</p><small>${esc(item.model)} · ${esc(item.reasoning_mode)} reasoning</small></div>${statusPill(item.status)}</article>`).join("") || empty("No configured executive agents in the snapshot.");

  $("#overviewActivity").innerHTML = (DATA.activity || []).slice(0, 7).map(item => `<article><span>${esc(item.time)}</span><div><strong>${esc(item.title)}</strong><p>${esc(item.detail)}</p></div></article>`).join("") || empty("No recorded outcomes.");
  const approvals = ownerDecisionItems();
  const open = openApprovals();
  $("#ownerQueueCount").textContent = `${open.length} awaiting · ${approvals.length} tracked`;
  $("#overviewApprovals").innerHTML = approvals.slice(0, 5).map(item => `<article><div>${statusPill(item.execution_status_label || item.status)}<small>${esc(item.category || "Owner decision")}</small></div><strong>${esc(item.title)}</strong><p>${esc(item.recommendation || item.action || "Review required")}</p>${decisionControls(item)}</article>`).join("") || empty("No active owner decisions in this snapshot.");
}

function renderProfit() {
  $("#financeMetrics").innerHTML = (DATA.finance?.metrics || []).map(item => metricCard(item.label, fmtMetric(item), `${item.confidence || "Unavailable"} · ${item.note || ""}`, item.confidence === "Confirmed" ? "healthy" : "attention")).join("");
  const lanes = DATA.revenue_network?.lanes || [];
  $("#revenueLanes").innerHTML = lanes.map(lane => `<article class="lane-card-v3"><div><span>${esc(lane.hub)}</span>${statusPill(lane.status)}</div><h2>${esc(lane.name)}</h2><p>${esc(lane.channel_type)}</p><dl><div><dt>Inventory</dt><dd>${esc(lane.inventory)}</dd></div><div><dt>Verified sales</dt><dd>${lane.verified_sales == null ? "Unavailable" : number(lane.verified_sales)}</dd></div><div><dt>Verified revenue</dt><dd>${lane.verified_revenue == null ? "Unavailable" : money(lane.verified_revenue)}</dd></div><div><dt>Owners</dt><dd>${esc(lane.accountable)} · ${esc(lane.supporting)}</dd></div></dl><div class="next-gate-v3"><span>Current work</span><strong>${esc(lane.current_assignment)}</strong><small>${esc(lane.next_gate)}</small></div></article>`).join("") || empty("Revenue lane registry unavailable.");
  $("#profitQuality").innerHTML = (DATA.finance?.ledger_readiness || []).map(item => `<article class="quality-card-v3 ${tone(item.status)}"><div>${statusPill(item.status)}</div><strong>${esc(item.label)}</strong><p>${esc(item.detail)}</p></article>`).join("") || empty("Ledger readiness unavailable.");
}

function renderAssets() {
  $("#businessAssets").innerHTML = (DATA.business_assets || []).map(item => `<article class="asset-card-v3"><div><span>${esc(item.type)}</span>${statusPill(item.status)}</div><h2>${esc(item.name)}</h2><p>${esc(item.evidence)}</p><footer><span>${esc(item.confidence)}</span><strong>${esc(item.owner)}</strong></footer></article>`).join("") || empty("Business asset registry unavailable.");
  const ventures = DATA.venture_lab?.ventures || [];
  $("#ventureGrid").innerHTML = ventures.map(item => {
    const identity = item.identity || {};
    const metrics = item.metrics || {};
    const queue = item.content_system?.queue || {};
    return `<article class="venture-card-v3"><div><span>${esc(item.project_label)}</span>${statusPill(item.status)}</div><h2>${esc(identity.verified_channel_name || "Identity not verified")}</h2><p>${esc(identity.verified_handle || "No verified handle")}</p><dl><div><dt>Subscribers</dt><dd>${metrics.subscribers == null ? "Unavailable" : number(metrics.subscribers)}</dd></div><div><dt>28d views</dt><dd>${metrics.views == null ? "Unavailable" : number(metrics.views)}</dd></div><div><dt>Private concepts</dt><dd>${number(queue.total_items || 0)}</dd></div><div><dt>Publishing</dt><dd>${item.authority?.publication_authorized ? "Authorized" : "Locked"}</dd></div></dl><small>${esc((item.issue_codes || []).join(" · ") || "No issue codes")}</small></article>`;
  }).join("") || empty("YouTube venture evidence unavailable.");
}

function latestCompleted(agent) {
  return (agent.city?.history || []).find(item => /succeeded|completed|success/i.test(String(item.status || item.detail || "")));
}

function agentMatches(item, query) {
  const blob = [item.name, item.department, item.role, item.mission, item.city?.current_activity, item.model].join(" ").toLowerCase();
  if (query && !blob.includes(query)) return false;
  if (currentAgentFilter === "active" && !item.configured) return false;
  if (currentAgentFilter === "attention" && !(Number(item.error_streak || 0) > 0 || tone(item.status) === "critical")) return false;
  if (currentAgentFilter === "on-demand" && item.configured) return false;
  return true;
}

function renderTeam() {
  const team = DATA.team || [];
  const configured = team.filter(item => item.configured).length;
  const errors = team.filter(item => Number(item.error_streak || 0) > 0).length;
  $("#agentSummary").innerHTML = `<div><strong>${team.length}</strong><span>named agents</span></div><div><strong>${configured}</strong><span>active executives</span></div><div><strong>${team.length - configured}</strong><span>on demand</span></div><div><strong>${errors}</strong><span>with errors</span></div>`;
  const query = String($("#agentSearch")?.value || "").trim().toLowerCase();
  const visible = team.filter(item => agentMatches(item, query));
  $("#teamGrid").innerHTML = visible.map(item => {
    const completed = latestCompleted(item);
    const state = item.configured ? item.status : "on demand";
    return `<article class="team-card-v3" data-agent-id="${esc(item.id)}"><header><div class="agent-avatar-v3">${esc(item.name.slice(0, 1))}</div><div><span>${esc(item.department)}</span><h2>${esc(item.name)}</h2><p>${esc(item.role)}</p></div>${statusPill(state)}</header><div class="agent-mission-v3"><span>Mission</span><strong>${esc(item.mission)}</strong></div><div class="agent-current-v3"><span>Current verified state</span><strong>${esc(item.city?.current_activity || "No verified current task")}</strong><small>${esc(item.city?.presence_source || "Source unavailable")} · observed ${esc(item.city?.observed_at || item.last_activity || "Unavailable")}</small></div><dl><div><dt>Operating class</dt><dd>${esc(item.operating_class)}</dd></div><div><dt>Model / reasoning</dt><dd>${esc(item.model)} · ${esc(item.reasoning_mode)}</dd></div><div><dt>Cadence</dt><dd>${esc(item.automation)}</dd></div><div><dt>Recent completed work</dt><dd>${esc(completed?.title || "No verified completion in sanitized history")}</dd></div><div><dt>Verified outcomes (7d)</dt><dd>${number(item.performance?.verified_points_7d || 0)}</dd></div><div><dt>Error streak</dt><dd>${number(item.error_streak || 0)}</dd></div><div><dt>Attributed sales</dt><dd>${number(item.verified_sales || 0)}</dd></div><div><dt>Attributed net profit</dt><dd>${money(item.verified_profit || 0)}</dd></div></dl><div class="authority-v3"><span>Authority boundary</span><p>${esc(item.authority)}</p></div></article>`;
  }).join("") || empty("No agents match this filter.");
  $("#responsibilityMatrix").innerHTML = table(["Outcome", "Accountable", "Supporting", "Owner gate"], (DATA.responsibility_matrix || []).map(row => [row.outcome, row.accountable, row.supporting, row.gate]));
}

function renderCity() {
  const league = DATA.profit_war || {};
  const contenders = league.contenders || [];
  const totalProfit = contenders.reduce((sum, item) => sum + Number(item.profit_generated || 0), 0);
  $("#leagueStatus").innerHTML = league.all_tied_at_zero ? `<span>NO CROWN</span><strong>All ${contenders.length} agents tied</strong><small>$0 attributed profit</small>` : league.has_verified_leader ? `<span>VERIFIED LEADER</span><strong>${esc(contenders[0]?.name || "—")}</strong><small>${money(contenders[0]?.profit_generated || 0)} attributed profit</small>` : `<span>NO UNIQUE LEADER</span><strong>Profit tie</strong><small>${money(totalProfit)} attributed</small>`;
  $("#cityHeadline").textContent = league.all_tied_at_zero ? "Equal foundations. The first verified profit raises a tower." : league.has_verified_leader ? `${contenders[0].name} leads the skyline` : "Verified profit tie";
  $("#citySnapshotStatus").textContent = `${dateText(DATA.generated_at)} · ${ageText(DATA.generated_at)}`;
  $("#leaderboardTruth").textContent = league.truth_note || "Verified attribution only";
  $("#profitWarGrid").innerHTML = contenders.map(item => `<article class="league-row-v3 ${item.is_leader ? "leader" : ""}" data-league-agent="${esc(item.id)}"><span class="league-rank-v3">${item.is_leader ? "♛" : `#${item.rank}`}</span><i style="--agent-color:${esc(item.color)}">${esc(item.name.slice(0, 1))}</i><div><strong>${esc(item.name)}</strong><small>${esc(item.department)} · ${esc(item.building_name)}</small></div><dl><div><dt>Height</dt><dd>${number(item.height_m)}m</dd></div><div><dt>Sales</dt><dd>${number(item.verified_sales)}</dd></div><div><dt>Profit</dt><dd>${money(item.profit_generated)}</dd></div></dl></article>`).join("") || empty("Profit League unavailable.");
  const milestones = [
    { name: "Earth HQ", threshold: 0, icon: "◉", purpose: "Operating foundation" },
    { name: "Revenue District", threshold: 1000, icon: "◇", purpose: "Repeatable first channel" },
    { name: "Scale Harbor", threshold: 5000, icon: "△", purpose: "Multi-channel proof" },
    { name: "Profit Capital", threshold: 10000, icon: "⬡", purpose: "Halfway to mission" },
    { name: "Apex World", threshold: 20000, icon: "✦", purpose: "$20K monthly profit achieved" }
  ];
  const companyProfit = Number(financeMetric("Net profit")?.value || 0);
  $("#worldMilestones").innerHTML = milestones.map(item => { const unlocked = companyProfit >= item.threshold; return `<article class="milestone-card-v3 ${unlocked ? "unlocked" : "locked"}"><span>${item.icon}</span><div><strong>${esc(item.name)}</strong><small>${esc(item.purpose)}</small></div><b>${unlocked ? "UNLOCKED" : `${money(item.threshold)} profit`}</b></article>`; }).join("");
}

function renderSystems() {
  const usage = DATA.ai_usage || {};
  const systems = DATA.systems || {};
  const gateway = systems.gateway || {};
  const routing = systems.model_routing || {};
  const inventory = systems.automation_inventory || {};
  const usageWidth = Math.max(0, Math.min(100, Number(usage.used_percent || 0)));
  $("#systemHeroGrid").innerHTML = `<article class="system-hero-v3 ${gateway.healthy ? "healthy" : "critical"}"><span>Gateway</span><strong>${gateway.healthy ? "RUNNING" : "NEEDS ATTENTION"}</strong><p>${esc(gateway.bind || "Local loopback")} · config ${gateway.config_valid === true ? "valid" : "unverified"}</p>${statusPill(gateway.healthy ? "healthy" : "attention")}</article><article class="system-hero-v3 ${tone(usage.mode)}"><span>Weekly OpenAI usage</span><strong>${usage.remaining_percent == null ? "Unavailable" : `${usage.remaining_percent}% LEFT`}</strong><div class="usage-track-v3"><i style="width:${usageWidth}%"></i></div><p>${usage.used_percent ?? "—"}% total used · ${usage.autonomy_used_percent_estimate ?? "—"}% estimated since activation · stop at ${usage.absolute_stop_used_percent ?? "—"}% used</p></article><article class="system-hero-v3 healthy"><span>Model router</span><strong>${esc(routing.default_model || DATA.meta?.model || "Unavailable")}</strong><p>${number(routing.luna_agents || 0)} Luna · ${number(routing.terra_agents || 0)} Terra · ${esc(routing.default_reasoning_mode || "—")} reasoning</p></article><article class="system-hero-v3 ${Number(systems.error_count || 0) ? "attention" : "healthy"}"><span>Scheduler</span><strong>${number(inventory.enabled ?? (systems.automations || []).length)} ENABLED</strong><p>${number(inventory.enabled_model ?? usage.enabled_model_job_count)} model · ${number(inventory.enabled_deterministic ?? usage.enabled_deterministic_job_count)} deterministic · ${number(inventory.disabled_model ?? usage.disabled_model_job_count)} legacy model jobs parked</p></article>`;
  const automations = systems.automations || [];
  $("#automationSummary").textContent = `${automations.length} enabled · ${systems.error_count || 0} need attention`;
  $("#automationTable").innerHTML = table(["Automation", "Owner", "Cadence", "Last run", "Next run", "Status", "Errors"], automations.map(item => [item.name, item.owner, item.cadence, item.last_run, item.next_run, item.status, item.error_streak]));
  $("#systemHealth").innerHTML = (systems.health || []).map(item => `<article class="health-card-v3 ${tone(item.status)}"><div><span>${esc(item.category)}</span>${statusPill(item.status)}</div><strong>${esc(item.name)}</strong><p>${esc(item.detail)}</p></article>`).join("") || empty("System health unavailable.");
  $("#dataQuality").innerHTML = (DATA.data_quality || []).map(item => `<article class="quality-card-v3 ${tone(item.status)}"><div>${statusPill(item.status)}</div><strong>${esc(item.label)}</strong><p>${esc(item.detail)}</p></article>`).join("") || empty("Data-quality register unavailable.");
}

function renderAttention() {
  const approvals = ownerDecisionItems();
  $("#approvalGrid").innerHTML = approvals.map(item => `<article class="approval-card-v3"><div><span>${esc(item.category || "Owner decision")}</span>${statusPill(item.execution_status_label || item.status)}</div><h2>${esc(item.title)}</h2><p>${esc(item.recommendation || item.action || "Review required")}</p><dl><div><dt>Owner</dt><dd>${esc(item.owner || "Andrew")}</dd></div><div><dt>Exposure</dt><dd>${esc(item.maximum_exposure || "Unavailable")}</dd></div><div><dt>Reversible</dt><dd>${esc(item.reversibility || "Unavailable")}</dd></div></dl><small>Decision state: ${esc(item.execution_status_label || item.status || "required")}. Approval is not completion.</small>${decisionControls(item)}</article>`).join("") || empty("No active owner decisions.");
  const exceptions = automationExceptions();
  $("#systemExceptions").innerHTML = exceptions.map(item => `<article class="exception-card-v3"><div>${statusPill(item.status)}<span>${number(item.error_streak || 0)} error streak</span></div><h2>${esc(item.name)}</h2><p>${esc(item.owner)} · ${esc(item.cadence)}</p><small>Last: ${esc(item.last_run)} · Next: ${esc(item.next_run)}</small></article>`).join("") || empty("No enabled automation exceptions.");
  $("#riskGrid").innerHTML = importantRisks().filter(item => item.severity !== "healthy").map(item => {
    const decision = decisionForRisk(item);
    return `<article class="risk-card-v3 ${tone(item.severity)}"><div><span>${esc(item.category)}</span>${statusPill(item.severity)}</div><h2>${esc(item.title)}</h2><p>${esc(item.detail)}</p><footer><span>Owner: ${esc(item.owner)}</span><strong>${esc(item.impact)}</strong></footer>${decision ? decisionControls(decision) : ""}</article>`;
  }).join("") || empty("No material open risks.");
}

function renderMeta() {
  const gateway = DATA.systems?.gateway || {};
  $("#sidebarPresence").textContent = DATA.meta?.rowan_status || "Rowan status unavailable";
  $("#sidebarModel").textContent = `${DATA.meta?.provider || "Provider unavailable"} · ${DATA.meta?.model || "model unavailable"}`;
  $("#sidebarDot").classList.toggle("offline", !gateway.healthy);
  const usage = DATA.ai_usage || {};
  $("#topUsage").textContent = usage.remaining_percent == null ? "Usage unavailable" : `${usage.remaining_percent}% weekly usage left`;
  $("#topFreshness").textContent = `${dateText(DATA.generated_at)} · ${ageText(DATA.generated_at)}`;
  const ageHours = (Date.now() - new Date(DATA.generated_at).getTime()) / 3600000;
  if (!Number.isFinite(ageHours) || ageHours > 6) {
    $("#dataBanner").hidden = false;
    $("#dataBanner").textContent = Number.isFinite(ageHours) ? `Snapshot is ${ageText(DATA.generated_at)}. Current work and financial state may have changed.` : "Snapshot timestamp is invalid; treat all current-state claims as unavailable.";
  }
  const attentionCount = openApprovals().length + automationExceptions().length + importantRisks().filter(item => item.severity === "critical").length;
  $("#attentionNavCount").textContent = attentionCount;
}

function safeRender(name, fn) {
  try { fn(); }
  catch (error) {
    console.error(`[ROWAN] ${name} render failed`, error);
    const banner = $("#dataBanner");
    if (banner) { banner.hidden = false; banner.textContent = `The ${name} panel could not render. Other sourced panels remain available; refresh after repair.`; }
  }
}

function renderAll() {
  safeRender("overview", renderOverview);
  safeRender("profit", renderProfit);
  safeRender("assets", renderAssets);
  safeRender("agents", renderTeam);
  safeRender("Agent City", renderCity);
  safeRender("systems", renderSystems);
  safeRender("attention", renderAttention);
  safeRender("snapshot metadata", renderMeta);
  document.dispatchEvent(new CustomEvent("rowan:data-ready", { detail: DATA }));
}

function showView(name, updateHash = true) {
  const valid = $(`[data-view="${CSS.escape(name)}"]`) ? name : "overview";
  $$(".view-v3").forEach(view => view.classList.toggle("active", view.dataset.view === valid));
  $$(".nav-item-v3").forEach(button => button.classList.toggle("active", button.dataset.viewTarget === valid));
  document.body.classList.remove("nav-open-v3");
  if (updateHash) history.replaceState(null, "", `#${valid}`);
  if (valid === "city" && typeof globalThis.bootCity3D === "function") setTimeout(() => globalThis.bootCity3D(), 80);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showToast(message) {
  const node = $("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2200);
}

async function loadData() {
  const response = await fetch(`./command-center-data.json?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Snapshot request failed with ${response.status}`);
  const snapshot = await response.json();
  if (!snapshot || !Array.isArray(snapshot.team) || !snapshot.generated_at) throw new Error("Snapshot schema is incomplete");
  DATA = snapshot;
  window.DATA = DATA;
  renderAll();
}

function bindUI() {
  document.addEventListener("click", event => {
    const decisionButton = event.target.closest("[data-secure-decision-id]");
    if (decisionButton) {
      const item = (DATA?.approvals || []).find(entry => entry.id === decisionButton.dataset.secureDecisionId);
      if (item) openSecureDecision(item, decisionButton.dataset.decisionAction);
      return;
    }
    const nav = event.target.closest("[data-view-target]");
    if (nav) showView(nav.dataset.viewTarget);
    const filter = event.target.closest("[data-agent-filter]");
    if (filter) {
      currentAgentFilter = filter.dataset.agentFilter;
      $$("[data-agent-filter]").forEach(item => item.classList.toggle("active", item === filter));
      renderTeam();
    }
    const leagueAgent = event.target.closest("[data-league-agent]");
    if (leagueAgent && typeof window.ROWAN_SELECT_AGENT === "function") window.ROWAN_SELECT_AGENT(leagueAgent.dataset.leagueAgent);
  });
  $("#agentSearch")?.addEventListener("input", renderTeam);
  $("#mobileMenu")?.addEventListener("click", () => document.body.classList.toggle("nav-open-v3"));
  $("#refreshButton")?.addEventListener("click", async event => {
    event.currentTarget.disabled = true;
    try { await loadData(); showToast("Verified snapshot refreshed"); }
    catch (error) { $("#dataBanner").hidden = false; $("#dataBanner").textContent = `Snapshot refresh failed: ${error.message}. Existing data remains visible.`; }
    finally { event.currentTarget.disabled = false; }
  });
  window.addEventListener("hashchange", () => showView(location.hash.slice(1) || "overview", false));
}

document.addEventListener("DOMContentLoaded", async () => {
  document.body.innerHTML = TEMPLATE;
  document.body.className = "v3-ready";
  bindUI();
  showView(location.hash.slice(1) || "overview", false);
  try { await loadData(); }
  catch (error) {
    console.error("[ROWAN] snapshot load failed", error);
    $("#dataBanner").hidden = false;
    $("#dataBanner").textContent = `The sanitized command snapshot could not be loaded: ${error.message}. No financial or agent claims are being displayed.`;
    $("#executiveSummary").textContent = "Dashboard evidence unavailable.";
  }
});

globalThis.RowanV3DecisionContract = {
  currentDecision,
  ownerDecisionItems,
  secureDecisionUrl,
  decisionControls,
  decisionForRisk
};
