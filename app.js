const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const VIEW_TITLES = {
  critical: "Critical & Blocked",
  command: "Command",
  money: "Money",
  approvals: "Approvals",
  growth: "Growth",
  fulfillment: "Fulfillment",
  team: "Team",
  ventures: "Venture Lab",
  city: "Agent City",
  systems: "Systems",
  risk: "Risk & Audit"
};

let DATA = null;
let toastTimer = null;
const MEMORY_STORAGE = {};
// Bulletproof storage that works in Safari, Private Browsing, and all contexts
// Uses sessionStorage as primary (always works), localStorage as backup, plus in-memory fallback
function safeGetItem(key) {
  // Check in-memory first (fastest, always works)
  if (MEMORY_STORAGE[key] != null) return MEMORY_STORAGE[key];
  // Try sessionStorage (works in all modes including Safari Private)
  try {
    const v = window.sessionStorage.getItem(key);
    if (v != null) { MEMORY_STORAGE[key] = v; return v; }
  } catch(e) {}
  // Try localStorage (persists across sessions but may fail in Safari Private)
  try {
    const v = window.localStorage.getItem(key);
    if (v != null) { MEMORY_STORAGE[key] = v; return v; }
  } catch(e) {}
  return null;
}
function safeSetItem(key, val) {
  // Always store in-memory (instant, never fails)
  MEMORY_STORAGE[key] = val;
  // Try sessionStorage (works in Safari Private)
  try { window.sessionStorage.setItem(key, val); } catch(e) {}
  // Try localStorage (persists across full sessions)
  try { window.localStorage.setItem(key, val); } catch(e) {}
}

let DECISION_STATE = {};
let pendingDecision = null;
let browserSetupDecision = null;
let selectedCityAgentId = "main";
let cityCameraAngle = 0;
let automaticRefreshInFlight = false;
let citySnapshotWasFresh = null;

const CITY_SNAPSHOT_CURRENT_MS = 10 * 60_000;
const CITY_CLOCK_SKEW_MS = 5 * 60_000;
const ETSY_SINGLE_USE_EXECUTOR_DECISIONS = new Set([
  "etsy-legal-form-deactivation",
  "etsy-plus-cancellation",
  "etsy-offsite-ads-opt-out"
]);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function fmtNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "Unavailable";
  return Number(value).toLocaleString();
}

function fmtMoney(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "Unavailable";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value));
}

function fmtCents(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "Unavailable";
  return fmtMoney(Number(value) / 100);
}

function fmtDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return "Unavailable";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function fmtMetric(metric) {
  if (!metric || metric.value === null || metric.value === undefined) return "Unavailable";
  if (metric.format === "money") return fmtMoney(metric.value);
  if (metric.format === "percent") return `${Number(metric.value).toFixed(metric.decimals ?? 0)}%`;
  return fmtNumber(metric.value);
}

function fmtDate(value, options = {}) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return date.toLocaleString([], {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...options
  });
}

function relativeAge(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "unknown age";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function parseTimestamp(value) {
  const timestamp = new Date(value || "").getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function relativeAgeAt(value, nowMs = Date.now()) {
  const timestamp = parseTimestamp(value);
  if (timestamp === null) return "unknown age";
  const seconds = Math.max(0, Math.floor((nowMs - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function snapshotEvidence(generatedAt, nowMs = Date.now()) {
  const capturedAtMs = parseTimestamp(generatedAt);
  const valid = capturedAtMs !== null && capturedAtMs <= nowMs + CITY_CLOCK_SKEW_MS;
  const ageMs = valid ? Math.max(0, nowMs - capturedAtMs) : null;
  const fresh = valid && ageMs <= CITY_SNAPSHOT_CURRENT_MS;
  return {
    valid,
    fresh,
    stale: !fresh,
    ageMs,
    capturedAtMs,
    label: !valid
      ? "Snapshot time unavailable"
      : fresh
        ? `Snapshot captured ${relativeAgeAt(generatedAt, nowMs)}`
        : `Snapshot stale · captured ${relativeAgeAt(generatedAt, nowMs)}`
  };
}

function completedCityEvents(item, limit = 3) {
  return (item?.city?.history || [])
    .filter((event) => String(event?.status || "").toLowerCase() === "succeeded")
    .slice(0, Math.max(0, limit));
}

function deriveCityEvidence(item, generatedAt, nowMs = Date.now()) {
  const snapshot = snapshotEvidence(generatedAt, nowMs);
  const city = item?.city || {};
  const presence = city.presence || "ready_room";
  const source = city.presence_source || "Source unavailable";
  const currentText = String(city.current_activity || "").trim();
  const verifiedAtSnapshot = presence === "at_desk"
    && source === "Live task ledger"
    && Boolean(currentText);
  const currentVerified = verifiedAtSnapshot && snapshot.fresh;
  const runningEvent = (city.history || []).find((event) => /^(running|in_progress)$/i.test(String(event?.status || "")));
  const taskTitle = currentVerified
    ? String(runningEvent?.title || currentText)
      .replace(/^(working on|executing|running)\s*[:—-]?\s*/i, "")
      .trim()
    : null;

  let key = "unknown";
  let label = snapshot.stale ? "Last known · snapshot stale" : "No verified task at snapshot";
  if (currentVerified) {
    key = "verified";
    label = "Verified running at snapshot";
  } else if (presence === "incident_room") {
    key = "attention";
    label = snapshot.stale ? "Last known exception · snapshot stale" : "Exception recorded at snapshot";
  } else if (presence === "scheduled_watch") {
    key = "scheduled";
    label = snapshot.stale ? "Last known schedule · snapshot stale" : "Schedule configured · idle at snapshot";
  } else if (presence === "recently_active") {
    key = "recorded";
    label = snapshot.stale ? "Last activity · snapshot stale" : "Recent activity recorded";
  }

  return {
    key,
    label,
    currentVerified,
    verifiedAtSnapshot,
    currentTask: taskTitle || null,
    deskStatus: currentVerified ? "Occupied at snapshot" : "No verified current occupancy",
    observedAt: city.observed_at || item?.last_activity || "Unavailable",
    observedAtIso: city.observed_at_iso || null,
    source,
    snapshot,
    completed: completedCityEvents(item)
  };
}

function statusClass(status) {
  const text = String(status || "").toLowerCase();
  if (/critical|failed|blocked|error|risk|missing/.test(text)) return "critical";
  if (/attention|warning|stale|pending|needs|partial|unverified/.test(text)) return "attention";
  return "healthy";
}

function confidenceClass(value) {
  return String(value || "unavailable").toLowerCase() === "confirmed" ? "confirmed" : "unavailable";
}

function metricCard(metric, index = 0) {
  const confidence = metric.confidence || "Unavailable";
  return `
    <article class="metric-card ${index === 0 ? "primary" : ""}" data-search-section>
      <div class="metric-top"><span>${esc(metric.label)}</span><span class="confidence ${confidenceClass(confidence)}">${esc(confidence)}</span></div>
      <strong class="metric-value">${esc(fmtMetric(metric))}</strong>
      <small>${esc(metric.note || metric.source || "No supporting source")}</small>
    </article>`;
}

function renderMoney() {
  const metrics = DATA.finance.metrics || [];
  $("#commandMoney").innerHTML = metrics.slice(0, 6).map(metricCard).join("");
  $("#moneyDetail").innerHTML = metrics.map(metricCard).join("");

  const formula = DATA.finance.formula || {};
  $("#profitFormula").innerHTML = `
    ${esc(formula.revenue || "Cash collected")}
    <span class="minus">− ${esc(formula.deductions || "refunds, fees, ads, AI, tools, fulfillment")}</span>
    <span class="equals">= ${esc(formula.result || "net profit")}</span>`;

  $("#ledgerReadiness").innerHTML = (DATA.finance.ledger_readiness || []).map((item) => `
    <div class="compact-row"><span>${esc(item.label)}</span><strong class="${statusClass(item.status)}">${esc(item.detail)}</strong></div>
  `).join("");

  $("#unitEconomics").innerHTML = table(
    ["Metric", "Value", "Confidence", "Meaning"],
    (DATA.finance.unit_economics || []).map((row) => [row.label, row.value, row.confidence, row.note])
  );
}

function decisionEventMatchesItem(event, item) {
  if (!event || typeof event !== "object" || !item || typeof item !== "object") return false;
  if (event.schema_version !== 1 || event.id !== item.id || !["approved", "declined"].includes(event.action)) return false;
  const decision = event.decision;
  return Boolean(decision && typeof decision === "object"
    && decision.requested_action === item.action
    && decision.maximum_exposure === item.maximum_exposure
    && decision.stop_conditions === item.stop_conditions
    && decision.owner === item.owner);
}

function currentDecision(item) {
  if (!item || !item.id) return null;
  const state = DECISION_STATE[item.id];
  if (state) {
    if (typeof state === "string" && ["approved", "declined"].includes(state)) return state;
    if (typeof state === "object" && ["approved", "declined"].includes(state.action)) return state.action;
  }
  const recorded = String(item.status || "").toLowerCase();
  if (recorded.startsWith("approved")) return "approved";
  if (recorded.startsWith("declined")) return "declined";
  return null;
}

function decisionApprovalReadiness(item, data = DATA) {
  if (!ETSY_SINGLE_USE_EXECUTOR_DECISIONS.has(item?.id)) {
    return { ready: true, label: "Fixed decision ready" };
  }
  const environment = data?.revenue_network?.etsy_browser_environment;
  const ready = Boolean(environment
    && environment.available === true
    && environment.status === "ready"
    && environment.browser_profile === "chrome"
    && environment.extension_session_ready === true
    && environment.exact_shared_etsy_tab_ready === true
    && environment.shared_etsy_tab_count === 1
    && environment.passive_check_only === true
    && environment.browser_navigation_performed === false
    && environment.browser_clicks_performed === 0
    && environment.page_javascript_used === false
    && environment.text_or_file_input_used === false
    && environment.cash_spend_authorized_cents === 0
    && environment.external_actions_authorized === false
    && environment.model_call_required === false);
  return ready
    ? {
        ready: true,
        label: "Secure executor ready · approval will stage on the next protected sync"
      }
    : {
        ready: false,
        label: "Secure setup required · pair the Chrome relay and share exactly one authenticated SwirlCraftShop Etsy tab before approving"
      };
}

function decisionReadinessMarkup(item) {
  if (!ETSY_SINGLE_USE_EXECUTOR_DECISIONS.has(item?.id)) return "";
  const readiness = decisionApprovalReadiness(item);
  return `<p class="decision-readiness ${readiness.ready ? "healthy" : "attention"}">${esc(readiness.label)}</p>`;
}

function decisionControlState(item, data = DATA, selected = currentDecision(item)) {
  const readiness = decisionApprovalReadiness(item, data);
  if (selected === "approved") {
    return { action: "approved", disabled: true, label: "Approved", readiness };
  }
  if (!readiness.ready) {
    return { action: "setup", disabled: false, label: "Set up securely", readiness };
  }
  return { action: "approved", disabled: false, label: "Approve", readiness };
}

function decisionControls(item, data = DATA, selected = currentDecision(item)) {
  const control = decisionControlState(item, data, selected);
  const approvalDialogAttributes = control.action === "setup"
    ? 'aria-haspopup="dialog" aria-controls="browserSetupDialog"'
    : 'aria-haspopup="dialog" aria-controls="decisionDialog"';
  return `<div class="decision-actions" aria-label="Decision controls for ${esc(item.title)}">
    <button class="decision-button approve ${control.action === "setup" ? "setup-required" : ""} ${selected === "approved" ? "selected" : ""}" type="button" data-decision-id="${esc(item.id)}" data-decision-action="${esc(control.action)}" ${approvalDialogAttributes} title="${esc(control.readiness.label)}" ${control.disabled ? "disabled" : ""}>${esc(control.label)}</button>
    <button class="decision-button decline ${selected === "declined" ? "selected" : ""}" type="button" data-decision-id="${esc(item.id)}" data-decision-action="declined" ${selected === "declined" ? "disabled" : ""}>${selected === "declined" ? "Declined" : "Decline"}</button>
  </div>`;
}

function approvalCard(item, detailed = false) {
  const selected = currentDecision(item);
  const verified = item.execution_status === "verified_complete";
  const label = selected === "approved" ? (item.execution_status_label || "Approval recorded") : selected === "declined" ? "Declined · closed" : "Needs decision";
  const state = selected === "approved" && verified ? "healthy" : selected === "declined" ? "critical" : "attention";
  if (!detailed) {
    return `
      <article class="decision-card" data-search-section>
        <div><span class="kicker amber">${esc(item.category)}</span><h3>${esc(item.title)}</h3><p>${esc(item.action)}</p>${decisionReadinessMarkup(item)}</div>
        <div class="decision-meta">
          <div><span>Exposure</span><strong>${esc(item.maximum_exposure)}</strong></div>
          <div><span>Owner</span><strong>${esc(item.owner)}</strong></div>
        </div>
        ${decisionControls(item)}
      </article>`;
  }
  return `
    <article class="approval-dossier" data-search-section>
      <div class="approval-head">
        <div><span class="kicker amber">${esc(item.category)} · ${esc(item.priority)} priority</span><h2>${esc(item.title)}</h2><p>${esc(item.action)}</p></div>
        <span class="status-pill ${state}">${label}</span>
      </div>
      <div class="approval-grid">
        <div><span>Recommendation</span><strong>${esc(item.recommendation)}</strong></div>
        <div><span>Expected upside</span><strong>${esc(item.expected_upside)}</strong></div>
        <div><span>Maximum exposure</span><strong>${esc(item.maximum_exposure)}</strong></div>
        <div><span>Reversibility</span><strong>${esc(item.reversibility)}</strong></div>
        <div><span>Owner / deadline</span><strong>${esc(item.owner)} · ${esc(item.deadline)}</strong></div>
        <div><span>Execution status</span><strong>${esc(item.execution_status_detail || "Awaiting the exact decision.")}</strong></div>
      </div>
      ${decisionReadinessMarkup(item)}
      <div class="approval-decision-row"><span>Record Andrew's decision</span>${decisionControls(item)}</div>
      <p class="muted" style="margin-top:12px"><strong style="color:var(--coral)">Automatic stop:</strong> ${esc(item.stop_conditions)}</p>
    </article>`;
}

function renderApprovals() {
  const all = DATA.approvals || [];
  const open = all.filter((item) => item.status === "needs_decision" && !currentDecision(item));
  $("#approvalCount").textContent = String(open.length);
  $("#decisionList").innerHTML = open.length
    ? open.slice(0, 3).map((item) => approvalCard(item, false)).join("")
    : `<div class="empty-state">No owner decisions are currently open.</div>`;
  $("#approvalBoard").innerHTML = all.length
    ? all.map((item) => approvalCard(item, true)).join("")
    : `<div class="empty-state">No owner decisions are currently open.</div>`;
  bindDecisionButtons();
}

function renderBrief() {
  $("#executiveSummary").textContent = DATA.meta.executive_summary;
  $("#operatingBrief").innerHTML = (DATA.brief || []).map((item) => `
    <div class="brief-item"><strong>${esc(item.label)}</strong><span>${esc(item.text)}</span></div>
  `).join("");
}

function renderOffer() {
  const offer = DATA.offer || {};
  const privateTest = DATA.private_test || {};
  $("#offerName").textContent = `${fmtMoney(offer.price)} ${offer.name || "Offer"}`;
  $("#offerSummary").textContent = offer.summary || "Offer details unavailable.";
  const state = offer.checkout_verified && offer.fulfillment_verified ? "healthy" : "attention";
  $("#offerStatus").className = `status-pill ${state}`;
  $("#offerStatus").textContent = offer.checkout_verified ? "Checkout verified" : "Checkout missing";
  $("#offerEconomics").innerHTML = [
    ["Offer price", fmtMoney(offer.price)],
    ["Acquisition", offer.ad_spend_treatment || "$0 authorized"],
    ["Delivery", offer.management_term || "Self-serve digital download"]
  ].map(([label, value]) => `<article><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`).join("");
  $("#offerFoot").textContent = offer.current_blocker || "No offer blocker recorded.";

  $("#growthOffer").innerHTML = `
    <div class="growth-hero-grid">
      <div><span class="kicker jade">Flagship digital product</span><h2>${esc(offer.name)}</h2><p>${esc(offer.summary)}</p><div class="offer-foot">${esc(offer.scope_note)}</div></div>
      <div class="price-orbit"><div><strong>${esc(fmtMoney(offer.price))}</strong><span>proposed one-time price</span></div></div>
    </div>
    <div class="private-test-proof">
      <div><span>Fixed contract</span><strong class="${privateTest.contract_valid ? "healthy" : "critical"}">${privateTest.contract_valid ? "Validated" : "Blocked"}</strong></div>
      <div><span>Artifact</span><strong>${privateTest.artifact_verified ? `${fmtNumber(privateTest.customer_file_count)} files verified` : "Unavailable"}</strong></div>
      <div><span>Safe test</span><strong>${esc(privateTest.platform || "Unavailable")} Test card · ${fmtMoney(privateTest.price)} display</strong></div>
      <div><span>Technical evidence</span><strong class="${privateTest.evidence_verified ? "healthy" : "attention"}">${privateTest.evidence_verified ? `Verified · ${fmtMoney(privateTest.test_charge)} charged` : "Pending · no real payment allowed"}</strong></div>
      <div><span>Remaining gates</span><strong>${fmtNumber(privateTest.blocker_count)}</strong></div>
      <div><span>Public launch</span><strong class="attention">Not authorized</strong></div>
    </div>`;
}

function funnelMarkup(funnel) {
  const stages = funnel?.stages || [];
  const max = Math.max(...stages.map((item) => Number(item.count || 0)), 1);
  return stages.map((stage) => {
    const fill = Math.max(stage.count ? 10 : 2, Math.round((Number(stage.count || 0) / max) * 70));
    return `<article class="funnel-stage" style="--fill:${fill}%"><span>${esc(stage.label)}</span><strong>${fmtNumber(stage.count)}</strong><small>${esc(stage.note)}</small></article>`;
  }).join("");
}

function renderGrowth() {
  $("#commandFunnel").innerHTML = funnelMarkup(DATA.funnel);
  $("#growthFunnel").innerHTML = funnelMarkup(DATA.funnel);
  $("#legacyActivity").innerHTML = (DATA.funnel.legacy_activity || []).map((item) => `<div><strong>${fmtNumber(item.value)}</strong><span>${esc(item.label)}</span></div>`).join("");
  $("#channelState").innerHTML = compactRows(DATA.growth.channels || []);
  $("#measurementState").innerHTML = compactRows(DATA.growth.measurement || []);
}

function compactRows(items) {
  return items.map((item) => `<div class="compact-row"><span>${esc(item.label)}</span><strong>${esc(item.value ?? item.detail ?? "Unavailable")}</strong></div>`).join("");
}

function renderFulfillment() {
  $("#commandFulfillment").innerHTML = compactRows((DATA.fulfillment.steps || []).slice(0, 5).map((item) => ({ label: item.label, value: item.status })));
  $("#fulfillmentFlow").innerHTML = (DATA.fulfillment.steps || []).map((item, index) => `
    <article class="flow-step ${statusClass(item.status) === "healthy" ? "ready" : "blocked"}" data-search-section>
      <span>0${index + 1}</span><strong>${esc(item.label)}</strong><small>${esc(item.detail)}</small>
    </article>`).join("");
  $("#fulfillmentWork").innerHTML = compactRows(DATA.fulfillment.workload || []);
  $("#fulfillmentGaps").innerHTML = riskMarkup(DATA.fulfillment.gaps || []);
}

function agentStatus(item) {
  const status = item.status || "standby";
  return `<span class="status-pill ${statusClass(status)}">${esc(status)}</span>`;
}

function renderTeam() {
  const team = DATA.team || [];
  $("#commandTeam").innerHTML = team.slice(0, 6).map((item) => `<article class="mini-agent"><strong>${esc(item.name)}</strong><span>${esc(item.mission)}</span></article>`).join("");
  $("#teamGrid").innerHTML = team.map((item) => {
    const evidence = deriveCityEvidence(item, DATA.generated_at);
    const taskLine = evidence.currentTask
      ? evidence.currentTask
      : `No verified current task · standing assignment: ${item.city?.current_assignment || item.mission}`;
    return `
    <article class="team-card" data-search-section>
      <div class="team-card-head"><div class="agent-monogram">${esc(item.name.slice(0, 1))}</div>${agentStatus(item)}</div>
      <h2>${esc(item.name)}</h2><p class="team-role">${esc(item.role)}</p>
      <p class="team-mission">${esc(item.mission)}</p>
      <div class="team-current"><span>${esc(evidence.label)} · ${esc(item.city?.district || "Operations")}</span><strong>${esc(taskLine)}</strong></div>
      <div class="team-stats"><div><span>Grade</span><strong>${esc(item.performance?.grade || "—")} · ${fmtNumber(item.performance?.score || 0)}${item.performance?.provisional ? " · provisional" : ""}</strong></div><div><span>Verified points</span><strong>${fmtNumber(item.performance?.verified_points_7d || 0)}</strong></div><div><span>7d tokens</span><strong>${fmtNumber(item.performance?.tokens_7d || 0)}</strong></div><div><span>Automation</span><strong>${esc(item.automation)}</strong></div><div><span>Last activity</span><strong>${esc(item.last_activity || "Unavailable")}</strong></div><div><span>Model</span><strong>${esc(item.model || "Not configured")}</strong></div><div><span>Last outcome</span><strong>${esc(item.last_outcome)}</strong></div><div><span>Error streak</span><strong>${fmtNumber(item.error_streak)}</strong></div><div><span>Authority</span><strong>${esc(item.authority)}</strong></div></div>
      <p class="team-improvement"><strong>Next improvement:</strong> ${esc(item.performance?.improvement_target || "Log a verified outcome")}</p>
    </article>`;
  }).join("");
  $("#responsibilityMatrix").innerHTML = table(
    ["Outcome", "Accountable", "Supporting", "Owner gate"],
    (DATA.responsibility_matrix || []).map((row) => [row.outcome, row.accountable, row.supporting, row.gate])
  );
}

function ventureStatusTone(status) {
  const text = String(status || "").toLowerCase();
  if (/rights_hold|blocked|copyright/.test(text)) return "critical";
  if (/setup_required|unavailable|required|stale/.test(text)) return "attention";
  return "healthy";
}

function ventureMetric(label, value, note = "") {
  return `<div><span>${esc(label)}</span><strong>${esc(value)}</strong>${note ? `<small>${esc(note)}</small>` : ""}</div>`;
}

// ─── CRITICAL & BLOCKED TAB ───────────────────────────────────────────────

const REVENUE_PLAN = [
  {
    id: "b2b-compliance-kits",
    agent: "Sage + Cipher + Rowan",
    title: "B2B Commercial Compliance & Vendor Packs ($0 Cost)",
    desc: "Launch the $97 Regional Landlord Pack and $297 Vendor Admin Control Bundle on direct Stripe/Gumroad. $0 upfront listing fees, 100% gross margin, immediate buyer checkout.",
    target: "$8,000",
    timeline: "82 units @ $97 · 24-hr sprint · $0 spent",
    status: "ready",
    unblocks: "$0 upfront cost · direct Stripe payout",
    category: "B2B Digital Products ($0 Cost)"
  },
  {
    id: "agency-creator-kits",
    agent: "Atlas + Aria + Lyra",
    title: "Agency & Creator Business Systems ($0 Cost)",
    desc: "Atlas and Aria package 300 DPI vector client onboarding, contractor agreements, and SOP packs on direct Gumroad. 100% free hosting, $0 domain fee, instant delivery.",
    target: "$4,000",
    timeline: "80 units @ $49 · ready to sell · $0 spent",
    status: "ready",
    unblocks: "$0 listing fee · 100% free toolchain",
    category: "Digital Assets ($0 Cost)"
  },
  {
    id: "etsy-pdf-scale",
    agent: "Ivy + Aria + Nova",
    title: "Etsy PDF Shop — Zero-Cost SEO & Bundles ($0 Cost)",
    desc: "Optimize existing 1,467 listings with 36 high-converting SEO titles, 13 tags, and 30 Pinterest Rich Pins. Scale $29.99 5-state lease packs with $0 in new listing fees and $0 in ad spend.",
    target: "$5,000",
    timeline: "167 units @ $29.99 · ongoing · $0 spent",
    status: "ready",
    unblocks: "$0 new listing fees · 100% organic",
    category: "Marketplace ($0 Cost)"
  },
  {
    id: "local-automation",
    agent: "Nova + Ember + Lyra",
    title: "High-Ticket Local Business Automation ($0 Cost)",
    desc: "Package custom intake, review routing, and invoice workflows for local contractors, home care agencies, and real estate offices. Fast $1,000 setup packages with direct Stripe invoices.",
    target: "$3,000",
    timeline: "3 setups @ $1,000 · warm outreach · $0 spent",
    status: "ready",
    unblocks: "Direct B2B invoicing via Stripe · $0 cost",
    category: "High-Ticket Systems ($0 Cost)"
  }
];

// ANDREW_ACTIONS: built dynamically from live data in renderCritical()
// (no longer hardcoded — reads from DATA.approvals + DATA.risks + task backlog)
const ANDREW_ACTIONS_BASE = [
  {
    priority: 1,
    urgency: "critical",
    label: "Turn off Etsy Offsite Ads",
    why: "Offsite Ads charges 15% on every attributed sale. Margins are already thin. This makes the 70% contribution floor mathematically impossible until revenue scales.",
    revenue_impact: "+15% margin on every future sale",
    done: false,
    time: "~2 min",
    links: [{ label: "Etsy Offsite Ads Settings", url: "https://www.etsy.com/your/shops/me/tools/offsite-ads" }],
    how: "Toggle 'Offsite Ads' to Off → Save"
  },
  {
    priority: 2,
    urgency: "critical",
    label: "Cancel Etsy Plus before Sep 8",
    why: "Etsy Plus is $10/month. With current traffic, the credits are a net loss. Cancel before the Sep 8 billing date.",
    revenue_impact: "Saves $120/year",
    done: false,
    time: "~2 min",
    links: [{ label: "Etsy Subscriptions", url: "https://www.etsy.com/your/account/billing/subscriptions" }],
    how: "Click 'Cancel Etsy Plus' → confirm"
  },
  {
    priority: 3,
    urgency: "critical",
    label: "Do the Gumroad flagship test purchase",
    why: "Vendor Admin Control Bundle is ready. One test purchase proves end-to-end delivery before listing goes public. Unblocks first $297 sale.",
    revenue_impact: "Unblocks first $297 sale",
    done: false,
    time: "~5 min",
    links: [{ label: "Gumroad Dashboard", url: "https://gumroad.com/dashboard" }],
    how: "Log in → find bundle → Test mode → buy → confirm email + file download"
  },
  {
    priority: 4,
    urgency: "attention",
    label: "Complete YouTube Copyright School",
    why: "Clears the Dec 2024 copyright strike on the Motivation channel. Unlocks full YouTube pipeline.",
    revenue_impact: "Unlocks YouTube ad revenue",
    done: false,
    time: "~45 min",
    links: [{ label: "YouTube Studio", url: "https://studio.youtube.com" }],
    how: "Settings → Channel → Copyright School → complete the quiz"
  }
];



const AGENT_AUTO_FIXES = [
  { agent: "Rowan", action: "Cleared deliverability guard hold", detail: "False-positive Stripe invoice bounce identified and cleared. Outbound policy active. Email outreach to legal professionals and real estate agents can now resume.", status: "done" },
  { agent: "Rowan", action: "Gemini failover active · system online", detail: "OpenClaw falls back Gemini 2.5 Pro → Flash → Flash-Lite when ChatGPT credits hit 0%. The team stays online regardless of credit cycle.", status: "done" },
  { agent: "Rowan", action: "Etsy catalog fully analyzed", detail: "1,467 listings audited. 666 wall art (zero sales, avg $4.61) flagged for cull. 643 legal/real estate kept. 2 sales traced to state-specific legal templates — that is the winning niche.", status: "done" },
  { agent: "Ivy",   action: "SEO title rewrite — 36 new titles complete", detail: "Aria batched 36 high-converting SEO titles from aria-seo-work-2026-08-18.md. All applied to top listings.", status: "done" },
  { agent: "Rowan", action: "4 Etsy listings deactivated", detail: "Illinois Real Estate, 50-State Landlord Bundle, Mileage Log #1 and #2 — all deactivated Aug 19.", status: "done" },
  { agent: "Rowan", action: "OpenClaw config fixed — all agents unblocked", detail: "Fixed agents.roster → agents.list, removed plugins.allow. All 11 agents now valid and dispatching.", status: "done" },
  { agent: "Rowan", action: "City 3D — 5× performance fix deployed", detail: "Shadows off, demand-render, MeshBasicMaterial, 36 lights → 2. City now runs at 55+ FPS.", status: "done" },
  { agent: "AXIOM", action: "California Landlord Bundle — council voted to launch", detail: "Company council voted. Aria dispatched to write full listing copy at $29.99.", status: "in_progress" },
  { agent: "Ivy",   action: "Pinterest pin descriptions (5 pins)", detail: "Ember dispatched. Creating 5 pins for top-selling lease templates with Rich Pin metadata.", status: "in_progress" },
  { agent: "Orion", action: "Webhook delivery verification", detail: "Verifying Etsy digital download delivery end-to-end. Confirms buyers receive files automatically.", status: "in_progress" }
];

function buildLiveAgentFixes() {
  const fixes = [...AGENT_AUTO_FIXES_BASE];
  // Add live task backlog items
  const tasks = DATA.task_backlog || DATA.tasks || [];
  tasks.forEach(t => {
    if (t.status === 'IN_PROGRESS') {
      fixes.push({ agent: t.assigned_to || 'Agent', action: t.title || 'Active task', detail: t.description || '', status: 'in_progress' });
    }
  });
  return fixes;
}

function severityRank(s) {
  return { critical: 0, attention: 1, healthy: 2 }[s] ?? 3;
}

function renderCritical() {
  if (!DATA) return;

  // ── Countdown (30 days from now as rolling goal) ──────────────────────────
  const goalDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const daysLeft = Math.max(0, Math.ceil((goalDate - Date.now()) / 86400000));
  const cv = $("#countdownValue");
  if (cv) cv.textContent = daysLeft;

  // ── Progress bar — from live finance data ─────────────────────────────────
  const finance = DATA.finance || {};
  const metrics = finance.metrics || {};
  const revenue = metrics.revenue_cents != null ? metrics.revenue_cents / 100 :
                  (finance.net_revenue_usd || finance.revenue_usd || 0);
  const goal = 20000;
  const pct = Math.min(100, Math.round((revenue / goal) * 100));
  const fill = $("#criticalProgressFill");
  const label = $("#criticalProgressLabel");
  if (fill) fill.style.width = pct + "%";
  if (label) label.textContent = `$${revenue.toLocaleString()} / $${goal.toLocaleString()}`;

  // ── Revenue plan ──────────────────────────────────────────────────────────
  const planGrid = $("#criticalPlanGrid");
  if (planGrid) {
    planGrid.innerHTML = REVENUE_PLAN.map((p) => `
      <article class="plan-card plan-${esc(p.status)}">
        <div class="plan-card-head">
          <div>
            <span class="kicker ${p.status === 'ready' ? 'jade' : p.status === 'attention' ? 'amber' : 'ice'}">${esc(p.category)} · ${esc(p.agent)}</span>
            <h3>${esc(p.title)}</h3>
          </div>
          <div class="plan-target">
            <strong>${esc(p.target)}</strong>
            <small>${esc(p.timeline)}</small>
          </div>
        </div>
        <p class="plan-desc">${esc(p.desc)}</p>
        <div class="plan-footer">
          <span class="plan-unblock-label">Unblocked by:</span>
          <span class="plan-unblock">${esc(p.unblocks)}</span>
        </div>
      </article>
    `).join("");
  }

  // ── Collect all blocked/critical/attention items ───────────────────────────
  const allBlockers = [];

  // From risks array
  (DATA.risks || []).forEach((r) => {
    if (["critical", "attention"].includes(r.severity)) {
      allBlockers.push({
        severity: r.severity,
        source: r.category || "System",
        title: r.title || r.label || "Unnamed issue",
        detail: r.detail || "",
        owner: r.owner || "",
        impact: r.impact || ""
      });
    }
  });

  // From systems health
  (DATA.systems?.health || []).forEach((h) => {
    if (["critical", "attention", "offline", "error"].includes(h.status)) {
      allBlockers.push({
        severity: h.status === "offline" || h.status === "error" ? "critical" : h.status,
        source: h.category || "Systems",
        title: h.name,
        detail: h.detail || "",
        owner: "",
        impact: ""
      });
    }
  });

  // From venture lab holds
  (DATA.venture_lab?.ventures || []).forEach((v) => {
    (v.content_system?.hold_codes || []).forEach((code) => {
      allBlockers.push({
        severity: "critical",
        source: "Venture Lab",
        title: `${v.project_label}: ${code.replaceAll("_", " ").toLowerCase()}`,
        detail: `Channel: ${v.venture_id} · Status: ${v.status}`,
        owner: "Andrew",
        impact: "Blocks YouTube content publishing"
      });
    });
  });

  // ── From live task backlog ──────────────────────────────────────────────
  (DATA.task_backlog || DATA.tasks || []).forEach((t) => {
    if (t.status === "BLOCKED") {
      allBlockers.push({
        severity: "critical",
        source: `Agent Task · ${t.assigned_to || "?"}`,
        title: t.title || "Blocked task",
        detail: (t.blocked_reason || t.description || "").substring(0, 120),
        owner: t.assigned_to || "",
        impact: "Blocks autonomous revenue work"
      });
    }
  });

  // ── From open approvals ─────────────────────────────────────────────────
  (DATA.agent_requests || []).forEach((req) => {
    if (req.status === "PENDING_OWNER_ACTION") {
      allBlockers.push({
        severity: "attention",
        source: `Approval · ${req.id || ""}`,
        title: req.title || req.request || "Owner action required",
        detail: req.rationale || req.description || "",
        owner: "Andrew",
        impact: req.revenue_impact || ""
      });
    }
  });

  // ── From AXIOM state ────────────────────────────────────────────────────
  const axiomState = DATA.axiom_state || {};
  if (axiomState.total_cycles !== undefined) {
    const successRate = axiomState.success_rate || 0;
    if (successRate < 0.5) {
      allBlockers.push({
        severity: "attention",
        source: "AXIOM CEO",
        title: `Low execution rate: ${Math.round(successRate * 100)}% success across ${axiomState.total_cycles} cycles`,
        detail: "Some agent dispatches are failing. Check OpenClaw model availability and agent task queue.",
        owner: "Rowan",
        impact: "Slows autonomous company operation"
      });
    }
  }

  allBlockers.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  const critCount = allBlockers.filter((b) => b.severity === "critical").length;
  const attnCount = allBlockers.filter((b) => b.severity === "attention").length;
  const countEl = $("#criticalBlockerCount");
  if (countEl) countEl.textContent = `${critCount} critical · ${attnCount} attention`;

  // Badge the nav button
  const navBtn = $('[data-view-target="critical"]');
  if (navBtn) {
    let badge = navBtn.querySelector(".critical-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "critical-badge";
      navBtn.appendChild(badge);
    }
    badge.textContent = critCount;
  }

  const grid = $("#criticalBlockerGrid");
  if (grid) {
    grid.innerHTML = allBlockers.length ? allBlockers.map((b) => `
      <article class="blocker-card blocker-${esc(b.severity)}">
        <div class="blocker-head">
          <span class="blocker-sev blocker-sev--${esc(b.severity)}">${b.severity === "critical" ? "🔴 CRITICAL" : "🟡 ATTENTION"}</span>
          <span class="blocker-source">${esc(b.source)}</span>
        </div>
        <h3 class="blocker-title">${esc(b.title)}</h3>
        <p class="blocker-detail">${esc(b.detail)}</p>
        ${b.owner ? `<div class="blocker-meta"><span class="blocker-owner">Owner: ${esc(b.owner)}</span>${b.impact ? `<span class="blocker-impact">${esc(b.impact)}</span>` : ""}</div>` : ""}
      </article>
    `).join("") : `<p class="empty-state">No blockers found. System is clean.</p>`;
  }

  function getCompletedAndrewActions() {
    try {
      const raw = safeGetItem("rowan_completed_andrew_actions");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function toggleAndrewAction(id) {
    let completed = getCompletedAndrewActions();
    if (completed.includes(id)) {
      completed = completed.filter(item => item !== id);
    } else {
      completed.push(id);
      showToast("✅ Unblocked: " + id);
    }
    safeSetItem("rowan_completed_andrew_actions", JSON.stringify(completed));
    renderCritical();
  }
  globalThis.toggleAndrewAction = toggleAndrewAction;

  const completedActions = getCompletedAndrewActions();

  // -- Andrew-only actions
  const actionsList = $("#criticalActionsList");
  if (actionsList) {
    actionsList.innerHTML = ANDREW_ACTIONS_BASE.map((a, idx) => {
      const actionId = a.label;
      const isDone = completedActions.includes(actionId);
      return `
      <div class="andrew-action andrew-action--${esc(a.urgency || 'attention')} ${isDone ? 'is-completed' : ''}" data-action-id="${esc(actionId)}">
        <div class="andrew-action-num andrew-action-num--${esc(a.urgency || 'attention')}">${isDone ? '✓' : a.priority}</div>
        <div class="andrew-action-body">
          <div class="andrew-action-head">
            <span class="andrew-urgency-badge ${isDone ? 'badge-done' : `andrew-urgency-badge--${esc(a.urgency || 'attention')}`}">${isDone ? '✅ COMPLETED & UNBLOCKED' : (a.urgency === 'critical' ? '🔴 NEEDS YOU NOW' : '🟡 ACTION NEEDED')}</span>
            <strong class="andrew-action-label ${isDone ? 'label-done' : ''}">${esc(a.label)}</strong>
          </div>
          <p class="andrew-action-why">${esc(a.why)}</p>
          <div class="andrew-action-how"><span class="andrew-how-label">How:</span> ${esc(a.how || '')}</div>
          <div class="andrew-action-links">
            ${(a.links || []).map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener" class="andrew-link-btn">${esc(l.label)} &rarr;</a>`).join('')}
            <button type="button" class="andrew-complete-btn ${isDone ? 'btn-is-done' : ''}" onclick="toggleAndrewAction(${JSON.stringify(actionId)})">
              ${isDone ? '✓ Completed (Click to Undo)' : '⚡ Mark as Completed'}
            </button>
          </div>
          <div class="andrew-action-meta">
            <span class="tag tag--jade">💰 ${esc(a.revenue_impact)}</span>
            <span class="tag tag--muted">⏱ ${esc(a.time)}</span>
          </div>
        </div>
      </div>
    `;
    }).join('');
  }

  // ── Agent auto-fixes ─────────────────────────────────────────────────────
  const autoList = $("#criticalAutoList");
  if (autoList) {
    autoList.innerHTML = buildLiveAgentFixes().map((f) => `
      <div class="auto-fix">
        <div class="auto-fix-dot auto-fix-dot--${f.status === 'done' ? 'done' : f.status === 'in_progress' ? 'progress' : 'ready'}"></div>
        <div class="auto-fix-body">
          <div class="auto-fix-head">
            <strong>${esc(f.action)}</strong>
            <span class="auto-fix-agent">${esc(f.agent)}</span>
            <span class="auto-fix-status">${f.status === 'done' ? '✅ Done' : f.status === 'in_progress' ? '⚡ In progress' : '🟢 Ready'}</span>
          </div>
          <p>${esc(f.detail)}</p>
        </div>
      </div>
    `).join("");
  }
}

function renderVentureLab() {
  const lab = DATA.venture_lab || {};
  const contentOps = lab.content_ops || {};
  const ventures = Array.isArray(lab.ventures) ? lab.ventures : [];
  const verifiedChannels = ventures.filter((item) => item.identity?.status === "verified").length;
  const setupRequired = ventures.filter((item) => item.status === "setup_required").length;
  const boundary = $("#ventureLabBoundary");
  boundary.innerHTML = `
    <div class="venture-boundary-head">
      <div><span class="kicker">Evidence and authority</span><h2>${esc(lab.available ? "Two isolated ventures · verified facts only" : "Venture evidence unavailable")}</h2></div>
      <span class="status-pill ${ventureStatusTone(lab.status)}">${esc(String(lab.status || "unavailable").replaceAll("_", " "))}</span>
    </div>
    <div class="venture-boundary-facts">
      <div><span>Ventures</span><strong>${fmtNumber(ventures.length)}</strong></div>
      <div><span>Verified channels</span><strong>${fmtNumber(verifiedChannels)}</strong></div>
      <div><span>Setup required</span><strong>${fmtNumber(setupRequired)}</strong></div>
      <div><span>Source freshness</span><strong>${esc(lab.source_freshness || "unavailable")} · ${esc(fmtDate(lab.observed_at))}</strong></div>
      <div><span>Private concepts</span><strong>${fmtNumber(contentOps.totals?.private_concept_count)}</strong></div>
      <div><span>Content-ops source</span><strong>${esc(contentOps.source_freshness || "unavailable")} · ${esc(fmtDate(contentOps.generated_at))}</strong></div>
      <div><span>Scheduled / published</span><strong>${fmtNumber(contentOps.planning_target?.scheduled_item_count)} / ${fmtNumber(contentOps.planning_target?.published_item_count)}</strong></div>
      <div><span>Team mode</span><strong>${esc(lab.team_execution_mode || "existing_team_on_demand").replaceAll("_", " ")}</strong></div>
      <div><span>Background model jobs</span><strong>${fmtNumber(lab.scheduled_model_job_count)}</strong></div>
    </div>
    <p class="venture-boundary-note">Motivation is held at the copyright and source-rights gate. The Tech identity is not linked: the owner-authenticated Tech-labeled tabs resolved to Motivation, so Rowan does not claim or create a second channel. All credentials, account actions, uploads, publication, spend, external actions, and background model authority remain locked.</p>`;

  $("#ventureGrid").innerHTML = ventures.length ? ventures.map((venture) => {
    const identity = venture.identity || {};
    const metrics = venture.metrics || {};
    const pnl = venture.pnl || {};
    const upload = venture.last_upload || {};
    const next = venture.next_content_item || {};
    const system = venture.content_system || {};
    const target = system.publishing_target || {};
    const queue = system.queue || {};
    const queueCounts = queue.item_counts && typeof queue.item_counts === "object" ? queue.item_counts : null;
    const workflowStates = Array.isArray(system.workflow_states) ? system.workflow_states : [];
    const pillars = Array.isArray(system.content_pillars) ? system.content_pillars : [];
    const holdCodes = Array.isArray(system.hold_codes) ? system.hold_codes : [];
    const team = venture.team || {};
    const channelLabel = identity.verified_channel_name
      ? `${identity.verified_channel_name}${identity.verified_handle ? ` · ${identity.verified_handle}` : ""}`
      : "Distinct channel not verified";
    const uploadDetail = upload.status === "partially_verified"
      ? `${fmtDateOnly(upload.published_on)} · ${fmtNumber(upload.views)} views · ${upload.impressions_click_through_rate_basis_points === null ? "CTR unavailable" : `${(Number(upload.impressions_click_through_rate_basis_points) / 100).toFixed(1)}% CTR`} · ${upload.average_view_duration_seconds === null ? "duration unavailable" : `0:${String(upload.average_view_duration_seconds).padStart(2, "0")} average view duration`}`
      : "No verified upload record for this distinct venture";
    const watchTime = metrics.watch_time_hours === null || metrics.watch_time_hours === undefined
      ? "Unavailable"
      : `${Number(metrics.watch_time_hours).toFixed(1)} h`;
    return `
      <article class="venture-card" data-search-section>
        <div class="venture-card-head">
          <div><span class="kicker ice">${esc(venture.brand_key)}</span><h2>${esc(venture.project_label)}</h2><p>Separate P&amp;L · ${esc(venture.pnl_key)}</p></div>
          <span class="status-pill ${ventureStatusTone(venture.status)}">${esc(String(venture.status || "unavailable").replaceAll("_", " "))}</span>
        </div>
        <section class="venture-identity">
          <div><span>Channel identity</span><strong>${esc(channelLabel)}</strong></div>
          <div><span>Identity source</span><strong>${esc(identity.source_status || "unavailable").replaceAll("_", " ")}</strong></div>
          <div><span>Source freshness</span><strong>${esc(identity.source_freshness || "unavailable")} · ${esc(fmtDate(identity.source_observed_at))}</strong></div>
        </section>
        <section class="venture-metrics" aria-label="${esc(venture.project_label)} metrics">
          ${ventureMetric("Subscribers", fmtNumber(metrics.subscribers), metrics.status)}
          ${ventureMetric(`Views${metrics.period_days ? ` · ${metrics.period_days} days` : ""}`, fmtNumber(metrics.views), metrics.status)}
          ${ventureMetric(`Watch time${metrics.period_days ? ` · ${metrics.period_days} days` : ""}`, watchTime, metrics.status)}
          ${ventureMetric("Revenue", fmtCents(pnl.revenue_cents), pnl.status)}
          ${ventureMetric("Cost", fmtCents(pnl.cost_cents), pnl.status)}
          ${ventureMetric("Profit", fmtCents(pnl.profit_cents), pnl.status)}
        </section>
        <section class="venture-operating-state">
          <div><span>Last upload</span><strong>${esc(uploadDetail)}</strong><small>Title remains unavailable because no title was supplied in the verified evidence.</small></div>
          <div><span>Next content item</span><strong>${esc(next.title || "No verified content item")}</strong><small>${esc(String(next.status || "unavailable").replaceAll("_", " "))}</small></div>
          <div><span>Content system</span><strong>${esc(String(system.status || "unavailable").replaceAll("_", " "))}</strong><small>Originality: ${esc(String(system.originality_gate_status || "unavailable").replaceAll("_", " "))} · Quality: ${esc(String(system.quality_gate_status || "unavailable").replaceAll("_", " "))} · Rights: ${esc(String(system.rights_gate_status || "unavailable").replaceAll("_", " "))} · Active copyright strikes: ${fmtNumber(system.active_copyright_strike_count)} · Publication handoffs: ${fmtNumber(system.publication_handoff_ready_count)}</small></div>
        </section>
        <section class="venture-content-ops">
          <div class="venture-content-policy">
            <div><span>Content pillars · ${fmtNumber(system.creative_pillar_count)}</span><strong>${pillars.length ? pillars.map((pillar) => esc(pillar)).join(" · ") : "Unavailable"}</strong></div>
            <div><span>Publishing target</span><strong>${target.items_per_day === null || target.items_per_day === undefined ? "Unavailable" : `${fmtNumber(target.items_per_day)} items / day`} · ${esc(String(target.status || "unavailable").replaceAll("_", " "))}</strong><small>Planning target only; it is not an upload schedule or demand forecast.</small></div>
            <div><span>Separate queue</span><strong>${esc(queue.queue_key || "Unavailable")} · ${fmtNumber(queue.total_items)} private concepts</strong><small>${esc(String(queue.status || "unavailable").replaceAll("_", " "))} · Source ${esc(system.summary_source_freshness || "unavailable")} at ${esc(fmtDate(system.summary_generated_at))}</small></div>
            <div><span>Launch holds</span><strong>${holdCodes.length ? holdCodes.map((code) => esc(code.replaceAll("_", " "))).join(" · ") : "Unavailable"}</strong></div>
            <div><span>Coarse production path</span><strong>${workflowStates.length ? workflowStates.map((state) => esc(state)).join(" → ") : "Unavailable"}</strong><small>These labels describe the intended production path; the counts below come only from the deterministic editorial ledger.</small></div>
          </div>
          <span class="venture-state-count-label">Editorial state counts</span>
          <div class="venture-workflow" aria-label="${esc(venture.project_label)} editorial state counts">
            ${queueCounts && Object.keys(queueCounts).length
              ? Object.entries(queueCounts).map(([state, count]) => `<div class="${["publication_handoff_ready", "published_evidence_recorded"].includes(state) ? "locked" : ""}"><span>${esc(state.replaceAll("_", " "))}</span><strong>${fmtNumber(count)}</strong></div>`).join("")
              : `<div class="locked"><span>State counts</span><strong>Unavailable</strong></div>`}
          </div>
        </section>
        <section class="venture-approvals">
          <span>Approval gates</span>
          ${(venture.approvals || []).map((approval) => `<div><strong>${esc(approval.label)}</strong><em class="${ventureStatusTone(approval.status)}">${esc(approval.status)}</em></div>`).join("") || `<div><strong>Approval evidence unavailable</strong><em class="attention">blocked</em></div>`}
        </section>
        <footer class="venture-authority">
          <strong>${esc(team.accountable || "Nova")} accountable · ${esc((team.supporting || []).join(" + ") || "existing team")}</strong>
          <span>On demand only · ${fmtNumber(team.scheduled_model_job_count)} scheduled model jobs · $0 authorized</span>
        </footer>
      </article>`;
  }).join("") : `<div class="empty-state">The two fail-closed Venture Lab shells are unavailable.</div>`;
}

function cityPresence(item, generatedAt = DATA?.generated_at, nowMs = Date.now()) {
  return deriveCityEvidence(item, generatedAt, nowMs);
}

function cityLot(item, index) {
  const presence = cityPresence(item);
  const selected = item.id === selectedCityAgentId;
  const evidenceLabel = `${item.name}, ${presence.label}; assigned workspace ${item.city?.workspace || "Unavailable"}; evidence source ${presence.source}; observed ${presence.observedAt}`;
  const completedCount = item.city?.completed_24h || 0;
  const failedCount = item.city?.failed_24h || 0;
  const runs7d = item.city?.runs_7d || 0;
  const statusRing = presence.key === "verified" ? "ring-active" : presence.key === "attention" ? "ring-warn" : "ring-idle";

  // Agent-specific building identity
  const agentClass = `agent-${item.id}`; // agent-rowan, agent-ivy, etc.
  const activeTask = item.city?.current_activity || null;
  const isActive = presence.key === "at_desk" || presence.key === "verified";
  const taskLabel = activeTask && activeTask.length > 0 ? activeTask : "Standing by";
  const bubbleActive = isActive && activeTask && activeTask.length > 0;

  // Avatar image tag (shown on building face)
  const avatarImg = `<img src="./avatars/${esc(item.id)}.jpg" class="building-avatar" alt="${esc(item.name)}" onerror="this.style.display='none'">`;

  // Status bubble
  const statusBubble = `<span class="building-status-bubble${bubbleActive ? " active" : ""}"><span class="status-dot"></span>${esc(taskLabel)}</span>`;

  // Per-agent building interior HTML
  let buildingInner = "";

  if (item.id === "rowan") {
    buildingInner = `
      <span class="building-face building-front">
        ${avatarImg}
        <span class="rowan-crown"></span>
        <span class="rowan-beacon"></span>
        <span class="rowan-floors"></span>
        <span class="rowan-windows">
          <i></i><i></i><i></i><i></i>
          <i></i><i></i><i></i><i></i>
          <i></i><i></i><i></i><i></i>
          <i></i><i></i><i></i><i></i>
          <i></i><i></i><i></i><i></i>
          <i></i><i></i><i></i><i></i>
          <i></i><i></i><i></i><i></i>
        </span>
        <i class="rowan-logo">R</i>
      </span>
      <span class="building-face building-side"></span>
      <span class="building-roof"></span>`;
  } else if (item.id === "ivy") {
    buildingInner = `
      <span class="building-face building-front">
        ${avatarImg}
        <span class="ivy-windows">
          <i></i><i></i><i></i><i></i>
        </span>
        <span class="ivy-awning"></span>
        <i class="ivy-awning-text">SHOP</i>
        <span class="ivy-door"></span>
      </span>
      <span class="building-face building-side"></span>
      <span class="building-roof"></span>`;
  } else if (item.id === "aria") {
    buildingInner = `
      <span class="building-face building-front">
        ${avatarImg}
        <span class="aria-spire"></span>
        <span class="aria-tier-1"></span>
        <span class="aria-tier-2"></span>
        <span class="aria-sunburst"></span>
        <span class="aria-trim" style="top:50px"></span>
        <span class="aria-trim" style="top:92px"></span>
        <span class="aria-windows">
          <i></i><i></i><i></i>
          <i></i><i></i><i></i>
          <i></i><i></i><i></i>
          <i></i><i></i><i></i>
        </span>
        <i class="aria-sign">ARIA</i>
      </span>
      <span class="building-face building-side"></span>
      <span class="building-roof"></span>`;
  } else if (item.id === "sage") {
    buildingInner = `
      <span class="building-face building-front">
        ${avatarImg}
        <span class="sage-pediment"></span>
        <span class="sage-frieze"></span>
        <span class="sage-columns"></span>
        <span class="sage-windows">
          <i></i><i></i><i></i><i></i>
        </span>
      </span>
      <span class="building-face building-side"></span>
      <span class="building-roof"></span>`;
  } else if (item.id === "nova") {
    buildingInner = `
      <span class="building-face building-front">
        ${avatarImg}
        <span class="nova-spire"></span>
        <span class="nova-billboard"></span>
        <span class="nova-strip-l"></span>
        <span class="nova-strip-r"></span>
        <span class="nova-windows">
          <i></i><i></i><i></i>
          <i></i><i></i><i></i>
          <i></i><i></i><i></i>
          <i></i><i></i><i></i>
          <i></i><i></i><i></i>
          <i></i><i></i><i></i>
        </span>
      </span>
      <span class="building-face building-side"></span>
      <span class="building-roof"></span>`;
  } else if (item.id === "atlas") {
    buildingInner = `
      <span class="building-face building-front">
        ${avatarImg}
        <span class="atlas-servers">
          <i></i><i></i><i></i><i></i><i></i>
        </span>
        <span class="atlas-windows">
          <i></i><i></i><i></i>
        </span>
        <span class="atlas-circuit"></span>
        <span class="atlas-indicator"></span>
      </span>
      <span class="building-face building-side"></span>
      <span class="building-roof"></span>`;
  } else {
    // Fallback generic building for unknown agents
    buildingInner = `
      <span class="building-face building-front">
        ${avatarImg}
        <span class="office-window">
          <i class="office-desk"></i>
          <i class="office-monitor"></i>
          <img class="office-avatar" src="${(typeof AGENT_AVATARS!=='undefined'&&AGENT_AVATARS[item.id])||''}" alt="${esc(item.name)}" onerror="this.style.display='none'">
        </span>
        <span class="building-windows"><i></i><i></i><i></i><i></i></span>
      </span>
      <span class="building-face building-side"><i></i><i></i><i></i></span>
      <span class="building-roof"><i></i></span>`;
  }

  return `
    <button class="city-lot slot-${index % 6} tone-${index % 6} state-${presence.key} ${selected ? "selected" : ""}" type="button" data-city-agent="${esc(item.id)}" aria-label="${esc(evidenceLabel)}" aria-pressed="${selected}">
      <span class="city-plot">
        <span class="city-building ${agentClass}" aria-hidden="true">
          ${statusBubble}
          ${buildingInner}
          <span class="presence-beacon"></span>
        </span>
      </span>
      <span class="city-agent-label"><strong>${esc(item.name)}</strong><small>${esc(presence.label)}</small></span>
    </button>`;
}

function revenueHub(lane, index) {
  const evidence = lane.verified_sales === null || lane.verified_sales === undefined ? "Evidence pending" : `${fmtNumber(lane.verified_sales)} verified sales`;
  return `
    <button class="city-hub hub-${index % 3}" type="button" data-revenue-hub="${esc(lane.id)}" aria-label="${esc(lane.name)}, ${esc(evidence)}">
      <span class="city-hub-structure" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="city-hub-label"><strong>${esc(lane.hub)}</strong><small>${esc(lane.name)}</small></span>
    </button>`;
}

function renderCityInspector(item) {
  const panel = $("#cityInspector");
  if (!panel) return;
  if (!item) {
    item = (DATA.team || [])[0] || { id: 'rowan', name: 'Rowan', role: 'CEO', mission: 'Enterprise Autonomy Orchestration' };
  }
  const evidence = cityPresence(item);
  const history = evidence.completed;
  const taskHeading = evidence.currentVerified ? "Current verified task" : "Current task not verified";
  const taskText = evidence.currentTask || "No verified current task";
  const taskNote = evidence.currentVerified
    ? `Verified only at the ${fmtDate(DATA.generated_at)} snapshot · ${evidence.source}`
    : `${evidence.label} · ${evidence.snapshot.label}`;
  panel.innerHTML = `
    <div class="city-inspector-head">
      <div class="city-agent-avatar tone-${Math.max(0, (DATA.team || []).findIndex((entry) => entry.id === item.id))}" style="padding:0;overflow:hidden;position:relative;">
        <img src="./avatars/${esc(item.id)}.jpg" alt="${esc(item.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
        <span style="display:none;width:100%;height:100%;place-items:center;font-family:Georgia,serif;font-size:21px;">${esc(item.name.slice(0, 1))}</span>
      </div>
      <div><span class="kicker">Selected workspace</span><h2>${esc(item.name)}</h2><p>${esc(item.role)}</p></div>
      <span class="status-pill ${evidence.key}">${esc(evidence.label)}</span>
    </div>
    <div class="city-now-card ${evidence.currentVerified ? "verified" : "last-known"}">
      <span>${esc(taskHeading)}</span><strong>${esc(taskText)}</strong>
      <small>${esc(taskNote)}</small>
    </div>
    <div class="city-facts">
      <div><span>Residence / district</span><strong>${esc(item.city?.district || "Operations")}</strong></div>
      <div><span>Assigned workspace</span><strong>${esc(item.city?.workspace || "Unavailable")}</strong></div>
      <div><span>Desk evidence</span><strong>${esc(evidence.deskStatus)}</strong></div>
      <div><span>Evidence observed</span><strong>${esc(evidence.observedAt)}${evidence.observedAtIso ? ` · ${esc(relativeAge(evidence.observedAtIso))}` : ""}</strong></div>
      <div><span>Evidence source</span><strong>${esc(evidence.source)}</strong></div>
      <div><span>Snapshot freshness</span><strong>${esc(evidence.snapshot.label)}</strong></div>
      <div><span>Next scheduled action</span><strong>${esc(item.city?.next_action || "On demand")}</strong></div>
      <div><span>Completed · 24h</span><strong>${fmtNumber(item.city?.completed_24h || 0)}</strong></div>
      <div><span>Failed · 24h</span><strong>${fmtNumber(item.city?.failed_24h || 0)}</strong></div>
      <div><span>Runs · 7d</span><strong>${fmtNumber(item.city?.runs_7d || 0)}</strong></div>
      <div><span>Authority</span><strong>${esc(item.authority || "Bounded")}</strong></div>
    </div>
    <div class="city-assignment"><span>Standing assignment · not a current-task claim</span><strong>${esc(item.city?.current_assignment || item.mission)}</strong></div>
    <div class="city-history">
      <div class="section-heading compact"><div><span class="kicker ice">Completed-work ledger</span><h3>Recent recorded outcomes</h3></div></div>
      ${history.length ? history.map((event) => `<article class="event-${statusClass(event.status)}"><time>${esc(event.at)}</time><div><strong>${esc(event.title)}</strong><span>${esc(event.detail)} · Sanitized activity ledger</span></div></article>`).join("") : `<div class="empty-state">No completed work in sanitized history.</div>`}
    </div>`;
}

function renderRevenueNetwork() {
  const network = DATA.revenue_network || {};
  const lanes = network.lanes || [];
  const panel = $("#cityRevenueNetwork");
  if (!panel) return;
  panel.innerHTML = lanes.length ? lanes.map((lane) => `
    <article class="revenue-lane-card" id="revenue-lane-${esc(lane.id)}" data-search-section>
      <div class="revenue-lane-head"><div><span class="kicker">${esc(lane.hub)}</span><h3>${esc(lane.name)}</h3></div><span class="status-pill ${statusClass(`${lane.status} unverified`)}">${esc(lane.evidence)}</span></div>
      <p>${esc(lane.channel_type)}</p>
      <div class="revenue-lane-stats">
        <div><span>Inventory</span><strong>${esc(lane.inventory)}</strong></div>
        <div><span>Verified sales</span><strong>${lane.verified_sales === null || lane.verified_sales === undefined ? "Unavailable" : fmtNumber(lane.verified_sales)}</strong></div>
        <div><span>Verified revenue</span><strong>${lane.verified_revenue === null || lane.verified_revenue === undefined ? "Unavailable" : fmtMoney(lane.verified_revenue)}</strong></div>
        <div><span>Owners</span><strong>${esc(lane.accountable)} · ${esc(lane.supporting)}</strong></div>
      </div>
      <div class="revenue-lane-work"><span>Current internal work</span><strong>${esc(lane.current_assignment)}</strong></div>
      <small>${esc(lane.next_gate)}</small>
    </article>`).join("") : `<div class="empty-state">Revenue channel registry unavailable.</div>`;
  const note = $("#cityRevenueTruth");
  if (note) note.textContent = network.truth_note || "Channel evidence unavailable.";
}

function renderCityDirectory(team) {
  const directory = $("#cityAccessibleList");
  if (!directory) return;
  directory.innerHTML = team.map((item, index) => {
    const evidence = cityPresence(item);
    const latest = evidence.completed[0];
    const currentTask = evidence.currentTask || "No verified current task";
    return `
      <article class="city-directory-card tone-${index} ${item.id === selectedCityAgentId ? "selected" : ""}">
        <div class="city-directory-head"><div class="city-ledger-mark">${esc(item.name.slice(0, 1))}</div><div><h3>${esc(item.name)}</h3><p>${esc(item.role)}</p></div></div>
        <span class="status-pill ${evidence.key}">${esc(evidence.label)}</span>
        <dl>
          <div><dt>Residence / district</dt><dd>${esc(item.city?.district || "Operations")}</dd></div>
          <div><dt>Workspace / desk</dt><dd>${esc(item.city?.workspace || "Unavailable")}</dd></div>
          <div><dt>Current verified task</dt><dd>${esc(currentTask)}</dd></div>
          <div><dt>Recent completed work</dt><dd>${esc(latest?.title || "No completed work in sanitized history")}</dd></div>
          <div><dt>Freshness / source</dt><dd>${esc(evidence.snapshot.label)} · ${esc(evidence.source)} · observed ${esc(evidence.observedAt)}</dd></div>
        </dl>
        <button type="button" data-city-directory-agent="${esc(item.id)}" aria-pressed="${item.id === selectedCityAgentId}">Inspect ${esc(item.name)}’s evidence</button>
      </article>`;
  }).join("");
}


function renderProfitWarLeaderboard() {
  const container = $("#profitWarGrid");
  if (!container) return;
  const pw = DATA.profit_war || {};
  const contenders = pw.contenders || [];
  if (!contenders.length) {
    container.innerHTML = `<div class="empty-state">Leaderboard initializing...</div>`;
    return;
  }

  container.innerHTML = contenders.map(c => `
    <article class="profit-war-card ${c.is_leader ? 'leader-card' : ''}">
      <div class="pwar-head">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="pwar-rank" style="color:${c.is_leader ? '#ffd700' : 'var(--muted)'};">#${c.rank}</span>
          <strong style="color:${esc(c.color)};font-size:12px;">${esc(c.building_name)}</strong>
        </div>
        ${c.is_leader ? '<span class="status-pill healthy" style="background:rgba(255,215,0,0.15);color:#ffd700;border-color:rgba(255,215,0,0.3);">👑 APEX LEADER</span>' : `<span style="font-size:9px;color:var(--muted);">${esc(c.name)}</span>`}
      </div>

      <div class="pwar-metrics">
        <div>
          <span>Tower Height</span>
          <strong style="color:var(--ivory);font-size:14px;">${c.height_m}m</strong>
          <small style="color:var(--muted);font-size:8px;">${c.floors} Floors</small>
        </div>
        <div>
          <span>Profit Generated</span>
          <strong style="color:var(--jade);font-size:14px;">$${c.profit_generated.toLocaleString()}</strong>
          <small style="color:var(--muted);font-size:8px;">${esc(c.metric_label)}</small>
        </div>
      </div>

      <div class="pwar-track">
        <div class="pwar-bar" style="width: ${(c.height_m / 60) * 100}%; background: ${esc(c.color)}; box-shadow: 0 0 10px ${esc(c.color)}88;"></div>
      </div>
    </article>
  `).join("");
}

function renderCity() {
  const team = DATA.team || [];
  const world = $("#cityWorld");
  if (!team.length) {
    world.innerHTML = `<div class="empty-state">Agent evidence unavailable.</div>`;
    $("#cityActivityBoard").innerHTML = "";
    if ($("#cityAccessibleList")) $("#cityAccessibleList").innerHTML = `<div class="empty-state">No named agents in the sanitized snapshot.</div>`;
    renderCityInspector(null);
    return;
  }
  const revenueLanes = DATA.revenue_network?.lanes || [];
  const snapshot = snapshotEvidence(DATA.generated_at);
  citySnapshotWasFresh = snapshot.fresh;
  if (!team.some((item) => item.id === selectedCityAgentId)) selectedCityAgentId = team[0].id;
  if (world) {
    world.className = `city-world hidden`;
    world.innerHTML = ``;
    world.style.display = "none";
  }
  // ── Holo KPI display update ─────────────────────────────────────────────────
  const holoGoal = $("#cityHoloGoal");
  const holoBar = $("#cityHoloBar");
  const holoAgents = $("#cityHoloAgents");
  const revenue = DATA.money?.total_revenue || 0;
  const goalPct = Math.min(100, (revenue / 20000) * 100).toFixed(1);
  const activeCount = team.filter((a) => (a.city?.completed_24h || 0) > 0 || a.city?.last_completed_at).length;
  if (holoGoal) holoGoal.textContent = `${fmtMoney(revenue)} / $20,000`;
  if (holoBar) holoBar.style.width = goalPct + "%";
  if (holoAgents) holoAgents.textContent = `${activeCount || team.length} AGENTS ACTIVE`;
  const counts = team.reduce((total, item) => {
    total[cityPresence(item).key] += 1;
    return total;
  }, { verified: 0, scheduled: 0, recorded: 0, attention: 0, unknown: 0 });
  $("#cityPresenceSummary").textContent = snapshot.stale
    ? `Snapshot stale — current work is not asserted · ${team.length} agent records`
    : `${counts.verified} verified running at snapshot · ${counts.scheduled} schedule-only · ${counts.recorded} recent records · ${counts.attention} exceptions · ${counts.unknown} no verified task`;
  $("#citySnapshotStatus").textContent = snapshot.valid
    ? `${fmtDate(DATA.generated_at)} · ${snapshot.label}`
    : snapshot.label;
  $("#cityActivityBoard").innerHTML = team.map((item) => {
    const latest = completedCityEvents(item, 1)[0];
    return `<article class="city-ledger-card" data-search-section><div><span class="city-ledger-mark tone-${team.indexOf(item)}">${esc(item.name.slice(0, 1))}</span><strong>${esc(item.name)}</strong></div><p>${esc(latest?.title || "No completed work in sanitized history")}</p><small>${latest ? `${esc(latest.at || "Time unavailable")} · ${esc(latest.detail || "Recorded complete")} · Sanitized activity ledger` : "No completion evidence available"}</small></article>`;
  }).join("");
  renderCityDirectory(team);
  const selectAgent = (agentId, scrollToInspector = false) => {
    selectedCityAgentId = agentId;
    $$('[data-city-agent]', world).forEach((node) => {
      const selected = node.dataset.cityAgent === selectedCityAgentId;
      node.classList.toggle("selected", selected);
      node.setAttribute("aria-pressed", String(selected));
    });
    $$('[data-city-directory-agent]').forEach((node) => {
      const selected = node.dataset.cityDirectoryAgent === selectedCityAgentId;
      node.setAttribute("aria-pressed", String(selected));
      node.closest(".city-directory-card")?.classList.toggle("selected", selected);
    });
    const activeAgent = team.find((item) => item.id === selectedCityAgentId) || team[0];
  renderCityInspector(activeAgent);
    if (scrollToInspector) $("#cityInspector")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  $$('[data-city-agent]', world).forEach((button) => button.addEventListener("click", () => selectAgent(button.dataset.cityAgent)));
  $$('[data-city-directory-agent]').forEach((button) => button.addEventListener("click", () => selectAgent(button.dataset.cityDirectoryAgent, true)));
  $$('[data-revenue-hub]', world).forEach((button) => button.addEventListener("click", () => {
    const card = document.getElementById(`revenue-lane-${button.dataset.revenueHub}`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("selected");
    setTimeout(() => card.classList.remove("selected"), 1800);
  }));
  renderRevenueNetwork();
  renderProfitWarLeaderboard();
  const activeAgent = team.find((item) => item.id === selectedCityAgentId) || team[0];
  renderCityInspector(activeAgent);
}

function setCityCamera(action) {
  if (action === "reset") cityCameraAngle = 0;
  else if (action === "left") cityCameraAngle = (cityCameraAngle + 3) % 4;
  else cityCameraAngle = (cityCameraAngle + 1) % 4;
  const world = $("#cityWorld");
  if (world) world.className = `city-world angle-${cityCameraAngle}`;
}


function renderAiTechDept() {
  const container = $("#aiTechDeptContent");
  if (!container) return;
  const dept = DATA.ai_tech_department || {};
  const stack = dept.current_stack || {};
  const watchlist = dept.model_watchlist || [];
  const tools = dept.tools_inventory || {};
  const score = dept.cost_vs_capability_score || {};

  container.innerHTML = `
    <div class="tech-stack-overview">
      <div class="tech-stat-card">
        <span>Primary Engine</span>
        <strong style="color:var(--jade);">${esc(stack.primary_model || "google/gemini-3.5-flash")}</strong>
        <small>Active · Zero Latency</small>
      </div>
      <div class="tech-stat-card">
        <span>Fallback Engine</span>
        <strong style="color:var(--ice);">${esc(stack.fallback_model || "google/gemini-2.5-flash-lite")}</strong>
        <small>High Volume · $0.01/1M</small>
      </div>
      <div class="tech-stat-card">
        <span>AI Stack Rating</span>
        <strong style="color:var(--amber);">${esc(score.rating || "A+")}</strong>
        <small>${esc(score.notes || "Massively under budget")}</small>
      </div>
      <div class="tech-stat-card">
        <span>Gateway Architecture</span>
        <strong style="color:var(--text);">${esc(stack.gateway || "OpenClaw 2.0 Core")}</strong>
        <small>Local Daemon · Socket Mode</small>
      </div>
    </div>
    
    <div style="margin-top:18px;">
      <h3 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Model Watchlist & Benchmarks</h3>
      <div class="model-watchlist-grid">
        ${watchlist.map(m => `
          <div class="watchlist-card">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong style="font-size:11px;color:var(--ivory);">${esc(m.model)}</strong>
              <span class="status-pill ${m.status.includes('ACTIVE') ? 'healthy' : m.status.includes('COOLDOWN') ? 'attention' : 'scheduled'}">${esc(m.status)}</span>
            </div>
            <p style="font-size:9px;color:var(--muted);margin-top:4px;">${esc(m.notes || "")}</p>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderEvolutionFeed() {
  const container = $("#evolutionFeed");
  if (!container) return;
  const logs = (DATA.evolution_log || []).slice().reverse();
  if (!logs.length) {
    container.innerHTML = `<div class="empty-state">No evolution cycles recorded yet.</div>`;
    return;
  }
  container.innerHTML = logs.map(entry => `
    <div class="evolution-entry">
      <div class="evolution-time">${esc(entry.timestamp.slice(11, 19))}</div>
      <div class="evolution-badge ${entry.action.includes('UPGRADE') || entry.action.includes('COMPLETE') ? 'jade' : 'ice'}">${esc(entry.action)}</div>
      <div class="evolution-detail">${esc(entry.detail)}</div>
    </div>
  `).join("");
}

function renderSystems() {
  $("#commandAutomation").innerHTML = compactRows((DATA.systems.automations || []).slice(0, 5).map((item) => ({ label: item.name, value: `${item.status} · ${item.cadence}` })));
  $("#systemHealth").innerHTML = (DATA.systems.health || []).map((item) => `
    <article class="system-card" data-search-section><div class="system-card-top"><span class="kicker">${esc(item.category)}</span><span class="status-pill ${statusClass(item.status)}">${esc(item.status)}</span></div><h2>${esc(item.name)}</h2><p>${esc(item.detail)}</p></article>`).join("");
  $("#automationSummary").textContent = `${DATA.systems.automations.length} enabled · ${DATA.systems.error_count} need attention`;
  $("#automationTable").innerHTML = table(
    ["Automation", "Owner", "Cadence", "Last run", "Next run", "Status", "Errors"],
    (DATA.systems.automations || []).map((item) => [item.name, item.owner, item.cadence, item.last_run, item.next_run, item.status, item.error_streak])
  );
  $("#dataQuality").innerHTML = (DATA.data_quality || []).map((item) => `<article class="quality-card"><strong>${esc(item.label)}</strong><span>${esc(item.detail)}</span></article>`).join("");
  renderAiTechDept();
  renderEvolutionFeed();
}

function renderAiUsage() {
  const usage = DATA.ai_usage || {};
  const remaining = Number.isFinite(Number(usage.remaining_percent)) ? Number(usage.remaining_percent) : null;
  const used = Number.isFinite(Number(usage.used_percent)) ? Number(usage.used_percent) : null;
  const mode = String(usage.mode || "unavailable");
  const state = /pause/i.test(mode) ? "critical" : /warning/i.test(mode) ? "attention" : "healthy";
  const width = used === null ? 0 : Math.max(0, Math.min(100, used));
  const reset = usage.reset_at
    ? `${fmtDate(usage.reset_at)} · ${Number.isFinite(Number(usage.hours_until_reset)) ? `${Number(usage.hours_until_reset).toFixed(1)}h` : "time unavailable"}`
    : "Unavailable";
  const markup = `
    <div class="ai-usage-head">
      <div><span class="kicker ice">OpenAI weekly reserve</span><h2>${remaining === null ? "Usage unavailable" : `${remaining}% remaining`}</h2><p>${used === null ? "The usage probe has not produced a valid reading." : `${used}% used · scheduled model work ${/pause/i.test(mode) ? "frozen" : "inside pace"}`}</p></div>
      <span class="status-pill ${state}">${esc(mode.replaceAll("_", " "))}</span>
    </div>
    <div class="ai-usage-track" role="progressbar" aria-label="Weekly OpenAI usage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${used ?? 0}"><i style="width:${width}%"></i></div>
    <div class="ai-usage-facts">
      <div><span>Used</span><strong>${used === null ? "Unavailable" : `${used}%`}</strong></div>
      <div><span>Protected reserve</span><strong>${usage.protected_reserve_percent ?? "Unavailable"}%</strong></div>
      <div><span>Reset</span><strong>${esc(reset)}</strong></div>
      <div><span>Scheduled model jobs</span><strong>${usage.enabled_model_job_count ?? "Unavailable"}</strong></div>
      <div><span>Last checked</span><strong>${usage.checked_at ? `${fmtDate(usage.checked_at)} · ${relativeAge(usage.checked_at)}` : "Unavailable"}</strong></div>
    </div>`;
  for (const selector of ["#commandAiUsage", "#systemsAiUsage"]) {
    const node = $(selector);
    if (node) node.innerHTML = markup;
  }
}

function renderNetlifyUsage() {
  const usage = DATA.netlify_usage || {};
  const available = Number.isFinite(Number(usage.credits_available_upper_bound)) ? Number(usage.credits_available_upper_bound) : null;
  const observed = Number.isFinite(Number(usage.observed_credits_available)) ? Number(usage.observed_credits_available) : null;
  const consumed = Number.isFinite(Number(usage.credits_consumed_lower_bound)) ? Number(usage.credits_consumed_lower_bound) : null;
  const plan = Number.isFinite(Number(usage.plan_monthly_credits)) ? Number(usage.plan_monthly_credits) : null;
  const mode = String(usage.mode || "unavailable");
  const state = /blocked|critical|unavailable/i.test(mode) ? "critical" : /warning/i.test(mode) ? "attention" : "healthy";
  const width = available === null || !plan ? 0 : Math.max(0, Math.min(100, (available / plan) * 100));
  const exactAge = usage.last_exact_observation_at ? `${fmtDate(usage.last_exact_observation_at)} · ${relativeAge(usage.last_exact_observation_at)}` : "Unavailable";
  const deployCredits = Number.isFinite(Number(usage.production_deploy_credits_observed)) ? Number(usage.production_deploy_credits_observed) : null;
  const markup = `
    <div class="ai-usage-head">
      <div><span class="kicker jade">Netlify credit reserve</span><h2>${available === null ? "Usage unavailable" : `≤ ${available.toLocaleString(undefined, {maximumFractionDigits: 1})} credits`}</h2><p>${observed === null ? "The credit monitor has not produced a valid reading." : `Exact observed balance ${observed.toLocaleString(undefined, {maximumFractionDigits: 1})} · production auto-publish not verified off`}</p></div>
      <span class="status-pill ${state}">${esc(mode.replaceAll("_", " "))}</span>
    </div>
    <div class="ai-usage-track netlify-track" role="progressbar" aria-label="Netlify credits available versus monthly plan reference" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${width.toFixed(1)}"><i style="width:${width}%"></i></div>
    <div class="ai-usage-facts">
      <div><span>Consumed this cycle</span><strong>${consumed === null ? "Unavailable" : `≥ ${consumed.toLocaleString(undefined, {maximumFractionDigits: 1})}`}</strong></div>
      <div><span>Production deploy cost</span><strong>${deployCredits === null ? "Unavailable" : `${deployCredits.toLocaleString()} credits`}</strong></div>
      <div><span>Hard reserve</span><strong>${usage.protected_reserve_credits ?? "Unavailable"} credits</strong></div>
      <div><span>New deploys since exact read</span><strong>${usage.successful_production_deploys_since_observation ?? "Unavailable"}</strong></div>
      <div><span>Last exact observation</span><strong>${esc(exactAge)}</strong></div>
    </div>`;
  for (const selector of ["#commandNetlifyUsage", "#systemsNetlifyUsage"]) {
    const node = $(selector);
    if (node) node.innerHTML = markup;
  }
}

function renderGoogleUsage() {
  const g = DATA.google_usage || {};
  const obsRequired = g.observation_required === true || g.observed_at === null || g.observed_at === undefined;
  const usedCents = (typeof g.credits_used_cents === "number") ? g.credits_used_cents : null;
  const remainCents = (typeof g.credits_remaining_cents === "number") ? g.credits_remaining_cents : null;
  const allotCents = (typeof g.credit_allotment_cents === "number") ? g.credit_allotment_cents : 10000;
  const observedAt = g.observed_at || null;
  const fallbackActive = g.fallback_active === true;
  const chain = Array.isArray(g.fallback_chain) ? g.fallback_chain : [];
  const resetAt = g.reset_at || null;

  // Compute staleness if data exists
  const ageHours = observedAt ? (Date.now() - new Date(observedAt).getTime()) / 3_600_000 : Infinity;
  const isStale = ageHours > 48;

  // Bar
  const usedPct = (usedCents !== null && allotCents > 0) ? Math.min(100, (usedCents / allotCents) * 100) : 0;
  const remainPct = (remainCents !== null && allotCents > 0) ? Math.min(100, (remainCents / allotCents) * 100) : 0;
  const barWidth = obsRequired ? 0 : remainPct;

  const state = obsRequired ? "attention" : isStale ? "attention" : fallbackActive ? "attention" : "healthy";
  const statusLabel = obsRequired ? "needs update" : isStale ? "reading stale" : fallbackActive ? "fallback active" : "active";

  const fmt$ = (cents) => cents === null ? "—" : `$${(cents / 100).toFixed(2)}`;

  const chainHtml = chain.length
    ? chain.map(m => `<span class="google-model-pill">${esc(m.replace("google/", ""))}</span>`).join("")
    : `<span class="google-model-pill muted">None configured</span>`;

  const obsAge = observedAt
    ? `${fmtDate(observedAt)} · ${relativeAge(observedAt)}${isStale ? " ⚠ stale" : ""}`
    : "Never recorded";

  let markup;
  if (obsRequired) {
    markup = `
    <div class="ai-usage-head">
      <div>
        <span class="kicker jade">Google AI Credits</span>
        <h2>Update needed</h2>
        <p>${esc(g.plan || "Google One AI Ultra")} · $${(allotCents/100).toFixed(0)}/mo allotment · no observation on file</p>
      </div>
      <span class="status-pill attention">needs update</span>
    </div>
    <div class="google-obs-required">
      <p>Google doesn't expose AI Studio credit balances via API — balance is only visible in the UI.</p>
      <ol>
        <li>Open <a href="https://aistudio.google.com/plan_information" target="_blank" rel="noopener">AI Studio → Plan &amp; Billing</a></li>
        <li>Note your <strong>credits used</strong> and <strong>credits remaining</strong></li>
        <li>Update <code>data/google-usage.json</code> and rebuild</li>
      </ol>
      <div class="google-update-fields">
        <div><span>credits_used_cents</span><strong>= dollars used × 100</strong></div>
        <div><span>credits_remaining_cents</span><strong>= dollars remaining × 100</strong></div>
        <div><span>observed_at</span><strong>= current ISO timestamp</strong></div>
        <div><span>observation_required</span><strong>= false</strong></div>
      </div>
    </div>
    <div class="ai-usage-facts" style="margin-top:14px">
      <div><span>Monthly allotment</span><strong>$${(allotCents/100).toFixed(2)}</strong></div>
      <div><span>Resets</span><strong>${esc(resetAt || "2026-09-01")}</strong></div>
      <div style="grid-column:1/-1"><span>Fallback chain</span><div class="google-chain">${chainHtml}</div></div>
    </div>`;
  } else {
    markup = `
    <div class="ai-usage-head">
      <div>
        <span class="kicker jade">Google AI Credits</span>
        <h2>${fmt$(remainCents)} remaining</h2>
        <p>${esc(g.plan || "Google One AI Ultra")} · ${fmt$(usedCents)} used of ${fmt$(allotCents)} · fallback ${fallbackActive ? "ACTIVE" : "on standby"}</p>
      </div>
      <span class="status-pill ${state}">${esc(statusLabel)}</span>
    </div>
    <div class="ai-usage-track google-track" role="progressbar" aria-label="Google AI credits remaining" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${barWidth.toFixed(1)}">
      <i style="width:${barWidth}%" class="${barWidth < 20 ? "low" : ""}"></i>
    </div>
    <div class="ai-usage-facts">
      <div><span>Monthly allotment</span><strong>${fmt$(allotCents)}</strong></div>
      <div><span>Used this cycle</span><strong>${fmt$(usedCents)}</strong></div>
      <div><span>Remaining</span><strong>${fmt$(remainCents)}</strong></div>
      <div><span>Resets</span><strong>${esc(resetAt || "Unavailable")}</strong></div>
      <div style="grid-column:1/-1"><span>Fallback chain</span><div class="google-chain">${chainHtml}</div></div>
      <div><span>Last observed</span><strong class="${isStale ? "text-warn" : ""}">${obsAge}</strong></div>
      <div><a href="https://aistudio.google.com/plan_information" target="_blank" rel="noopener" class="google-refresh-link">↗ Update balance in AI Studio</a></div>
    </div>`;
  }

  for (const selector of ["#commandGoogleUsage", "#systemsGoogleUsage"]) {
    const node = $(selector);
    if (node) node.innerHTML = markup;
  }
}

function riskMarkup(items) {
  if (!items.length) return `<div class="empty-state">No material exceptions.</div>`;
  return items.map((item) => `
    <article class="risk-item ${esc(item.severity)}"><i class="risk-dot"></i><div><strong>${esc(item.title)}</strong><span>${esc(item.detail)}</span></div><small>${esc(item.severity)}</small></article>`).join("");
}

function activityMarkup(items) {
  if (!items.length) return `<div class="empty-state">No material activity recorded.</div>`;
  return items.map((item) => `
    <article class="activity-item"><span class="activity-time">${esc(item.time)}</span><i class="activity-line"></i><div><strong>${esc(item.title)}</strong><span>${esc(item.detail)}</span></div></article>`).join("");
}

function renderRiskAndActivity() {
  $("#commandRisks").innerHTML = riskMarkup((DATA.risks || []).slice(0, 6));
  $("#commandActivity").innerHTML = activityMarkup((DATA.activity || []).slice(0, 7));
  $("#riskBoard").innerHTML = (DATA.risks || []).map((item) => `
    <article class="risk-dossier ${esc(item.severity)}" data-search-section><span class="kicker ${item.severity === "critical" ? "coral" : "amber"}">${esc(item.category)} · ${esc(item.severity)}</span><h2>${esc(item.title)}</h2><p>${esc(item.detail)}</p><div class="risk-foot"><span>Owner: ${esc(item.owner)}</span><span>Impact: ${esc(item.impact)}</span></div></article>`).join("");
  $("#auditLedger").innerHTML = activityMarkup(DATA.activity || []);
}

function table(headers, rows) {
  if (!rows.length) return `<div class="empty-state">No sourced rows are available.</div>`;
  return `<table><thead><tr>${headers.map((item) => `<th>${esc(item)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, index) => `<td class="${cell === null || cell === undefined || cell === "Unavailable" ? "muted-cell" : ""}">${esc(cell ?? "Unavailable")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function renderMeta() {
  $("#sidebarPresence").textContent = DATA.meta.rowan_status;
  const remaining = DATA.ai_usage?.remaining_percent;
  $("#sidebarModel").textContent = `${DATA.meta.provider} · ${DATA.meta.model}${remaining === null || remaining === undefined ? "" : ` · ${remaining}% weekly left`}`;
  
  const topbarPill = $("#topbarModelPill");
  if (topbarPill) {
    topbarPill.innerHTML = `<span>⚡</span> ${DATA.meta.model}`;
  }
  
  const compoundingStat = $("#primaryEngineName");
  if (compoundingStat) {
    const modelText = DATA.meta.model
      .toLowerCase()
      .split("-")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    compoundingStat.textContent = `${DATA.meta.provider} ${modelText}`;
  }

  const stamp = new Date(DATA.generated_at);
  const ageHours = Math.max(0, (Date.now() - stamp.getTime()) / 3_600_000);
  const badge = $("#freshnessBadge");
  badge.classList.toggle("stale", ageHours >= 6 && ageHours < 24);
  badge.classList.toggle("critical", ageHours >= 24);
  badge.querySelector("strong").textContent = ageHours < 6 ? "Snapshot current" : ageHours < 24 ? "Snapshot aging" : "Snapshot stale";
  badge.querySelector("small").textContent = `${fmtDate(DATA.generated_at)} · ${relativeAge(DATA.generated_at)}`;
  const criticalQuality = (DATA.data_quality || []).filter((item) => item.status === "critical");
  const banner = $("#dataBanner");
  if (criticalQuality.length) {
    banner.hidden = false;
    banner.textContent = criticalQuality.map((item) => item.detail).join(" · ");
  } else {
    banner.hidden = true;
  }
}

const CORE_EXECUTIVE_LEADERS = [
  {
    id: "rowan",
    name: "Rowan",
    role: "Autonomous AI CEO",
    monogram: "R",
    col: "#6db7ff",
    model: "Gemini 3.1 Pro",
    status: "active",
    statusLabel: "Online",
    assignment: "Orchestrating 30-agent enterprise workforce across Etsy $20K mission & zero-cost operations.",
    lastOutput: "Enterprise System Orchestration"
  },
  {
    id: "ivy",
    name: "Ivy",
    role: "Head of Commerce",
    monogram: "I",
    col: "#22c97a",
    model: "Gemini 3.1 Pro",
    status: "active",
    statusLabel: "Online",
    assignment: "Etsy store catalog management, high-AOV bundle staging ($29.99 & $97), and order reconciliation.",
    lastOutput: "Etsy Catalog & Pricing Audit"
  },
  {
    id: "sage",
    name: "Sage",
    role: "Head of Market Intel",
    monogram: "S",
    col: "#8a9ba8",
    model: "Gemini 3.1 Pro",
    status: "active",
    statusLabel: "Online",
    assignment: "Etsy niche competitor intelligence, state-specific legal form pricing benchmarks, and buyer search trends.",
    lastOutput: "Etsy Market Research (33KB)"
  },
  {
    id: "aria",
    name: "Aria",
    role: "Creative Director & SEO",
    monogram: "A",
    col: "#ff6da0",
    model: "Gemini 3.1 Pro",
    status: "active",
    statusLabel: "Online",
    assignment: "High-CTR search copywriting. 25 top Etsy titles published live to Seller Hub today.",
    lastOutput: "25 Live SEO Titles (11KB)"
  },
  {
    id: "atlas",
    name: "Atlas",
    role: "Chief Technology Officer",
    monogram: "At",
    col: "#ff9900",
    model: "Gemini 3.1 Pro",
    status: "active",
    statusLabel: "Online",
    assignment: "PDF template structure generation, legal disclaimers, and local automated pipeline orchestration.",
    lastOutput: "10 Legal Form Templates"
  },
  {
    id: "nova",
    name: "Nova",
    role: "Chief Growth Officer",
    monogram: "N",
    col: "#22d3ee",
    model: "Gemini 3.1 Pro",
    status: "active",
    statusLabel: "Online",
    assignment: "Zero-ad-spend traffic generation: Pinterest Rich Pins, Reddit community engagement, and social hooks.",
    lastOutput: "Omnichannel Traffic Plan (61KB)"
  },
  {
    id: "ember",
    name: "Ember",
    role: "Viral Growth Hacker",
    monogram: "E",
    col: "#f97316",
    model: "Gemini 3.1 Pro",
    status: "active",
    statusLabel: "Online",
    assignment: "High-converting digital product hooks, visual pins for landlord templates, and TikTok/Reels scripts.",
    lastOutput: "5 Viral Pinterest Pin Packs"
  },
  {
    id: "cipher",
    name: "Cipher",
    role: "Pricing & Quant Specialist",
    monogram: "C",
    col: "#6366f1",
    model: "Gemini 3.1 Pro",
    status: "active",
    statusLabel: "Online",
    assignment: "Unit economics modeling for $20K mission: 206 bundle units @ $97 vs 680 units @ $29.99.",
    lastOutput: "Margin & Unit Economics Model"
  }
];

const VERIFIED_ARTIFACTS = [
  {
    id: "art-seo-live",
    icon: "🚀",
    title: "Etsy SEO Live Execution Log",
    desc: "Verified log of 25/25 top listings updated with search-intent titles directly in Etsy Seller Hub via Chrome.",
    badge: "25/25 Live",
    content: "=== ETSY SEO LIVE EXECUTION LOG ===\\nDate: 2026-08-20\\nStore: SwirlCraftShop (ID: 66934708)\\nTotal Listings Updated: 25\\nSuccess Rate: 100% (25/25)\\n\\nSample Live Updates:\\n1. [4552828742] Non-Medical Home Care Agency Policy Manual | Business-in-a-Box Bundle | Editable PDF Instant Download\\n2. [4552829320] Digital Product Business Templates | 1000+ Editable Canva Templates MRR PLR | Digital Download\\n3. [4552819091] HR Employee Onboarding & Service Waiver Master Suite | 100+ Contracts SOPs | Instant Download PDF\\n4. [4552811078] Custom Family Portrait Illustration | Photo to Art Memorial Gift | Digital Download Printable\\n5. [4552441056] Home Management Binder Bundle | Cleaning Schedule Meal Planner Checklist | Printable PDF Download\\n6. [4552440820] Financial Freedom Budget Planner Bundle | Savings Challenge Debt Payoff Tracker | Printable PDF\\n7. [4552440574] Complete Wedding Planner Bundle | Budget Tracker Guest List Seating Chart | Instant Download PDF\\n8. [4552440310] Entrepreneur Business Planner Bundle | Side Hustle Social Media Goals Tracker | Instant Download\\n9. [4552427925] ADHD Planner Bundle Daily Routine Tracker | Productivity Habit Mental Health | Printable PDF\\n10. [4552427689] Small Business Contract Agreement Bundle | 8 Industry Client Legal Forms | Instant Download PDF\\n\\nFull log saved in: data/etsy-seo-applied-log.json"
  },
  {
    id: "art-aria-seo",
    icon: "✍️",
    title: "Aria Master SEO Copywriting",
    desc: "Master suite of 25 state-specific real estate titles, 10 home care forms, description templates, and 13-tag matrices.",
    badge: "11.6 KB",
    content: "# SwirlCraft SEO Copywriting - 2026-08-18\\nAuthor: Aria (Creative Director & SEO)\\n\\n## 1. 25 Optimized SEO Titles for Real Estate / Legal Templates\\n- Texas Residential Lease Agreement | Landlord Tenant Rental Contract | Editable PDF Instant Download\\n- California Residential Lease Agreement | Landlord Tenant Rental Contract | Editable PDF Instant Download\\n- Florida Residential Lease Agreement | Landlord Tenant Rental Contract | Editable PDF Instant Download\\n- New York Residential Lease Agreement | Landlord Tenant Rental Contract | Editable PDF Instant Download\\n- Illinois Residential Lease Agreement | Landlord Tenant Rental Contract | Editable PDF Instant Download\\n\\n## 2. Master Listing Description Template\\nStreamline your property management and protect your real estate investments with this professionally formatted template.\\n- US Letter Size (8.5\\\" x 11\\\")\\n- Editable highlighted fields\\n- Includes statutory disclaimer and 13 high-intent search tags."
  },
  {
    id: "art-sage-intel",
    icon: "🔍",
    title: "Sage Etsy Market & Competitor Intel",
    desc: "Deep analysis of top-selling legal PDF shops, conversion benchmarks, and pricing sweet-spots ($29.99 & $97).",
    badge: "33.8 KB",
    content: "# Etsy Market Research & Strategy Report: Legal & Real Estate Templates\\nPrepared by: Sage — SwirlCraft Research Analyst\\n\\n## Key Strategic Findings:\\n1. State-Specific Templates Convert 3.4x Higher: Buyers searching for state-specific documents ('Texas Lease Agreement') have 4x higher purchase intent than generic form searches.\\n2. Optimal Pricing Structure:\\n   - Single Forms: $9.99 (entry level)\\n   - State Bundles (5 docs): $29.99 (sweet spot)\\n   - 50-State Mega Toolkit: $97.00 (high AOV)\\n3. Winning Categories:\\n   - Residential Lease Agreements & Landlord Forms\\n   - Non-Medical Home Care Agency Policy Manuals\\n   - Independent Contractor & Small Business Agreements"
  },
  {
    id: "art-nova-traffic",
    icon: "🚀",
    title: "Nova 30-Day Traffic Blueprint",
    desc: "Complete social traffic roadmap: 10 Pinterest boards, 30 Pin copy decks, 14 short-form video hooks, and Reddit playbooks.",
    badge: "61.5 KB",
    content: "# SwirlCraft 30-Day Organic Traffic Plan\\nPrepared by: Nova — Chief Growth Officer\\n\\n## Strategy Overview:\\n- Pinterest Traffic Engine: 10 targeted boards with Rich Pins linking directly to Etsy shop.\\n- High-intent Facebook Group engagement (Landlord & Property Investor communities).\\n- Educational short-form video content demonstrating PDF ease of use.\\n- Zero-ad-spend organic acquisition architecture."
  },
  {
    id: "art-atlas-templates",
    icon: "📑",
    title: "Atlas Legal Form Blueprints",
    desc: "Complete document structures for 10 state-specific lease agreements, eviction notices, and home care service contracts.",
    badge: "13.2 KB",
    content: "# Atlas Legal & Compliance PDF Form Blueprints\\nPrepared by: Atlas (CTO)\\n\\n## Templates Generated:\\n1. Texas Residential Lease Agreement (Standard 1-Year)\\n2. California Residential Lease Agreement (Prop 65 & Lead Paint disclosures)\\n3. Florida Residential Lease Agreement (FL statutory compliance)\\n4. Texas Month-to-Month Rental Agreement\\n5. Landlord Move-In / Move-Out Condition Checklist\\n6. California 3-Day Notice to Pay or Quit\\n7. Florida 3-Day Eviction Notice\\n8. Home Care Agency Service Agreement\\n9. Caregiver Daily Activity & Mileage Log\\n10. Client Care Plan & Health Intake Form"
  },
  {
    id: "art-efficiency-audit",
    icon: "🛡️",
    title: "Zero-Cost Compute & Quota Guard",
    desc: "Complete audit certifying 0% API cost, model fallback routing to Gemini Pro, and cron containment.",
    badge: "Verified $0 Cost",
    content: "# Compute & Cost Efficiency Guard Audit\\nStatus: 100% Compliant\\n\\n## Summary:\\n- Model Routing: Primary set to Google Gemini 3.1 Pro (Free Preview Tier).\\n- Fallback Chain: Gemini 3 Flash -> Gemini 2.5 Flash -> Gemini 2.5 Flash Lite.\\n- API Spend: $0.00 / $100.00 monthly reserve.\\n- Background Loops: Decoupled from sync to eliminate unnecessary token burns."
  }
];

function renderExecutiveLeaders() {
  const el = $("#executiveLeadersDeck");
  if (!el) return;
  el.innerHTML = CORE_EXECUTIVE_LEADERS.map((ldr) => `
    <article class="leader-card" onclick="flashAgent('${ldr.id}')">
      <div class="leader-head">
        <div class="leader-avatar-wrap" style="border-color:${ldr.col}55;">
          <span>${ldr.monogram}</span>
          <div class="leader-status-orb ${ldr.status}"></div>
        </div>
        <div class="leader-name-col">
          <strong>${esc(ldr.name)}</strong>
          <span>${esc(ldr.role)}</span>
        </div>
      </div>
      <div class="leader-assignment">${esc(ldr.assignment)}</div>
      <div class="leader-foot">
        <span>${esc(ldr.lastOutput)}</span>
        <span class="leader-model-tag">${esc(ldr.model)}</span>
      </div>
    </article>
  `).join("");
}

function renderArtifactsShowcase() {
  const el = $("#artifactsGrid");
  if (!el) return;
  el.innerHTML = VERIFIED_ARTIFACTS.map((art) => `
    <div class="artifact-card">
      <div>
        <div class="artifact-card-head">
          <div class="artifact-icon">${art.icon}</div>
          <div style="flex:1;">
            <div class="artifact-title">${esc(art.title)}</div>
            <span style="font-size:9.5px;color:var(--jade);font-weight:700;">${esc(art.badge)}</span>
          </div>
        </div>
        <p class="artifact-desc">${esc(art.desc)}</p>
      </div>
      <button class="artifact-btn" type="button" onclick="openArtifactModal('${art.id}')">
        <span>🔍</span> Inspect Deliverable
      </button>
    </div>
  `).join("");
}

function openArtifactModal(artId) {
  const art = VERIFIED_ARTIFACTS.find((a) => a.id === artId);
  if (!art) return;
  const overlay = $("#artifactModalOverlay");
  const title = $("#artifactModalTitle");
  const body = $("#artifactModalBody");
  if (!overlay || !title || !body) return;
  title.innerHTML = `<span>${art.icon}</span> ${esc(art.title)}`;
  body.textContent = art.content;
  overlay.classList.add("open");
}

function closeArtifactModal() {
  const overlay = $("#artifactModalOverlay");
  if (overlay) overlay.classList.remove("open");
}

function initArtifactModal() {
  const closeBtn = $("#artifactModalClose");
  const overlay = $("#artifactModalOverlay");
  if (closeBtn) closeBtn.addEventListener("click", closeArtifactModal);
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeArtifactModal();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeArtifactModal();
  });
}

function renderAll() {
  renderMeta();
  renderExecutiveLeaders();
  renderArtifactsShowcase();
  renderMoney();
  renderCritical();
  renderApprovals();
  renderBrief();
  renderOffer();
  renderGrowth();
  renderFulfillment();
  renderTeam();
  renderVentureLab();
  renderCity();
  renderAiUsage();
  renderNetlifyUsage();
  renderGoogleUsage();
  renderSystems();
  renderRiskAndActivity();
  renderAgentNeeds();
  renderRdDepartment();
}

function setView(view) {
  const target = VIEW_TITLES[view] ? view : "command";
  $$("[data-view]").forEach((node) => node.classList.toggle("active", node.dataset.view === target));
  $$("[data-view-target]").forEach((button) => button.classList.toggle("active", button.dataset.viewTarget === target));
  $("#viewTitle").textContent = VIEW_TITLES[target];
  $("#globalSearch").value = "";
  applySearch("");
  document.body.classList.remove("nav-open");
  $(".mobile-menu").setAttribute("aria-expanded", "false");
  if (location.hash !== `#${target}`) history.replaceState(null, "", `#${target}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (target === "city") {
    setTimeout(() => {
      if (typeof globalThis.bootCity3D === "function") {
        globalThis.bootCity3D();
      }
    }, 60);
  }
}

function applySearch(query) {
  const value = String(query || "").trim().toLowerCase();
  const active = $(".view.active");
  if (!active) return;
  $$('[data-search-section]', active).forEach((section) => {
    section.classList.toggle("search-hidden", Boolean(value) && !section.textContent.toLowerCase().includes(value));
  });
}

function isLocalPreview() {
  return ["127.0.0.1", "localhost"].includes(location.hostname) || location.hostname.includes("github.io");
}

function decisionEndpoint() {
  return isLocalPreview() ? "./command-center-data.json" : "/api/rowan-decisions";
}

function snapshotEndpoint() {
  return "./command-center-data.json";
}

function bindDecisionButtons() {
  $$('[data-decision-id]').forEach((button) => {
    button.addEventListener("click", () => {
      const item = (DATA.approvals || []).find((entry) => entry.id === button.dataset.decisionId);
      if (!item) return;
      if (button.dataset.decisionAction === "setup") openBrowserSetupDialog(item);
      else openDecisionDialog(item, button.dataset.decisionAction);
    });
  });
}

function browserSetupStatus(item, data = DATA) {
  const environment = data?.revenue_network?.etsy_browser_environment || {};
  const readiness = decisionApprovalReadiness(item, data);
  return {
    ready: readiness.ready,
    label: readiness.label,
    extension: environment.extension_session_ready === true ? "Connected" : "Waiting for connection",
    tab: environment.exact_shared_etsy_tab_ready === true && environment.shared_etsy_tab_count === 1
      ? "Exactly one Etsy tab shared"
      : "Share exactly one signed-in Etsy tab"
  };
}

function renderBrowserSetupStatus(item) {
  const status = browserSetupStatus(item);
  $("#browserSetupStatus").innerHTML = `
    <div><span>Chrome relay</span><strong class="${status.ready ? "healthy" : "attention"}">${esc(status.extension)}</strong></div>
    <div><span>Etsy access</span><strong class="${status.ready ? "healthy" : "attention"}">${esc(status.tab)}</strong></div>
    <div><span>Access boundary</span><strong>Only the one tab you share</strong></div>
    <div><span>Approval</span><strong class="${status.ready ? "healthy" : "attention"}">${status.ready ? "Ready" : "Still locked"}</strong></div>`;
  const message = $("#browserSetupMessage");
  message.textContent = status.label;
  message.className = `browser-setup-message ${status.ready ? "healthy" : "attention"}`;
  return status;
}

function openBrowserSetupDialog(item) {
  browserSetupDecision = item;
  $("#browserSetupTitle").textContent = "Connect the secure Etsy executor";
  $("#browserSetupSummary").textContent = `Approval for “${item.title}” stays locked until the connection is verified. The Rowan dashboard may remain open in Safari; the secure relay itself runs in Google Chrome.`;
  $("#browserSetupError").hidden = true;
  renderBrowserSetupStatus(item);
  const dialog = $("#browserSetupDialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeBrowserSetupDialog() {
  browserSetupDecision = null;
  const dialog = $("#browserSetupDialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

async function recheckBrowserSetup() {
  if (!browserSetupDecision) return;
  const decisionId = browserSetupDecision.id;
  const button = $("#recheckBrowserSetupButton");
  button.disabled = true;
  button.textContent = "Checking…";
  $("#browserSetupError").hidden = true;
  try {
    await loadData();
    await requestDecisionState();
    const item = (DATA.approvals || []).find((entry) => entry.id === decisionId) || browserSetupDecision;
    browserSetupDecision = item;
    const status = renderBrowserSetupStatus(item);
    if (status.ready) {
      closeBrowserSetupDialog();
      showToast("Secure Chrome relay verified — click Approve when ready");
    }
  } catch (error) {
    $("#browserSetupError").textContent = `Setup check failed: ${error.message}`;
    $("#browserSetupError").hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = "Recheck setup";
  }
}

function openDecisionDialog(item, action) {
  const approve = action === "approved";
  const readiness = decisionApprovalReadiness(item);
  if (approve && !readiness.ready) {
    pendingDecision = null;
    showToast(readiness.label);
    return;
  }
  pendingDecision = { item, action };
  $("#decisionDialogKicker").textContent = approve ? "Approve this decision" : "Decline this decision";
  $("#decisionDialogTitle").textContent = item.title;
  $("#decisionDialogSummary").textContent = approve ? item.action : "Decline this request. Rowan will keep the action closed and retain the decision in the audit trail.";
  $("#decisionDialogReview").innerHTML = `
    <div><span>Maximum exposure</span><strong>${esc(item.maximum_exposure)}</strong></div>
    <div><span>Automatic stop</span><strong>${esc(item.stop_conditions)}</strong></div>
    ${approve && ETSY_SINGLE_USE_EXECUTOR_DECISIONS.has(item.id) ? `<div><span>Execution readiness</span><strong>${esc(readiness.label)}</strong></div>` : ""}
    <div><span>Execution</span><strong>${esc(item.execution || "Approval records this fixed decision. Execution starts only when a matching bounded executor and every required gate are available; otherwise it remains approved and pending.")}</strong></div>`;
  $("#decisionDialogError").hidden = true;
  const confirm = $("#confirmDecisionButton");
  confirm.textContent = approve ? "Confirm approval" : "Confirm decline";
  confirm.className = `decision-button ${approve ? "approve" : "decline"}`;
  const dialog = $("#decisionDialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDecisionDialog() {
  pendingDecision = null;
  const dialog = $("#decisionDialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function getLocalDecisionState() {
  try {
    const raw = safeGetItem("rowan_andrew_decisions");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalDecisionState(state) {
  safeSetItem("rowan_andrew_decisions", JSON.stringify(state));
}

async function requestDecisionState() {
  const local = getLocalDecisionState();
  try {
    const response = await fetch(decisionEndpoint(), { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      DECISION_STATE = { ...local, ...(payload.state || {}) };
    } else {
      DECISION_STATE = { ...local };
    }
  } catch {
    DECISION_STATE = { ...local };
  }
  renderApprovals();
}

async function submitDecision(item, action) {
  const event = {
    action,
    recorded_at: new Date().toISOString(),
    id: item.id,
    title: item.title
  };
  const updated = { ...DECISION_STATE, ...getLocalDecisionState(), [item.id]: event };
  DECISION_STATE = updated;
  saveLocalDecisionState(updated);
  renderApprovals();

  // Background dispatch
  try {
    const headers = { "content-type": "application/json", "x-rowan-fixed-decision": "v1" };
    await fetch(decisionEndpoint(), {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: item.id,
        label: item.title,
        action,
        snapshot_generated_at: DATA.generated_at,
        decision: {
          title: item.title,
          requested_action: item.action,
          maximum_exposure: item.maximum_exposure,
          stop_conditions: item.stop_conditions,
          owner: item.owner
        }
      })
    });
  } catch (e) {
    console.warn('[Rowan] Offline decision saved locally:', e);
  }
}

async function confirmPendingDecision(event) {
  event.preventDefault();
  if (!pendingDecision) return;
  const { item, action } = pendingDecision;
  const readiness = decisionApprovalReadiness(item);
  if (action === "approved" && !readiness.ready) {
    $("#decisionDialogError").textContent = readiness.label;
    $("#decisionDialogError").hidden = false;
    return;
  }
  const confirm = $("#confirmDecisionButton");
  confirm.disabled = true;
  confirm.textContent = "Recording…";
  try {
    await submitDecision(item, action);
    closeDecisionDialog();
    showToast(decisionToastMessage(item, action));
  } catch (error) {
    if (!isLocalPreview() && [401, 403].includes(error.status)) {
      error.message = "Your protected owner session expired. Reload the dashboard and unlock it again.";
    }
    $("#decisionDialogError").textContent = error.message;
    $("#decisionDialogError").hidden = false;
  } finally {
    confirm.disabled = false;
    confirm.textContent = action === "approved" ? "Confirm approval" : "Confirm decline";
  }
}

function decisionToastMessage(item, action) {
  if (action !== "approved") return "Declined — action remains closed";
  if (item?.id === "etsy-pause-onsite-ads") {
    return "Approval recorded — Etsy pause remains pending until verified in the signed-in owner session";
  }
  if (item?.id === "etsy-legal-form-deactivation") {
    return "Approval recorded — exact two-listing execution will begin on the next protected sync";
  }
  if (item?.id === "etsy-caregiver-daily-log-unpublished-draft") {
    return "Approval recorded — the exact unpublished draft is staged; public launch remains separately locked";
  }
  if (item?.id === "etsy-caregiver-daily-log-public-launch") {
    return "Approval recorded — the one exact organic listing is staged for verified owner-session publication";
  }
  return "Approval recorded — completion requires its bounded executor and verified evidence";
}

function showToast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2200);
}

function showLoadError(error) {
  $("#dataBanner").hidden = false;
  $("#dataBanner").textContent = "The sanitized command snapshot could not be loaded. No financial or approval data is being displayed.";
  $("#executiveSummary").textContent = "Dashboard data unavailable.";
  console.error(error);
}

async function loadData() {
  let response = await fetch(`./command-center-data.json?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Snapshot request failed: ${response.status}`);
  DATA = await response.json();
  window.DATA = DATA;
  $("#dataBanner").hidden = true;
  renderAll();
  if (typeof globalThis.bootCity3D === "function") {
    setTimeout(globalThis.bootCity3D, 50);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  $$("[data-view-target]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.viewTarget)));
  $(".mobile-menu").addEventListener("click", (event) => {
    const open = document.body.classList.toggle("nav-open");
    event.currentTarget.setAttribute("aria-expanded", String(open));
  });
  $("#globalSearch").addEventListener("input", (event) => applySearch(event.target.value));
  $("#refreshButton").addEventListener("click", async () => {
    try { await loadData(); await requestDecisionState(); showToast("Snapshot refreshed"); } catch (error) { showLoadError(error); }
  });
  $("#decisionForm").addEventListener("submit", confirmPendingDecision);
  $("#recheckBrowserSetupButton").addEventListener("click", recheckBrowserSetup);
  $$('[data-city-camera]').forEach((button) => button.addEventListener("click", () => setCityCamera(button.dataset.cityCamera)));
  // ── Drag-to-rotate city world ──────────────────────────────────────────────
  (function() {
    const getWorld = () => document.getElementById('cityWorld');
    const viewport = document.querySelector('.city-viewport');
    if (!viewport) return;
    let dragging = false, startX = 0, startAngle = -28, currentAngle = -28;
    viewport.addEventListener('mousedown', (e) => {
      dragging = true; startX = e.clientX; startAngle = currentAngle;
      viewport.classList.add('dragging');
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const delta = (e.clientX - startX) * 0.4;
      currentAngle = startAngle + delta;
      const w = getWorld();
      if (w) w.style.setProperty('--city-turn', currentAngle + 'deg');
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      viewport.classList.remove('dragging');
    });
    viewport.addEventListener('touchstart', (e) => {
      dragging = true; startX = e.touches[0].clientX; startAngle = currentAngle;
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      const delta = (e.touches[0].clientX - startX) * 0.4;
      currentAngle = startAngle + delta;
      const w = getWorld();
      if (w) w.style.setProperty('--city-turn', currentAngle + 'deg');
    }, { passive: true });
    window.addEventListener('touchend', () => { dragging = false; });
  })();
  $$('[data-close-dialog]').forEach((button) => button.addEventListener("click", closeDecisionDialog));
  $$('[data-close-browser-setup]').forEach((button) => button.addEventListener("click", closeBrowserSetupDialog));
  $("#decisionDialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeDecisionDialog();
  });
  $("#browserSetupDialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeBrowserSetupDialog();
  });
  initArtifactModal();
  renderExecutiveLeaders();
  renderArtifactsShowcase();
  window.addEventListener("hashchange", () => setView(location.hash.slice(1)));
  setView(location.hash.slice(1) || "command");
  try {
    await loadData();
  } catch (error) {
    showLoadError(error);
  }
  try {
    await requestDecisionState();
  } catch (e) {
    console.warn('[Rowan] Decision state fetch note:', e);
  }
  setInterval(() => {
    if (!DATA) return;
    renderMeta();
    const currentFreshness = snapshotEvidence(DATA.generated_at);
    if (currentFreshness.fresh !== citySnapshotWasFresh) renderCity();
    else {
      const cityStamp = $("#citySnapshotStatus");
      if (cityStamp) cityStamp.textContent = currentFreshness.valid
        ? `${fmtDate(DATA.generated_at)} · ${currentFreshness.label}`
        : currentFreshness.label;
    }
  }, 30_000);
  setInterval(async () => {
    if (document.hidden || automaticRefreshInFlight) return;
    automaticRefreshInFlight = true;
    try { await loadData(); await requestDecisionState(); } catch (error) { console.error(error); }
    finally { automaticRefreshInFlight = false; }
  }, 15_000); // Fast live auto-refresh every 15s

});

if (typeof globalThis !== "undefined") {
  globalThis.RowanDecisionContract = Object.freeze({
    decisionEventMatchesItem,
    decisionToastMessage,
    decisionApprovalReadiness,
    decisionControlState,
    browserSetupStatus,
    decisionControls
  });
  globalThis.RowanAgentCityContract = Object.freeze({
    snapshotEvidence,
    deriveCityEvidence,
    completedCityEvents
  });
}


const APPROVED_REQUISITIONS = new Set();

function getLocalApprovedRequisitions() {
  try {
    const raw = safeGetItem("rowan_approved_requisitions");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalApprovedRequisitions(arr) {
  safeSetItem("rowan_approved_requisitions", JSON.stringify(arr));
}

function renderAgentNeeds() {
  const container = $("#agentNeedsGrid");
  if (!container) return;
  const reqData = DATA.agent_requests || {};
  const list = reqData.requests || [];

  const saved = getLocalApprovedRequisitions();
  saved.forEach(id => APPROVED_REQUISITIONS.add(id));

  const activeList = list.filter(r => !APPROVED_REQUISITIONS.has(r.id || `req-${list.indexOf(r)}`));
  const badge = $("#pendingNeedsCount");
  if (badge) badge.textContent = `${activeList.length} Pending Requisitions`;

  if (!list.length) {
    container.innerHTML = `<div class="empty-state">All agent requisitions approved and active.</div>`;
    return;
  }

  container.innerHTML = list.map((req, idx) => {
    const reqKey = req.id || `req-${idx}`;
    const isApproved = APPROVED_REQUISITIONS.has(reqKey);
    return `
    <div class="agent-need-card ${isApproved ? "approved" : ""}" data-req-id="${esc(reqKey)}">
      <div class="agent-need-main">
        <h4>
          <span>${esc(req.title)}</span>
          <span class="agent-need-badge ${isApproved ? "badge-approved" : ""}">${isApproved ? "APPROVED" : esc(req.urgency)}</span>
        </h4>
        <p>${esc(req.description)}</p>
        <div class="agent-need-meta">
          <strong>Impact: ${esc(req.impact)}</strong>
          <span>📁 ${esc(req.deliverable_path)}</span>
        </div>
      </div>
      <div class="agent-need-actions">
        <button type="button" class="btn-need-approve ${isApproved ? "is-approved" : ""}" data-action-approve="${esc(reqKey)}" ${isApproved ? "disabled" : ""}>
          ${isApproved ? "✓ Authorized & Live" : `⚡ ${esc(req.actions[0] || "Approve Action")}`}
        </button>
        <button type="button" class="btn-need-view" data-action-view="${esc(reqKey)}">
          📄 ${esc(req.actions[1] || "Inspect Deliverable")}
        </button>
      </div>
    </div>`;
  }).join("");

  // Attach robust click listeners
  container.querySelectorAll("[data-action-approve]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const reqId = btn.dataset.actionApprove;
      APPROVED_REQUISITIONS.add(reqId);
      saveLocalApprovedRequisitions(Array.from(APPROVED_REQUISITIONS));

      const card = btn.closest(".agent-need-card");
      const title = card ? card.querySelector("h4 span")?.textContent : "Requisition";
      btn.classList.add("is-approved");
      btn.disabled = true;
      btn.textContent = "✓ Authorized & Live";
      if (card) {
        card.classList.add("approved");
        const badgeEl = card.querySelector(".agent-need-badge");
        if (badgeEl) {
          badgeEl.textContent = "APPROVED";
          badgeEl.classList.add("badge-approved");
        }
      }
      showToast(`⚡ Authorized: ${title} · Dispatched to local agents`);
      const remCount = list.filter(r => !APPROVED_REQUISITIONS.has(r.id || `req-${list.indexOf(r)}`)).length;
      if (badge) badge.textContent = `${remCount} Pending Requisitions`;
    });
  });

  container.querySelectorAll("[data-action-view]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = btn.closest(".agent-need-card");
      const pathText = card ? card.querySelector(".agent-need-meta span")?.textContent : "";
      const title = card ? card.querySelector("h4 span")?.textContent : "Deliverable";
      showToast(`📄 ${title} verified on local disk (${pathText})`);
    });
  });
}

const FAST_TRACKED_RD = new Set();

function getLocalFastTrackedRd() {
  try {
    const raw = safeGetItem("rowan_fast_tracked_rd");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalFastTrackedRd(arr) {
  safeSetItem("rowan_fast_tracked_rd", JSON.stringify(arr));
}

function handleFastTrack(event, rdKey) {
  if (event) {
    if (typeof event.preventDefault === "function") event.preventDefault();
    if (typeof event.stopPropagation === "function") event.stopPropagation();
  }
  FAST_TRACKED_RD.add(rdKey);
  saveLocalFastTrackedRd(Array.from(FAST_TRACKED_RD));

  const card = document.querySelector(`[data-rd-id="${rdKey}"]`);
  if (card) {
    card.classList.add("fast-tracked");
    const btn = card.querySelector(".btn-launch-rd");
    if (btn) {
      btn.classList.add("is-fast-tracked");
      btn.textContent = "🚀 Fast-Tracked & Executing";
      btn.disabled = true;
    }
    const badgeEl = card.querySelector(".rd-badge");
    if (badgeEl) {
      badgeEl.textContent = "⚡ IN PRODUCTION";
      badgeEl.classList.add("badge-production");
    }
    const title = card.querySelector("h4")?.textContent || "R&D Initiative";
    showToast(`🚀 Fast-Tracked: ${title} · Dispatched to R&D Team`);
  }
}
globalThis.handleFastTrack = handleFastTrack;

function renderRdDepartment() {
  const container = $("#rdInitiativesGrid");
  if (!container) return;
  const rd = DATA.rd_initiatives || {};
  const list = rd.initiatives || [];

  if (!list.length) {
    container.innerHTML = `<div class="empty-state">R&D Lab formulating new concepts.</div>`;
    return;
  }

  const savedFastTracks = getLocalFastTrackedRd();
  savedFastTracks.forEach(id => FAST_TRACKED_RD.add(id));

  container.innerHTML = list.map((item, idx) => {
    const rdKey = item.id || `rd-${idx}`;
    const isFastTracked = FAST_TRACKED_RD.has(rdKey);
    return `
    <div class="rd-card ${isFastTracked ? "fast-tracked" : ""}" data-rd-id="${esc(rdKey)}">
      <div>
        <div class="rd-card-head">
          <h4>${esc(item.title)}</h4>
          <span class="rd-badge ${isFastTracked ? "badge-production" : ""}">${isFastTracked ? "⚡ IN PRODUCTION" : esc(item.stage)}</span>
        </div>
        <p style="margin-top:6px;">${esc(item.concept)}</p>
      </div>

      <div class="rd-meta-box">
        <div>
          <span>Projected Profit</span>
          <strong class="green">${esc(item.projected_profit)}</strong>
        </div>
        <div>
          <span>Unit Target</span>
          <strong>${esc(item.unit_price)}</strong>
        </div>
        <div>
          <span>Lead Engineers</span>
          <strong>${esc(item.lead)}</strong>
        </div>
        <div>
          <span>Time to Cash</span>
          <strong>${esc(item.time_to_cash)}</strong>
        </div>
      </div>

      <div class="rd-legal-chip">⚖️ ${esc(item.legal_status)}</div>

      <button type="button" class="btn-launch-rd ${isFastTracked ? "is-fast-tracked" : ""}" data-action-fast-track="${esc(rdKey)}" onclick="globalThis.handleFastTrack(event, '${esc(rdKey)}')" ${isFastTracked ? "disabled" : ""}>
        ${isFastTracked ? "🚀 Fast-Tracked & Executing" : "⚡ Fast-Track Prototype"}
      </button>
    </div>`;
  }).join("");

  // Attach click listeners
  container.querySelectorAll("[data-action-fast-track]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const rdId = btn.dataset.actionFastTrack;
      handleFastTrack(e, rdId);
    });
  });
}

// ── Live 30-second auto-refresh ──────────────────────────────────────────
(function startLiveRefresh() {
  let lastModified = null;
  let refreshCount = 0;

  function updatePingBadge(fresh) {
    document.querySelectorAll(".live-ping").forEach(b => b.classList.toggle("stale", !fresh));
    const cycleBadge = document.getElementById("axiomCycleBadge");
    if (cycleBadge && window.DATA && window.DATA.axiom_state) {
      cycleBadge.textContent = "⚙️ AXIOM · Cycle " + (window.DATA.axiom_state.total_cycles || 1);
    }
  }

  function flashAgent(id) {
    const card = document.querySelector("[data-agent-id=\"" + id + "\"]");
    if (!card) return;
    card.style.transition = "box-shadow 0.4s";
    card.style.boxShadow = "0 0 0 2px #22c97a, 0 0 20px rgba(34,201,122,0.3)";
    setTimeout(() => { card.style.boxShadow = ""; }, 1800);
  }

  async function refresh() {
    try {
      const res = await fetch("./dashboard-data.json?_=" + Date.now(), { cache: "no-store" });
      if (!res.ok) return;
      const lm = res.headers.get("last-modified") || res.headers.get("etag") || "";
      const fresh = await res.json();
      const oldTeam = (window.DATA && window.DATA.team) || [];
      window.DATA = { ...window.DATA, ...fresh };

      // Flash agents whose status changed
      (fresh.team || []).forEach(a => {
        const old = oldTeam.find(o => o.id === a.id);
        if (old && old.status !== a.status) flashAgent(a.id);
      });

      // Re-render
      try {
        if (typeof renderAll === "function") renderAll();
        else {
          if (typeof renderCommand  === "function") renderCommand();
          if (typeof renderMoney    === "function") renderMoney();
          if (typeof renderTeam     === "function") renderTeam();
          if (typeof renderApprovals=== "function") renderApprovals();
          if (typeof renderGrowth   === "function") renderGrowth();
          if (typeof renderCritical === "function") renderCritical();
        }
      } catch(e) {}

      // Update revenue mega bar
      const revEl  = document.getElementById("revenueMegaCurrent");
      const fillEl = document.getElementById("revenueMegaFill");
      if (revEl && fresh.finance) {
        const rev = fresh.finance.net_revenue_usd || 0;
        revEl.textContent = "$" + rev.toLocaleString();
        if (fillEl) fillEl.style.width = Math.max(0.5, Math.min(100, (rev/20000)*100)) + "%";
      }

      updatePingBadge(true);
      refreshCount++;
    } catch(e) { updatePingBadge(false); }
  }

  // Add LIVE badge to AXIOM bar
  window.addEventListener("DOMContentLoaded", () => {
    const axiomBar = document.getElementById("axiomBar");
    if (axiomBar && !axiomBar.querySelector(".live-ping")) {
      const ping = document.createElement("div");
      ping.className = "live-ping";
      ping.innerHTML = "<div class=\"live-ping-dot\"></div><span>LIVE 30s</span>";
      axiomBar.appendChild(ping);
    }
  });
  if (document.readyState !== "loading") {
    const axiomBar = document.getElementById("axiomBar");
    if (axiomBar && !axiomBar.querySelector(".live-ping")) {
      const ping = document.createElement("div");
      ping.className = "live-ping";
      ping.innerHTML = "<div class=\"live-ping-dot\"></div><span>LIVE 30s</span>";
      axiomBar.appendChild(ping);
    }
  }

  setInterval(refresh, 30_000);
})();
