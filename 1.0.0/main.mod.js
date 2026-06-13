import { PolyMod } from "https://cdn.polymodloader.com/cb/PolyTrackMods/PolyModLoader/0.5.1/PolyModLoader.js";

class PracticeMenu extends PolyMod {

    frozen = false;
    inputsBlocked = false;

    init(pml) {
        console.log("[PracticeMenu] init called");
        this.buildUI();
        this.setupInputBlock();
        
        // Intercept Worker to hook physics
        const _Worker = window.Worker;
        const self = this;
        window.Worker = function(url, opts) {
            const w = new _Worker(url, opts);
            if (String(url).includes('simulation')) {
                window.__ptWorker = w;
                const origPost = w.postMessage.bind(w);
                w.postMessage = function(msg) {
                    // Grab carId from any outgoing message
                    if (msg && msg.carId != null && window.__ptCarId == null) {
                        window.__ptCarId = msg.carId;
                        self.updateStatus("✓ Ready | carId: " + msg.carId);
                    }
                    // Drop ControlCar (type 6) when frozen
                    if (window.__ptFrozen && msg && msg.messageType === 6) return;
                    origPost(msg);
                };
                w._orig = origPost;
                console.log("[PracticeMenu] Worker hooked!");
                self.updateStatus("Worker hooked — start a race");
            }
            return w;
        };
        window.Worker.prototype = _Worker.prototype;
    }

    toggleFreeze() {
        this.frozen = !this.frozen;
        window.__ptFrozen = this.frozen;
        if (window.__ptWorker && window.__ptCarId != null) {
            window.__ptWorker._orig({ messageType: 7, carId: window.__ptCarId, isPaused: this.frozen });
        }
        this.updateStatus(this.frozen ? "⏸ Frozen" : "▶ Running");
        this.showNotif(this.frozen ? "⏸ Frozen" : "▶ Resumed", this.frozen ? "#ff6b6b" : "#4ecdc4");
    }

    resetLap() {
        if (window.__ptWorker && window.__ptCarId != null) {
            window.__ptWorker._orig({ messageType: 6, carId: window.__ptCarId, up: false, right: false, down: false, left: false, reset: true });
        }
        ["keydown", "keyup"].forEach(t => document.dispatchEvent(new KeyboardEvent(t, { key: "r", code: "KeyR", keyCode: 82, bubbles: true })));
        this.frozen = false;
        window.__ptFrozen = false;
        this.updateStatus("↻ Reset");
        this.showNotif("↻ Lap reset", "#ffa500");
    }

    toggleInputBlock() {
        this.inputsBlocked = !this.inputsBlocked;
        this.updateStatus(this.inputsBlocked ? "🎮 Inputs BLOCKED" : "🎮 Inputs enabled");
        this.showNotif(this.inputsBlocked ? "🛑 Inputs blocked" : "✅ Inputs enabled", this.inputsBlocked ? "#e74c3c" : "#27ae60");
    }

    setupInputBlock() {
        document.addEventListener("keydown", (e) => {
            if (this.inputsBlocked) { e.stopImmediatePropagation(); e.preventDefault(); }
        }, true);
        document.addEventListener("keyup", (e) => {
            if (this.inputsBlocked) { e.stopImmediatePropagation(); e.preventDefault(); }
        }, true);
    }

    buildUI() {
        const style = document.createElement("style");
        style.textContent = `@keyframes pt-fade{0%{opacity:1}70%{opacity:1}100%{opacity:0}} #pt-menu button:hover{filter:brightness(1.4)}`;
        document.head.appendChild(style);

        const speeds = [[0,"⏸","FREEZE","#ff6b6b"],[0.25,"🐢","0.25x","#4ecdc4"],[0.5,"🐌","0.5x","#4ecdc4"],[1.0,"▶","1x","#00ff88"],[2.0,"⚡","2x","#ffd93d"]];

        const menu = document.createElement("div");
        menu.id = "pt-menu";
        menu.style.cssText = "position:fixed;top:50px;right:20px;width:310px;background:#0a0e27;border:2px solid #00ff88;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.8);font-family:'Courier New',monospace;z-index:999999;color:#fff;user-select:none;";
        menu.innerHTML = `
            <div id="pt-hdr" style="background:#00ff88;color:#000;padding:10px 14px;font-weight:bold;font-size:12px;letter-spacing:2px;cursor:move;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0;">
                <span>⚙️ PRACTICE MENU</span>
                <button id="pt-x" style="background:none;border:none;color:#000;font-size:16px;cursor:pointer;padding:0;line-height:1;">✕</button>
            </div>
            <div style="padding:12px;">
                <div style="font-size:9px;color:#00ff88;letter-spacing:1px;margin-bottom:5px;">SPEED / FREEZE</div>
                <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:10px;">
                    ${speeds.map(([m,ic,lb,cl]) => `<button class="pt-spd" data-m="${m}" style="padding:7px 3px;background:${cl}1a;border:2px solid ${cl};color:${cl};font-size:9px;font-weight:bold;border-radius:5px;cursor:pointer;font-family:inherit;display:flex;flex-direction:column;align-items:center;gap:2px;min-height:42px;${m===1.0?"outline:2px solid #fff;":""}"><span style="font-size:14px">${ic}</span>${lb}</button>`).join("")}
                </div>
                <div style="font-size:9px;color:#00ff88;letter-spacing:1px;margin-bottom:5px;">ACTIONS</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:10px;">
                    <button id="pt-rst" style="padding:9px;background:#ffa5001a;border:2px solid #ffa500;color:#ffa500;font-weight:bold;font-size:10px;border-radius:5px;cursor:pointer;font-family:inherit;">↻ RESET</button>
                    <button id="pt-blk" style="padding:9px;background:#e74c3c1a;border:2px solid #e74c3c;color:#e74c3c;font-weight:bold;font-size:10px;border-radius:5px;cursor:pointer;font-family:inherit;">🎮 BLOCK INPUT</button>
                </div>
                <div id="pt-st" style="padding:7px;background:#1a1f3a;border:1px solid #00ff8844;border-radius:4px;font-size:10px;color:#00ff88;">Loading...</div>
            </div>`;

        const attach = () => {
            if (document.body) { document.body.appendChild(menu); this.wireUI(); }
            else setTimeout(attach, 100);
        };
        attach();
    }

    wireUI() {
        document.querySelectorAll(".pt-spd").forEach(btn => {
            const m = parseFloat(btn.dataset.m);
            btn.addEventListener("click", () => {
                if (m === 0) { this.toggleFreeze(); return; }
                // Slow-mo via interval
                this.setSpeed(m);
                document.querySelectorAll(".pt-spd").forEach(b => b.style.outline = parseFloat(b.dataset.m) === m ? "2px solid #fff" : "none");
            });
        });
        document.getElementById("pt-rst").addEventListener("click", () => this.resetLap());
        document.getElementById("pt-blk").addEventListener("click", () => this.toggleInputBlock());
        document.getElementById("pt-x").addEventListener("click", () => document.getElementById("pt-menu").style.display = "none");

        const menu = document.getElementById("pt-menu");
        const hdr = document.getElementById("pt-hdr");
        let drag=false, ox=0, oy=0;
        hdr.addEventListener("mousedown", e => { drag=true; ox=e.clientX-menu.offsetLeft; oy=e.clientY-menu.offsetTop; });
        document.addEventListener("mousemove", e => { if(drag){menu.style.left=(e.clientX-ox)+"px";menu.style.top=(e.clientY-oy)+"px";menu.style.right="auto";} });
        document.addEventListener("mouseup", () => { drag=false; });
    }

    setSpeed(mult) {
        // Clear old interval
        if (this._slowMoInterval) { clearInterval(this._slowMoInterval); this._slowMoInterval = null; }
        this.frozen = false;
        window.__ptFrozen = false;
        
        if (mult === 1.0) {
            this.updateStatus("▶ Normal speed");
            this.showNotif("▶ 1x speed", "#00ff88");
            return;
        }
        if (mult > 1.0) {
            // Can't speed up physics easily - notify user
            this.updateStatus("⚡ " + mult + "x (visual only)");
            this.showNotif("⚡ " + mult + "x", "#ffd93d");
            return;
        }
        // Slow-mo: drop frames proportionally
        let frameCount = 0;
        const keepEvery = Math.round(1 / mult);
        const origPost = window.__ptWorker?._orig;
        if (!origPost) { this.showNotif("Start a race first!", "#ff6b6b"); return; }

        // Replace postMessage with frame dropper
        window.__ptWorker.postMessage = function(msg) {
            if (msg && msg.messageType === 6) {
                frameCount++;
                if (frameCount % keepEvery !== 0) return;
            }
            origPost(msg);
        };
        window.__ptWorker._orig = origPost;

        this.updateStatus("🐢 Speed: " + mult + "x");
        this.showNotif("🐢 Speed → " + mult + "x", "#4ecdc4");
    }

    updateStatus(t) { const e = document.getElementById("pt-st"); if(e) e.textContent = t; }

    showNotif(text, color="#00ff88") {
        const n = document.createElement("div");
        n.textContent = text;
        n.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:1000000;background:${color}22;border:2px solid ${color};color:${color};padding:10px 16px;border-radius:6px;font-weight:bold;font-size:12px;font-family:'Courier New',monospace;pointer-events:none;animation:pt-fade 3s forwards;`;
        document.body.appendChild(n);
        setTimeout(() => n.remove(), 3000);
    }
}

export let polyMod = new PracticeMenu();
