// =====================================================================
//  FINGER NINJA — game.js v3 (Full Feature Edition)
//  NEW: Sound Effects · Victory/ThumbsUp Gestures · Hand Cursor
//       Stress Analytics · Gesture Combos · Replay System · Frame Send
// =====================================================================

// ── DOM ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const stressMeter = document.getElementById('stress-meter');
const stressText = document.getElementById('stress-text');
const gestureText = document.getElementById('gesture-text');
const startBtn = document.getElementById('start-btn');
const instructions = document.getElementById('instructions');
const levelEl = document.getElementById('level-display');
const livesEl = document.getElementById('lives-display');
const multEl = document.getElementById('multiplier-display');
const bombMeter = document.getElementById('bomb-meter');
const bombText = document.getElementById('bomb-text');
const pwupBanner = document.getElementById('powerup-banner');
const waveBanner = document.getElementById('wave-banner');
const waveText = document.getElementById('wave-text');
const flashEl = document.getElementById('screen-flash');
const comboFlash = document.getElementById('combo-flash');
const chargeShieldEl = document.getElementById('charge-shield');
const chargeVictoryEl = document.getElementById('charge-victory');
const chargeThumbsEl = document.getElementById('charge-thumbs');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// ── Core Game State ─────────────────────────────────────────────────
let gameActive = false, score = 0, stressLevel = 0;
let currentGesture = "NONE", moveX = 0, lastShotTime = 0;
let level = 1, lives = 1, scoreMultiplier = 1, multiplierTimer = 0;
let backendStress = null, frameCount = 0, playerName = "NINJA";
let lastTimestamp = 0;

const SHOT_COOLDOWN = 200;
const BOMB_COOLDOWN = 10000;
let lastBombTime = -BOMB_COOLDOWN;
let doubleShot = false, doubleShotTimer = 0;
let slowMoActive = false, slowMoTimer = 0;
let shieldKitActive = false, shieldKitTimer = 0;
let invincible = false, invincibleTimer = 0;

// Ability Charges
let shieldCharges = 1;
let victoryCharges = 1;
let thumbsCharges = 1;
let lastChargeThreshold = 0;

// ── NEW State ──────────────────────────────────────────────────────
let soundEnabled = true;
let audioCtx = null;
// Victory ✌️
let victoryActive = false, victoryTimer = 0;
// Thumbs Up 👍
let thumbsUpUsed = false;
let lastPalmGesture = false; // rising edge for shield charge
// Hand Cursor
let handCursorX = 0, handCursorY = 0, handVisible = false;
// Stress Analytics
const stressHistory = [];   // { t, v }
let stressChart = null, analyticsVisible = false;
let peakStress = 0, avgStressSum = 0, avgStressCount = 0, comboCount = 0;
// Gesture Combo
const gestureBuffer = [];   // { g, time }
const COMBO_WINDOW_MS = 1200;
const COMBOS = [
    { seq: ['Victory', 'OpenPalm'], action: 'shieldBlast', desc: '🛡 SHIELD BLAST!' },
    { seq: ['Victory', 'Victory'], action: 'rapidFire', desc: '🔥 RAPID FIRE!' },
    { seq: ['OpenPalm', 'Fist'], action: 'shockwave', desc: '⚡ SHOCKWAVE!' },
];
let rapidFireActive = false, rapidFireTimer = 0;
// Replay
const replayFrames = [];    // { px, gesture, stress, score, level }
let replayMode = false, replayIdx = 0, replayAnim = null;
let lastReplaySample = 0;

// ── Starfield ────────────────────────────────────────────────────────
const stars = Array.from({ length: 120 }, () => ({
    x: Math.random() * 1920, y: Math.random() * 1080,
    size: Math.random() * 1.5 + 0.3,
    speed: Math.random() * 0.4 + 0.05,
    alpha: Math.random() * 0.6 + 0.1
}));

// ── Player ───────────────────────────────────────────────────────────
const player = {
    x: canvas.width / 2, y: canvas.height - 110,
    width: 52, height: 60, color: '#00ffcc',
    shield: false, bullets: [], shieldAngle: 0
};

// ── Game Objects ─────────────────────────────────────────────────────
let enemies = [], powerUps = [];
const particles = [];
let bossAlive = false, boss = null;

// ── Power-Up Types ────────────────────────────────────────────────────
const POWERUP_TYPES = [
    { id: 'DOUBLE_SHOT', label: '2×', color: '#00aaff', desc: 'DOUBLE SHOT' },
    { id: 'SLOW_MO', label: '⏱', color: '#aa00ff', desc: 'SLOW-MO' },
    { id: 'SHIELD_KIT', label: '🛡', color: '#ffffff', desc: 'SHIELD KIT' },
    { id: 'SCORE_X2', label: '★', color: '#ffcc00', desc: 'SCORE ×2' }
];

// =====================================================================
//  SOUND ENGINE (Web Audio API — no files needed)
// =====================================================================
function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playTone(freq, type = 'sine', dur = 0.12, vol = 0.25, freqEnd = null) {
    if (!soundEnabled || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, audioCtx.currentTime + dur);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.start(); osc.stop(audioCtx.currentTime + dur);
}

function playNoise(dur = 0.15, vol = 0.4) {
    if (!soundEnabled || !audioCtx) return;
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    src.buffer = buf;
    src.connect(gain); gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    src.start();
}

const SFX = {
    shoot() { playTone(880, 'sawtooth', 0.08, 0.2, 220); },
    hit() { playNoise(0.12, 0.35); },
    explode() { playNoise(0.25, 0.55); },
    powerup() { playTone(440, 'sine', 0.3, 0.25, 880); },
    bomb() { playNoise(0.4, 0.8); playTone(80, 'sine', 0.4, 0.3); },
    combo() { playTone(660, 'square', 0.05, 0.2); setTimeout(() => playTone(880, 'square', 0.1, 0.25), 60); },
    victory() { [440, 550, 660, 880].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.15, 0.2), i * 80)); },
    levelup() { [330, 440, 550, 660].forEach((f, i) => setTimeout(() => playTone(f, 'triangle', 0.12, 0.2), i * 60)); },
    gameover() { [440, 349, 277, 220].forEach((f, i) => setTimeout(() => playTone(f, 'sawtooth', 0.25, 0.35), i * 250)); }
};

function toggleSound() {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById('sound-toggle-btn');
    btn.innerText = soundEnabled ? '🔊' : '🔇';
    btn.title = soundEnabled ? 'Sound On' : 'Sound Off';
    btn.classList.toggle('muted', !soundEnabled);
}

// =====================================================================
//  STRESS ANALYTICS
// =====================================================================
let stressChartLabels = [], stressChartData = [];

function initStressChart() {
    if (stressChart) return;
    const chartCanvas = document.getElementById('stress-chart');
    stressChart = new Chart(chartCanvas, {
        type: 'line',
        data: {
            labels: stressChartLabels,
            datasets: [{
                label: 'Stress',
                data: stressChartData,
                borderColor: '#00ffcc',
                backgroundColor: 'rgba(0,255,204,0.08)',
                borderWidth: 2, tension: 0.4,
                pointRadius: 0, fill: true
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            scales: {
                y: { min: 0, max: 100, ticks: { color: '#00ffcc', font: { family: 'Orbitron', size: 9 } }, grid: { color: 'rgba(0,255,204,0.1)' } },
                x: { ticks: { color: '#00ffcc', maxTicksLimit: 5, font: { size: 8 } }, grid: { color: 'rgba(0,255,204,0.08)' } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function updateStressChart() {
    const now = new Date();
    const label = `${now.getMinutes()}:${String(now.getSeconds()).padStart(2, '0')}`;
    stressChartLabels.push(label);
    stressChartData.push(Math.round(stressLevel));
    if (stressChartLabels.length > 60) { stressChartLabels.shift(); stressChartData.shift(); }
    if (stressChart) stressChart.update('none');
    // update stat displays
    if (stressLevel > peakStress) {
        peakStress = stressLevel;
        const el = document.getElementById('peak-stress');
        if (el) el.innerText = Math.round(peakStress) + '%';
        const elFinal = document.getElementById('final-peak-stress');
        if (elFinal) elFinal.innerText = Math.round(peakStress) + '%';
    }
    avgStressSum += stressLevel; avgStressCount++;
    const avg = avgStressCount ? Math.round(avgStressSum / avgStressCount) : 0;
    const avgEl = document.getElementById('avg-stress');
    if (avgEl) avgEl.innerText = avg + '%';
    const diffEl = document.getElementById('difficulty-label');
    if (diffEl) diffEl.innerText = stressLevel > 75 ? 'HARD' : stressLevel > 45 ? 'MEDIUM' : 'EASY';
    // combo count
    const ccEl = document.getElementById('combo-count');
    if (ccEl) ccEl.innerText = comboCount;
}

function toggleAnalytics() {
    analyticsVisible = !analyticsVisible;
    document.getElementById('analytics-panel').classList.toggle('hidden', !analyticsVisible);
    if (analyticsVisible) { initStressChart(); updateStressChart(); }
}

// =====================================================================
//  GESTURE COMBO SYSTEM
// =====================================================================
function pushGestureToBuffer(g) {
    const now = Date.now();
    gestureBuffer.push({ g, time: now });
    // remove old entries
    while (gestureBuffer.length && now - gestureBuffer[0].time > COMBO_WINDOW_MS) gestureBuffer.shift();
    checkCombos();
}

function checkCombos() {
    for (const combo of COMBOS) {
        const len = combo.seq.length;
        if (gestureBuffer.length < len) continue;
        const recent = gestureBuffer.slice(-len);
        if (recent.every((e, i) => e.g === combo.seq[i])) {
            gestureBuffer.length = 0;
            executCombo(combo);
            break;
        }
    }
}

function executCombo(combo) {
    comboCount++;
    SFX.combo();
    showComboFlash(combo.desc);
    switch (combo.action) {
        case 'shieldBlast':
            // activate shield + shoot ring of bullets
            player.shield = true;
            for (let a = 0; a < 8; a++) {
                const angle = (a / 8) * Math.PI * 2;
                player.bullets.push({ x: player.x + player.width / 2, y: player.y + player.height / 2, speed: 10, angle });
            }
            break;
        case 'rapidFire':
            rapidFireActive = true;
            rapidFireTimer = 5000;
            break;
        case 'shockwave':
            // destroy enemies within radius
            const cx = player.x + player.width / 2, cy = player.y + player.height / 2;
            enemies = enemies.filter(e => {
                const dist = Math.hypot(e.x + e.width / 2 - cx, e.y + e.height / 2 - cy);
                if (dist < 220) { score += 10 * scoreMultiplier; createParticles(e.x + e.width / 2, e.y + e.height / 2, '#aa00ff', 10); return false; }
                return true;
            });
            triggerFlash('rgba(170,0,255,0.4)');
            break;
    }
}

function showComboFlash(text, dur = 1800) {
    comboFlash.innerText = text;
    comboFlash.classList.remove('hidden');
    clearTimeout(comboFlash._t);
    comboFlash._t = setTimeout(() => comboFlash.classList.add('hidden'), dur);
}

// =====================================================================
//  REPLAY SYSTEM
// =====================================================================
function recordReplayFrame(now) {
    if (!gameActive || replayMode) return;
    if (now - lastReplaySample < 80) return; // ~12 fps
    lastReplaySample = now;
    replayFrames.push({ px: player.x, gesture: currentGesture, stress: Math.round(stressLevel), score, level });
}

function watchReplay() {
    if (!replayFrames.length) return;
    document.getElementById('game-over').classList.add('hidden');
    document.getElementById('replay-mode-banner').classList.remove('hidden');
    replayMode = true; replayIdx = 0;
    requestAnimationFrame(drawReplayFrame);
}

function stopReplay() {
    replayMode = false;
    document.getElementById('replay-mode-banner').classList.add('hidden');
    document.getElementById('game-over').classList.remove('hidden');
}

function drawReplayFrame() {
    if (!replayMode) return;
    const f = replayFrames[replayIdx];
    // Clear + stars
    ctx.fillStyle = 'rgba(5,5,5,0.22)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => {
        s.y += s.speed * 0.5;
        if (s.y > canvas.height) s.y = 0;
        ctx.globalAlpha = s.alpha * 0.6;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    // replayed player
    const cy = canvas.height - 110;
    ctx.shadowBlur = 15; ctx.shadowColor = '#00ffcc'; ctx.fillStyle = '#00ffcc';
    ctx.beginPath();
    ctx.moveTo(f.px + 26, cy);
    ctx.lineTo(f.px, cy + 60);
    ctx.lineTo(f.px + 52, cy + 60);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(f.px + 26, cy - 12, 10, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    // overlay info
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(canvas.width / 2 - 140, 10, 280, 40);
    ctx.fillStyle = '#00ffcc'; ctx.font = '12px Orbitron,monospace'; ctx.textAlign = 'center';
    ctx.fillText(`REPLAY  SCORE:${f.score}  LEVEL:${f.level}  STRESS:${f.stress}%`, canvas.width / 2, 35);
    ctx.textAlign = 'left';
    replayIdx++;
    if (replayIdx >= replayFrames.length) { stopReplay(); return; }
    setTimeout(() => requestAnimationFrame(drawReplayFrame), 80);
}

// =====================================================================
//  SOCKET + BACKEND FRAME SENDING
// =====================================================================
// Dynamically connect to the same host that served the page
const backendUrl = window.location.hostname === 'localhost' ? 'http://localhost:5000' : window.location.origin;
const socket = io(backendUrl, { reconnectionAttempts: 5 });
const connectionStatus = document.getElementById('connection-status');
const webcamPreview = document.getElementById('webcam-preview');

const videoElement = document.createElement('video');
videoElement.style.display = 'none';
document.body.appendChild(videoElement);

socket.on('connect', () => { console.log("Backend connected."); });
socket.on('disconnect', () => { backendStress = null; });

// Receive real stress from backend
socket.on('stress_update', data => {
    if (data && typeof data.stressScore === 'number') backendStress = data.stressScore;
});

// Receive gesture + stress from backend frame analysis
socket.on('gesture_data', data => {
    if (!data) return;
    if (typeof data.stressScore === 'number') backendStress = data.stressScore;
});

// Send webcam frame to backend every 200 ms for stress analysis
function sendFrameToBackend() {
    if (!videoElement.videoWidth) return;
    try {
        const tmp = document.createElement('canvas');
        tmp.width = 320; tmp.height = 240;
        tmp.getContext('2d').drawImage(videoElement, 0, 0, 320, 240);
        const image = tmp.toDataURL('image/jpeg', 0.6);
        socket.emit('process_frame', { image });
    } catch (e) { /* silently skip if camera not ready */ }
}
setInterval(sendFrameToBackend, 200);

// =====================================================================
//  MEDIAPIPE HANDS
// =====================================================================
const hands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
hands.onResults(onResults);

let lastFistGesture = false, lastVictoryGesture = false, lastThumbsGesture = false;
let lastGestureForCombo = '';

function onResults(results) {
    let handDetected = false;
    let gesture = "None";
    let mx = 0;

    const tmp = document.createElement('canvas');
    const tctx = tmp.getContext('2d');
    tmp.width = videoElement.videoWidth || 640;
    tmp.height = videoElement.videoHeight || 480;
    tctx.save(); tctx.clearRect(0, 0, tmp.width, tmp.height);
    if (results.image) tctx.drawImage(results.image, 0, 0, tmp.width, tmp.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length) {
        handDetected = true;
        const lm = results.multiHandLandmarks[0];

        if (window.drawConnectors) drawConnectors(tctx, lm, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 3 });
        if (window.drawLandmarks) drawLandmarks(tctx, lm, { color: '#FF0000', lineWidth: 2 });

        const thumbTip = lm[4], indexTip = lm[8];
        const middleTip = lm[12], ringTip = lm[16], pinkyTip = lm[20];
        const wrist = lm[0];

        // Hand cursor position
        handCursorX = wrist.x * canvas.width;
        handCursorY = wrist.y * canvas.height;

        // MCP / PIP joints
        const indexMCP = lm[5], middleMCP = lm[9], ringMCP = lm[13], pinkyMCP = lm[17];
        const indexPIP = lm[6], middlePIP = lm[10], ringPIP = lm[14], pinkyPIP = lm[18];

        const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
        const palmDist = Math.hypot(wrist.x - middleTip.x, wrist.y - middleTip.y);

        // FINGERS UP (inverted Y)
        const iu = indexTip.y < indexMCP.y, mu = middleTip.y < middleMCP.y, ru = ringTip.y < ringPIP.y, pu = pinkyTip.y < pinkyPIP.y;

        // 1. Victory ✌️ (Shoot)
        if (iu && mu && !ru && !pu) gesture = "Victory";
        // 2. PinkyUp 🤙 (Multiplier)
        else if (pu && !iu && !mu && !ru) gesture = "PinkyUp";
        // 3. OK 👌 (Slow-Mo)
        else if (pinchDist < 0.08 && mu && ru && pu) gesture = "OK";
        // 4. OpenPalm 🖐 (Shield)
        else if (iu && mu && ru && pu && palmDist > 0.3) gesture = "OpenPalm";
        // 5. Fist ✊ (Bomb)
        else if (!iu && !mu && !ru && !pu) gesture = "Fist";
        else gesture = "Neutral";

        // Draw gesture visual feedback
        if (gesture !== "Neutral") {
            tctx.beginPath();
            tctx.arc(indexTip.x * tmp.width, indexTip.y * tmp.height, 20, 0, Math.PI * 2);
            tctx.fillStyle = "rgba(0,255,204,0.3)"; tctx.fill();
        }

        mx = (wrist.x - 0.5) * -3;
    }

    webcamPreview.src = tmp.toDataURL('image/jpeg', 0.5);
    tctx.restore();
    handVisible = handDetected;
    currentGesture = gesture;
    moveX = mx;

    gestureText.innerText = currentGesture.toUpperCase();
    updateStressUI();

    connectionStatus.innerText = handDetected ? "HAND DETECTED" : "SEARCHING HAND...";
    connectionStatus.style.color = handDetected ? "#00ffcc" : "#ffcc00";

    // Push to combo buffer on gesture change (rising edge)
    if (gesture !== "None" && gesture !== lastGestureForCombo && gameActive) {
        pushGestureToBuffer(gesture);
        lastGestureForCombo = gesture;
    }

    if (gameActive) handleGesture();
}

const camera = new Camera(videoElement, {
    onFrame: async () => { await hands.send({ image: videoElement }); },
    width: 640, height: 480
});
camera.start();

// =====================================================================
//  STRESS UI
// =====================================================================
function updateStressUI() {
    stressMeter.style.width = stressLevel + '%';
    if (stressLevel > 70) { stressMeter.style.background = '#ff4444'; stressText.innerText = 'HIGH STRESS'; }
    else if (stressLevel > 40) { stressMeter.style.background = '#ffcc00'; stressText.innerText = 'TENSION'; }
    else { stressMeter.style.background = '#00ffcc'; stressText.innerText = 'CALM'; }
}

function updateChargeHUD() {
    if (chargeShieldEl) {
        chargeShieldEl.innerText = `🖐:${shieldCharges}`;
        chargeShieldEl.classList.toggle('out', shieldCharges <= 0);
    }
    if (chargeVictoryEl) {
        chargeVictoryEl.innerText = `👌:${victoryCharges}`;
        chargeVictoryEl.classList.toggle('out', victoryCharges <= 0);
    }
    if (chargeThumbsEl) {
        chargeThumbsEl.innerText = `🤙:${thumbsCharges}`;
        chargeThumbsEl.classList.toggle('out', thumbsCharges <= 0);
    }
}

// =====================================================================
//  GESTURE HANDLING
// =====================================================================
function handleGesture() {
    const now = Date.now();
    const cooldown = rapidFireActive ? 50 : SHOT_COOLDOWN;

    if (currentGesture === "Victory") {
        if (now - lastShotTime > cooldown) { shoot(); lastShotTime = now; }
    }

    // Shield (🖐) 
    const palmNow = (currentGesture === "OpenPalm");
    if (palmNow && !lastPalmGesture) {
        if (shieldCharges > 0) {
            shieldCharges--; shieldKitActive = true; shieldKitTimer = 6000; player.shield = true;
            SFX.powerup(); showBanner('🖐 SHIELD ACTIVATED!'); updateChargeHUD();
        }
    }
    lastPalmGesture = palmNow;
    player.shield = (shieldKitActive || (currentGesture === "OpenPalm" && !shieldCharges));

    // Fist ✊ → Bomb
    const fistNow = (currentGesture === "Fist");
    if (fistNow && !lastFistGesture) tryBomb();
    lastFistGesture = fistNow;

    // OK Sign 👌 → slow all enemies
    const okNow = (currentGesture === "OK");
    if (okNow && !lastVictoryGesture && !victoryActive) {
        if (victoryCharges > 0) {
            victoryCharges--; victoryActive = true; victoryTimer = 6000;
            SFX.victory(); showBanner('👌 SLOW-MO ACTIVATED!'); updateChargeHUD();
        }
    }
    lastVictoryGesture = okNow;

    // Pinky Up 🤙 → score x2
    const pinkyNow = (currentGesture === "PinkyUp");
    if (pinkyNow && !lastThumbsGesture && !thumbsUpUsed) {
        if (thumbsCharges > 0) {
            thumbsCharges--; thumbsUpUsed = true; scoreMultiplier = 2; multiplierTimer = 10000;
            multEl.innerText = 'x2'; multEl.style.color = '#ffcc00';
            showBanner('🤙 SCORE ×2 ACTIVATED!'); SFX.combo(); updateChargeHUD();
        }
    }
    if (!pinkyNow) thumbsUpUsed = false;
    lastThumbsGesture = pinkyNow;
}

// =====================================================================
//  SHOOT
// =====================================================================
function shoot() {
    if (player.bullets.length >= 10) return;
    SFX.shoot();
    const bx = player.x + player.width / 2 - 2;
    player.bullets.push({ x: bx, y: player.y, speed: 12, angle: 0 });
    if (doubleShot) {
        player.bullets.push({ x: bx - 12, y: player.y + 5, speed: 11, angle: -0.06 });
        player.bullets.push({ x: bx + 12, y: player.y + 5, speed: 11, angle: 0.06 });
    }
}

// =====================================================================
//  BOMB
// =====================================================================
function tryBomb() {
    const now = Date.now();
    if (now - lastBombTime < BOMB_COOLDOWN) return;
    lastBombTime = now;
    SFX.bomb();
    const cleared = enemies.length;
    enemies.forEach(e => createParticles(e.x + e.width / 2, e.y + e.height / 2, '#ff6600', 14));
    enemies = [];
    score += cleared * 5 * scoreMultiplier;
    triggerFlash('rgba(255,102,0,0.5)');
    showBanner('💥 BOMB! +' + (cleared * 5 * scoreMultiplier));
}

// =====================================================================
//  SPAWNING
// =====================================================================
function spawnEnemy() {
    if (!gameActive) return;
    const vMult = victoryActive ? 0.4 : 1;
    const sMult = slowMoActive ? 0.35 : 1;
    // STRESS ADAPTATION: Speed and Spawn Rate scale with Stress Level
    const stressFactor = 1 + (stressLevel / 100);
    const rate = (0.015 + (stressLevel / 1500) + (level - 1) * 0.005) * stressFactor;
    const speed = (1.8 + (stressLevel / 12) + (level - 1) * 0.45) * vMult * sMult;

    if (Math.random() < rate)
        enemies.push({ x: Math.random() * (canvas.width - 44), y: -50, width: 36, height: 36, speed, angle: 0, hp: 1 });
    if (frameCount % 1200 === 0 && gameActive) spawnPowerUp();
}

function spawnPowerUp() {
    const t = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    powerUps.push({ x: 60 + Math.random() * (canvas.width - 120), y: -40, width: 32, height: 32, speed: 1.5, type: t, angle: 0 });
}

function spawnBoss() {
    if (bossAlive) return;
    bossAlive = true;
    boss = { x: canvas.width / 2 - 60, y: 40, width: 90, height: 90, speed: 1.8, dir: 1, hp: 5, maxHp: 5, angle: 0, color: '#ff2222' };
    showBanner('⚡ BOSS INCOMING!'); SFX.levelup();
}

function checkLevelUp() {
    const n = Math.floor(score / 200) + 1;
    if (n > level) { level = n; levelEl.innerText = String(level).padStart(2, '0'); showWaveBanner('WAVE ' + level); SFX.levelup(); if (level % 3 === 0) spawnBoss(); }
}

// =====================================================================
//  MAIN UPDATE
// =====================================================================
function update(dt) {
    if (!gameActive) return;
    frameCount++;

    // Grant charges every 500 points
    const threshold = Math.floor(score / 500);
    if (threshold > lastChargeThreshold) {
        lastChargeThreshold = threshold;
        shieldCharges++;
        victoryCharges++;
        thumbsCharges++;
        SFX.levelup();
        showBanner('⚡ CHARGES REPLENISHED!');
        updateChargeHUD();
    }

    // STRESS CALCULATION: Combine Biometrics + Score-based Intensity
    const intensity = (score / 12) + Math.sin(Date.now() / 1000) * 12;
    const biometric = (backendStress !== null) ? backendStress : 15;
    stressLevel = Math.max(5, Math.min(100, biometric + intensity));

    // Timers
    if (doubleShot && (doubleShotTimer -= dt) <= 0) doubleShot = false;
    if (slowMoActive && (slowMoTimer -= dt) <= 0) slowMoActive = false;
    if (shieldKitActive && (shieldKitTimer -= dt) <= 0) shieldKitActive = false;
    if (multiplierTimer > 0 && (multiplierTimer -= dt) <= 0) { scoreMultiplier = 1; multEl.innerText = 'x1'; multEl.style.color = ''; }
    if (invincible && (invincibleTimer -= dt) <= 0) invincible = false;
    if (victoryActive && (victoryTimer -= dt) <= 0) victoryActive = false;
    if (rapidFireActive && (rapidFireTimer -= dt) <= 0) rapidFireActive = false;

    // Bomb meter
    const bElap = Date.now() - lastBombTime, bPct = Math.min(100, (bElap / BOMB_COOLDOWN) * 100);
    bombMeter.style.width = bPct + '%';
    if (bPct >= 100) { bombMeter.classList.add('bomb-ready'); bombMeter.classList.remove('bomb-charging'); bombText.innerText = 'READY'; }
    else { bombMeter.classList.remove('bomb-ready'); bombMeter.classList.add('bomb-charging'); bombText.innerText = Math.ceil((BOMB_COOLDOWN - bElap) / 1000) + 's'; }

    // Player
    const tX = ((Math.max(-1, Math.min(1, moveX)) + 1) * (canvas.width / 2)) - player.width / 2;
    player.x = Math.max(0, Math.min(canvas.width - player.width, player.x + (tX - player.x) * 0.3));
    player.shieldAngle += 0.03;

    // Bullets
    for (let i = player.bullets.length - 1; i >= 0; i--) {
        const b = player.bullets[i];
        b.y -= b.speed; b.x += Math.sin(b.angle) * 2;
        if (b.y < 0 || b.x < 0 || b.x > canvas.width) player.bullets.splice(i, 1);
    }

    // Boss
    if (bossAlive && boss) {
        boss.x += boss.speed * (victoryActive ? 0.3 : 1) * boss.dir;
        boss.y = Math.min(boss.y + 0.3, 80);
        if (boss.x + boss.width > canvas.width - 10 || boss.x < 10) boss.dir *= -1;
        boss.angle += 0.01;
        for (let bi = player.bullets.length - 1; bi >= 0; bi--) {
            const b = player.bullets[bi];
            if (b.x < boss.x + boss.width && b.x + 4 > boss.x && b.y < boss.y + boss.height && b.y + 15 > boss.y) {
                player.bullets.splice(bi, 1); boss.hp--; SFX.hit();
                createParticles(boss.x + boss.width / 2, boss.y + boss.height / 2, '#ff2222', 6);
                if (boss.hp <= 0) { score += 50 * scoreMultiplier; SFX.explode(); createParticles(boss.x + boss.width / 2, boss.y + boss.height / 2, '#ff6600', 30); spawnPowerUp(); boss = null; bossAlive = false; showBanner('💀 BOSS DOWN! +50'); triggerFlash('rgba(255,100,0,0.4)'); }
            }
        }
        if (boss && !invincible && boss.x < player.x + player.width && boss.x + boss.width > player.x && boss.y + boss.height > player.y) {
            if (player.shield) { boss.hp--; if (boss.hp <= 0) { score += 50 * scoreMultiplier; boss = null; bossAlive = false; } }
            else { takeDamage(); boss.x = boss.x < canvas.width / 2 ? canvas.width - 100 : 10; }
        }
    }

    // Enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        e.y += e.speed * (victoryActive ? 0.3 : 1) * (slowMoActive ? 0.35 : 1);
        e.angle += 0.06;
        if (!invincible && e.y + e.height > player.y && e.x < player.x + player.width && e.x + e.width > player.x) {
            if (player.shield) { score += 5 * scoreMultiplier; createParticles(e.x + e.width / 2, e.y + e.height / 2, '#00ffcc', 8); enemies.splice(i, 1); continue; }
            else { takeDamage(); enemies.splice(i, 1); continue; }
        }
        let hit = false;
        for (let bi = player.bullets.length - 1; bi >= 0; bi--) {
            const b = player.bullets[bi];
            if (b.x < e.x + e.width + 10 && b.x + 15 > e.x - 10 && b.y < e.y + e.height && b.y + 20 > e.y) {
                player.bullets.splice(bi, 1); e.hp--;
                if (e.hp <= 0) { score += 10 * scoreMultiplier; SFX.hit(); createParticles(e.x + e.width / 2, e.y + e.height / 2, '#ff4444', 10); enemies.splice(i, 1); hit = true; break; }
            }
        }
        if (!hit && e.y > canvas.height) enemies.splice(i, 1);
    }

    // Power-ups
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const p = powerUps[i]; p.y += p.speed; p.angle += 0.04;
        if (p.x < player.x + player.width && p.x + p.width > player.x && p.y + p.height > player.y && p.y < player.y + player.height) { applyPowerUp(p.type); powerUps.splice(i, 1); continue; }
        if (p.y > canvas.height) powerUps.splice(i, 1);
    }

    spawnEnemy(); checkLevelUp();
    scoreEl.innerText = String(score).padStart(4, '0');
    livesEl.innerText = lives > 0 ? '❤️' : '✖'; // Single life mode
    if (stressLevel > 70) livesEl.parentElement.classList.add('stress-glow');
    else livesEl.parentElement.classList.remove('stress-glow');
    updateStressUI();
    if (frameCount % 60 === 0) updateStressChart();
    recordReplayFrame(Date.now());
}

// =====================================================================
//  TAKE DAMAGE
// =====================================================================
function takeDamage() {
    if (invincible) return;
    lives--; invincible = true; invincibleTimer = 1500;
    SFX.explode(); triggerFlash('rgba(255,0,0,0.5)');
    if (lives <= 0) gameOver();
}

// =====================================================================
//  POWER-UP APPLICATION
// =====================================================================
function applyPowerUp(type) {
    SFX.powerup();
    switch (type.id) {
        case 'DOUBLE_SHOT': doubleShot = true; doubleShotTimer = 8000; break;
        case 'SLOW_MO': slowMoActive = true; slowMoTimer = 7000; break;
        case 'SHIELD_KIT': shieldKitActive = true; shieldKitTimer = 6000; player.shield = true; break;
        case 'SCORE_X2': scoreMultiplier = 2; multiplierTimer = 10000; multEl.innerText = 'x2'; multEl.style.color = '#ffcc00'; break;
    }
    showBanner('⚡ ' + type.desc);
    createParticles(player.x + player.width / 2, player.y, type.color, 14);
}

// =====================================================================
//  PARTICLES / FLASH / BANNERS
// =====================================================================
function createParticles(x, y, color = '#00ffcc', count = 10) {
    for (let i = 0; i < count; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, life: 1, color });
}
function triggerFlash(color = 'rgba(255,255,255,0.6)') { flashEl.style.background = color; flashEl.style.opacity = '1'; setTimeout(() => flashEl.style.opacity = '0', 80); }
function showBanner(text, dur = 2000) { pwupBanner.innerText = text; pwupBanner.classList.remove('hidden'); clearTimeout(pwupBanner._t); pwupBanner._t = setTimeout(() => pwupBanner.classList.add('hidden'), dur); }
function showWaveBanner(text, dur = 2400) { waveText.innerText = text; waveBanner.classList.remove('hidden'); clearTimeout(waveBanner._t); waveBanner._t = setTimeout(() => waveBanner.classList.add('hidden'), dur); }

// =====================================================================
//  DRAW
// =====================================================================
function draw() {
    ctx.fillStyle = 'rgba(5,5,5,0.18)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => { s.y += s.speed; if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; } ctx.globalAlpha = s.alpha; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1;
    drawPlayer();
    ctx.shadowBlur = 8; ctx.shadowColor = '#fff'; ctx.fillStyle = '#fff';
    player.bullets.forEach(b => ctx.fillRect(b.x, b.y, 4, 18)); ctx.shadowBlur = 0;
    if (bossAlive && boss) drawBoss();
    enemies.forEach(e => drawShuriken(e.x + e.width / 2, e.y + e.height / 2, e.width / 2, e.angle));
    powerUps.forEach(p => drawPowerUp(p));
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]; p.x += p.vx; p.y += p.vy; p.vx *= 0.93; p.vy *= 0.93; p.life -= 0.025;
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.shadowBlur = 6; ctx.shadowColor = p.color; ctx.fillRect(p.x, p.y, 3, 3);
        if (p.life <= 0) particles.splice(i, 1);
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    if (bossAlive && boss) drawBossHP();
    drawHandCursor();
}

function drawPlayer() {
    const cx = player.x + player.width / 2;
    const col = invincible && Math.floor(Date.now() / 120) % 2 === 0 ? 'rgba(0,255,204,0.3)' : player.color;
    ctx.shadowBlur = 20; ctx.shadowColor = col; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(cx, player.y); ctx.lineTo(player.x, player.y + player.height); ctx.lineTo(player.x + player.width, player.y + player.height); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, player.y - 12, 10, 0, Math.PI * 2); ctx.fill();
    if (player.shield) {
        ctx.shadowColor = '#aaffee'; ctx.strokeStyle = 'rgba(160,255,220,0.85)'; ctx.lineWidth = 3; ctx.setLineDash([8, 4]);
        ctx.beginPath(); ctx.arc(cx, player.y + player.height / 2, 48, player.shieldAngle, player.shieldAngle + Math.PI * 1.7); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, player.y + player.height / 2, 48, player.shieldAngle + Math.PI, player.shieldAngle + Math.PI * 2.7); ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.shadowBlur = 0;
}

function drawShuriken(cx, cy, r, angle, color = '#ff4444') {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    
    // Draw an emoji instead of the spike shape
    ctx.font = `${r * 1.8}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧸', 0, 0);
    
    ctx.restore();
}

function drawPowerUp(p) {
    const cx = p.x + p.width / 2, cy = p.y + p.height / 2, col = p.type.color, s = p.width / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(p.angle); ctx.shadowBlur = 20; ctx.shadowColor = col; ctx.fillStyle = col + '33'; ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col; ctx.font = `bold ${Math.round(s * 0.85)}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowBlur = 0;
    ctx.fillText(p.type.label, 0, 0); ctx.restore();
}

function drawBoss() {
    const cx = boss.x + boss.width / 2, cy = boss.y + boss.height / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(boss.angle * 0.3); ctx.shadowBlur = 35; ctx.shadowColor = boss.color; ctx.fillStyle = boss.color;
    ctx.fillRect(-boss.width / 2, -boss.height / 2, boss.width, boss.height);
    for (let i = 0; i < boss.maxHp; i++) { if (i < boss.hp) continue; ctx.fillStyle = '#ff000070'; ctx.fillRect(-boss.width / 2 + i * (boss.width / boss.maxHp), -boss.height / 2, boss.width / boss.maxHp, boss.height); }
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(0, 0, boss.width * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(4, 0, boss.width * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.restore();
}

function drawBossHP() {
    const bW = 240, bH = 14, bX = canvas.width / 2 - bW / 2, bY = 8, pct = boss.hp / boss.maxHp;
    ctx.fillStyle = '#111'; ctx.fillRect(bX, bY, bW, bH); ctx.shadowBlur = 10; ctx.shadowColor = '#ff2222'; ctx.fillStyle = '#ff2222'; ctx.fillRect(bX, bY, bW * pct, bH);
    ctx.shadowBlur = 0; ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 1; ctx.strokeRect(bX, bY, bW, bH);
    ctx.fillStyle = '#fff'; ctx.font = '9px Orbitron,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('BOSS', canvas.width / 2, bY + bH / 2);
}

function drawHandCursor() {
    if (!handVisible || !gameActive) return;
    ctx.save(); ctx.shadowBlur = 18; ctx.shadowColor = '#ffff00'; ctx.strokeStyle = '#ffff00'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(handCursorX, handCursorY, 14, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,0,0.5)'; ctx.beginPath(); ctx.arc(handCursorX, handCursorY, 4, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.restore();
}

// =====================================================================
//  GAME OVER / RESTART / LEADERBOARD
// =====================================================================
function gameOver() {
    gameActive = false; bossAlive = false; boss = null; SFX.gameover(); triggerFlash('rgba(255,0,0,0.6)');
    document.getElementById('final-score').innerText = score;
    document.getElementById('final-level').innerText = level;
    document.getElementById('final-combos').innerText = comboCount;
    document.getElementById('final-peak-stress').innerText = Math.round(peakStress) + '%';
    const rank = saveScore(playerName, score);
    document.getElementById('final-rank').innerText = '#' + rank;
    renderLeaderboard(rank);
    document.getElementById('game-over').classList.remove('hidden');
}

function restartGame() {
    score = 0; level = 1; lives = 1; scoreMultiplier = 1; backendStress = null; frameCount = 0;
    [enemies, powerUps, particles, player.bullets, gestureBuffer, replayFrames, stressChartLabels, stressChartData].forEach(a => a.length = 0);
    player.x = canvas.width / 2; player.shield = false;
    doubleShot = slowMoActive = shieldKitActive = invincible = victoryActive = rapidFireActive = false;
    peakStress = avgStressSum = avgStressCount = comboCount = 0;
    shieldCharges = victoryCharges = thumbsCharges = 1; lastChargeThreshold = 0;
    lastPalmGesture = lastFistGesture = lastVictoryGesture = lastThumbsGesture = false;
    bossAlive = false; boss = null; lastBombTime = -BOMB_COOLDOWN;
    scoreEl.innerText = '0000'; levelEl.innerText = '01'; multEl.innerText = 'x1'; multEl.style.color = '';
    peakStress = 0; avgStressSum = 0; avgStressCount = 0; comboCount = 0;
    stressChartLabels.length = 0; stressChartData.length = 0;
    updateChargeHUD();
    if (stressChart) stressChart.update('none');
    document.getElementById('game-over').classList.add('hidden');
    gameActive = true;
}

const LB_KEY = 'fingerNinjaLeaderboard';
function getLeaderboard() { try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; } catch { return []; } }
function saveScore(name, s) {
    const lb = getLeaderboard(); lb.push({ name: (name || 'NINJA').toUpperCase(), score: s, date: new Date().toLocaleDateString() });
    lb.sort((a, b) => b.score - a.score); const t = lb.slice(0, 5); localStorage.setItem(LB_KEY, JSON.stringify(t));
    return t.findIndex(e => e.name === (name || 'NINJA').toUpperCase() && e.score === s) + 1;
}
function renderLeaderboard(hr) {
    const lb = getLeaderboard(), tb = document.getElementById('leaderboard-body'); tb.innerHTML = '';
    lb.forEach((e, i) => { const tr = document.createElement('tr'); if (i + 1 === hr) tr.className = 'highlight'; tr.innerHTML = `<td>${i + 1}</td><td>${e.name}</td><td>${String(e.score).padStart(4, '0')}</td>`; tb.appendChild(tr); });
}

// =====================================================================
//  MAIN LOOP + START
// =====================================================================
function gameLoop(ts) { const dt = ts - lastTimestamp; lastTimestamp = ts; update(dt); draw(); requestAnimationFrame(gameLoop); }

startBtn.onclick = () => {
    initAudio();
    playerName = (document.getElementById('player-name').value.trim() || 'NINJA').toUpperCase();
    instructions.classList.add('hidden'); gameActive = true; lastTimestamp = performance.now(); replayFrames.length = 0;
    updateChargeHUD();
    requestAnimationFrame(gameLoop);
};

window.onresize = () => {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight; player.y = canvas.height - 110;
    stars.forEach(s => { s.x = Math.random() * canvas.width; s.y = Math.random() * canvas.height; });
};
