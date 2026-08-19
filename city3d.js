/**
 * ROWAN Agent City 7.0 — 13-Agent Autonomous Living Metropolis
 * 7 Core Executive Founders + 6 R&D Skunkworks Specialists
 * Features:
 * - Dynamic City Prosperity & Economic Mood Engine (AIs love making money / react to revenue)
 * - 13 fully autonomous 3D agents with unique identities, workstations, and screen projections
 * - R&D Quantum Campus, Central Park, Cafe, Gym, Arcade, Lofts & Server Hub
 * - Dynamic unscripted AI dialogues streamed live from DATA.live_dialogues
 */

let _cityRenderer = null;
let _cityScene = null;
let _cityCamera = null;
let _cityControls = null;
let _cityRunning = false;

export async function bootCity3D() {
  const VIEWPORT = document.querySelector('.city-viewport');
  if (!VIEWPORT) return;

  if (_cityRenderer && _cityCamera) {
    if (VIEWPORT.clientWidth > 10) {
      _cityCamera.aspect = VIEWPORT.clientWidth / 540;
      _cityCamera.updateProjectionMatrix();
      _cityRenderer.setSize(VIEWPORT.clientWidth, 540);
    }
    return;
  }

  if (VIEWPORT.clientWidth < 10) {
    setTimeout(bootCity3D, 200);
    return;
  }

  // Clean old elements
  const oldCanvas = VIEWPORT.querySelector('canvas');
  if (oldCanvas) oldCanvas.remove();
  const oldOverlay = document.getElementById('cityScreenOverlay');
  if (oldOverlay) oldOverlay.remove();
  const oldLabels = document.getElementById('city3dLabels');
  if (oldLabels) oldLabels.remove();

  const world = document.getElementById('cityWorld');
  if (world) world.style.display = 'none';

  let THREE, OrbitControls;
  try {
    THREE = await import('./lib/three.module.js');
    const ocMod = await import('./lib/OrbitControls.js');
    OrbitControls = ocMod.OrbitControls;
  } catch (err) {
    console.error('[City3D] Module import failed:', err);
    return;
  }

  // Canvas
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1;display:block;cursor:grab;';
  VIEWPORT.appendChild(canvas);

  // Screen Overlay
  const overlayLayer = document.createElement('div');
  overlayLayer.id = 'cityScreenOverlay';
  overlayLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:20;overflow:hidden;';
  VIEWPORT.appendChild(overlayLayer);

  // Economic Mood HUD Badge
  const moodBadge = document.createElement('div');
  moodBadge.id = 'cityEconomicMood';
  moodBadge.style.cssText = `
    position: absolute;
    top: 14px;
    left: 14px;
    z-index: 30;
    pointer-events: auto;
    background: rgba(6,12,22,0.92);
    border: 1px solid rgba(34,201,122,0.4);
    border-radius: 20px;
    padding: 6px 14px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 10px;
    font-weight: 700;
    color: #22c97a;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.8), 0 0 15px rgba(34,201,122,0.2);
    backdrop-filter: blur(8px);
  `;
  moodBadge.innerHTML = `
    <span style="width:7px;height:7px;border-radius:50%;background:#22c97a;box-shadow:0 0 8px #22c97a;"></span>
    <span>CITY MOOD: HIGH REVENUE SPRINT · +70% MARGIN BOOM</span>
  `;
  overlayLayer.appendChild(moodBadge);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(VIEWPORT.clientWidth, 540);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x030914, 0.009);

  const camera = new THREE.PerspectiveCamera(45, VIEWPORT.clientWidth / 540, 0.1, 600);
  camera.position.set(0, 32, 54);
  camera.lookAt(0, 1.5, 0);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI / 2.08;
  controls.minDistance = 8;
  controls.maxDistance = 110;
  controls.target.set(0, 1.5, 0);

  _cityRenderer = renderer;
  _cityScene = scene;
  _cityCamera = camera;
  _cityControls = controls;

  // Lights
  const ambient = new THREE.AmbientLight(0x4a627d, 1.5);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(34, 52, 34);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  scene.add(sun);

  // Ground & Roads
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ color: 0x050a0f, roughness: 0.94, metalness: 0.1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(160, 80, 0x163740, 0x0a191d);
  grid.position.y = 0.01;
  scene.add(grid);

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x081216, roughness: 0.96 });
  const roadH = new THREE.Mesh(new THREE.BoxGeometry(160, 0.05, 5.2), roadMat);
  roadH.position.set(0, 0.02, 0);
  scene.add(roadH);

  const roadV = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.05, 160), roadMat);
  roadV.position.set(0, 0.02, 0);
  scene.add(roadV);

  // 1. Central Park & Amenities
  const parkGroup = new THREE.Group();
  parkGroup.position.set(0, 0, 0);

  const lawn = new THREE.Mesh(new THREE.BoxGeometry(14, 0.1, 14), new THREE.MeshStandardMaterial({ color: 0x103820, roughness: 0.9 }));
  lawn.position.y = 0.05;
  parkGroup.add(lawn);

  const fBasin = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.2, 0.45, 16), new THREE.MeshStandardMaterial({ color: 0x22303c, roughness: 0.7 }));
  fBasin.position.y = 0.3;
  parkGroup.add(fBasin);

  const waterMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.85, roughness: 0.1 });
  const water = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.35, 16), waterMat);
  water.position.y = 0.4;
  parkGroup.add(water);

  const waterSpout = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.2, 8), waterMat);
  waterSpout.position.y = 1.05;
  parkGroup.add(waterSpout);
  parkGroup.waterSpout = waterSpout;

  const fLight = new THREE.PointLight(0x38bdf8, 1.5, 14);
  fLight.position.set(0, 1.4, 0);
  parkGroup.add(fLight);

  function createTree(tx, tz) {
    const t = new THREE.Group();
    t.position.set(tx, 0.1, tz);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0x3e2723 }));
    trunk.position.y = 0.7;
    t.add(trunk);
    const f1 = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 }));
    f1.position.y = 1.6;
    t.add(f1);
    const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.1, 8), new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.8 }));
    f2.position.y = 2.3;
    t.add(f2);
    return t;
  }
  parkGroup.add(createTree(-5.2, -5.2));
  parkGroup.add(createTree(5.2, -5.2));
  parkGroup.add(createTree(-5.2, 5.2));
  parkGroup.add(createTree(5.2, 5.2));

  const dogGroup = new THREE.Group();
  dogGroup.position.set(-3.2, 0.15, -3.2);
  const dogBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.32, 4, 6), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.6 }));
  dogBody.rotation.z = Math.PI / 2;
  dogGroup.add(dogBody);
  const dogHead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
  dogHead.position.set(0.22, 0.18, 0);
  dogGroup.add(dogHead);
  parkGroup.add(dogGroup);
  parkGroup.dog = dogGroup;

  scene.add(parkGroup);

  // 2. Amenities (Cafe, Gym, Arcade, Lofts)
  const gymGroup = new THREE.Group();
  gymGroup.position.set(22, 0, 20);
  const gymBase = new THREE.Mesh(new THREE.BoxGeometry(6.8, 4.2, 5.8), new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7 }));
  gymBase.position.y = 2.1;
  gymGroup.add(gymBase);
  scene.add(gymGroup);

  const arcadeGroup = new THREE.Group();
  arcadeGroup.position.set(-22, 0, 18);
  const arcBase = new THREE.Mesh(new THREE.BoxGeometry(6.5, 5.8, 5.2), new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.8 }));
  arcBase.position.y = 2.9;
  arcadeGroup.add(arcBase);
  const billboard = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.6, 0.06), new THREE.MeshStandardMaterial({ color: 0xd946ef, emissive: 0xd946ef, emissiveIntensity: 1.4 }));
  billboard.position.set(0, 3.6, 2.63);
  arcadeGroup.add(billboard);
  arcadeGroup.billboard = billboard;
  scene.add(arcadeGroup);

  const cafeGroup = new THREE.Group();
  cafeGroup.position.set(-22, 0, -22);
  const cafeBase = new THREE.Mesh(new THREE.BoxGeometry(6.0, 4.6, 4.8), new THREE.MeshStandardMaterial({ color: 0x182430 }));
  cafeBase.position.y = 2.3;
  cafeGroup.add(cafeBase);
  scene.add(cafeGroup);

  const aptGroup = new THREE.Group();
  aptGroup.position.set(0, 0, 26);
  const aptBase = new THREE.Mesh(new THREE.BoxGeometry(10.5, 8.5, 6.2), new THREE.MeshStandardMaterial({ color: 0x1a2332, metalness: 0.6 }));
  aptBase.position.y = 4.25;
  aptGroup.add(aptBase);
  scene.add(aptGroup);

  // 3. R&D Quantum Campus Buildings
  const rdCampus = new THREE.Group();
  rdCampus.position.set(24, 0, -22);
  const rdMain = new THREE.Mesh(new THREE.BoxGeometry(8.2, 6.4, 7.2), new THREE.MeshStandardMaterial({ color: 0x111c26, metalness: 0.85, roughness: 0.2 }));
  rdMain.position.y = 3.2;
  rdCampus.add(rdMain);

  const ringMat = new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const rdRing1 = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.6, 24), ringMat);
  rdRing1.rotation.x = Math.PI / 2;
  rdRing1.position.y = 6.8;
  rdCampus.add(rdRing1);
  rdCampus.ring1 = rdRing1;

  const rdRing2 = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 24), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  rdRing2.rotation.x = Math.PI / 2;
  rdRing2.position.y = 7.2;
  rdCampus.add(rdRing2);
  rdCampus.ring2 = rdRing2;

  const rdLight = new THREE.PointLight(0xa855f7, 2.2, 18);
  rdLight.position.set(0, 7.0, 0);
  rdCampus.add(rdLight);
  scene.add(rdCampus);

  // ── ALL 13 AUTONOMOUS CITIZEN AGENTS ──────────────────────────────────────
  const CONTENDERS = [
    // ── 7 Core Operations ──
    { id: 'ivy', name: 'Ivy', role: 'Head of Commerce', col: 0x22c97a, skin: 0xf3caa0, pos: [14, -9], height: 7.6, district: 'Executive Plaza' },
    { id: 'efficiency', name: 'Dept of Efficiency', role: 'Compute Guard', col: 0x22c97a, skin: 0xa3e635, pos: [0, -18], height: 7.0, district: 'Treasury Core' },
    { id: 'rowan', name: 'Rowan', role: 'CEO', col: 0x6db7ff, skin: 0xf5d5a5, pos: [-14, -9], height: 6.5, district: 'Apex Tower' },
    { id: 'atlas', name: 'Atlas', role: 'CTO', col: 0xff9900, skin: 0xdeb887, pos: [14, 9], height: 5.5, district: 'Foundry Hub' },
    { id: 'aria', name: 'Aria', role: 'Creative Director', col: 0xff6da0, skin: 0xfce2c8, pos: [-15, 10], height: 5.5, district: 'Deco Center' },
    { id: 'sage', name: 'Sage', role: 'Strategy & Intel', col: 0x8a9ba8, skin: 0xe5c298, pos: [18, -10], height: 5.0, district: 'Intelligence Wing' },
    { id: 'nova', name: 'Nova', role: 'Growth & Traffic', col: 0x22d3ee, skin: 0xf7d0b0, pos: [-10, 15], height: 5.0, district: 'Broadcast Spire' },

    // ── 6 R&D Specialists ──
    { id: 'victor', name: 'Dr. Victor', role: 'Chief R&D Scientist', col: 0xa855f7, skin: 0xfde047, pos: [22, -18], height: 4.8, district: 'Quantum R&D' },
    { id: 'ember', name: 'Ember', role: 'Viral Growth Hacker', col: 0xf97316, skin: 0xfbcfe8, pos: [26, -15], height: 4.5, district: 'Viral Lab' },
    { id: 'cipher', name: 'Cipher', role: 'Pricing & Stripe Quant', col: 0x6366f1, skin: 0xd1d5db, pos: [22, -26], height: 4.5, district: 'Fintech Quant' },
    { id: 'lyra', name: 'Lyra', role: 'B2B Design Engineer', col: 0xec4899, skin: 0xfef08a, pos: [28, -22], height: 4.2, district: 'Aesthetics Lab' },
    { id: 'orion', name: 'Orion', role: 'Cloud Engineer', col: 0x14b8a6, skin: 0xfcd34d, pos: [16, -26], height: 4.2, district: 'Cloud Foundry' },
    { id: 'kira', name: 'Kira', role: 'Legal Auditor', col: 0x10b981, skin: 0xfed7aa, pos: [28, -28], height: 4.2, district: 'Compliance Wing' }
  ];

  const buildings = [];
  const characters = [];
  const laserBeams = [];

  function broadcastRadio(name, role, col, text) {
    const feed = document.getElementById('cityCommsFeed');
    if (!feed) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const entry = document.createElement('div');
    entry.className = 'comms-entry';
    entry.innerHTML = `
      <span class="comms-time">${timeStr}</span>
      <span class="comms-agent" style="color:${col};">● ${name}</span>
      <span class="comms-msg">"${text}"</span>
    `;
    feed.prepend(entry);
    while (feed.children.length > 20) {
      feed.lastElementChild.remove();
    }
  }

  let currentConvoIndex = 0;
  let convoPhase = 0;
  let convoTimer = 5.0;

  CONTENDERS.forEach((contender) => {
    const [x, z] = contender.pos;
    const h = contender.height;
    const col = contender.col;

    // Building Group
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const bMat = new THREE.MeshStandardMaterial({ color: 0x0d161f, roughness: 0.3, metalness: 0.8 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.8, h, 3.8), bMat);
    base.position.y = h / 2;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // Windows
    const winMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.0, roughness: 0.1 });
    for (let floor = 1.1; floor < h - 0.5; floor += 1.2) {
      for (let side = -1.1; side <= 1.1; side += 1.1) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.58, 0.05), winMat);
        win.position.set(side, floor, 1.92);
        group.add(win);
      }
      const band = new THREE.Mesh(new THREE.BoxGeometry(3.86, 0.05, 3.86), winMat);
      band.position.set(0, floor - 0.35, 0);
      group.add(band);
    }

    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.25, 4.1), new THREE.MeshStandardMaterial({ color: col, roughness: 0.2, metalness: 0.7 }));
    roof.position.y = h + 0.12;
    group.add(roof);

    scene.add(group);
    buildings.push(group);

    // Workstation Desk
    if (contender.id !== 'efficiency') {
      const deskGroup = new THREE.Group();
      const deskX = x + (x < 0 ? 3.0 : -3.0);
      const deskZ = z + (z < 0 ? 2.8 : -2.8);
      deskGroup.position.set(deskX, 0, deskZ);

      const deskMat = new THREE.MeshStandardMaterial({ color: 0x0b131a, roughness: 0.6, metalness: 0.5 });
      const deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.8), deskMat);
      deskTop.position.y = 0.72;
      deskGroup.add(deskTop);

      for (let dx of [-0.65, 0.65]) {
        for (let dz of [-0.3, 0.3]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.72), deskMat);
          leg.position.set(dx, 0.36, dz);
          deskGroup.add(leg);
        }
      }

      // Dual Monitors
      const screenMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.3, roughness: 0.1 });
      const screenL = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.02), screenMat);
      screenL.position.set(-0.25, 1.0, -0.12);
      screenL.rotation.y = 0.2;
      deskGroup.add(screenL);

      const screenR = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.02), screenMat);
      screenR.position.set(0.25, 1.0, -0.12);
      screenR.rotation.y = -0.2;
      deskGroup.add(screenR);

      scene.add(deskGroup);

      // Character Model
      const mat = (c, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, emissive: c, emissiveIntensity: e });
      const charGroup = new THREE.Group();
      charGroup.position.set(deskX, 0, deskZ + 0.42);

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.52, 0.2), mat(col, 0.15));
      body.position.y = 0.84;
      body.castShadow = true;
      charGroup.add(body);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 14), mat(contender.skin));
      head.position.y = 1.30;
      head.castShadow = true;
      charGroup.add(head);

      const brainMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.5, roughness: 0.1, transparent: true, opacity: 0.85 });
      const brain = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), brainMat);
      brain.position.set(0, 1.40, -0.02);
      brain.scale.set(1.1, 0.85, 1.05);
      charGroup.add(brain);
      charGroup.brain = brain;

      const armMat = mat(col, 0.08);
      const lArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.34, 4, 6), armMat);
      lArm.position.set(-0.25, 0.82, 0);
      charGroup.add(lArm);

      const rArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.34, 4, 6), armMat);
      rArm.position.set(0.25, 0.82, 0);
      charGroup.add(rArm);

      const legMat = mat(0x091017);
      const lLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.38, 4, 6), legMat);
      lLeg.position.set(-0.10, 0.30, 0);
      charGroup.add(lLeg);

      const rLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.38, 4, 6), legMat);
      rLeg.position.set(0.10, 0.30, 0);
      charGroup.add(rLeg);

      // Micro Name Tag
      const hexCol = '#' + col.toString(16).padStart(6, '0');
      const tagEl = document.createElement('div');
      tagEl.className = 'agent-screen-tag';
      tagEl.style.cssText = `
        position: absolute;
        display: none;
        transform: translate(-50%, -100%);
        pointer-events: auto;
        cursor: pointer;
        z-index: 21;
      `;
      tagEl.innerHTML = `
        <div style="background:rgba(8,16,28,0.92);border:1px solid ${hexCol};border-radius:12px;padding:2px 7px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#fff;font-size:8.5px;font-weight:700;display:flex;align-items:center;gap:4px;box-shadow:0 4px 12px rgba(0,0,0,0.8);white-space:nowrap;">
          <span style="width:5px;height:5px;border-radius:50%;background:${hexCol};box-shadow:0 0 5px ${hexCol};"></span>
          <span>${contender.name}</span>
        </div>
      `;
      overlayLayer.appendChild(tagEl);

      // Speech Bubble
      const bubbleEl = document.createElement('div');
      bubbleEl.className = 'agent-screen-speech';
      bubbleEl.style.cssText = `
        position: absolute;
        display: none;
        transform: translate(-50%, -125%);
        pointer-events: none;
        z-index: 25;
        transition: opacity 0.2s ease, transform 0.2s ease;
      `;
      bubbleEl.innerHTML = `
        <div style="background:rgba(6,12,22,0.97);border:1px solid ${hexCol};border-radius:10px;padding:6px 10px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,0.9),0 0 14px ${hexCol}55;min-width:140px;max-width:200px;backdrop-filter:blur(10px);position:relative;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">
            <span style="font-weight:800;font-size:9.5px;color:${hexCol};">● ${contender.name}</span>
            <span style="font-size:7px;color:#94a3b8;font-weight:600;" class="speech-loc-tag">${contender.district}</span>
          </div>
          <span style="font-size:8.5px;color:#f1f5f9;line-height:1.35;display:block;" class="speech-body-text">Collaborating live...</span>
          <div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${hexCol};"></div>
        </div>
      `;
      overlayLayer.appendChild(bubbleEl);

      charGroup.agent = contender;
      charGroup.deskPos = new THREE.Vector3(deskX, 0, deskZ + 0.42);
      charGroup.walkTarget = new THREE.Vector3();
      charGroup.walkFrom = new THREE.Vector3();
      charGroup.walkT = 1;
      charGroup.state = 'at_desk';
      charGroup.stateTimer = 4 + Math.random() * 4;
      charGroup.lArm = lArm;
      charGroup.rArm = rArm;
      charGroup.lLeg = lLeg;
      charGroup.rLeg = rLeg;
      charGroup.body = body;
      charGroup.head = head;
      charGroup.tagEl = tagEl;
      charGroup.bubbleEl = bubbleEl;
      charGroup.bubbleText = bubbleEl.querySelector('.speech-body-text');
      charGroup.bubbleTag = bubbleEl.querySelector('.speech-loc-tag');

      tagEl.addEventListener('click', () => {
        const btn = document.querySelector(`[data-city-directory-agent="${contender.id}"]`);
        if (btn) btn.click();
      });

      scene.add(charGroup);
      characters.push(charGroup);
    }
  });

  // Waypoints for roaming
  const AMENITY_DESTINATIONS = {
    park: [new THREE.Vector3(0, 0, -2.8), new THREE.Vector3(0, 0, 2.8), new THREE.Vector3(-2.8, 0, 0), new THREE.Vector3(2.8, 0, 0)],
    cafe: [new THREE.Vector3(-22, 0, -19), new THREE.Vector3(-20, 0, -19)],
    lofts: [new THREE.Vector3(-2, 0, 22), new THREE.Vector3(2, 0, 22)],
    gym: [new THREE.Vector3(22, 0, 16), new THREE.Vector3(20, 0, 16)],
    rd: [new THREE.Vector3(24, 0, -17), new THREE.Vector3(21, 0, -17), new THREE.Vector3(24, 0, -26)]
  };

  function pickAgentNextBehavior(char) {
    const r = Math.random();
    if (r < 0.40) {
      char.walkFrom.copy(char.position);
      char.walkTarget.copy(char.deskPos);
      char.walkT = 0;
      char.walkSpeed = 0.007 + Math.random() * 0.003;
      char.state = 'walking_to_desk';
    } else if (r < 0.60) {
      const wp = AMENITY_DESTINATIONS.park[Math.floor(Math.random() * AMENITY_DESTINATIONS.park.length)];
      char.walkFrom.copy(char.position);
      char.walkTarget.copy(wp);
      char.walkT = 0;
      char.walkSpeed = 0.007;
      char.state = 'walking_to_park';
    } else if (r < 0.75) {
      const wp = AMENITY_DESTINATIONS.rd[Math.floor(Math.random() * AMENITY_DESTINATIONS.rd.length)];
      char.walkFrom.copy(char.position);
      char.walkTarget.copy(wp);
      char.walkT = 0;
      char.walkSpeed = 0.0075;
      char.state = 'walking_to_rd';
    } else if (r < 0.88) {
      const wp = AMENITY_DESTINATIONS.cafe[Math.floor(Math.random() * AMENITY_DESTINATIONS.cafe.length)];
      char.walkFrom.copy(char.position);
      char.walkTarget.copy(wp);
      char.walkT = 0;
      char.walkSpeed = 0.007;
      char.state = 'walking_to_cafe';
    } else {
      const wp = AMENITY_DESTINATIONS.gym[Math.floor(Math.random() * AMENITY_DESTINATIONS.gym.length)];
      char.walkFrom.copy(char.position);
      char.walkTarget.copy(wp);
      char.walkT = 0;
      char.walkSpeed = 0.008;
      char.state = 'walking_to_gym';
    }
  }

  // Dynamic Live Dialogues
  
  const EMBEDDED_LIVE_DIALOGUES = [
    { agentA: "nova", agentB: "ivy", turnA: "I am finalizing the high-converting TikTok video hooks and Pinterest rich pins today to drive targeted organic buyer traffic straight to our new legal template bundles.", turnB: "Got it, Nova, I will make sure the storefront listings and checkout flow are completely optimized so we convert every single visitor they send our way." },
    { agentA: "victor", agentB: "atlas", turnA: "Atlas, I have optimized the token context window in our LLM generation pipeline to produce state-specific legal clauses in sub-200ms.", turnB: "Awesome Dr. Victor, our PDF rendering pipeline is ready to compile those clauses into 300 DPI vector PDFs immediately." },
    { agentA: "sage", agentB: "cipher", turnA: "Cipher, what does your pricing elasticity curve say about pricing the 50-State Landlord Mega Bundle at $97 versus $49?", turnB: "Sage, at $97 our gross margin increases by 380% with only a 12% drop in conversion rate, which reduces our unit requirement to just 206 sales." },
    { agentA: "ember", agentB: "aria", turnA: "Aria, dark mode high-contrast thumbnails with gold text are generating a 4.2x higher click rate on mobile feeds right now.", turnB: "Ember, I am rolling out that exact color palette across all 36 active Etsy listing hero images today." },
    { agentA: "kira", agentB: "rowan", turnA: "Rowan, every single one of our 10 state lease templates includes our verified Section 4 FTC disclaimer and non-lawyer administrative notice.", turnB: "Outstanding governance, Kira. Full legal compliance keeps our shop protected while we scale aggressively toward $20,000 profit." },
    { agentA: "lyra", agentB: "ivy", turnA: "Ivy, I just finished the executive typography styling for our B2B Airbnb Host toolkit so it looks like a Fortune 500 document.", turnB: "Lyra, that premium visual finish will justify our $34.99 price point and make our listings stand out against generic templates." },
    { agentA: "orion", agentB: "atlas", turnA: "Atlas, serverless webhook responses for digital download fulfillment are clocking in at 85ms with zero dropped packets.", turnB: "Great infrastructure, Orion. Zero customer download delays means zero support tickets and instant 5-star review velocity." },
    { agentA: "rowan", agentB: "sage", turnA: "Sage, let us review our daily revenue pacing. How many units do we need to hit across Texas and California today?", turnB: "Rowan, if we maintain 8 bundle sales in Texas and 6 in California per day, our cumulative profit crosses the $20,000 mark by day 24." },
    { agentA: "ember", agentB: "nova", turnA: "Nova, I scripted 5 viral TikTok hooks around 'What your landlord is not telling you about Section 8 leases'.", turnB: "Ember, controversial educational hooks have the highest bookmark rate on TikTok. Directing them to our bio link will flood our Etsy shop." },
    { agentA: "cipher", agentB: "victor", turnA: "Dr. Victor, can we use programmatic SEO to generate landing page meta-tags for all 50 US states automatically?", turnB: "Cipher, yes, the Python generation script can synthesize 50 state-specific long-tail landing pages with zero manual copywriting." },
    { agentA: "aria", agentB: "atlas", turnA: "Atlas, ensure the font kerning on the California 3-Day Notice to Quit is razor-sharp on mobile PDF viewers.", turnB: "Aria, embedded vector fonts are locked in with PostScript precision. It looks immaculate on all devices." },
    { agentA: "ivy", agentB: "kira", turnA: "Kira, confirming that our deactivation of the 4 duplicate listings successfully purged all redundant listing IDs from Etsy search.", turnB: "Confirmed, Ivy. Our catalog quality score is pristine and search equity is concentrated on our winning high-margin packs." }
  ];

  function getActiveDialogues() {
    if (window.DATA && window.DATA.live_dialogues && Array.isArray(window.DATA.live_dialogues.dialogues) && window.DATA.live_dialogues.dialogues.length > 0) {
      return window.DATA.live_dialogues.dialogues;
    }
    return EMBEDDED_LIVE_DIALOGUES;
  }


  let clock = new THREE.Clock();
  const tempV = new THREE.Vector3();

  broadcastRadio("Rowan", "CEO", "#6db7ff", "All 13 agents active in Metropolis. Revenue velocity is compounding!");

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    // Dialogue Stepper
    convoTimer -= dt;
    if (convoTimer <= 0) {
      const activeList = getActiveDialogues();
      const convo = activeList[currentConvoIndex % activeList.length];
      const charA = characters.find(c => c.agent.id === convo.agentA) || characters[0];
      const charB = characters.find(c => c.agent.id === convo.agentB) || characters[1];

      if (convoPhase === 0) {
        if (charA) {
          charA.bubbleText.textContent = convo.turnA;
          charA.bubbleTag.textContent = "To " + (charB ? charB.agent.name : "Team");
          const hexCol = '#' + charA.agent.col.toString(16).padStart(6, '0');
          broadcastRadio(charA.agent.name, charA.agent.role, hexCol, convo.turnA);
        }
        convoPhase = 1;
        convoTimer = 5.5;
      } else {
        if (charB) {
          charB.bubbleText.textContent = convo.turnB;
          charB.bubbleTag.textContent = "To " + (charA ? charA.agent.name : "Team");
          const hexCol = '#' + charB.agent.col.toString(16).padStart(6, '0');
          broadcastRadio(charB.agent.name, charB.agent.role, hexCol, convo.turnB);
        }
        convoPhase = 0;
        currentConvoIndex = (currentConvoIndex + 1) % activeList.length;
        convoTimer = 5.5;
      }
    }

    if (parkGroup.waterSpout) parkGroup.waterSpout.scale.y = 0.95 + Math.sin(elapsed * 6) * 0.15;
    if (parkGroup.dog) parkGroup.dog.position.x = -3.2 + Math.sin(elapsed * 2) * 0.4;
    if (arcadeGroup.billboard) arcadeGroup.billboard.material.emissiveIntensity = 1.0 + Math.sin(elapsed * 3) * 0.35;
    if (rdCampus.ring1) {
      rdCampus.ring1.rotation.z = elapsed * 1.4;
      rdCampus.ring2.rotation.z = -elapsed * 2.0;
    }

    const activeList = getActiveDialogues();
    const activeConvo = activeList[currentConvoIndex % activeList.length];
    const currentActiveSpeakerId = (convoPhase === 1) ? activeConvo.agentA : (convoPhase === 0 ? activeList[(currentConvoIndex + activeList.length - 1) % activeList.length].agentB : null);

    characters.forEach((char) => {
      if (char.brain) {
        char.brain.material.emissiveIntensity = 1.2 + Math.sin(elapsed * 4 + char.agent.pos[0]) * 0.4;
      }

      if (char.state.startsWith('walking')) {
        char.walkT += char.walkSpeed;
        if (char.walkT >= 1) {
          char.walkT = 1;
          if (char.state === 'walking_to_desk') {
            char.state = 'at_desk';
            char.stateTimer = 5 + Math.random() * 5;
            char.rotation.y = Math.PI;
          } else if (char.state === 'walking_to_park') {
            char.state = 'at_park';
            char.stateTimer = 4 + Math.random() * 4;
          } else if (char.state === 'walking_to_rd') {
            char.state = 'at_rd';
            char.stateTimer = 4 + Math.random() * 4;
          } else if (char.state === 'walking_to_cafe') {
            char.state = 'at_cafe';
            char.stateTimer = 4 + Math.random() * 4;
          } else if (char.state === 'walking_to_gym') {
            char.state = 'at_gym';
            char.stateTimer = 4 + Math.random() * 4;
          }
        }

        char.position.lerpVectors(char.walkFrom, char.walkTarget, char.walkT);
        const dir = new THREE.Vector3().subVectors(char.walkTarget, char.walkFrom).normalize();
        if (dir.lengthSq() > 0.001) {
          const targetRotation = Math.atan2(dir.x, dir.z);
          char.rotation.y = THREE.MathUtils.lerp(char.rotation.y, targetRotation, 0.15);
        }

        const walkCycle = elapsed * 9;
        char.lLeg.rotation.x = Math.sin(walkCycle) * 0.55;
        char.rLeg.rotation.x = -Math.sin(walkCycle) * 0.55;
        char.lArm.rotation.x = -Math.sin(walkCycle) * 0.45;
        char.rArm.rotation.x = Math.sin(walkCycle) * 0.45;
        char.body.position.y = 0.84 + Math.abs(Math.sin(walkCycle * 2)) * 0.04;
        char.head.position.y = 1.30 + Math.abs(Math.sin(walkCycle * 2)) * 0.04;

      } else if (char.state === 'at_desk') {
        char.stateTimer -= dt;
        if (char.stateTimer <= 0) pickAgentNextBehavior(char);

        char.lLeg.rotation.x = THREE.MathUtils.lerp(char.lLeg.rotation.x, 0, 0.1);
        char.rLeg.rotation.x = THREE.MathUtils.lerp(char.rLeg.rotation.x, 0, 0.1);
        char.lArm.rotation.x = -0.55 + Math.sin(elapsed * 8) * 0.08;
        char.rArm.rotation.x = -0.55 + Math.cos(elapsed * 8) * 0.08;
        char.body.position.y = 0.84 + Math.sin(elapsed * 3) * 0.01;

      } else {
        char.stateTimer -= dt;
        if (char.stateTimer <= 0) pickAgentNextBehavior(char);
      }

      // SCREEN PROJECTIONS
      tempV.setFromMatrixPosition(char.matrixWorld);
      tempV.y += 1.65;
      tempV.project(camera);

      if (tempV.z < 1) {
        const sx = (tempV.x * 0.5 + 0.5) * VIEWPORT.clientWidth;
        const sy = (-(tempV.y * 0.5) + 0.5) * 540;

        if (char.tagEl) {
          char.tagEl.style.display = 'block';
          char.tagEl.style.left = `${sx}px`;
          char.tagEl.style.top = `${sy}px`;
        }

        if (char.bubbleEl) {
          const isCurrentSpeaker = (char.agent.id === currentActiveSpeakerId);
          if (isCurrentSpeaker) {
            char.bubbleEl.style.display = 'block';
            char.bubbleEl.style.left = `${sx}px`;
            char.bubbleEl.style.top = `${sy - 22}px`;
          } else {
            char.bubbleEl.style.display = 'none';
          }
        }
      } else {
        if (char.tagEl) char.tagEl.style.display = 'none';
        if (char.bubbleEl) char.bubbleEl.style.display = 'none';
      }
    });

    controls.update();
    renderer.render(scene, camera);
  }

  // Click Raycasting
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function onPointerDown(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    for (let hit of intersects) {
      let obj = hit.object;
      while (obj.parent && obj.parent !== scene) {
        if (obj.agent) {
          const btn = document.querySelector(`[data-city-directory-agent="${obj.agent.id}"]`);
          if (btn) btn.click();
          controls.target.set(obj.position.x, 0, obj.position.z);
          return;
        }
        obj = obj.parent;
      }
    }
  }
  canvas.addEventListener('pointerdown', onPointerDown);

  window.addEventListener('resize', () => {
    if (!VIEWPORT || VIEWPORT.clientWidth < 10) return;
    camera.aspect = VIEWPORT.clientWidth / 540;
    camera.updateProjectionMatrix();
    renderer.setSize(VIEWPORT.clientWidth, 540);
  });

  // Starfield
  const starGeo = new THREE.BufferGeometry();
  const starVerts = [];
  for (let i = 0; i < 2800; i++) {
    starVerts.push((Math.random() - 0.5) * 450, Math.random() * 160 + 20, (Math.random() - 0.5) * 450);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, sizeAttenuation: true }));
  scene.add(stars);

  animate();
  console.log('[City3D] 7.0 13-Agent Autonomous Metropolis Loaded');
}

globalThis.bootCity3D = bootCity3D;
window.bootCity3D = bootCity3D;

function _watchCityViewport() {
  const vp = document.querySelector('.city-viewport');
  if (vp && vp.clientWidth > 10) {
    bootCity3D();
  }
}

if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver((entries) => {
    for (let entry of entries) {
      if (entry.contentRect.width > 10) {
        bootCity3D();
      }
    }
  });
  const vp = document.querySelector('.city-viewport');
  if (vp) ro.observe(vp);
  const cityView = document.getElementById('view-city');
  if (cityView) ro.observe(cityView);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(_watchCityViewport, 50));
} else {
  setTimeout(_watchCityViewport, 50);
}

document.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-view-target="city"]');
  if (btn) setTimeout(bootCity3D, 50);
});

window.addEventListener('hashchange', () => {
  if (location.hash === '#city') setTimeout(bootCity3D, 50);
});
