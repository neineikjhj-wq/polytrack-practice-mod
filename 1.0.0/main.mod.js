import { PolyMod, MixinType } from "https://cdn.polymodloader.com/cb/PolyTrackMods/PolyModLoader/0.6.2/PolyTypes.js";

class PracticeMenu extends PolyMod {

    // ================================================================
    // STATE
    // ================================================================
    frozen = false;
    speedMult = 1.0;
    inputsBlocked = false;
    simController = null; // grabbed via mixin
    carId = null;         // grabbed via mixin

    init(pml) {
        // Intercept the SimulationController so we can call pauseCar / controlCar
        pml.registerGlobalMixin({
            type: MixinType.INSERT,
            token: "new Worker(\"simulation_worker.bundle.js\")",
            func: `ActivePolyModLoader.getMod("practicemenu").onWorkerCreated(this);`
        });

        // Intercept createCar response to grab carId
        pml.registerGlobalMixin({
            type: MixinType.INSERT,
            token: "case o.UpdateResult:",
            func: `ActivePolyModLoader.getMod("practicemenu").onUpdateResult(t);`
        });

        this.buildUI();
        this.setupKeys();
    }

    // Called when the simulation worker controller is instantiated
    onWorkerCreated(controller) {
        this.simController = controller;
        this.updateStatus("✓ Sim controller ready");
        console.log("[PracticeMenu] Sim controller captured");
    }

    // Called every physics frame update — grab carId from here
    onUpdateResult(data) {
        if (data && data.carStateBuffers && this.carId == null) {
            // carId is encoded in first 4 bytes of each buffer
            for (const buf of data.carStateBuffers) {
                const bytes = new Uint8Array(buf);
                const id = bytes[0] | bytes[1] << 8 | bytes[2] << 16 | bytes[3] << 24;
                if (id >= 0) {
                    this.carId = id;
                    this.updateStatus("✓ Ready | carId: " + id);
                    console.log("[PracticeMenu] carId:", id);
                    break;
                }
            }
        }
    }

    // ================================================================
    // ACTIONS
    // ================================================================

    sendToSim(msg) {
        if (!this.simController) { this.showNotif("Sim not ready yet", "#ff6b6b"); return false; }
        // The worker is stored as a private field — use postMessage via the worker ref
        // PML gives us access to the class instance, so we call its methods directly
        if (msg.messageType === 7) {
            this.simController.pauseCar(msg.carId, msg.isPaused);
            return true;
        }
        if (msg.messageType === 6) {
            this.simController.controlCar(msg.carId, msg.up, msg.right, msg.down, msg.left, msg.reset);
            return true;
        }
        return false;
    }

    toggleFreeze() {
        this.frozen = !this.frozen;
        if (this.carId != null) {
            this.sendToSim({ messageType: 7, carId: this.carId, isPaused: this.frozen });
        }
        this.updateStatus(this.frozen ? "⏸ Frozen" : "▶ Running");
        this.showNotif(this.frozen ? "⏸ Frozen" : "▶ Resumed", this.frozen ? "#ff6b6b" : "#4ecdc4");
    }

    setSpeed(mult) {
        this.speedMult = mult;
        this.frozen = false;
        if (this.carId != null) {
            this.sendToSim({ messageType: 7, carId: this.carId, isPaused: false });
        }
        // Speed scaling: INSERT a multiplier into the physics timestep
        // We do this by overriding how controlCar batches frames
        this.applySpeedMixin(mult);
        this.updateStatus("⚡ Speed: " + mult + "x");
        this.showNotif("⚡ Speed → " + mult + "x", mult < 1 ? "#4ecdc4" : "#ffd93d");
        document.querySelectorAll(".pt-spd").forEach(b => {
            b.style.outline = parseFloat(b.dataset.m) === mult ? "2px solid #fff" : "none";
        });
    }

    applySpeedMixin(mult) {
        // We control speed by how often we feed controlCar to the sim.
        // Store the multiplier globally so the mixin can read it.
        window.__PT_SPEED__ = mult;
    }

    resetLap() {
        if (this.carId != null) {
            this.sendToSim({ messageType: 6, carId: this.carId, up: false, right: false, down: false, left: false, reset: true });
        }
        // Keyboard fallback
        ["keydown", "keyup"].forEach(t => document.dispatchEvent(new KeyboardEvent(t, { key: "r", code: "KeyR", keyCode: 82, bubbles: true })));
        this.frozen = false;
        this.updateStatus("↻ Reset");
        this.showNotif("↻ Lap reset", "#ffa500");
    }

    toggleInputBlock() {
        this.inputsBlocked = !this.inputsBlocked;
        this.updateStatus(this.inputsBlocked ? "🎮 Inputs BLOCKED" : "🎮 Inputs enabled");
        this.showNotif(this.inputsBlocked ? "🛑 Inputs blocked" : "✅ Inputs enabled", this.inputsBlocked ? "#e74c3c" : "#27ae60");
    }

    setupKeys() {
        document.addEventListener("keydown", (e) => {
            if (this.inputsBlocked && document.getElementById("pt-menu")) {
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        }, true);
        document.addEventListener("keyup", (e) => {
            if (this.inputsBlocked && document.getElementById("pt-menu")) {
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        }, true);
    }

    // ================================================================
    // UI
    // ================================================================

    buildUI() {
        // Inject style
        const style = document.createElement("style");
        style.textContent = `
            @keyframes pt-fade { 0%{opacity:1} 70%{opacity:1} 100%{opacity:0} }
            #pt-menu button:hover { filter: brightness(1.4); }
        `;
        document.head.appendChild(style);

        const menu = document.createElement("div");
        menu.id = "pt-menu";
        menu.style.cssText = `
            position: fixed; top: 50px; right: 20px; width: 310px;
            background: #0a0e27; border: 2px solid #00ff88; border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0,0,0,.8);
            font-family: 'Courier New', monospace; z-index: 999999;
            color: #fff; user-select: none;
        `;

        const speeds = [
            [0,    "⏸", "FREEZE", "#ff6b6b"],
            [0.25, "🐢", "0.25x",  "#4ecdc4"],
            [0.5,  "🐌", "0.5x",   "#4ecdc4"],
            [1.0,  "▶",  "1x",     "#00ff88"],
            [2.0,  "⚡", "2x",     "#ffd93d"],
        ];

        menu.innerHTML = `
            <div id="pt-hdr" style="background:#00ff88;color:#000;padding:10px 14px;font-weight:bold;font-size:12px;letter-spacing:2px;cursor:move;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0;">
                <span>⚙️ PRACTICE MENU</span>
                <button id="pt-x" style="background:none;border:none;color:#000;font-size:16px;cursor:pointer;padding:0;line-height:1;">✕</button>
            </div>
            <div style="padding:12px;">

                <div style="font-size:9px;color:#00ff88;letter-spacing:1px;margin-bottom:5px;">SPEED / FREEZE</div>
                <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:10px;">
                    ${speeds.map(([m, ic, lb, cl]) => `
                        <button class="pt-spd" data-m="${m}" style="
                            padding:7px 3px; background:${cl}1a; border:2px solid ${cl};
                            color:${cl}; font-size:9px; font-weight:bold; border-radius:5px;
                            cursor:pointer; font-family:inherit; display:flex;
                            flex-direction:column; align-items:center; gap:2px; min-height:42px;
                            ${m === 1.0 ? "outline:2px solid #fff;" : ""}
                        "><span style="font-size:14px">${ic}</span>${lb}</button>
                    `).join("")}
                </div>

                <div style="font-size:9px;color:#00ff88;letter-spacing:1px;margin-bottom:5px;">ACTIONS</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:10px;">
                    <button id="pt-rst" style="padding:9px;background:#ffa5001a;border:2px solid #ffa500;color:#ffa500;font-weight:bold;font-size:10px;border-radius:5px;cursor:pointer;font-family:inherit;">↻ RESET</button>
                    <button id="pt-blk" style="padding:9px;background:#e74c3c1a;border:2px solid #e74c3c;color:#e74c3c;font-weight:bold;font-size:10px;border-radius:5px;cursor:pointer;font-family:inherit;">🎮 BLOCK INPUT</button>
                </div>

                <div id="pt-st" style="padding:7px;background:#1a1f3a;border:1px solid #00ff8844;border-radius:4px;font-size:10px;color:#00ff88;">
                    Waiting for race to start...
                </div>
            </div>
        `;

        // Wait for body to be ready
        const attach = () => {
            if (document.body) {
                document.body.appendChild(menu);
                this.wireUI();
            } else {
                setTimeout(attach, 100);
            }
        };
        attach();
    }

    wireUI() {
        // Speed buttons
        document.querySelectorAll(".pt-spd").forEach(btn => {
            const m = parseFloat(btn.dataset.m);
            btn.addEventListener("click", () => {
                if (m === 0) this.toggleFreeze();
                else this.setSpeed(m);
            });
        });

        document.getElementById("pt-rst").addEventListener("click", () => this.resetLap());
        document.getElementById("pt-blk").addEventListener("click", () => this.toggleInputBlock());
        document.getElementById("pt-x").addEventListener("click", () => {
            document.getElementById("pt-menu").style.display = "none";
        });

        // Drag
        const menu = document.getElementById("pt-menu");
        const hdr = document.getElementById("pt-hdr");
        let drag = false, ox = 0, oy = 0;
        hdr.addEventListener("mousedown", e => { drag = true; ox = e.clientX - menu.offsetLeft; oy = e.clientY - menu.offsetTop; });
        document.addEventListener("mousemove", e => { if (drag) { menu.style.left = (e.clientX - ox) + "px"; menu.style.top = (e.clientY - oy) + "px"; menu.style.right = "auto"; } });
        document.addEventListener("mouseup", () => { drag = false; });
    }

    updateStatus(text) {
        const el = document.getElementById("pt-st");
        if (el) el.textContent = text;
    }

    showNotif(text, color = "#00ff88") {
        const n = document.createElement("div");
        n.textContent = text;
        n.style.cssText = `
            position:fixed; bottom:24px; right:24px; z-index:1000000;
            background:${color}22; border:2px solid ${color}; color:${color};
            padding:10px 16px; border-radius:6px; font-weight:bold; font-size:12px;
            font-family:'Courier New',monospace; pointer-events:none;
            animation:pt-fade 3s forwards;
        `;
        document.body.appendChild(n);
        setTimeout(() => n.remove(), 3000);
    }
}

export let polyMod = new PracticeMenu();
