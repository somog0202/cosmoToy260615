const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// 右クリックメニューを無効化
canvas.addEventListener("contextmenu", e => e.preventDefault());

const particles = [];
const fields = [];
const walls = [];

// --- ジェスチャ判定用の状態管理 ---
const DRAG_THRESHOLD = 10; // ドラッグ判定とする移動距離(px)
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

        if (this.x < this.r) {
            this.x = this.r;
            this.vx *= -1;
        }
        if (this.x > canvas.width - this.r) {
            this.x = canvas.width - this.r;
            this.vx *= -1;
        }
        if (this.y < this.r) {
            this.y = this.r;
            this.vy *= -1;
        }
        if (this.y > canvas.height - this.r) {
            this.y = canvas.height - this.r;
            this.vy *= -1;
        }
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

// --- 入力制御 (ステートマシン) ---
canvas.addEventListener("pointerdown", e => {
    // マウスの場合は左クリックのみ反応させる
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    startX = e.clientX;
    startY = e.clientY;
    currX = startX;
    currY = startY;
    
    inputState = 'WAITING';

    // 長押しタイマーのセット
    pressTimer = setTimeout(() => {
        if (inputState === 'WAITING') {
            inputState = 'LONG_PRESS';
            // スマホ等で振動フィードバックがあれば鳴らす
            if (navigator.vibrate) navigator.vibrate(20);
        }
    }, LONG_PRESS_TIME);

    canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", e => {
    if (inputState === 'IDLE') return;

    currX = e.clientX;
    currY = e.clientY;

    if (inputState === 'WAITING') {
        const dist = Math.hypot(currX - startX, currY - startY);
        // 一定距離動いたらドラッグ（壁生成）モードへ移行
        if (dist > DRAG_THRESHOLD) {
            clearTimeout(pressTimer);
            inputState = 'DRAGGING';
        }
    }
});

window.addEventListener("pointerup", e => {
    if (inputState === 'IDLE') return;

    clearTimeout(pressTimer);

    if (inputState === 'WAITING') {
        // 短く押して離した -> タップ（白玉生成）
        particles.push(new Particle(startX, startY));

    } else if (inputState === 'DRAGGING') {
        // ドラッグして離した -> 壁生成
        const dist = Math.hypot(currX - startX, currY - startY);
        if (dist > 5) {
            walls.push(new Wall(startX, startY, currX, currY));
        }

    } else if (inputState === 'LONG_PRESS') {
        // 長押しメニューから選択して離した -> 力の生成
        const dx = currX - startX;
        const dist = Math.hypot(currX - startX, currY - startY);
        
        // 中心からある程度離れた場所でリリースした場合のみ生成
        if (dist > 20) {
            if (dx < 0) {
                // 左側で離した：斥力
                fields.push(new Field(startX, startY, 120, "red"));
            } else {
                // 右側で離した：引力
                fields.push(new Field(startX, startY, -120, "deepskyblue"));
            }
        }
    }

    inputState = 'IDLE';
});

// キャンセル処理
window.addEventListener("pointercancel", () => {
    clearTimeout(pressTimer);
    inputState = 'IDLE';
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

            const avx = a.vx;
            const avy = a.vy;
            a.vx = b.vx;
            a.vy = b.vy;
            b.vx = avx;
            b.vy = avy;
        }
    }
}

function solveWallCollisions() {
    for (const p of particles) {
        for (const wall of walls) {
            const wx1 = wall.x1;
            const wy1 = wall.y1;
            const wx2 = wall.x2;
            const wy2 = wall.y2;

            // 壁の線分ベクトル
            const wallDx = wx2 - wx1;
            const wallDy = wy2 - wy1;
            
            // 壁の線分の長さの2乗
            const lenSq = wallDx * wallDx + wallDy * wallDy;
            if (lenSq === 0) continue;

            // 球の中心から壁の始点へのベクトル
            const pdx = p.x - wx1;
            const pdy = p.y - wy1;

            // 線分上での最近点（射影）の割合t (0?1の範囲にクランプ)
            const dot = pdx * wallDx + pdy * wallDy;
            const t = Math.max(0, Math.min(1, dot / lenSq));

            // 線分上の最近点座標
            const closestX = wx1 + t * wallDx;
            const closestY = wy1 + t * wallDy;

            // 最近点と球の中心との距離
            const distVecX = p.x - closestX;
            const distVecY = p.y - closestY;
            const distSq = distVecX * distVecX + distVecY * distVecY;

            // 距離が半径より小さければ衝突（めり込んでいる）
            if (distSq > 0 && distSq < p.r * p.r) {
                const dist = Math.sqrt(distSq);
                
                // 衝突時の法線ベクトル（壁から球を押し出す方向）
                const nx = distVecX / dist;
                const ny = distVecY / dist;

                // めり込みの解消（めり込んだ分だけ法線方向に押し出す）
                const overlap = p.r - dist;
                p.x += nx * overlap;
                p.y += ny * overlap;

                // 速度の反射（法線方向の速度を反転）
                const vdot = p.vx * nx + p.vy * ny;
                // 壁に向かって動いている場合のみ反射させる
                if (vdot < 0) {
                    // 反射係数（1.0で完全弾性衝突）
                    const restitution = 1.0;
                    p.vx -= (1 + restitution) * vdot * nx;
                    p.vy -= (1 + restitution) * vdot * ny;
                }
            }
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

    // UIオーバーレイの描画
    if (inputState === 'DRAGGING') {
        // 壁のプレビュー
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(currX, currY);
        ctx.strokeStyle = "rgba(170, 170, 170, 0.5)";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.stroke();

    } else if (inputState === 'LONG_PRESS') {
        // 長押しラジアルメニューの描画
        const dx = currX - startX;
        const dist = Math.hypot(currX - startX, currY - startY);
        const isLeft = dist > 20 && dx < 0;
        const isRight = dist > 20 && dx >= 0;

        // 中心点
        ctx.beginPath();
        ctx.arc(startX, startY, 5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.fill();

        // 操作ガイドの線
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(currX, currY);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.stroke();

        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // 左（斥力：赤）
        ctx.beginPath();
        ctx.arc(startX - 60, startY, 25, 0, Math.PI * 2);
        ctx.fillStyle = isLeft ? "red" : "rgba(255, 0, 0, 0.2)";
        ctx.fill();
        ctx.fillStyle = "white";
        ctx.fillText("Attraction", startX - 60, startY);

        // 右（引力：青）
        ctx.beginPath();
        ctx.arc(startX + 60, startY, 25, 0, Math.PI * 2);
        ctx.fillStyle = isRight ? "deepskyblue" : "rgba(0, 191, 255, 0.2)";
        ctx.fill();
        ctx.fillStyle = "white";
        ctx.fillText("Repulsion", startX + 60, startY);
    }
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

loop();