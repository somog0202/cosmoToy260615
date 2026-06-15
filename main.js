const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// コンテキストメニューを禁止
canvas.addEventListener("contextmenu", e => e.preventDefault());

const particles = [];
const fields = [];
const walls = [];

// --- ジェスチャ判定用の状態管理 ---
const DRAG_THRESHOLD = 15;   // ドラッグと判定する移動距離(px) ※スマホ用に少し広めに調整
const LONG_PRESS_TIME = 400; // 長押し判定とする時間(ms)

let inputState = 'IDLE'; // 'IDLE', 'WAITING', 'DRAGGING', 'LONG_PRESS'
let startX = 0;
let startY = 0;
let currX = 0;
let currY = 0;
let pressTimer = null;

class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = (Math.random() - 0.5) * 4;
        this.r = 10;
    }

    update() {
        this.prevX = this.x;
        this.prevY = this.y;

        for (const f of fields) {
            let dx = f.x - this.x;
            let dy = f.y - this.y;
            let d2 = dx * dx + dy * dy;

            if (d2 < 400) d2 = 400;

            let d = Math.sqrt(d2);
            let force = f.strength / d2;

            this.vx += force * dx / d;
            this.vy += force * dy / d;
        }

        this.x += this.vx;
        this.y += this.vy;

        if (this.x < this.r) { this.x = this.r; this.vx *= -1; }
        if (this.x > canvas.width - this.r) { this.x = canvas.width - this.r; this.vx *= -1; }
        if (this.y < this.r) { this.y = this.r; this.vy *= -1; }
        if (this.y > canvas.height - this.r) { this.y = canvas.height - this.r; this.vy *= -1; }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.fill();
    }
}

class Field {
    constructor(x, y, strength, color) {
        this.x = x;
        this.y = y;
        this.strength = strength;
        this.color = color;
        this.r = 12;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
}

class Wall {
    constructor(x1, y1, x2, y2) {
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
    }

    draw() {
        ctx.beginPath();
        ctx.moveTo(this.x1, this.y1);
        ctx.lineTo(this.x2, this.y2);
        ctx.strokeStyle = "#AAA";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.stroke();
    }
}

// --- 入力制御 (スマホ・PCハイブリッド対応) ---
canvas.addEventListener("pointerdown", e => {
    // マウスの場合は左クリックのみ、タッチはすべて通す
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    startX = e.clientX;
    startY = e.clientY;
    currX = startX;
    currY = startY;
    
    inputState = 'WAITING';

    // 長押しタイマー
    pressTimer = setTimeout(() => {
        if (inputState === 'WAITING') {
            inputState = 'LONG_PRESS';
            // スマホのバイブレーション（Android等、動く環境のみ）
            if (navigator.vibrate) navigator.vibrate(20);
        }
    }, LONG_PRESS_TIME);

    // ポインターイベントをこのCanvasに拘束（画面外に出ても追跡する）
    canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", e => {
    if (inputState === 'IDLE') return;

    currX = e.clientX;
    currY = e.clientY;

    if (inputState === 'WAITING') {
        const dist = Math.hypot(currX - startX, currY - startY);
        // 一定距離動いたら「ドラッグ（壁生成）」とみなす
        if (dist > DRAG_THRESHOLD) {
            clearTimeout(pressTimer);
            inputState = 'DRAGGING';
        }
    }
});

// イベントを window から canvas に変更し、確実に発火させる
canvas.addEventListener("pointerup", e => {
    if (inputState === 'IDLE') return;

    clearTimeout(pressTimer);

    if (inputState === 'WAITING') {
        // 短く離した：タップ（白玉）
        particles.push(new Particle(startX, startY));
    } else if (inputState === 'DRAGGING') {
        // 動かして離した：壁
        const dist = Math.hypot(currX - startX, currY - startY);
        if (dist > 5) {
            walls.push(new Wall(startX, startY, currX, currY));
        }
    } else if (inputState === 'LONG_PRESS') {
        // 長押しからスワイプして離した：力
        const dx = currX - startX;
        const dist = Math.hypot(currX - startX, currY - startY);
        
        if (dist > 25) {
            if (dx < 0) {
                fields.push(new Field(startX, startY, 120, "red")); // 斥力
            } else {
                fields.push(new Field(startX, startY, -120, "deepskyblue")); // 引力
            }
        }
    }

    inputState = 'IDLE';
    canvas.releasePointerCapture(e.pointerId);
});

// ブラウザの介入などで中断された場合のセーフティ
canvas.addEventListener("pointercancel", e => {
    clearTimeout(pressTimer);
    inputState = 'IDLE';
    canvas.releasePointerCapture(e.pointerId);
});

// --- 物理演算 (変更なし) ---
function solveParticleCollisions() {
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const a = particles[i];
            const b = particles[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist === 0) continue;
            const minDist = a.r + b.r;
            if (dist >= minDist) continue;
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;
            a.x -= nx * overlap * 0.5;
            a.y -= ny * overlap * 0.5;
            b.x += nx * overlap * 0.5;
            b.y += ny * overlap * 0.5;
            const avx = a.vx; const avy = a.vy;
            a.vx = b.vx; a.vy = b.vy;
            b.vx = avx; b.vy = avy;
        }
    }
}

function solveWallCollisions() {
    for (const p of particles) {
        for (const wall of walls) {
            const sx1 = p.prevX; const sy1 = p.prevY;
            const sx2 = p.x; const sy2 = p.y;
            const wx1 = wall.x1; const wy1 = wall.y1;
            const wx2 = wall.x2; const wy2 = wall.y2;
            const den = (sx1 - sx2) * (wy1 - wy2) - (sy1 - sy2) * (wx1 - wx2);
            if (Math.abs(den) < 0.0001) continue;
            const t = ((sx1 - wx1) * (wy1 - wy2) - (sy1 - wy1) * (wx1 - wx2)) / den;
            const u = -((sx1 - sx2) * (sy1 - wy1) - (sy1 - sy2) * (sx1 - wx1)) / den;
            if (t < 0 || t > 1 || u < 0 || u > 1) continue;
            const wallDx = wx2 - wx1; const wallDy = wy2 - wy1;
            const wallLen = Math.sqrt(wallDx * wallDx + wallDy * wallDy);
            if (wallLen === 0) continue;
            let nx = -wallDy / wallLen; let ny = wallDx / wallLen;
            const dot = p.vx * nx + p.vy * ny;
            if (dot > 0) { nx *= -1; ny *= -1; }
            const vdot = p.vx * nx + p.vy * ny;
            p.vx -= 2 * vdot * nx; p.vy -= 2 * vdot * ny;
            p.x = sx1 + (sx2 - sx1) * t + nx * (p.r + 1);
            p.y = sy1 + (sy2 - sy1) * t + ny * (p.r + 1);
        }
    }
}

function update() {
    for (const p of particles) p.update();
    solveParticleCollisions();
    solveWallCollisions();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const wall of walls) wall.draw();
    for (const f of fields) f.draw();
    for (const p of particles) p.draw();

    // UIオーバーレイ
    if (inputState === 'DRAGGING') {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(currX, currY);
        ctx.strokeStyle = "rgba(170, 170, 170, 0.5)";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.stroke();
    } else if (inputState === 'LONG_PRESS') {
        const dx = currX - startX;
        const dist = Math.hypot(currX - startX, currY - startY);
        const isLeft = dist > 25 && dx < 0;
        const isRight = dist > 25 && dx >= 0;

        ctx.beginPath();
        ctx.arc(startX, startY, 5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(currX, currY);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.stroke();

        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // 左（斥力）
        ctx.beginPath();
        ctx.arc(startX - 65, startY, 28, 0, Math.PI * 2);
        ctx.fillStyle = isLeft ? "red" : "rgba(255, 0, 0, 0.2)";
        ctx.fill();
        ctx.fillStyle = "white";
        ctx.fillText("斥力", startX - 65, startY);

        // 右（引力）
        ctx.beginPath();
        ctx.arc(startX + 65, startY, 28, 0, Math.PI * 2);
        ctx.fillStyle = isRight ? "deepskyblue" : "rgba(0, 191, 255, 0.2)";
        ctx.fill();
        ctx.fillStyle = "white";
        ctx.fillText("引力", startX + 65, startY);
    }
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

loop();
