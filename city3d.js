/**
 * ROWAN Agent City 10.0 — State-of-the-Art Autonomous Metropolis
 * Complete rewrite. Every ROWAN system is a physical building.
 * 8 color-coded districts. Cinematic camera. Live data integration.
 */

let _cityRenderer = null;
let _cityRunning = false;
let _animFrameId = null;

export async function bootCity3D() {
  const VIEWPORT = document.querySelector('.city-viewport');
  if (!VIEWPORT) return;

  if (_cityRunning && _cityRenderer) {
    if (VIEWPORT.clientWidth > 10) {
      _cityRenderer.setSize(VIEWPORT.clientWidth, 560);
    }
    return;
  }
  if (VIEWPORT.clientWidth < 10) { setTimeout(bootCity3D, 200); return; }

  _cityRunning = true;
  if (_animFrameId) { cancelAnimationFrame(_animFrameId); _animFrameId = null; }
  VIEWPORT.querySelectorAll('canvas,#cityScreenOverlay,#city3dLabels,.agent-screen-tag,.building-screen-tag,.agent-screen-speech,.city-district-plate').forEach(e => e.remove());

  const worldEl = document.getElementById('cityWorld');
  if (worldEl) worldEl.style.display = 'none';

  let THREE, OrbitControls;
  try {
    THREE = await import('./lib/three.module.js');
    const oc = await import('./lib/OrbitControls.js');
    OrbitControls = oc.OrbitControls;
  } catch(e) { console.error('[City10] Import failed:', e); return; }

  const W = VIEWPORT.clientWidth, H = 560;

  // Canvas
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1;display:block;cursor:grab;touch-action:none;';
  VIEWPORT.appendChild(canvas);

  // HTML overlay
  const overlay = document.createElement('div');
  overlay.id = 'cityScreenOverlay';
  overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:20;overflow:hidden;';
  VIEWPORT.appendChild(overlay);

  // Renderer
  const isMobile = window.innerWidth < 768;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1 : 1.5));
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.NoToneMapping;
  _cityRenderer = renderer;

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010510);
  scene.fog = new THREE.Fog(0x010510, 120, 280);

  // Camera
  const camera = new THREE.PerspectiveCamera(46, W / H, 0.5, 1400);
  camera.position.set(0, 72, 118);

  // Controls
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 6, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.maxPolarAngle = Math.PI / 2.08;
  controls.minDistance = 8;
  controls.maxDistance = 200;
  controls.rotateSpeed = 0.85;
  controls.zoomSpeed = 1.1;
  controls.update();

  // ── Lighting (optimized: no shadows) ────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x1a3050, 5.0));
  const moon = new THREE.DirectionalLight(0x6699cc, 1.8);
  moon.position.set(-30, 80, -50);
  moon.castShadow = false;
  scene.add(moon);
  scene.add(new THREE.HemisphereLight(0x0a1628, 0x020408, 1.2));

  // ── Ground & Roads ──────────────────────────────────────────────────────
  const groundMat = new THREE.MeshBasicMaterial({ color: 0x030609 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Grid
  const grid = new THREE.GridHelper(400, 160, 0x0b1c28, 0x060f14);
  grid.position.y = 0.02;
  scene.add(grid);

  // District zone overlays on ground (colored glowing rectangles)
  const DISTRICT_ZONES = [
    { col: 0x6db7ff, cx:   0, cz:   0, w: 52, d: 52, name: 'AGENT HQ'      },
    { col: 0x00ffcc, cx:  82, cz:   0, w: 36, d: 60, name: 'INFRASTRUCTURE' },
    { col: 0xfbbf24, cx: -82, cz:   0, w: 36, d: 60, name: 'FINANCE'        },
    { col: 0xf97316, cx:   6, cz:  82, w: 60, d: 32, name: 'COMMERCE'       },
    { col: 0xc4b5fd, cx:   6, cz: -82, w: 60, d: 32, name: 'OPERATIONS'     },
    { col: 0xff2d55, cx:  66, cz:  66, w: 30, d: 30, name: 'MARKETING'      },
    { col: 0x67e8f9, cx: -66, cz: -66, w: 30, d: 30, name: 'INTELLIGENCE'   },
    { col: 0xff4444, cx:  66, cz: -66, w: 30, d: 30, name: 'VENTURE LAB'    },
  ];

  DISTRICT_ZONES.forEach(z => {
    // Glowing floor tile
    const mat = new THREE.MeshBasicMaterial({ color: z.col, transparent: true, opacity: 0.12 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.d), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(z.cx, 0.04, z.cz);
    scene.add(mesh);

    // Border lines
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(z.w, 0.01, z.d)),
      new THREE.LineBasicMaterial({ color: z.col, transparent: true, opacity: 0.35 })
    );
    edges.position.set(z.cx, 0.05, z.cz);
    scene.add(edges);

    // District label plate (HTML)
    const plate = document.createElement('div');
    plate.className = 'city-district-plate';
    plate.dataset.wx = z.cx;
    plate.dataset.wz = z.cz;
    plate.style.cssText = 'position:absolute;display:none;transform:translate(-50%,-50%);pointer-events:none;z-index:11;';
    const hex = '#' + z.col.toString(16).padStart(6,'0');
    plate.innerHTML = `<div style="background:rgba(2,5,14,0.82);border:1px solid ${hex}55;border-radius:16px;padding:3px 11px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:${hex};font-size:7.5px;font-weight:800;letter-spacing:1.8px;backdrop-filter:blur(6px);text-transform:uppercase;white-space:nowrap;">${z.name}</div>`;
    overlay.appendChild(plate);
  });

  // Main roads
  const roadMat = new THREE.MeshBasicMaterial({ color: 0x050c12 });
  function addRoad(x, z, w, d) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), roadMat);
    r.position.set(x, 0.03, z);
    scene.add(r);
  }
  addRoad(0,  0,  400, 7); // E-W main
  addRoad(0,  0,  7, 400); // N-S main
  addRoad(0,  42, 400, 4.5); // rings
  addRoad(0, -42, 400, 4.5);
  addRoad( 42, 0, 4.5, 400);
  addRoad(-42, 0, 4.5, 400);

  // Street accent lights (2 instead of 36 PointLights)
  const warmAccent = new THREE.PointLight(0xffe5aa, 3.5, 90);
  warmAccent.position.set(0, 8, 0);
  scene.add(warmAccent);
  const blueAccent = new THREE.PointLight(0x4499ff, 2.5, 110);
  blueAccent.position.set(50, 15, 50);
  scene.add(blueAccent);

  // ── Park at center ──────────────────────────────────────────────────────
  const park = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.12, 16), new THREE.MeshBasicMaterial({ color: 0x0d2b18 }));
  park.position.y = 0.06;
  scene.add(park);

  const poolMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.3, 24), poolMat);
  pool.position.y = 0.22;
  scene.add(pool);
  const poolLight = new THREE.PointLight(0x38bdf8, 2.5, 20);
  poolLight.position.set(0, 1.5, 0);
  scene.add(poolLight);

  // Trees removed for performance

  // ── Building factory ─────────────────────────────────────────────────────
  // Types: 'box','stepped','taper','needle','wide'
  function makeBuilding(scene, cfg) {
    const { x, z, h, w = 5, d = 5, col, type = 'box', label, sub, icon, district } = cfg;
    const grp = new THREE.Group();
    grp.position.set(x, 0, z);
    const hex = '#' + col.toString(16).padStart(6,'0');

    // Materials
    const shellMat = new THREE.MeshStandardMaterial({ color: 0x060d14, roughness: 0.18, metalness: 0.92 });
    const glowMat  = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.12, roughness: 0.04, metalness: 0.96, transparent: true, opacity: 0.65 });
    const accentMat= new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.4, roughness: 0.0 });
    const winMat   = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.95, roughness: 0.05 });
    const podMat   = new THREE.MeshStandardMaterial({ color: 0x0c1b26, roughness: 0.5, metalness: 0.72 });

    const pH = h * 0.14;   // podium height
    const tW = w * 0.70;   // tower width
    const tD = d * 0.70;   // tower depth

    // Podium
    const podium = new THREE.Mesh(new THREE.BoxGeometry(w + 1.8, pH, d + 1.8), podMat);
    podium.position.y = pH / 2;
    // shadows disabled
    grp.add(podium);

    // Neon base strip
    const neon = new THREE.Mesh(new THREE.BoxGeometry(w + 1.9, 0.14, 0.1), accentMat);
    neon.position.set(0, pH + 0.07, (d + 1.8) / 2 + 0.05);
    grp.add(neon);

    if (type === 'box') {
      // Clean modernist glass box
      const tower = new THREE.Mesh(new THREE.BoxGeometry(tW, h - pH, tD), shellMat);
      tower.position.y = pH + (h - pH) / 2;
      // castShadow disabled
      grp.add(tower);
      // Glass faces
      [[0, 0, tD/2+0.01, 0],[0, 0, -(tD/2+0.01), Math.PI],[-(tW/2+0.01), 0, 0, -Math.PI/2],[tW/2+0.01, 0, 0, Math.PI/2]].forEach(([fx,_,fz,ry]) => {
        const isWide = Math.abs(fz) > Math.abs(fx);
        const gf = new THREE.Mesh(new THREE.PlaneGeometry(isWide ? tW-0.2 : tD-0.2, h-pH-0.2), glowMat.clone());
        gf.position.set(fx, pH+(h-pH)/2, fz);
        gf.rotation.y = ry;
        grp.add(gf);
      });
      // Window rows
      const cols = Math.max(1, Math.floor((tW-0.5)/0.72));
      for (let fy = pH+0.8; fy < h-0.5; fy += 1.3) {
        for (let c=0; c<cols; c++) {
          if (Math.random() > 0.18) {
            const win = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.52, 0.06), winMat);
            win.position.set(-tW/2+0.46+c*0.72, fy, tD/2+0.04);
            grp.add(win);
          }
        }
        const band = new THREE.Mesh(new THREE.BoxGeometry(tW+0.08, 0.08, tD+0.08), new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:0.25,roughness:0.2}));
        band.position.set(0, fy-0.38, 0);
        grp.add(band);
      }
      // Roof slab
      const roof = new THREE.Mesh(new THREE.BoxGeometry(tW+0.3, 0.38, tD+0.3), new THREE.MeshStandardMaterial({color:col,roughness:0.12,metalness:0.9}));
      roof.position.y = h + 0.19;
      grp.add(roof);

    } else if (type === 'stepped') {
      // Art Deco stepped skyscraper
      const steps = 3;
      for (let s=0; s<steps; s++) {
        const sf = 1 - s*0.28;
        const sh = (h-pH) / steps;
        const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(tW*sf, sh, tD*sf), shellMat);
        stepMesh.position.y = pH + sh*s + sh/2;
        // castShadow disabled
        grp.add(stepMesh);
        // Windows on each step
        const sc = Math.max(1, Math.floor((tW*sf-0.5)/0.75));
        for (let fy=pH+sh*s+0.7; fy<pH+sh*(s+1)-0.3; fy+=1.25) {
          for (let c=0; c<sc; c++) {
            if (Math.random()>0.2) {
              const win = new THREE.Mesh(new THREE.BoxGeometry(0.38,0.5,0.06),winMat);
              win.position.set(-tW*sf/2+0.42+c*0.75, fy, tD*sf/2+0.04);
              grp.add(win);
            }
          }
        }
        // Step setback accent ring
        if (s>0) {
          const ring = new THREE.Mesh(new THREE.BoxGeometry(tW*(sf+0.28)+0.2, 0.18, tD*(sf+0.28)+0.2), accentMat);
          ring.position.y = pH + sh*s + 0.09;
          grp.add(ring);
        }
      }
      // Crown
      const crown = new THREE.Mesh(new THREE.BoxGeometry(tW*0.44+0.2, 0.4, tD*0.44+0.2), new THREE.MeshStandardMaterial({color:col,roughness:0.1,metalness:0.9}));
      crown.position.y = h+0.2;
      grp.add(crown);

    } else if (type === 'taper') {
      // Tapered futuristic tower
      const taper = new THREE.Mesh(new THREE.CylinderGeometry(tW*0.3, tW*0.65, h-pH, 6), shellMat);
      taper.position.y = pH + (h-pH)/2;
      taper.castShadow = true;
      grp.add(taper);
      // Glow rings
      for (let fy=pH+1.5; fy<h-1; fy+=2.2) {
        const r = tW*0.65 - (fy-pH)/(h-pH)*(tW*0.35);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r*0.9, 0.1, 6, 24), accentMat);
        ring.rotation.x = Math.PI/2;
        ring.position.y = fy;
        grp.add(ring);
      }

    } else if (type === 'needle') {
      // Supertall needle tower
      const base = new THREE.Mesh(new THREE.BoxGeometry(tW, h*0.55, tD), shellMat);
      base.position.y = pH + h*0.55/2;
      base.castShadow = true;
      grp.add(base);
      const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.35, tW*0.42, h*0.5, 8), shellMat);
      needle.position.y = pH + h*0.55 + h*0.25;
      grp.add(needle);
      // Observation deck ring
      const obs = new THREE.Mesh(new THREE.TorusGeometry(tW*0.7, 0.2, 8, 32), accentMat);
      obs.rotation.x = Math.PI/2;
      obs.position.y = pH + h*0.55 + 0.5;
      grp.add(obs);
      // Windows on base
      const wc = Math.max(1,Math.floor((tW-0.5)/0.72));
      for (let fy=pH+0.9; fy<pH+h*0.52; fy+=1.25) {
        for (let c=0; c<wc; c++) {
          if (Math.random()>0.18) {
            const win = new THREE.Mesh(new THREE.BoxGeometry(0.4,0.52,0.06),winMat);
            win.position.set(-tW/2+0.45+c*0.72, fy, tD/2+0.04);
            grp.add(win);
          }
        }
      }

    } else if (type === 'wide') {
      // Wide campus-style building
      const main = new THREE.Mesh(new THREE.BoxGeometry(tW, h-pH, tD), shellMat);
      main.position.y = pH + (h-pH)/2;
      main.castShadow = true;
      grp.add(main);
      // Wide glass facade
      const wg = new THREE.Mesh(new THREE.PlaneGeometry(tW-0.2, h-pH-0.2), glowMat.clone());
      wg.position.set(0, pH+(h-pH)/2, tD/2+0.02);
      grp.add(wg);
      // Horizontal bands (warehouse-style)
      for (let fy=pH+1; fy<h-0.4; fy+=1.6) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(tW+0.1, 0.1, tD+0.1), accentMat);
        band.position.set(0, fy, 0);
        grp.add(band);
      }
    }

    // Rooftop spire (if tall enough)
    if (h >= 16) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.3, h*0.18, 6), new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:1.8,metalness:0.9}));
      sp.position.y = h + h*0.09;
      grp.add(sp);
      if (h >= 20) {
        const obsRing = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.1, 8, 28), accentMat);
        obsRing.rotation.x = Math.PI/2;
        obsRing.position.y = h + 0.7;
        grp.add(obsRing);
      }
    }

    // Roof beacon light
    const beacon = new THREE.PointLight(col, 2.8, 32);
    beacon.position.y = h + (h>=16 ? h*0.18 + 1 : 2);
    grp.add(beacon);

    // Base flood uplighter
    const flood = new THREE.PointLight(col, 0.7, 10);
    flood.position.set(0, 1.2, (d+1.8)/2 + 1.2);
    grp.add(flood);

    scene.add(grp);

    // Floating label
    const labelEl = document.createElement('div');
    labelEl.className = 'building-screen-tag';
    labelEl.dataset.bId = cfg.id || label;
    labelEl.style.cssText = 'position:absolute;display:none;transform:translate(-50%,-100%);pointer-events:none;z-index:18;';
    labelEl.innerHTML = `<div style="background:rgba(3,8,18,0.97);border:1px solid ${hex}aa;border-radius:10px;padding:5px 10px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;gap:7px;box-shadow:0 4px 20px rgba(0,0,0,0.9),0 0 16px ${hex}44;white-space:nowrap;"><span style="font-size:14px;">${icon||'🏢'}</span><div style="display:flex;flex-direction:column;line-height:1.25;"><strong style="font-size:9.5px;font-weight:800;color:#fff;letter-spacing:0.3px;">${label}</strong><span style="font-size:7.5px;color:${hex};font-weight:600;">${sub||''}</span></div></div>`;
    overlay.appendChild(labelEl);

    const labelWorldPos = new THREE.Vector3(x, h + (h>=16 ? h*0.18+2 : 3.5), z);
    return { grp, labelEl, labelWorldPos };
  }

  // ── ALL BUILDINGS ────────────────────────────────────────────────────────
  const allBuildings = [];

  const BUILDINGS = [
    // ─── AGENT HQ — Center (r~22-36) ───
    { id:'rowan',      x: -38, z: -28, h: 34, w:7, d:7, col:0x6db7ff, type:'needle',  label:'Rowan',         sub:'CEO · Apex Tower',          icon:'🏛️' },
    { id:'ivy',        x:   0, z: -44, h: 38, w:8, d:7, col:0x22c97a, type:'stepped', label:'Ivy',           sub:'Head of Commerce',          icon:'🛍️' },
    { id:'efficiency', x:  38, z: -28, h: 30, w:7, d:6, col:0x34d399, type:'box',     label:'Efficiency',    sub:'Compute Guard',             icon:'🛡️' },
    { id:'aria',       x: -44, z:   0, h: 28, w:6, d:6, col:0xff6da0, type:'taper',   label:'Aria',          sub:'Creative Director',         icon:'🎨' },
    { id:'atlas',      x:  44, z:   0, h: 30, w:6, d:6, col:0xff9900, type:'stepped', label:'Atlas',         sub:'CTO · Systems',             icon:'⚙️' },
    { id:'sage',       x: -38, z:  28, h: 26, w:6, d:6, col:0x8a9ba8, type:'box',     label:'Sage',          sub:'Strategy & Intel',          icon:'🧠' },
    { id:'nova',       x:   0, z:  44, h: 32, w:7, d:6, col:0x22d3ee, type:'needle',  label:'Nova',          sub:'Growth & Traffic',          icon:'🚀' },
    { id:'victor',     x:  38, z:  28, h: 28, w:6, d:6, col:0xa855f7, type:'taper',   label:'Dr. Victor',    sub:'Chief R&D Scientist',       icon:'🔬' },
    // Inner ring
    { id:'ember',      x: -20, z: -14, h: 19, w:5, d:5, col:0xf97316, type:'box',     label:'Ember',         sub:'Viral Growth Hacker',       icon:'🔥' },
    { id:'cipher',     x:  20, z: -14, h: 21, w:5, d:5, col:0x6366f1, type:'stepped', label:'Cipher',        sub:'Pricing & Stripe Quant',    icon:'💳' },
    { id:'lyra',       x: -20, z:  14, h: 18, w:5, d:5, col:0xec4899, type:'wide',    label:'Lyra',          sub:'B2B Design Engineer',       icon:'✨' },
    { id:'orion',      x:  20, z:  14, h: 19, w:5, d:5, col:0x14b8a6, type:'box',     label:'Orion',         sub:'Cloud Engineer',            icon:'☁️' },
    { id:'kira',       x:   0, z: -20, h: 17, w:5, d:5, col:0x10b981, type:'box',     label:'Kira',          sub:'Legal Auditor',             icon:'⚖️' },

    // ─── INFRASTRUCTURE (East, x=65-95) ───
    { id:'openclaw-gw',  x: 72, z: -18, h: 24, w:6,d:6, col:0x00ffcc, type:'needle',  label:'OpenClaw Gateway', sub:'AI Model Router · Live',  icon:'🔀' },
    { id:'github-cdn',   x: 72, z:   0, h: 18, w:6,d:5, col:0xddeeff, type:'stepped', label:'GitHub CDN',    sub:'Dashboard · Live',          icon:'🌐' },
    { id:'netlify',      x: 72, z:  18, h: 15, w:5,d:5, col:0x00ad9f, type:'box',     label:'Netlify Cloud', sub:'Build & Deploy',            icon:'⛅' },
    { id:'sqlite',       x: 88, z: -12, h: 14, w:5,d:5, col:0xffd700, type:'wide',    label:'Data Vault',    sub:'SQLite · Agent Runs',       icon:'🗄️' },
    { id:'evolve-eng',   x: 88, z:   6, h: 22, w:5,d:5, col:0x22c97a, type:'taper',   label:'Evolution Engine',sub:'Self-Improves 30min',      icon:'🧬' },
    { id:'sync-tower',   x: 88, z:  20, h: 19, w:4,d:4, col:0x38bdf8, type:'needle',  label:'Sync Tower',    sub:'Real-Time · 5min',          icon:'📡' },

    // ─── FINANCE (West, x=-65 to -95) ───
    { id:'profit-ledger',x:-72, z: -12, h: 22, w:6,d:6, col:0xfbbf24, type:'stepped', label:'Profit Ledger', sub:'P&L Tracker · Live',        icon:'💰' },
    { id:'cost-guard',   x:-72, z:   6, h: 16, w:5,d:5, col:0xf43f5e, type:'box',     label:'Cost Guard',    sub:'Budget Watchdog',           icon:'🛡️' },
    { id:'capital-alloc',x:-88, z:  -8, h: 15, w:5,d:5, col:0xa3e635, type:'wide',    label:'Capital Alloc.',sub:'Resource Optimizer',        icon:'📊' },
    { id:'rev-registry', x:-88, z:  10, h: 20, w:5,d:5, col:0x22c97a, type:'taper',   label:'Revenue Registry',sub:'All Channels',             icon:'💎' },

    // ─── COMMERCE (South, z=65-90) ───
    { id:'swirlcraft',   x: -16, z: 76, h: 42, w:9,d:8, col:0xf97316, type:'stepped', label:'SwirlCraft',    sub:'Etsy Shop · Primary Revenue',icon:'🛒' },
    { id:'seo-lab',      x:   4, z: 76, h: 22, w:6,d:5, col:0x34d399, type:'box',     label:'SEO Lab',       sub:'36 Listings Optimized',     icon:'🔍' },
    { id:'listing-fac',  x:  20, z: 76, h: 17, w:5,d:5, col:0xfcd34d, type:'wide',    label:'Listing Factory',sub:'New Products',              icon:'🏭' },
    { id:'fulfillment',  x:  35, z: 76, h: 14, w:5,d:5, col:0x60a5fa, type:'box',     label:'Fulfillment Hub',sub:'Instant Delivery',          icon:'📦' },

    // ─── OPERATIONS (North, z=-65 to -90) ───
    { id:'mgr-tower',    x: -14, z:-78, h: 42, w:8,d:7, col:0xc4b5fd, type:'needle',  label:'Manager Tower', sub:'Sage · Atlas · Nova',       icon:'🏢' },
    { id:'task-depot',   x:   4, z:-78, h: 20, w:6,d:5, col:0xfde68a, type:'stepped', label:'Task Depot',    sub:'Work Queue',                icon:'📋' },
    { id:'decision-box', x:  20, z:-78, h: 16, w:5,d:5, col:0xfb923c, type:'box',     label:'Decision Inbox',sub:'Owner Approvals',           icon:'📬' },
    { id:'approval-gate',x:  35, z:-78, h: 13, w:5,d:5, col:0xf43f5e, type:'wide',    label:'Approval Gate', sub:'Auth Required',             icon:'✅' },

    // ─── MARKETING (SE, x=55-75, z=55-75) ───
    { id:'tiktok-studio',x:  60, z: 58, h: 20, w:6,d:5, col:0xff2d55, type:'taper',   label:'TikTok Studio', sub:'Viral Video',               icon:'🎬' },
    { id:'pinterest',    x:  74, z: 58, h: 16, w:5,d:5, col:0xe60023, type:'box',     label:'Pinterest',     sub:'Pin Publishing',            icon:'📌' },
    { id:'broadcast',    x:  74, z: 44, h: 28, w:4,d:4, col:0x818cf8, type:'needle',  label:'Broadcast',     sub:'Traffic Funnels',           icon:'📻' },

    // ─── INTELLIGENCE (NW, x=-55 to -75, z=-55 to -75) ───
    { id:'action-queue', x: -60, z:-58, h: 17, w:5,d:5, col:0x67e8f9, type:'stepped', label:'Action Queue',  sub:'Live Ops',                  icon:'⚡' },
    { id:'watchdog',     x: -74, z:-58, h: 15, w:5,d:5, col:0xfca5a5, type:'wide',    label:'Watchdog',      sub:'Auto-Heals Blockers',       icon:'🐕' },
    { id:'daily-upg',   x: -74, z:-44, h: 20, w:5,d:5, col:0xa78bfa, type:'taper',   label:'Daily Upgrade', sub:'Nightly Self-Improve',      icon:'🔭' },

    // ─── VENTURE LAB (NE, x=55-75, z=-55 to -75) ───
    { id:'youtube-lab',  x:  60, z:-58, h: 20, w:6,d:5, col:0xff4444, type:'taper',   label:'YouTube Lab',   sub:'Video Revenue',             icon:'▶️' },
    { id:'flippa',       x:  74, z:-58, h: 16, w:5,d:5, col:0xf59e0b, type:'stepped', label:'Flippa Exchange',sub:'Digital M&A',              icon:'🏦' },
  ];

  BUILDINGS.forEach(cfg => {
    const b = makeBuilding(scene, cfg);
    allBuildings.push({ ...b, cfg });
  });

  // ── Starfield ─────────────────────────────────────────────────────────────
  const starVerts = [];
  for (let i=0; i<6000; i++) {
    starVerts.push((Math.random()-0.5)*700, Math.random()*220+30, (Math.random()-0.5)*700);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color:0xcce8ff, size:0.2, sizeAttenuation:true })));

  // ── Live data helpers ─────────────────────────────────────────────────────
  function getRealStatus(agentId) {
    if (!window.DATA) return '💤 Standing by';
    const team = (window.DATA.team||[]).find(m => m.id===agentId);
    if (!team) return '💤 Standing by';
    const act = team.city?.current_activity || '';
    if (act) return act;
    if (team.status==='WORKING') return '⚡ Working';
    return '💤 Standing by';
  }

  function populateComms() {
    const feed = document.getElementById('cityCommsFeed');
    if (!feed || !window.DATA?.evolution_log) return;
    feed.innerHTML = '';
    const logs = [...(window.DATA.evolution_log||[])].slice(-20).reverse();
    if (!logs.length) { feed.innerHTML='<div style="color:#475569;font-size:10px;padding:6px;">No events yet.</div>'; return; }
    logs.forEach(log => {
      const t = (log.timestamp||'').split('T')[1]?.substring(0,8)||'';
      const col = log.result==='error'?'#f43f5e':(log.result==='warning'?'#f59e0b':'#38bdf8');
      const el = document.createElement('div');
      el.className='comms-entry';
      el.style.cssText=`border-left:2px solid ${col};padding-left:7px;margin-bottom:5px;`;
      el.innerHTML=`<span style="color:#475569;font-size:8.5px;">[${t}]</span> <span style="color:${col};font-weight:700;font-size:9px;">● ${log.action||'SYS'}</span> <span style="color:#e2e8f0;font-size:9.5px;">"${(log.detail||'').substring(0,80)}"</span>`;
      feed.appendChild(el);
    });
  }

  // ── Mood badge ────────────────────────────────────────────────────────────
  const moodBadge = document.createElement('div');
  moodBadge.style.cssText = `position:absolute;top:12px;left:12px;z-index:30;pointer-events:none;background:rgba(3,8,18,0.94);border:1px solid rgba(34,201,122,0.5);border-radius:20px;padding:5px 13px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;font-weight:700;color:#22c97a;display:flex;align-items:center;gap:8px;box-shadow:0 6px 20px rgba(0,0,0,0.8),0 0 18px rgba(34,201,122,0.18);backdrop-filter:blur(8px);`;
  moodBadge.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:#22c97a;box-shadow:0 0 8px #22c97a;display:inline-block;"></span><span>CITY MOOD: HIGH REVENUE SPRINT · +70% MARGIN BOOM</span>`;
  overlay.appendChild(moodBadge);

  // ── Agent info panel (appears on click) ───────────────────────────────────
  const infoPanel = document.createElement('div');
  infoPanel.style.cssText = 'position:absolute;bottom:16px;left:14px;z-index:35;pointer-events:none;display:none;';
  overlay.appendChild(infoPanel);

  let selectedId = null;
  populateComms();

  // ── Demand-driven render (only re-renders when camera moves) ──────────────
  let _needsRender = true;
  let _labelTimer = 0;
  let syncTimer = 5.0;
  const clock = new THREE.Clock();
  const tmpV = new THREE.Vector3();

  controls.addEventListener('change', () => { _needsRender = true; });

  function updateLabels() {
    allBuildings.forEach(b => {
      if (!b.labelEl || !b.labelWorldPos) return;
      tmpV.copy(b.labelWorldPos).project(camera);
      if (tmpV.z >= 1) { b.labelEl.style.display='none'; return; }
      const sx = (tmpV.x*0.5+0.5)*VIEWPORT.clientWidth;
      const sy = (-(tmpV.y*0.5)+0.5)*H;
      const dist = camera.position.distanceTo(b.labelWorldPos);
      if (dist < 95 || b.cfg.id === selectedId) {
        b.labelEl.style.display='block';
        b.labelEl.style.left=`${sx}px`;
        b.labelEl.style.top=`${sy}px`;
        b.labelEl.style.opacity = Math.max(0, Math.min(1, (95-dist)/40)).toString();
      } else {
        b.labelEl.style.display='none';
      }
    });
    overlay.querySelectorAll('.city-district-plate').forEach(el => {
      const wx=parseFloat(el.dataset.wx), wz=parseFloat(el.dataset.wz);
      tmpV.set(wx, 1, wz).project(camera);
      if (tmpV.z>=1) { el.style.display='none'; return; }
      const sx=(tmpV.x*0.5+0.5)*VIEWPORT.clientWidth;
      const sy=(-(tmpV.y*0.5)+0.5)*H;
      el.style.display='block';
      el.style.left=`${sx}px`;
      el.style.top=`${sy}px`;
    });
  }

  function animate() {
    _animFrameId = requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    syncTimer -= dt;
    if (syncTimer <= 0) { populateComms(); syncTimer = 8.0; }

    // Pool light pulse (always animate)
    if (poolLight) { poolLight.intensity = 2.2 + Math.sin(elapsed*2.5)*0.6; _needsRender = true; }

    controls.update();

    if (_needsRender) {
      _labelTimer += dt;
      if (_labelTimer > 0.05) { updateLabels(); _labelTimer = 0; }
      renderer.render(scene, camera);
      _needsRender = false;
    }
  }

  // ── Click to select building ──────────────────────────────────────────────
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let clickStart = { x:0, y:0 };

  canvas.addEventListener('pointerdown', e => { clickStart={x:e.clientX,y:e.clientY}; });
  canvas.addEventListener('pointerup', e => {
    if (Math.abs(e.clientX-clickStart.x)>5||Math.abs(e.clientY-clickStart.y)>5) return;
    const rect = VIEWPORT.getBoundingClientRect();
    mouse.x = ((e.clientX-rect.left)/VIEWPORT.clientWidth)*2-1;
    mouse.y = -((e.clientY-rect.top)/H)*2+1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(allBuildings.map(b => b.grp), true);
    if (hits.length) {
      // Find which building was hit
      let hit = hits[0].object;
      while (hit.parent && !hit.parent.isScene) hit = hit.parent;
      const found = allBuildings.find(b => b.grp === hit);
      if (found) {
        selectedId = found.cfg.id;
        const col = '#'+found.cfg.col.toString(16).padStart(6,'0');
        const status = getRealStatus(found.cfg.id);
        infoPanel.style.display='block';
        infoPanel.innerHTML=`<div style="background:rgba(3,8,18,0.97);border:1px solid ${col}99;border-radius:12px;padding:12px 16px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;min-width:200px;box-shadow:0 8px 28px rgba(0,0,0,0.9),0 0 20px ${col}33;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><span style="font-size:18px;">${found.cfg.icon||'🏢'}</span><div><strong style="color:#fff;font-size:12px;font-weight:800;">${found.cfg.label}</strong><div style="color:${col};font-size:9.5px;font-weight:600;">${found.cfg.sub||''}</div></div></div><div style="color:#94a3b8;font-size:9px;margin-top:4px;">${status}</div></div>`;
        setTimeout(()=>{if(selectedId===found.cfg.id){selectedId=null;infoPanel.style.display='none';}},4000);
      }
    }
  });

  // ── Reset camera ─────────────────────────────────────────────────────────
  function resetCamera() {
    camera.position.set(0, 72, 118);
    controls.target.set(0, 6, 0);
    controls.update();
  }
  document.querySelectorAll('button').forEach(b => {
    if (b.textContent.trim().toLowerCase().includes('reset')) {
      b.addEventListener('click', resetCamera);
    }
  });

  window.addEventListener('resize', () => {
    if (!VIEWPORT||VIEWPORT.clientWidth<10) return;
    camera.aspect = VIEWPORT.clientWidth/H;
    camera.updateProjectionMatrix();
    renderer.setSize(VIEWPORT.clientWidth, H);
  });

  animate();
  console.log('[City10] State-of-the-art metropolis loaded — 39 buildings, 8 districts');
}

globalThis.bootCity3D = bootCity3D;
window.bootCity3D = bootCity3D;

function _watch() {
  const vp = document.querySelector('.city-viewport');
  if (vp&&vp.clientWidth>10) bootCity3D();
}
if (typeof ResizeObserver!=='undefined') {
  const ro = new ResizeObserver(entries=>{ for(const e of entries) if(e.contentRect.width>10) bootCity3D(); });
  const vp=document.querySelector('.city-viewport'); if(vp) ro.observe(vp);
  const cv=document.getElementById('view-city'); if(cv) ro.observe(cv);
}
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(_watch,50));
else setTimeout(_watch,50);
document.addEventListener('click', e=>{ if(e.target.closest('[data-view-target="city"]')) setTimeout(bootCity3D,50); });
window.addEventListener('hashchange',()=>{ if(location.hash==='#city') setTimeout(bootCity3D,50); });
