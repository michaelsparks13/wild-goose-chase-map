// AR course preview runtime. Inlined after ar-capabilities.js inside a
// <script type="module"> — AR_META is defined above by the build.
// Non-XR path: model-viewer drives the model, hotspots, and animation.
// WebXR path: a three.js immersive-ar session with hit-test placement,
// tap-to-inspect aid stations, and the same console UI via dom-overlay.

const mv = document.getElementById('courseModel');
const scrubber = document.getElementById('scrubber');
const trackFill = document.getElementById('trackFill');
const mileNow = document.getElementById('mileNow');
const playBtn = document.getElementById('playBtn');
const aidCard = document.getElementById('aidCard');
const aidCardName = document.getElementById('aidCardName');
const aidCardMile = document.getElementById('aidCardMile');
const aidCardServices = document.getElementById('aidCardServices');
const aidCardClose = document.getElementById('aidCardClose');
const nativeArBtn = document.getElementById('nativeArBtn');
const xrArBtn = document.getElementById('xrArBtn');
const xrExitBtn = document.getElementById('xrExitBtn');
const xrHint = document.getElementById('xrHint');

const SCRUB_MAX = Number(scrubber.max);
const DURATION = AR_META.animationSeconds;
let playing = true;
let scrubbing = false;

// The active timeline: swapped for the XR mixer during an immersive session.
let timeline = {
  getFraction: () => ((mv.currentTime || 0) % DURATION) / DURATION,
  setFraction: (f) => { mv.currentTime = f * DURATION; },
  setPlaying: (p) => { if (p) mv.play(); else mv.pause(); },
};

function updateConsole(frac) {
  const mile = scrubValueToMile(frac * SCRUB_MAX, SCRUB_MAX, AR_META.totalMiles);
  mileNow.textContent = formatMile(mile);
  scrubber.setAttribute('aria-valuetext', `Mile ${formatMile(mile)}`);
  trackFill.style.width = `${(frac * 100).toFixed(2)}%`;
  if (!scrubbing) scrubber.value = String(Math.round(frac * SCRUB_MAX));
}

function setPlaying(p) {
  playing = p;
  timeline.setPlaying(p);
  playBtn.dataset.state = p ? 'playing' : 'paused';
  playBtn.setAttribute('aria-label', p ? 'Pause lead pack animation' : 'Play lead pack animation');
}

playBtn.addEventListener('click', () => setPlaying(!playing));

scrubber.addEventListener('input', () => {
  scrubbing = true;
  if (playing) setPlaying(false);
  timeline.setFraction(scrubber.value / SCRUB_MAX);
  updateConsole(scrubber.value / SCRUB_MAX);
});
scrubber.addEventListener('change', () => { scrubbing = false; });

(function consoleLoop() {
  if (!scrubbing) updateConsole(timeline.getFraction());
  requestAnimationFrame(consoleLoop);
})();

// ---- Aid station cards ----------------------------------------------------

function showAidCard(index) {
  const station = AR_META.aidStations[index];
  if (!station) return;
  aidCardName.textContent = station.name;
  aidCardMile.textContent = formatMile(station.mile);
  aidCardServices.textContent = station.services || '';
  aidCardServices.hidden = !station.services;
  aidCard.hidden = false;
  document.querySelectorAll('.hotspot').forEach((el) => {
    el.dataset.active = String(el.dataset.aid === String(index));
  });
}

function hideAidCard() {
  aidCard.hidden = true;
  document.querySelectorAll('.hotspot').forEach((el) => { el.dataset.active = 'false'; });
}

aidCardClose.addEventListener('click', hideAidCard);
document.querySelectorAll('.hotspot').forEach((el) => {
  el.addEventListener('click', () => showAidCard(Number(el.dataset.aid)));
});

// ---- Capability detection --------------------------------------------------

async function detectCapabilities() {
  let xrArSupported = false;
  try {
    xrArSupported = !!(navigator.xr && (await navigator.xr.isSessionSupported('immersive-ar')));
  } catch {
    xrArSupported = false;
  }
  const mode = chooseArMode({ xrArSupported, canActivateNativeAr: mv.canActivateAR });
  // 'webxr' suppresses the Scene Viewer / Quick Look button (our session is
  // richer); 'native' keeps it; 'none' leaves a plain 3D viewer.
  nativeArBtn.hidden = mode !== 'native';
  xrArBtn.hidden = mode !== 'webxr';
  document.body.dataset.arMode = mode;
}

// The model can finish loading before this module runs — check both ways.
if (mv.loaded) detectCapabilities();
else mv.addEventListener('load', detectCapabilities);

// ---- WebXR session ----------------------------------------------------------

let xr = null; // lazy singleton: { renderer, scene, model, mixer, action, ... }

async function setupXR() {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.domElement.style.position = 'fixed';
  renderer.domElement.style.inset = '0';
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.01, 40);

  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x445544, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(0.5, 2, 0.8);
  scene.add(sun);

  const gltf = await new GLTFLoader().loadAsync('./course.glb');
  const model = gltf.scene;
  model.visible = false;
  scene.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(gltf.animations[0]);
  action.play();

  // Invisible, generously sized tap targets over each (tiny) aid pin.
  const pinTargets = [];
  const proxyGeom = new THREE.SphereGeometry(0.03, 8, 6);
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  AR_META.aidStations.forEach((station, i) => {
    const proxy = new THREE.Mesh(proxyGeom, proxyMat);
    proxy.position.set(station.position[0], station.position[1], station.position[2]);
    proxy.userData.aidIndex = i;
    model.add(proxy);
    pinTargets.push(proxy);
  });

  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.06, 0.08, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: getComputedStyle(document.documentElement).getPropertyValue('--ar-accent').trim() || '#ffffff',
    })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const raycaster = new THREE.Raycaster();
  const controller = renderer.xr.getController(0);
  scene.add(controller);

  return { THREE, renderer, scene, camera, model, mixer, action, reticle, controller, raycaster, pinTargets };
}

async function enterXR() {
  xrArBtn.disabled = true;
  try {
    if (!xr) xr = await setupXR();
    const { THREE, renderer, scene, camera, model, mixer, action, reticle, controller, raycaster, pinTargets } = xr;

    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.getElementById('xrUi') },
    });

    document.body.dataset.xrActive = '1';
    xrExitBtn.hidden = false;
    xrHint.hidden = false;
    hideAidCard();
    let placed = false;
    model.visible = false;

    // Continuity: pick up where the page timeline left off.
    action.time = timeline.getFraction() * DURATION;
    timeline = {
      getFraction: () => (action.time % DURATION) / DURATION,
      setFraction: (f) => { action.time = f * DURATION; mixer.update(0); },
      setPlaying: (p) => { action.paused = !p; },
    };
    timeline.setPlaying(playing);

    const viewerSpace = await session.requestReferenceSpace('viewer');
    const hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

    function onSelect() {
      if (!placed && reticle.visible) {
        model.position.setFromMatrixPosition(reticle.matrix);
        model.visible = true;
        placed = true;
        reticle.visible = false;
        xrHint.hidden = true;
        return;
      }
      if (!placed) return;
      const origin = new THREE.Vector3();
      const direction = new THREE.Vector3(0, 0, -1);
      controller.getWorldPosition(origin);
      direction.applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion()));
      raycaster.set(origin, direction);
      const hits = raycaster.intersectObjects(pinTargets, false);
      if (hits.length) showAidCard(hits[0].object.userData.aidIndex);
    }
    controller.addEventListener('select', onSelect);

    const clock = new THREE.Clock();
    renderer.setAnimationLoop((time, frame) => {
      const dt = clock.getDelta();
      if (playing) mixer.update(dt);
      if (frame && !placed) {
        const refSpace = renderer.xr.getReferenceSpace();
        const hits = frame.getHitTestResults(hitTestSource);
        if (hits.length) {
          reticle.visible = true;
          reticle.matrix.fromArray(hits[0].getPose(refSpace).transform.matrix);
        } else {
          reticle.visible = false;
        }
      }
      renderer.render(scene, camera);
    });

    await renderer.xr.setSession(session);

    session.addEventListener('end', () => {
      controller.removeEventListener('select', onSelect);
      renderer.setAnimationLoop(null);
      delete document.body.dataset.xrActive;
      xrExitBtn.hidden = true;
      xrHint.hidden = true;
      // Hand the console back to model-viewer, keeping the scrub position.
      const frac = (action.time % DURATION) / DURATION;
      timeline = {
        getFraction: () => ((mv.currentTime || 0) % DURATION) / DURATION,
        setFraction: (f) => { mv.currentTime = f * DURATION; },
        setPlaying: (p) => { if (p) mv.play(); else mv.pause(); },
      };
      timeline.setFraction(frac);
      timeline.setPlaying(playing);
    });

    xrExitBtn.onclick = () => session.end();
  } catch (err) {
    console.error('Failed to start AR session', err);
    xrHint.textContent = 'Could not start AR on this device.';
    xrHint.hidden = false;
    setTimeout(() => { xrHint.hidden = true; }, 4000);
  } finally {
    xrArBtn.disabled = false;
  }
}

xrArBtn.addEventListener('click', enterXR);
