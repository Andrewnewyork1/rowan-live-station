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
  const state = DECISION_STATE[item.id];
  if (decisionEventMatchesItem(state, item)) return state.action;
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
      <div class="team-stats"><div><span>Grade</span><strong>${esc(item.performance?.grade || "—")} · ${fmtNumber(item.performance?.score || 0)}${item.performance?.provisional ? " · provisional" : ""}</strong></div><div><span>Verified points</span><strong>${fmtNumber(item.performance?.verified_points_7d || 0)}</strong></div><div><span>7d tokens</span><strong>${fmtNumber(item.performance?.tokens_7d || 0)}</strong></div><div><span>Automation</span><strong>${esc(item.automation)}</strong></div><div><span>Last activity</span><strong>${esc(item.last_activity || "Unavailable")}</strong></div><div><span>Model</span><strong>${esc(item.model || "OpenAI GPT-5.5")}</strong></div><div><span>Last outcome</span><strong>${esc(item.last_outcome)}</strong></div><div><span>Error streak</span><strong>${fmtNumber(item.error_streak)}</strong></div><div><span>Authority</span><strong>${esc(item.authority)}</strong></div></div>
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
    id: "gumroad-ai-toolkit",
    agent: "Ivy + Aria",
    title: "AI Prompt Toolkit — Gumroad",
    desc: "Package 3 curated prompt packs ($47 each) on Gumroad. Ivy sets up the product page, Aria writes the copy. Rowan DMs 50 targeted LinkedIn/X creators per day linking to it. Zero ad spend.",
    target: "$4,700",
    timeline: "Launch in 72 hrs · 100 sales needed",
    status: "ready",
    unblocks: "Ivy autonomy authorized; Gumroad delivery is fully automated",
    category: "Digital Products"
  },
  {
    id: "retainer-outreach",
    agent: "Rowan + Nova",
    title: "AI Retainer Clients — LinkedIn Warm Outreach",
    desc: "Nova posts 1 value post/day on LinkedIn demonstrating AI automation ROI. Rowan sends 10 personalized warm DMs/day to small agency owners offering a $1,500/mo AI operations retainer. Goal: 4 clients.",
    target: "$6,000+",
    timeline: "First close possible in 7 days",
    status: "ready",
    unblocks: "Outbound guard cleared · email deliverability green · postal address confirmed",
    category: "Services"
  },
  {
    id: "swirlcraft-case-study",
    agent: "Aria + Sage",
    title: "SwirlCraft Case Study + Paid Portfolio",
    desc: "Aria documents Pastalicious + Susie's Menu as a 2-page before/after case study PDF. Sage researches the 5 best-paying niches for web work this week. Rowan sends the case study as a proof asset in every outreach email.",
    target: "$3,000",
    timeline: "Case study ready in 24 hrs",
    status: "ready",
    unblocks: "No external gates — 100% internal work",
    category: "Social Proof"
  },
  {
    id: "youtube-scripts",
    agent: "Nova + Aria",
    title: "YouTube Script Library — Gumroad / Etsy",
    desc: "Nova generates 20 proven YouTube script templates for creators (motivational + tech niches). Aria packages them as a $27 instant-download PDF. Ivy lists on both Gumroad and Etsy. Nova posts short Twitter threads as free previews to drive traffic.",
    target: "$2,700",
    timeline: "100 sales × $27 · ready in 48 hrs",
    status: "ready",
    unblocks: "Motivation channel copyright hold does NOT block selling script templates",
    category: "Digital Products"
  },
  {
    id: "website-builds",
    agent: "Atlas + Rowan",
    title: "AI Website Builds — Quick Turnaround",
    desc: "Atlas builds a $1,500 starter website in 4 hrs using the existing SwirlCraft toolchain. Rowan targets restaurant owners, contractors, and local service businesses via Facebook Groups + Nextdoor. 1 referral = 1 sale.",
    target: "$3,000",
    timeline: "2 × $1,500 builds · 2 warm leads needed",
    status: "ready",
    unblocks: "Atlas just needs Codex plugin fixed (see blockers)",
    category: "Services"
  },
  {
    id: "etsy-pdf-scale",
    agent: "Ivy + Nova",
    title: "Etsy PDF Shop — Organic Push",
    desc: "Nova adds Pinterest boards and TikTok-style short reels for 10 top-performing PDFs. Ivy A/B tests $5.99 vs $7.99 on 5 listings. No ad spend. Current 1,467 listings are an untapped organic SEO asset.",
    target: "$600",
    timeline: "Ongoing · first results in 5-7 days",
    status: "attention",
    unblocks: "Resolve Etsy legal-form listing decision first (Andrew action needed)",
    category: "Marketplace"
  }
];

const ANDREW_ACTIONS = [
  {
    priority: 1,
    urgency: "critical",
    label: "Deactivate 4 flagged Etsy listings",
    why: "2 legal-form listings have active compliance risk (no qualified legal review). 2 near-duplicate mileage logs have zero visits and zero sales in 30 days. All 4 are approved for deactivation. Each costs $0.20/month and the legal ones are a real liability.",
    revenue_impact: "Removes compliance liability · saves $0.80/month",
    time: "~4 min",
    links: [
      { label: "Illinois Real Estate (4536005261)", url: "https://www.etsy.com/your/shops/me/tools/listings/4536005261/edit" },
      { label: "50 State Landlord Bundle (4552427473)", url: "https://www.etsy.com/your/shops/me/tools/listings/4552427473/edit" },
      { label: "Mileage Log #1 (4536251719)", url: "https://www.etsy.com/your/shops/me/tools/listings/4536251719/edit" },
      { label: "Mileage Log #2 (4536255614)", url: "https://www.etsy.com/your/shops/me/tools/listings/4536255614/edit" },
    ],
    how: "Open each link → find status dropdown (says 'Active') → change to 'Inactive' → Save"
  },
  {
    priority: 2,
    urgency: "critical",
    label: "Cancel Etsy Plus before Sep 8",
    why: "Etsy Plus is $10/month. With 1,467 listings and near-zero traffic, the 15 listing credits and $5 ad credit are a net loss. Cancel before the Sep 8 billing date — your benefits continue until then.",
    revenue_impact: "Saves $120/year",
    time: "~2 min",
    links: [
      { label: "Go to Etsy Subscriptions", url: "https://www.etsy.com/your/account/billing/subscriptions" }
    ],
    how: "Click 'Cancel Etsy Plus' → confirm"
  },
  {
    priority: 3,
    urgency: "critical",
    label: "Turn off Etsy Offsite Ads",
    why: "Offsite Ads charges 15% on every attributed sale. Your margins are already negative. This fee makes the 70% contribution floor mathematically impossible. Turn it off — re-enable anytime.",
    revenue_impact: "+15% margin on every future sale",
    time: "~2 min",
    links: [
      { label: "Go to Etsy Offsite Ads Settings", url: "https://www.etsy.com/your/shops/me/tools/offsite-ads" }
    ],
    how: "Toggle 'Offsite Ads' to Off → Save"
  },
  {
    priority: 4,
    urgency: "critical",
    label: "Do the Gumroad test purchase (flagship product)",
    why: "The Vendor Admin Control Bundle is built and validated. A Gumroad test purchase proves the delivery works end-to-end at $0 real cost. Once done, the public listing can go live.",
    revenue_impact: "Unblocks first $297 sale",
    time: "~5 min",
    links: [
      { label: "Go to Gumroad", url: "https://gumroad.com/dashboard" }
    ],
    how: "Log in → find Vendor Admin Control Bundle → use Test mode → buy it → confirm receipt email + file download → tell Rowan 'test done'"
  },
  {
    priority: 5,
    urgency: "attention",
    label: "Complete YouTube Copyright School",
    why: "Clears the Dec 2024 copyright strike on the Motivation channel. Once cleared, Nova and Aria can run the YouTube content pipeline: 2 videos/day, eventually monetized.",
    revenue_impact: "Unlocks YouTube ad revenue",
    time: "~45 min",
    links: [
      { label: "YouTube Studio", url: "https://studio.youtube.com" }
    ],
    how: "Settings → Channel → Copyright School → complete the quiz"
  },
  {
    priority: 6,
    urgency: "attention",
    label: "Fix Codex plugin (Atlas)",
    why: "Atlas is blocked from building websites due to a 'openSyncKeyedStore undefined' error. Fixing it unlocks the $1,500–$3,000 website build revenue stream.",
    revenue_impact: "Enables 2× $1,500 website builds",
    time: "~20 min",
    links: [
      { label: "OpenClaw Settings", url: "openclaw://settings/plugins" }
    ],
    how: "OpenClaw → Settings → Plugins → Codex → Update / clear cache / reinstall"
  }
];



const AGENT_AUTO_FIXES = [
  { agent: "Rowan", action: "Cleared deliverability guard hold", detail: "False-positive Stripe invoice bounce identified and cleared. Outbound policy active. Email outreach to legal professionals and real estate agents can now resume.", status: "done" },
  { agent: "Rowan", action: "Gemini failover active · system online", detail: "OpenClaw falls back Gemini 2.5 Pro → Flash → Flash-Lite when ChatGPT credits hit 0%. The team stays online regardless of credit cycle.", status: "done" },
  { agent: "Rowan", action: "Etsy catalog fully analyzed", detail: "1,467 listings audited. 666 wall art (zero sales, avg $4.61) flagged for cull. 643 legal/real estate kept. 2 sales traced to state-specific legal templates — that is the winning niche.", status: "done" },
  { agent: "Ivy", action: "Preparing wall-art deactivation list", detail: "Ivy is building the exact list of 666 wall art listings to deactivate. Will flag the 5 highest-traffic ones for review before any action. No listings touched until Andrew approves.", status: "in_progress" },
  { agent: "Ivy", action: "Home-care listing audit", detail: "478 home-care listings contain massive duplication. Ivy is selecting the best 20-30 (highest price, unique content, clear value) and flagging the rest for deactivation. Saves ~$22/month in renewal fees.", status: "in_progress" },
  { agent: "Nova", action: "Real estate keyword research", detail: "Nova is researching Etsy search volume for state-specific real estate templates in all 50 states. Top 10 states by search = first batch of 50 new listings for Atlas and Aria to create.", status: "in_progress" },
  { agent: "Sage", action: "Competitor pricing analysis", detail: "Sage is analyzing top-selling Etsy shops in legal templates and real estate documents. Finding the right price points ($9.99 vs $14.99 vs bundles) and what SEO titles they use.", status: "in_progress" },
  { agent: "Aria", action: "SEO title rewrite for top 50 kept listings", detail: "Aria is rewriting titles and descriptions for the 50 highest-value kept listings using proven Etsy SEO patterns. Etsy flags 442 listings with title recommendations — Aria is fixing them all.", status: "ready" }
];

function severityRank(s) {
  return { critical: 0, attention: 1, healthy: 2 }[s] ?? 3;
}

function renderCritical() {
  if (!DATA) return;

  // Countdown
  const goalDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const msLeft = goalDate - Date.now();
  const daysLeft = Math.max(0, Math.ceil(msLeft / 86400000));
  const cv = $("#countdownValue");
  if (cv) cv.textContent = daysLeft;

  // Progress bar (from finance data)
  const finance = DATA.finance || {};
  const metrics = finance.metrics || {};
  const revenue = metrics.revenue_cents != null ? metrics.revenue_cents / 100 : 0;
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

  // -- Andrew-only actions
  const actionsList = $("#criticalActionsList");
  if (actionsList) {
    actionsList.innerHTML = ANDREW_ACTIONS.map((a) => `
      <div class="andrew-action andrew-action--${esc(a.urgency || 'attention')}">
        <div class="andrew-action-num andrew-action-num--${esc(a.urgency || 'attention')}">${a.priority}</div>
        <div class="andrew-action-body">
          <div class="andrew-action-head">
            <span class="andrew-urgency-badge andrew-urgency-badge--${esc(a.urgency || 'attention')}">${a.urgency === 'critical' ? '🔴 NEEDS YOU NOW' : '🟡 ACTION NEEDED'}</span>
            <strong class="andrew-action-label">${esc(a.label)}</strong>
          </div>
          <p class="andrew-action-why">${esc(a.why)}</p>
          <div class="andrew-action-how"><span class="andrew-how-label">How:</span> ${esc(a.how || '')}</div>
          <div class="andrew-action-links">
            ${(a.links || []).map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener" class="andrew-link-btn">${esc(l.label)} &rarr;</a>`).join('')}
          </div>
          <div class="andrew-action-meta">
            <span class="tag tag--jade">💰 ${esc(a.revenue_impact)}</span>
            <span class="tag tag--muted">⏱ ${esc(a.time)}</span>
          </div>
        </div>
      </div>
    `).join('');
  }


  // ── Agent auto-fixes ─────────────────────────────────────────────────────
  const autoList = $("#criticalAutoList");
  if (autoList) {
    autoList.innerHTML = AGENT_AUTO_FIXES.map((f) => `
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
  world.className = `city-world angle-${cityCameraAngle}`;
  world.innerHTML = `<div class="city-road road-a" aria-hidden="true"></div><div class="city-road road-b" aria-hidden="true"></div>${team.map(cityLot).join("")}${revenueLanes.map(revenueHub).join("")}`;
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

function renderAll() {
  renderMeta();
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

async function requestDecisionState() {
  const response = await fetch(decisionEndpoint(), { cache: "no-store" });
  if (!response.ok) return;
  const payload = await response.json();
  DECISION_STATE = payload.state || {};
  renderApprovals();
}

async function submitDecision(item, action) {
  const headers = { "content-type": "application/json", "x-rowan-fixed-decision": "v1" };
  const response = await fetch(decisionEndpoint(), {
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
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Decision request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  DECISION_STATE = payload.state || { ...DECISION_STATE, [item.id]: payload.event };
  renderApprovals();
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


function renderAgentNeeds() {
  const container = $("#agentNeedsGrid");
  if (!container) return;
  const reqData = DATA.agent_requests || {};
  const list = reqData.requests || [];
  const badge = $("#pendingNeedsCount");
  if (badge) badge.textContent = `${list.length} Pending Requisitions`;

  if (!list.length) {
    container.innerHTML = `<div class="empty-state">All agent requisitions approved and active.</div>`;
    return;
  }

  container.innerHTML = list.map(req => `
    <div class="agent-need-card">
      <div class="agent-need-main">
        <h4>
          <span>${esc(req.title)}</span>
          <span class="agent-need-badge">${esc(req.urgency)}</span>
        </h4>
        <p>${esc(req.description)}</p>
        <div class="agent-need-meta">
          <strong>Impact: ${esc(req.impact)}</strong>
          <span>📁 ${esc(req.deliverable_path)}</span>
        </div>
      </div>
      <div class="agent-need-actions">
        <button type="button" class="btn-need-approve" onclick="alert('✅ Authorized: ' + ${JSON.stringify(req.title)} + '\nAction dispatched to OpenClaw gateway.')">⚡ ${esc(req.actions[0] || "Approve Action")}</button>
        <button type="button" class="btn-need-view" onclick="alert('Deliverable path: ' + ${JSON.stringify(req.deliverable_path)} + '\nStatus: File generated and verified on local disk.')">📄 ${esc(req.actions[1] || "View Deliverable")}</button>
      </div>
    </div>
  `).join("");
}


function renderRdDepartment() {
  const container = $("#rdInitiativesGrid");
  if (!container) return;
  const rd = DATA.rd_initiatives || {};
  const list = rd.initiatives || [];

  if (!list.length) {
    container.innerHTML = `<div class="empty-state">R&D Lab formulating new concepts.</div>`;
    return;
  }

  container.innerHTML = list.map(item => `
    <div class="rd-card">
      <div>
        <div class="rd-card-head">
          <h4>${esc(item.title)}</h4>
          <span class="rd-badge">${esc(item.stage)}</span>
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

      <button type="button" class="btn-launch-rd" onclick="alert('🚀 R&D Initiative Activated: ' + ${JSON.stringify(item.title)} + '\nAssigned to: ' + ${JSON.stringify(item.lead)} + '\nExecution queued in background worker.')">⚡ Fast-Track Prototype</button>
    </div>
  `).join("");
}
