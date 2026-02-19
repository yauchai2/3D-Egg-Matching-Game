const gameCanvas = document.getElementById("gameCanvas");
const referenceCanvas = document.getElementById("referenceCanvas");
const matchValue = document.getElementById("matchValue");
const matchFill = document.getElementById("matchFill");
const targetMarker = document.getElementById("targetMarker");
const timerValue = document.getElementById("timerValue");

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const degToRad = (d) => (d * Math.PI) / 180;

let hasCelebrated = false;
let isAdvancingRound = false;
let timerEnded = false;
let timerStart = performance.now();
const TIMER_TOTAL_SECONDS = 179;
const TARGET_MATCH_PERCENT = 80;
const dropAnim = {
  active: false,
  start: 0,
  duration: 900,
  height: 1.7,
};

const pointerState = {
  dragging: false,
  mode: "rotate",
  lastX: 0,
  lastY: 0,
};

const activePointers = new Map();
const gestureState = {
  isMultiTouch: false,
  lastCenter: null,
  lastDistance: 0,
};

const targetState = {
  quat: new THREE.Quaternion(),
  pos: new THREE.Vector3(0, -0.05, 0),
  scale: 1,
};

const playerState = {
  posBounds: 0.85,
  scaleBounds: [0.72, 1.35],
};

const keyboardState = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
  z: false,
  x: false,
};

const KEYBOARD_ROTATE_STEP = 0.028;
const KEYBOARD_SCALE_STEP = 0.006;

function makeRenderer(canvas, alpha = true) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  return renderer;
}

const gameRenderer = makeRenderer(gameCanvas);
const refRenderer = makeRenderer(referenceCanvas);

const gameScene = new THREE.Scene();
const refScene = new THREE.Scene();

const gameCamera = new THREE.PerspectiveCamera(44, 1, 0.1, 30);
const refCamera = new THREE.PerspectiveCamera(36, 1, 0.1, 30);
gameCamera.position.set(0, 0.1, 3.1);
refCamera.position.set(0, 0.08, 3.45);

const REFERENCE_VISUAL_SCALE = 0.72;

const gameRoot = new THREE.Group();
const refRoot = new THREE.Group();
gameScene.add(gameRoot);
refScene.add(refRoot);

const baseGeometry = new THREE.SphereGeometry(1, 64, 64);
baseGeometry.scale(0.76, 1.02, 0.76);
baseGeometry.translate(0, 0.06, 0);

function addCommonLights(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));

  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(2.6, 2.3, 2.0);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xbad8ff, 0.32);
  fill.position.set(-2.2, -0.4, 1.6);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xfff2cf, 0.42);
  rim.position.set(-1.6, 1.0, -2.2);
  scene.add(rim);
}

addCommonLights(gameScene);
addCommonLights(refScene);

const eggMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.72,
  metalness: 0.04,
  map: null,
});

const playerDropGroup = new THREE.Group();
gameRoot.add(playerDropGroup);

const playerEgg = new THREE.Mesh(baseGeometry, eggMat.clone());
playerEgg.castShadow = false;
playerEgg.position.y = 0;
playerDropGroup.add(playerEgg);

const refEgg = new THREE.Mesh(baseGeometry, eggMat.clone());
refEgg.position.y = 0;
refRoot.add(refEgg);

function createEggTexture(theme = "spring") {
  const size = 1536;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");

  const palettes = {
    spring: {
      bg: "#fcfcfd",
      sun: "#f7cb18",
      sky: "#3a9de7",
      grass: "#4caf56",
      red: "#ef4a43",
      orange: "#ff9a38",
      purple: "#9f6bd8",
      ink: "#3b2b24",
    },
    night: {
      bg: "#f5f6fb",
      sun: "#ffd66d",
      sky: "#4285d4",
      grass: "#4c9659",
      red: "#ff6b72",
      orange: "#ffa657",
      purple: "#a084f5",
      ink: "#24262b",
    },
    pastel: {
      bg: "#fffdf8",
      sun: "#f4c762",
      sky: "#74bee6",
      grass: "#78be83",
      red: "#ee6f82",
      orange: "#f2a968",
      purple: "#b18cd9",
      ink: "#4e4540",
    },
  };

  const p = palettes[theme] || palettes.spring;

  g.fillStyle = p.bg;
  g.fillRect(0, 0, size, size);

  function pencilStroke(draw, color, width = 8, alpha = 0.9, repeat = 3) {
    for (let i = 0; i < repeat; i += 1) {
      g.save();
      g.strokeStyle = color;
      g.fillStyle = color;
      g.globalAlpha = alpha - i * 0.14;
      g.lineWidth = width + Math.random() * 1.8;
      g.lineCap = "round";
      g.lineJoin = "round";
      draw(i);
      g.restore();
    }
  }

  function drawSun(x, y, r) {
    pencilStroke(() => {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
    }, p.sun, 10, 0.86, 4);

    for (let i = 0; i < 12; i += 1) {
      const a = (Math.PI * 2 * i) / 12;
      const x1 = x + Math.cos(a) * (r + 8);
      const y1 = y + Math.sin(a) * (r + 8);
      const x2 = x + Math.cos(a) * (r + 40);
      const y2 = y + Math.sin(a) * (r + 40);
      pencilStroke(() => {
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
      }, p.sun, 7, 0.85, 2);
    }

    pencilStroke(() => {
      g.beginPath();
      g.arc(x - 16, y - 8, 4, 0, Math.PI * 2);
      g.arc(x + 15, y - 8, 4, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(x, y + 10, 20, 0.2, Math.PI - 0.2);
      g.stroke();
    }, p.ink, 5, 0.88, 2);
  }

  function drawRainbow(x, y, scale = 1) {
    const arcs = [
      [p.red, 70],
      [p.orange, 58],
      [p.purple, 46],
    ];
    arcs.forEach(([color, radius]) => {
      pencilStroke(() => {
        g.beginPath();
        g.arc(x, y, radius * scale, Math.PI * 1.1, Math.PI * 1.95);
        g.stroke();
      }, color, 9, 0.88, 3);
    });
  }

  function drawCloud(x, y, scale = 1) {
    pencilStroke(() => {
      g.beginPath();
      g.moveTo(x - 52 * scale, y + 10 * scale);
      g.bezierCurveTo(x - 64 * scale, y - 18 * scale, x - 12 * scale, y - 34 * scale, x + 12 * scale, y - 14 * scale);
      g.bezierCurveTo(x + 24 * scale, y - 36 * scale, x + 64 * scale, y - 20 * scale, x + 52 * scale, y + 12 * scale);
      g.stroke();
    }, p.sky, 8, 0.9, 3);
  }

  function drawHeart(x, y, s = 1) {
    pencilStroke(() => {
      g.beginPath();
      g.moveTo(x, y + 20 * s);
      g.bezierCurveTo(x - 40 * s, y - 10 * s, x - 22 * s, y - 48 * s, x, y - 24 * s);
      g.bezierCurveTo(x + 22 * s, y - 48 * s, x + 40 * s, y - 10 * s, x, y + 20 * s);
      g.stroke();
    }, p.red, 8, 0.85, 3);
  }

  function drawFlower(x, y, s = 1) {
    for (let i = 0; i < 5; i += 1) {
      const a = (Math.PI * 2 * i) / 5;
      const px = x + Math.cos(a) * 18 * s;
      const py = y + Math.sin(a) * 18 * s;
      pencilStroke(() => {
        g.beginPath();
        g.arc(px, py, 12 * s, 0, Math.PI * 2);
        g.stroke();
      }, p.grass, 5, 0.72, 2);
    }
  }

  function drawKid(x, y, shirt, hair) {
    pencilStroke(() => {
      g.beginPath();
      g.arc(x, y - 64, 28, 0, Math.PI * 2);
      g.stroke();
    }, "#f1bf9a", 6, 0.9, 2);

    pencilStroke(() => {
      g.beginPath();
      g.arc(x - 8, y - 70, 3, 0, Math.PI * 2);
      g.arc(x + 8, y - 70, 3, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(x, y - 58, 10, 0.2, Math.PI - 0.2);
      g.stroke();
    }, p.ink, 4, 0.92, 1);

    pencilStroke(() => {
      g.beginPath();
      g.moveTo(x - 22, y - 32);
      g.lineTo(x + 22, y - 32);
      g.lineTo(x + 14, y + 20);
      g.lineTo(x - 14, y + 20);
      g.closePath();
      g.stroke();
    }, shirt, 7, 0.85, 2);

    pencilStroke(() => {
      g.beginPath();
      g.moveTo(x - 10, y + 20);
      g.lineTo(x - 8, y + 52);
      g.moveTo(x + 10, y + 20);
      g.lineTo(x + 8, y + 52);
      g.moveTo(x - 26, y - 8);
      g.lineTo(x - 44, y + 4);
      g.moveTo(x + 26, y - 8);
      g.lineTo(x + 44, y + 4);
      g.stroke();
    }, p.ink, 5, 0.8, 2);

    pencilStroke(() => {
      g.beginPath();
      g.arc(x, y - 78, 24, Math.PI, Math.PI * 2);
      g.stroke();
    }, hair, 6, 0.92, 2);
  }

  function drawBoat(x, y) {
    pencilStroke(() => {
      g.beginPath();
      g.moveTo(x - 48, y + 18);
      g.lineTo(x + 48, y + 18);
      g.lineTo(x + 30, y + 34);
      g.lineTo(x - 34, y + 34);
      g.closePath();
      g.stroke();

      g.beginPath();
      g.moveTo(x, y - 52);
      g.lineTo(x, y + 18);
      g.stroke();

      g.beginPath();
      g.moveTo(x, y - 50);
      g.lineTo(x + 38, y - 10);
      g.lineTo(x, y -10);
      g.closePath();
      g.stroke();
    }, p.red, 7, 0.82, 3);

    pencilStroke(() => {
      g.beginPath();
      g.moveTo(x, y - 50);
      g.lineTo(x - 28, y - 22);
      g.lineTo(x, y -22);
      g.closePath();
      g.stroke();
    }, p.ink, 4, 0.75, 2);
  }

  function drawWave(y) {
    pencilStroke(() => {
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= size; x += 34) {
        g.quadraticCurveTo(x + 17, y - 16, x + 34, y);
      }
      g.stroke();
    }, p.sky, 6, 0.84, 3);
  }

  function drawStar(x, y, s = 1) {
    const spikes = 5;
    const outer = 16 * s;
    const inner = 7 * s;
    pencilStroke(() => {
      g.beginPath();
      for (let i = 0; i < spikes * 2; i += 1) {
        const radius = i % 2 === 0 ? outer : inner;
        const a = -Math.PI / 2 + (Math.PI * i) / spikes;
        const px = x + Math.cos(a) * radius;
        const py = y + Math.sin(a) * radius;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.stroke();
    }, p.orange, 5, 0.78, 2);
  }

  drawSun(268, 178, 74);
  drawRainbow(596, 236, 1.12);
  drawCloud(260, 470, 1.06);
  drawCloud(470, 500, 0.66);

  drawHeart(890, 560, 1);
  drawFlower(900, 780, 1.1);
  drawFlower(750, 610, 1.06);

  pencilStroke(() => {
    g.beginPath();
    g.moveTo(125, 900);
    g.lineTo(125, 810);
    g.lineTo(180, 758);
    g.lineTo(236, 810);
    g.lineTo(236, 900);
    g.closePath();
    g.stroke();
  }, p.red, 7, 0.8, 3);

  pencilStroke(() => {
    g.beginPath();
    g.rect(156, 840, 35, 60);
    g.stroke();
  }, p.sun, 5, 0.8, 2);

  pencilStroke(() => {
    g.beginPath();
    g.moveTo(68, 920);
    g.lineTo(68, 846);
    g.moveTo(68, 862);
    g.quadraticCurveTo(20, 882, 38, 925);
    g.moveTo(68, 878);
    g.quadraticCurveTo(108, 898, 86, 935);
    g.stroke();
  }, "#6f7e4f", 6, 0.76, 2);

  drawKid(560, 1006, p.red, "#844934");
  drawKid(690, 1008, p.sky, "#472e1f");

  pencilStroke(() => {
    g.beginPath();
    g.ellipse(840, 1010, 44, 30, 0.4, 0, Math.PI * 2);
    g.stroke();

    g.beginPath();
    g.moveTo(874, 1008);
    g.quadraticCurveTo(896, 994, 900, 1018);
    g.stroke();

    g.beginPath();
    g.arc(820, 1002, 3, 0, Math.PI * 2);
    g.fill();
  }, "#b27a40", 6, 0.84, 2);

  drawBoat(620, 1210);

  pencilStroke(() => {
    g.beginPath();
    g.ellipse(820, 1210, 36, 18, -0.2, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(798, 1208, 3, 0, Math.PI * 2);
    g.fill();
  }, "#f0b320", 6, 0.88, 2);

  drawWave(1270);
  drawWave(1310);

  const miniFlowers = [
    [108, 260, 0.64],
    [264, 310, 0.58],
    [960, 260, 0.62],
    [1120, 338, 0.56],
    [1240, 870, 0.6],
    [1360, 1020, 0.66],
    [210, 1115, 0.62],
    [305, 1188, 0.56],
  ];
  miniFlowers.forEach(([x, y, s]) => drawFlower(x, y, s));

  const miniHearts = [
    [1080, 440, 0.5],
    [1300, 640, 0.56],
    [240, 690, 0.56],
    [122, 1020, 0.46],
    [1400, 390, 0.48],
  ];
  miniHearts.forEach(([x, y, s]) => drawHeart(x, y, s));

  const miniClouds = [
    [90, 520, 0.5],
    [1320, 540, 0.56],
    [1448, 760, 0.48],
    [86, 760, 0.52],
  ];
  miniClouds.forEach(([x, y, s]) => drawCloud(x, y, s));

  const miniRainbows = [
    [320, 170, 0.56],
    [1240, 200, 0.52],
    [1380, 980, 0.48],
    [150, 920, 0.46],
  ];
  miniRainbows.forEach(([x, y, s]) => drawRainbow(x, y, s));

  const stars = [
    [170, 420, 0.72],
    [374, 640, 0.64],
    [1180, 460, 0.6],
    [1348, 560, 0.7],
    [1070, 920, 0.64],
    [144, 1260, 0.58],
    [1412, 1220, 0.56],
  ];
  stars.forEach(([x, y, s]) => drawStar(x, y, s));

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function applyEggTexture(theme) {
  const t = createEggTexture(theme);
  playerEgg.material.map = t;
  playerEgg.material.needsUpdate = true;

  const t2 = t.clone();
  t2.needsUpdate = true;
  refEgg.material.map = t2;
  refEgg.material.needsUpdate = true;

}

function easeOutBounce(t) {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) {
    const x = t - 1.5 / d1;
    return n1 * x * x + 0.75;
  }
  if (t < 2.5 / d1) {
    const x = t - 2.25 / d1;
    return n1 * x * x + 0.9375;
  }
  const x = t - 2.625 / d1;
  return n1 * x * x + 0.984375;
}

function startDropInAnimation() {
  dropAnim.active = true;
  dropAnim.start = performance.now();
  playerDropGroup.position.y = dropAnim.height;
}

function setNewTarget() {
  hasCelebrated = false;
  isAdvancingRound = false;
  startDropInAnimation();

  const euler = new THREE.Euler(
    degToRad(THREE.MathUtils.randFloatSpread(90)),
    degToRad(THREE.MathUtils.randFloatSpread(150)),
    degToRad(THREE.MathUtils.randFloatSpread(35)),
    "XYZ"
  );
  targetState.quat.setFromEuler(euler);

  targetState.pos.set(0, 0, 0);

  targetState.scale = THREE.MathUtils.randFloat(0.92, 1.08);

  refEgg.quaternion.copy(targetState.quat);
  refEgg.position.set(0, 0, 0);
  refEgg.scale.setScalar(targetState.scale * REFERENCE_VISUAL_SCALE);

}

function resetPlayer() {
  playerEgg.quaternion.identity();
  playerEgg.position.set(0, 0, 0);
  playerEgg.scale.setScalar(1);
}

function computeMatchScore() {
  const angle = playerEgg.quaternion.angleTo(targetState.quat);
  const angleScore = clamp(1 - angle / degToRad(65), 0, 1);

  const scaleDist = Math.abs(playerEgg.scale.x - targetState.scale);
  const scaleScore = clamp(1 - scaleDist / 0.45, 0, 1);

  return angleScore * 0.85 + scaleScore * 0.15;
}

function updateHUD() {
  const score = computeMatchScore();
  const pct = Math.round(score * 100);
  matchValue.textContent = `${pct}%`;

  matchFill.style.width = `${pct}%`;

  if (pct >= TARGET_MATCH_PERCENT && !hasCelebrated) {
    hasCelebrated = true;
  }

  if (pct >= TARGET_MATCH_PERCENT && !isAdvancingRound) {
    isAdvancingRound = true;
    setTimeout(() => {
      if (timerEnded) return;
      setNewTarget();
      resetPlayer();
    }, 700);
  }
}

function formatRemainingTime(totalSeconds) {
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function updateTimer(now) {
  if (timerEnded) return;
  const elapsedSec = Math.floor((now - timerStart) / 1000);
  const remaining = Math.max(0, TIMER_TOTAL_SECONDS - elapsedSec);
  timerValue.textContent = formatRemainingTime(remaining);

  if (remaining <= 0) {
    timerEnded = true;
    clearKeyboardState();
  }
}

function resize() {
  const gameRect = gameCanvas.getBoundingClientRect();
  const refRect = referenceCanvas.getBoundingClientRect();

  gameRenderer.setSize(gameRect.width, gameRect.height, false);
  refRenderer.setSize(refRect.width, refRect.height, false);

  gameCamera.aspect = gameRect.width / gameRect.height;
  refCamera.aspect = refRect.width / refRect.height;
  gameCamera.updateProjectionMatrix();
  refCamera.updateProjectionMatrix();
}

function pointerToCanvas(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
    inBounds: e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom,
  };
}

function setPointerMap(e) {
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
}

function getPointerArray() {
  return [...activePointers.values()];
}

function distanceBetween(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

function midpoint(a, b) {
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
}

function onPointerDown(e) {
  if (dropAnim.active || timerEnded) return;
  if (!pointerToCanvas(e, gameCanvas).inBounds) return;
  if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 2) return;

  gameCanvas.setPointerCapture(e.pointerId);
  setPointerMap(e);

  const pointers = getPointerArray();
  pointerState.dragging = true;

  if (pointers.length >= 2) {
    gestureState.isMultiTouch = true;
    const [p1, p2] = pointers;
    gestureState.lastCenter = midpoint(p1, p2);
    gestureState.lastDistance = distanceBetween(p1, p2);
  } else {
    gestureState.isMultiTouch = false;
    pointerState.mode = "rotate";
    pointerState.lastX = e.clientX;
    pointerState.lastY = e.clientY;
  }
}

function onPointerMove(e) {
  if (!activePointers.has(e.pointerId)) return;
  setPointerMap(e);
  if (!pointerState.dragging) return;

  const pointers = getPointerArray();
  if (pointers.length >= 2) {
    const [p1, p2] = pointers;
    const center = midpoint(p1, p2);
    const dist = distanceBetween(p1, p2);

    if (gestureState.lastDistance > 0) {
      const pinchDelta = dist - gestureState.lastDistance;
      const s = clamp(playerEgg.scale.x + pinchDelta * 0.0024, playerState.scaleBounds[0], playerState.scaleBounds[1]);
      playerEgg.scale.setScalar(s);
    }

    gestureState.lastCenter = center;
    gestureState.lastDistance = dist;
    return;
  }

  const dx = e.clientX - pointerState.lastX;
  const dy = e.clientY - pointerState.lastY;
  pointerState.lastX = e.clientX;
  pointerState.lastY = e.clientY;

  const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * 0.0098);
  const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * 0.0098);
  playerEgg.quaternion.multiplyQuaternions(qYaw, playerEgg.quaternion);
  playerEgg.quaternion.multiplyQuaternions(qPitch, playerEgg.quaternion);
}

function onPointerUp(e) {
  if (activePointers.has(e.pointerId)) {
    activePointers.delete(e.pointerId);
  }

  const pointers = getPointerArray();
  if (pointers.length >= 2) {
    const [p1, p2] = pointers;
    gestureState.lastCenter = midpoint(p1, p2);
    gestureState.lastDistance = distanceBetween(p1, p2);
    gestureState.isMultiTouch = true;
    return;
  }

  if (pointers.length === 1) {
    const only = pointers[0];
    pointerState.lastX = only.x;
    pointerState.lastY = only.y;
    gestureState.isMultiTouch = false;
    pointerState.mode = "rotate";
    return;
  }

  pointerState.dragging = false;
  gestureState.isMultiTouch = false;
  gestureState.lastCenter = null;
  gestureState.lastDistance = 0;
}

function onWheel(e) {
  if (dropAnim.active || timerEnded) return;
  if (!pointerToCanvas(e, gameCanvas).inBounds) return;

  e.preventDefault();
  const s = clamp(playerEgg.scale.x - e.deltaY * 0.0008, playerState.scaleBounds[0], playerState.scaleBounds[1]);
  playerEgg.scale.setScalar(s);
}

function isKeyboardControlKey(key) {
  return (
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "z" ||
    key === "x" ||
    key === "Z" ||
    key === "X"
  );
}

function onKeyDown(e) {
  if (!isKeyboardControlKey(e.key)) return;
  if (dropAnim.active || timerEnded) return;

  e.preventDefault();
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  keyboardState[key] = true;
}

function onKeyUp(e) {
  if (!isKeyboardControlKey(e.key)) return;

  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  keyboardState[key] = false;
}

function clearKeyboardState() {
  keyboardState.ArrowUp = false;
  keyboardState.ArrowDown = false;
  keyboardState.ArrowLeft = false;
  keyboardState.ArrowRight = false;
  keyboardState.z = false;
  keyboardState.x = false;
}

function applyKeyboardControls() {
  if (dropAnim.active || timerEnded) return;

  let yaw = 0;
  let pitch = 0;
  if (keyboardState.ArrowLeft) yaw -= KEYBOARD_ROTATE_STEP;
  if (keyboardState.ArrowRight) yaw += KEYBOARD_ROTATE_STEP;
  if (keyboardState.ArrowUp) pitch -= KEYBOARD_ROTATE_STEP;
  if (keyboardState.ArrowDown) pitch += KEYBOARD_ROTATE_STEP;

  if (yaw !== 0 || pitch !== 0) {
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
    playerEgg.quaternion.multiplyQuaternions(qYaw, playerEgg.quaternion);
    playerEgg.quaternion.multiplyQuaternions(qPitch, playerEgg.quaternion);
  }

  if (keyboardState.z || keyboardState.x) {
    const scaleDelta = (keyboardState.x ? 1 : 0) - (keyboardState.z ? 1 : 0);
    const s = clamp(playerEgg.scale.x + scaleDelta * KEYBOARD_SCALE_STEP, playerState.scaleBounds[0], playerState.scaleBounds[1]);
    playerEgg.scale.setScalar(s);
  }
}

function animate(now = 0) {
  requestAnimationFrame(animate);

  if (dropAnim.active) {
    const t = clamp((now - dropAnim.start) / dropAnim.duration, 0, 1);
    const bounced = easeOutBounce(t);
    playerDropGroup.position.y = (1 - bounced) * dropAnim.height;
    if (t >= 1) {
      dropAnim.active = false;
      playerDropGroup.position.y = 0;
    }
  }

  updateTimer(now);
  applyKeyboardControls();
  updateHUD();

  gameRenderer.render(gameScene, gameCamera);
  refRenderer.render(refScene, refCamera);
}

window.addEventListener("resize", resize);
gameCanvas.addEventListener("pointerdown", onPointerDown);
gameCanvas.addEventListener("pointermove", onPointerMove);
gameCanvas.addEventListener("pointerup", onPointerUp);
gameCanvas.addEventListener("pointercancel", onPointerUp);
gameCanvas.addEventListener("pointerleave", onPointerUp);
gameCanvas.addEventListener("contextmenu", (e) => {
  if (pointerToCanvas(e, gameCanvas).inBounds) {
    e.preventDefault();
  }
});
gameCanvas.addEventListener("wheel", onWheel, { passive: false });
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("blur", clearKeyboardState);

applyEggTexture("spring");
timerValue.textContent = formatRemainingTime(TIMER_TOTAL_SECONDS);
targetMarker.style.left = `calc(${TARGET_MATCH_PERCENT}% - 5px)`;
setNewTarget();
resetPlayer();
resize();
animate();
