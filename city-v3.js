let cityState = null;
let cityBooting = false;

const safe = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const usd = value => Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function latestCompleted(agent) {
  return (agent?.city?.history || []).find(item => /succeeded|completed|success/i.test(String(item.status || item.detail || "")));
}

function updateInspector(agentId) {
  const data = window.DATA;
  const panel = document.getElementById("cityInspector");
  if (!data || !panel) return;
  const agent = (data.team || []).find(item => item.id === agentId);
  const tower = (data.profit_war?.contenders || []).find(item => item.id === agentId);
  if (!agent || !tower) return;
  const completed = latestCompleted(agent);
  panel.innerHTML = `<span class="eyebrow-v3">Tower inspector</span><h2>${safe(agent.name)}</h2><p>${safe(agent.department)} · ${safe(agent.role)}</p><div class="tower-hero-v3"><span>Verified attributable net profit</span><strong>${usd(tower.profit_generated)}</strong><small>${safe(tower.attribution_status || "No reconciled attribution")}</small></div><div class="tower-facts-v3"><div><span>Tower height / floors</span><strong>${safe(tower.height_m)}m · ${safe(tower.floors)} floors</strong></div><div><span>Verified sales / revenue</span><strong>${safe(tower.verified_sales)} · ${usd(tower.verified_revenue)}</strong></div><div><span>Current verified state</span><strong>${safe(agent.city?.current_activity || "No verified current task")}</strong></div><div><span>Recent completed work</span><strong>${safe(completed?.title || "No verified completion in sanitized history")}</strong></div><div><span>Model route</span><strong>${safe(agent.model)} · ${safe(agent.reasoning_mode)} reasoning</strong></div><div><span>Authority</span><strong>${safe(agent.authority)}</strong></div></div>`;
}

function teamPositions(team) {
  const executives = team.filter(item => item.configured);
  const specialists = team.filter(item => !item.configured);
  const placed = [];
  const addRing = (items, radius, offset = 0) => items.forEach((item, index) => {
    const angle = offset + (Math.PI * 2 * index) / Math.max(1, items.length);
    placed.push({ item, x: Math.cos(angle) * radius, z: Math.sin(angle) * radius });
  });
  addRing(executives, 27, -Math.PI / 2);
  addRing(specialists.slice(0, 12), 58, -Math.PI / 2 + Math.PI / 12);
  addRing(specialists.slice(12), 88, -Math.PI / 2);
  return placed;
}

async function createCity(viewport, data) {
  const THREE = await import("./lib/three.module.js");
  const { OrbitControls } = await import("./lib/OrbitControls.js");
  if (!viewport.isConnected) return;

  if (cityState?.dispose) cityState.dispose();
  viewport.querySelectorAll("canvas,.city-v3-overlay").forEach(node => node.remove());

  const width = Math.max(320, viewport.clientWidth);
  const height = Math.max(440, viewport.clientHeight || 620);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", "Interactive Agent City profit skyline");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none;z-index:1";
  viewport.appendChild(canvas);
  const overlay = document.createElement("div");
  overlay.className = "city-v3-overlay";
  overlay.style.cssText = "position:absolute;inset:0;z-index:3;pointer-events:none;overflow:hidden";
  viewport.appendChild(overlay);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: window.innerWidth >= 700, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02060b);
  scene.fog = new THREE.Fog(0x02060b, 125, 255);
  const camera = new THREE.PerspectiveCamera(43, width / height, 0.5, 600);
  camera.position.set(0, 98, 142);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 8, 0);
  controls.enableDamping = false;
  controls.minDistance = 50;
  controls.maxDistance = 230;
  controls.maxPolarAngle = Math.PI / 2.04;
  controls.update();

  scene.add(new THREE.HemisphereLight(0x7ab7dd, 0x071013, 2.2));
  const key = new THREE.DirectionalLight(0xb8dfff, 2.5);
  key.position.set(-70, 120, 30);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x36d69a, 1.1);
  fill.position.set(90, 55, -70);
  scene.add(fill);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(118, 96), new THREE.MeshStandardMaterial({ color: 0x071015, roughness: 0.86, metalness: 0.25 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const grid = new THREE.GridHelper(224, 56, 0x1a3a43, 0x0d2027);
  grid.position.y = 0.03;
  scene.add(grid);

  [40, 73, 105].forEach((radius, index) => {
    const road = new THREE.Mesh(new THREE.RingGeometry(radius - 2.2, radius + 2.2, 96), new THREE.MeshBasicMaterial({ color: index === 0 ? 0x102730 : 0x0b1b21, side: THREE.DoubleSide }));
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.06;
    scene.add(road);
    const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 97 }, (_, i) => {
      const a = (i / 96) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * radius, 0.1, Math.sin(a) * radius);
    })), new THREE.LineBasicMaterial({ color: index === 0 ? 0x36d69a : 0x173b45, transparent: true, opacity: .55 }));
    scene.add(edge);
  });

  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, .55, 48), new THREE.MeshStandardMaterial({ color: 0x0c1d22, roughness: .35, metalness: .75 }));
  plaza.position.y = .28;
  scene.add(plaza);
  const goalRing = new THREE.Mesh(new THREE.TorusGeometry(9, .28, 10, 64), new THREE.MeshStandardMaterial({ color: 0xf4bd58, emissive: 0xf4bd58, emissiveIntensity: 1.4, metalness: .8 }));
  goalRing.rotation.x = Math.PI / 2;
  goalRing.position.y = .7;
  scene.add(goalRing);
  const goalCore = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 3.7, 10, 8), new THREE.MeshStandardMaterial({ color: 0x14262a, emissive: 0x36d69a, emissiveIntensity: .3, metalness: .9, roughness: .2 }));
  goalCore.position.y = 5;
  scene.add(goalCore);

  const leagueById = new Map((data.profit_war?.contenders || []).map(item => [item.id, item]));
  const towers = [];
  const labels = [];

  function towerMaterial(color) {
    return new THREE.MeshStandardMaterial({ color: 0x091319, emissive: color, emissiveIntensity: .09, roughness: .24, metalness: .88 });
  }

  function createTower(position, index) {
    const agent = position.item;
    const league = leagueById.get(agent.id) || {};
    const color = new THREE.Color(league.color || "#70bdff");
    const visualHeight = Math.max(18, Number(league.height_m || 18));
    const group = new THREE.Group();
    group.position.set(position.x, 0, position.z);
    group.userData.agentId = agent.id;

    const podium = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.8, 1.1, 8), new THREE.MeshStandardMaterial({ color: 0x101b21, roughness: .5, metalness: .7 }));
    podium.position.y = .55;
    group.add(podium);
    const shell = new THREE.Mesh(new THREE.BoxGeometry(5.8, visualHeight, 5.8), towerMaterial(color));
    shell.position.y = 1.1 + visualHeight / 2;
    group.add(shell);
    const glass = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .52, transparent: true, opacity: .74, roughness: .08, metalness: .78 });
    const facade = new THREE.Mesh(new THREE.PlaneGeometry(4.8, visualHeight - 1), glass);
    facade.position.set(0, 1.1 + visualHeight / 2, 2.91);
    group.add(facade);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(4.8, visualHeight - 1), glass.clone());
    side.rotation.y = Math.PI / 2;
    side.position.set(2.91, 1.1 + visualHeight / 2, 0);
    group.add(side);

    const sales = Math.max(0, Number(league.verified_sales || 0));
    const rowCount = Math.max(4, Math.floor(visualHeight / 3));
    for (let row = 0; row < rowCount; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const lit = row * 3 + col < sales;
        const win = new THREE.Mesh(new THREE.PlaneGeometry(.65, .43), new THREE.MeshBasicMaterial({ color: lit ? color : 0x18313a, transparent: true, opacity: lit ? 1 : .44 }));
        win.position.set(-1.55 + col * 1.55, 2.4 + row * 2.45, 2.925);
        group.add(win);
      }
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(6.2, .45, 6.2), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .48, metalness: .9, roughness: .12 }));
    roof.position.y = visualHeight + 1.32;
    group.add(roof);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(.08, .22, 3.1, 8), new THREE.MeshBasicMaterial({ color }));
    beacon.position.y = visualHeight + 3;
    group.add(beacon);

    if (league.is_leader) {
      const crown = new THREE.Group();
      for (let point = 0; point < 5; point += 1) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(.5, 2.7, 5), new THREE.MeshStandardMaterial({ color: 0xf4bd58, emissive: 0xf4bd58, emissiveIntensity: 1.2, metalness: .8 }));
        const angle = (point / 5) * Math.PI * 2;
        spike.position.set(Math.cos(angle) * 1.5, 1.35, Math.sin(angle) * 1.5);
        crown.add(spike);
      }
      crown.position.y = visualHeight + 3.2;
      group.add(crown);
    }

    scene.add(group);
    const label = document.createElement("button");
    label.type = "button";
    label.style.cssText = `position:absolute;display:none;transform:translate(-50%,-100%);pointer-events:auto;padding:4px 7px;border:1px solid ${league.color || "#70bdff"}66;border-radius:8px;background:rgba(3,8,12,.9);color:#eef7f6;font:700 8px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 5px 18px rgba(0,0,0,.45);white-space:nowrap;cursor:pointer`;
    label.innerHTML = `${safe(agent.name)} <span style="color:${safe(league.color || "#70bdff")};margin-left:4px">${usd(league.profit_generated)}</span>`;
    label.addEventListener("click", () => selectAgent(agent.id));
    overlay.appendChild(label);
    labels.push({ element: label, world: new THREE.Vector3(position.x, visualHeight + 5.5, position.z), agentId: agent.id, executive: agent.configured });
    towers.push({ group, agentId: agent.id, color, height: visualHeight });
  }

  teamPositions(data.team || []).forEach(createTower);

  const mood = document.createElement("div");
  const zeroTie = data.profit_war?.all_tied_at_zero;
  mood.style.cssText = `position:absolute;top:13px;left:13px;padding:7px 10px;border:1px solid ${zeroTie ? "rgba(244,189,88,.35)" : "rgba(54,214,154,.35)"};border-radius:999px;background:rgba(3,8,12,.9);color:${zeroTie ? "#f4bd58" : "#36d69a"};font:800 8px -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.08em`;
  mood.textContent = zeroTie ? `STARTING LINE · ${towers.length} EQUAL TOWERS · NO CROWN` : data.profit_war?.has_verified_leader ? `PROFIT LEADER · ${data.profit_war.contenders[0].name}` : "VERIFIED PROFIT TIE · NO CROWN";
  overlay.appendChild(mood);
  const instructions = document.createElement("div");
  instructions.style.cssText = "position:absolute;right:13px;top:13px;padding:7px 10px;border:1px solid rgba(112,189,255,.22);border-radius:999px;background:rgba(3,8,12,.86);color:#91a3aa;font:700 8px -apple-system,BlinkMacSystemFont,sans-serif";
  instructions.textContent = "DRAG TO ROTATE · SCROLL TO ZOOM · CLICK A TOWER";
  overlay.appendChild(instructions);
  const goalLabel = document.createElement("div");
  goalLabel.style.cssText = "position:absolute;display:none;transform:translate(-50%,-100%);padding:5px 8px;border:1px solid rgba(244,189,88,.4);border-radius:8px;background:rgba(3,8,12,.9);color:#f4bd58;font:800 8px -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.05em;white-space:nowrap";
  goalLabel.textContent = "$20K VERIFIED MONTHLY PROFIT";
  overlay.appendChild(goalLabel);
  const goalWorld = new THREE.Vector3(0, 13, 0);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let selectedId = null;
  let down = null;
  const projected = new THREE.Vector3();

  function updateLabels() {
    const rect = viewport.getBoundingClientRect();
    labels.forEach(item => {
      projected.copy(item.world).project(camera);
      const visible = projected.z < 1 && (item.executive || item.agentId === selectedId || camera.position.length() < 125);
      item.element.style.display = visible ? "block" : "none";
      if (!visible) return;
      item.element.style.left = `${(projected.x * .5 + .5) * rect.width}px`;
      item.element.style.top = `${(-projected.y * .5 + .5) * rect.height}px`;
      item.element.style.zIndex = item.agentId === selectedId ? "8" : "4";
    });
    projected.copy(goalWorld).project(camera);
    goalLabel.style.display = projected.z < 1 ? "block" : "none";
    goalLabel.style.left = `${(projected.x * .5 + .5) * rect.width}px`;
    goalLabel.style.top = `${(-projected.y * .5 + .5) * rect.height}px`;
  }

  function render() {
    controls.update();
    renderer.render(scene, camera);
    updateLabels();
  }

  function selectAgent(agentId) {
    selectedId = agentId;
    towers.forEach(tower => tower.group.scale.setScalar(tower.agentId === agentId ? 1.08 : 1));
    updateInspector(agentId);
    render();
  }

  controls.addEventListener("change", render);
  canvas.addEventListener("pointerdown", event => { down = { x: event.clientX, y: event.clientY }; canvas.style.cursor = "grabbing"; });
  canvas.addEventListener("pointerup", event => {
    canvas.style.cursor = "grab";
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(towers.map(item => item.group), true);
    if (!hits.length) return;
    let node = hits[0].object;
    while (node.parent && !node.userData.agentId) node = node.parent;
    if (node.userData.agentId) selectAgent(node.userData.agentId);
  });
  canvas.addEventListener("pointerleave", () => { canvas.style.cursor = "grab"; });

  const onResize = () => {
    if (!viewport.isConnected) return;
    const nextWidth = Math.max(320, viewport.clientWidth);
    const nextHeight = Math.max(440, viewport.clientHeight || 620);
    camera.aspect = nextWidth / nextHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(nextWidth, nextHeight, false);
    render();
  };
  window.addEventListener("resize", onResize);

  cityState = {
    selectAgent,
    dispose() {
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      canvas.remove();
      overlay.remove();
    }
  };
  window.ROWAN_SELECT_AGENT = selectAgent;
  document.getElementById("cityLoading")?.remove();
  render();
  if (towers.length) selectAgent(data.team.find(item => item.configured)?.id || data.team[0]?.id);
}

export async function bootCity3D() {
  if (cityBooting || !window.DATA) return;
  const viewport = document.querySelector(".city-viewport");
  if (!viewport || viewport.clientWidth < 20) return;
  cityBooting = true;
  try { await createCity(viewport, window.DATA); }
  catch (error) {
    console.error("[ROWAN] Agent City failed", error);
    const loading = document.getElementById("cityLoading");
    if (loading) loading.textContent = `Agent City unavailable: ${error.message}`;
  } finally { cityBooting = false; }
}

globalThis.bootCity3D = bootCity3D;
document.addEventListener("rowan:data-ready", () => {
  if (location.hash === "#city") setTimeout(bootCity3D, 60);
});
