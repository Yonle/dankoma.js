/* ---------------------------------------------------------
 * Pure Helper Functions (Stateless)
 * ------------------------------------------------------ */
function number(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function degree(value) {
    return (number(value) * Math.PI) / 180;
}

function parseOpacity(value) {
    if (typeof value === "number") return { from: value, to: value };
    const parts = String(value ?? "1-1").split("-");
    return {
        from: Math.max(0, Math.min(1, number(parts[0], 1))),
        to: Math.max(0, Math.min(1, number(parts[1], number(parts[0], 1)))),
    };
}

function parseCoordinate(value, axisSize) {
    const n = number(value);
    if (n >= 0 && n <= 1) return n * axisSize;
    return n;
}

function mode7_ease(t, linear) {
    t = Math.max(0, Math.min(1, t));
    if (linear) return t;
    return 1 - (1 - t) * (1 - t);
}

function rgbaFromRGB888(color, alpha = 1) {
    const n = number(color, 0xffffff) >>> 0;
    const r = (n >>> 16) & 0xff;
    const g = (n >>> 8) & 0xff;
    const b = n & 0xff;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function makeCanvas(width, height) {
    if (typeof OffscreenCanvas !== "undefined") {
        return new OffscreenCanvas(width, height);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

/* ---------------------------------------------------------
 * Main Dankoma Class
 * ------------------------------------------------------ */
class Dankoma {
    constructor(canvas, config = {}) {
        this.canvas = canvas;
        this.ctx = this.canvas.getContext("2d", { alpha: true });
        this.ctx.imageSmoothingEnabled = false;

        // Default Config
        this.config = {
            laneHeight: 32,
            dpr: 1,
            fonts: {
                scroll: 32,
                fixed: 32,
                weight: 500,
                family: `"SimHei", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`,
            },
            style: { opacity: 0.8 },
            scroll: { duration: 8.5, lookahead: 4, gap: 2 },
            fixed: { lifetime: 5000 },
            mode7: { weight: 400, outlineWidth: 1 },
        };
        
        // Merge user config
        this.updateConfig(config);

        // State
        this.video = null;
        this.activeMode7 = new Set();
        this.danmaku = [];
        this.timeline = [];
        this.danmakuIndex = 0;
        this.lastVideoTime = 0;
        this.drawEnabled = true;
        this.danmakuRunning = false;
        
        this.W = 0;
        this.H = 0;
        this.dpr = 1;
        this.SPRITE_DPR = this.config.dpr;

        this.topLanes = [];
        this.bottomLanes = [];
        this.centerLanes = [];
        this.comments = [];
        this.lastTime = performance.now();

        // Caches
        this.mode7RenderedCache = new WeakMap();
        this.mode7SpriteCache = new Map();
        this.renderCache = new Map();
        this.metricsCache = new Map();

        // Bindings for events and RAF
        this.resize = this.resize.bind(this);
        this.trackDanma = this.trackDanma.bind(this);
        this.danmaFrame = this.danmaFrame.bind(this);

        window.addEventListener("resize", this.resize);
        this.resize();

        // Start generic render loops
        this.rafFrame = requestAnimationFrame(this.danmaFrame);
    }

    /* ---------------------------------------------------------
     * Public API
     * ------------------------------------------------------ */
    
    updateConfig(newConfig) {
        // Deep-ish merge implementation for config updates
        for (const key in newConfig) {
            if (typeof newConfig[key] === 'object' && newConfig[key] !== null) {
                this.config[key] = { ...this.config[key], ...newConfig[key] };
            } else {
                this.config[key] = newConfig[key];
            }
        }
        this.SPRITE_DPR = this.config.dpr;
    }

    trackVideo(videoElem) {
        this.video = videoElem;
        this.lastVideoTime = this.video.currentTime;
        if (!this.danmakuRunning) {
            this.danmakuRunning = true;
            this.rafTrack = requestAnimationFrame(this.trackDanma);
        }
    }

    untrackVideo() {
        this.video = null;
        this.danmakuRunning = false;
        if (this.rafTrack) cancelAnimationFrame(this.rafTrack);
    }

    hide() {
        this.drawEnabled = false;
        this.ctx.clearRect(0, 0, this.W, this.H);
    }

    unhide() {
        this.drawEnabled = true;
        this.lastTime = performance.now(); // Prevent large dt jumps
    }

    destroy() {
        window.removeEventListener("resize", this.resize);
        this.untrackVideo();
        if (this.rafFrame) cancelAnimationFrame(this.rafFrame);
        
        this.ctx.clearRect(0, 0, this.W, this.H);
        
        this.comments = [];
        this.danmaku = [];
        this.timeline = [];
        this.activeMode7.clear();
        this.mode7SpriteCache.clear();
        this.renderCache.clear();
        this.metricsCache.clear();
    }

    clearDanmakus() {
        this.comments.length = 0;
        this.activeMode7.clear();
        this.rebuildLanes();
        this.ctx.clearRect(0, 0, this.W, this.H);
    }

    resetDanmakuData() {
        this.danmaku.length = 0;
        this.timeline.length = 0;
        this.danmakuIndex = 0;
        this.activeMode7.clear();
        this.comments.length = 0;
        this.rebuildLanes();
    }

    appendDanmaku(comment) {
        const index = this.danmaku.length;

        this.danmaku.push(comment);
        this.timeline.push({
            time: number(comment[1]),
            index,
        });
    }

    async loadDanmaJSONL(source) {
        const fetchSource = source instanceof Blob
            ? URL.createObjectURL(source)
            : source;

        const response = await fetch(fetchSource);
        if (!response.ok) {
            throw new Error(`failed to fetch danmaku: ${response.status}`);
        }

        const text = await this.readTextStream(response.body);

        this.parseJSONL(text, this.appendDanmaku.bind(this));

        if (source instanceof Blob) {
            URL.revokeObjectURL(fetchSource);
        }
    }

    async readTextStream(stream) {
        const reader = stream
            .pipeThrough(new TextDecoderStream())
            .getReader();

        let text = "";

        while (true) {
            const { value, done } = await reader.read();

            if (done) break;

            text += value;
        }

        return text;
    }

    parseJSONL(text, onComment) {
        for (const line of text.split("\n")) {
            if (!line.trim()) continue;

            onComment(JSON.parse(line));
        }
    }

    /* ---------------------------------------------------------
     * Danmaku Scheduling & Events
     * ------------------------------------------------------ */
    emitDanmaku(comment) {
        const [text, time, mode, timestamp, color, weight] = comment;
        switch (mode) {
            case 1:
            case 2:
            case 3:
                this.createComment(text, "scroll", color, 0);
                break;
            case 4:
                this.createComment(text, "bottom", color, 0);
                break;
            case 5:
                this.createComment(text, "top", color, 0);
                break;
            case 6:
                this.createComment(text, "scroll", color, 1);
                break;
            case 7:
                try {
                    this.activeMode7.add(this.createMode7(comment));
                } catch (err) {
                    console.error(timestamp, "Got error on mode7:", err, "\n", text);
                }
                break;
        }
    }

    seekDanmaku(time) {
        let lo = 0;
        let hi = this.timeline.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this.timeline[mid].time < time) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        this.danmakuIndex = lo;
    }

    updateDanmaku(currentTime) {
        if (Math.abs(currentTime - this.lastVideoTime) > 1.0) {
            this.seekDanmaku(currentTime);

            // Clear active comments so the screen doesn't get flooded with old sprites
            this.comments = [];
            this.rebuildLanes();
        }

        while (this.danmakuIndex < this.timeline.length && this.timeline[this.danmakuIndex].time <= currentTime) {
            const comment = this.danmaku[this.timeline[this.danmakuIndex].index];
            this.emitDanmaku(comment);
            this.danmakuIndex++;
        }
        this.lastVideoTime = currentTime;
    }

    /* ---------------------------------------------------------
     * Animation Loops
     * ------------------------------------------------------ */
    trackDanma() {
        if (this.video && !this.video.paused && this.drawEnabled) {
            this.updateDanmaku(this.video.currentTime);
        }
        if (this.danmakuRunning) {
            this.rafTrack = requestAnimationFrame(this.trackDanma);
        }
    }

    danmaFrame(now) {
        if (this.video && !this.video.paused && this.drawEnabled) {
            const currentTime = this.video.currentTime;
            this.ctx.clearRect(0, 0, this.W, this.H);
            this.drawDanmaFrame(now);
            this.mode7frameDanma(currentTime);
        }
        this.rafFrame = requestAnimationFrame(this.danmaFrame);
    }

    /* ---------------------------------------------------------
     * Mode 7 Logic
     * ------------------------------------------------------ */
    mode7CameraDistance() {
        return this.W / (2 * Math.tan(degree(20 / 2)));
    }

    mode7FontFamily(value) {
        if (!value) return this.config.fonts.family;
        let font = String(value).trim();
        if (font.length >= 2 && ((font[0] === '"' && font[font.length - 1] === '"') || (font[0] === "'" && font[font.length - 1] === "'"))) {
            return `${font}, ${this.config.fonts.family}`;
        }
        return `"${font}", ${this.config.fonts.family}`;
    }

    createMode7(record) {
        if (!Array.isArray(record)) throw new TypeError("mode7 record must be an array");
        const payload = record[0];
        const startTime = number(record[1]);
        const mode = number(record[2]);
        const color = number(record[4], 0xffffff);
        const fontSize = number(record[5], this.config.fonts.fixed);

        if (mode !== 7) throw new Error(`expected Mode 7, got mode ${mode}`);

        let data;
        try {
            data = typeof payload === "string" ? JSON.parse(payload) : payload;
        } catch (error) {
            throw new Error(`failed to parse Mode 7 payload: ${error.message}`);
        }

        if (!Array.isArray(data) || data.length < 5) throw new Error("invalid Mode 7 payload");

        const legacy = data.length < 14;
        const width = this.canvas.width / this.config.dpr;
        const height = this.canvas.height / this.config.dpr;

        let opacity, x1, y1, x2, y2, lifetime, moveDuration, delay;
        let zRotation = 0, yRotation = 0, linear = 1, outline = 0;
        let fontFamily = data.length >= 12 ? this.mode7FontFamily(data[12]) : this.config.fonts.family;

        if (!legacy) {
            opacity = parseOpacity(data[2]);
            x1 = parseCoordinate(data[0], width);
            y1 = parseCoordinate(data[1], height);
            x2 = parseCoordinate(data[7], width);
            y2 = parseCoordinate(data[8], height);
            lifetime = Math.max(0, number(data[3], 0) * 1000);
            moveDuration = Math.max(0, number(data[9], 0));
            delay = Math.max(0, number(data[10], 0));
            zRotation = number(data[5], 0);
            yRotation = number(data[6], 0);
            fontFamily = data[12] ? `"${data[12]}", ${this.config.fonts.family}` : this.config.fonts.family;
            outline = number(data[11], 0);
            linear = number(data[13], 1);
        } else {
            x1 = parseCoordinate(data[0], width);
            y1 = parseCoordinate(data[1], height);
            opacity = parseOpacity(data[2]);
            lifetime = Math.max(0, number(data[3], 0) * 1000);
            x2 = x1; y2 = y1;
            moveDuration = 0; delay = 0;
            zRotation = 0; yRotation = 0;
            fontFamily = this.config.fonts.family;
            outline = 0; linear = 1;
        }

        return {
            mode: 7,
            startTime,
            raw: data,
            text: String(data[4] ?? ""),
            fontSize,
            fontFamily,
            fontWeight: this.config.mode7.weight,
            color,
            outline: Boolean(outline),
            outlineWidth: this.config.mode7.outlineWidth,
            x1, y1, x2, y2, zRotation, yRotation,
            lifetime, moveDuration, delay,
            opacityFrom: opacity.from, opacityTo: opacity.to,
            linear: Boolean(linear),
            sprite: null,
        };
    }

    buildMode7Sprite(danmaku) {
        const { text, fontSize, fontFamily, fontWeight, color, outline, outlineWidth } = danmaku;
        const lines = String(text).split("\n");
        const font = `${fontWeight} ${fontSize}px ${fontFamily}`;

        const measureCanvas = makeCanvas(1, 1);
        const measureCtx = measureCanvas.getContext("2d", { alpha: false });
        measureCtx.font = font;
        measureCtx.textBaseline = "top";

        let textWidth = 0;
        for (const line of lines) {
            textWidth = Math.max(textWidth, measureCtx.measureText(line).width);
        }

        const lineHeight = Math.max(1, Math.ceil(fontSize));
        const padding = outline ? Math.ceil(outlineWidth * 2 + fontSize * 0.1) : Math.ceil(fontSize * 0.1);

        const logicalWidth = Math.max(1, Math.ceil(textWidth + padding * 2));
        const logicalHeight = Math.max(1, Math.ceil(lines.length * lineHeight + padding * 2));

        const canvas = makeCanvas(Math.ceil(logicalWidth * this.SPRITE_DPR), Math.ceil(logicalHeight * this.SPRITE_DPR));
        const ctx = canvas.getContext("2d", { alpha: true });

        ctx.scale(this.SPRITE_DPR, this.SPRITE_DPR);
        ctx.font = font;
        ctx.textBaseline = "top";
        ctx.textAlign = "left";

        for (let i = 0; i < lines.length; i++) {
            const x = padding;
            const y = padding + i * lineHeight;
            if (outline) {
                ctx.lineWidth = outlineWidth;
                ctx.lineJoin = "round";
                ctx.strokeStyle = "rgba(0, 0, 0, 1)";
                ctx.strokeText(lines[i], x, y);
            }
            ctx.fillStyle = rgbaFromRGB888(color, 1);
            ctx.fillText(lines[i], x, y);
        }

        return { canvas, width: logicalWidth, height: logicalHeight };
    }

    getMode7Sprite(danmaku) {
        if (danmaku.sprite) return danmaku.sprite;
        const key = [danmaku.text, danmaku.fontSize, danmaku.fontFamily, danmaku.fontWeight, danmaku.color, danmaku.outline, danmaku.outlineWidth, this.config.laneHeight, this.SPRITE_DPR].join("|");
        
        let sprite = this.mode7SpriteCache.get(key);
        if (!sprite) {
            sprite = this.buildMode7Sprite(danmaku);
            this.mode7SpriteCache.set(key, sprite);
        }
        danmaku.sprite = sprite;
        return sprite;
    }

    getMode7RenderedSprite(danmaku) {
        const sprite = this.getMode7Sprite(danmaku);
        if (danmaku.yRotation === 0) return sprite;

        const focal = this.mode7CameraDistance();
        const slices = Math.min(24, Math.max(8, Math.ceil(sprite.width / 8)));
        const rotationKey = Math.round(danmaku.yRotation * 2) / 2; // Quantize to 0.5 degree steps

        let cache = this.mode7RenderedCache.get(sprite);
        if (!cache) {
            cache = new Map();
            this.mode7RenderedCache.set(sprite, cache);
        }

        const key = `${rotationKey}:${this.W}:${slices}`;
        let rendered = cache.get(key);
        if (rendered) return rendered;

        const angle = degree(rotationKey);
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const width = sprite.width;
        const height = sprite.height;
        const spriteDpr = sprite.canvas.width / sprite.width;
        const srcCanvasWidth = sprite.canvas.width;
        const srcH = sprite.canvas.height;
        const leftX = 0;
        const rightX = width;

        const leftDepth = focal - leftX * sinA;
        const rightDepth = focal - rightX * sinA;

        if (leftDepth <= 1 || rightDepth <= 1) return sprite;

        const leftScale = focal / leftDepth;
        const rightScale = focal / rightDepth;
        const leftProjectedX = leftX * cosA * leftScale;
        const rightProjectedX = rightX * cosA * rightScale;
        const minX = Math.min(leftProjectedX, rightProjectedX);
        const maxX = Math.max(leftProjectedX, rightProjectedX);
        const projectedHeight = height * Math.max(leftScale, rightScale);
        const pad = 2;

        const outputWidth = Math.ceil(maxX - minX) + pad * 2;
        const outputHeight = Math.ceil(projectedHeight) + pad * 2;

        const start = performance.now();

        /*console.log({
            spriteWidth: sprite.width,
            spriteHeight: sprite.height,
            outputWidth,
            outputHeight,
            minX,
            maxX,
            projectedHeight,
            angle: danmaku.yRotation
        });*/

        if (
            !Number.isFinite(outputWidth) ||
            !Number.isFinite(outputHeight) ||
            outputWidth <= 0 ||
            outputHeight <= 0 ||
            (outputWidth * outputHeight > 16_000_000)
        ) {
            console.log("mode7 bakery: What the fuck: ", danmaku.text?.slice(0, 20))
            console.log({
                W: this.W,
                H: this.H,
                focal,
                angle: danmaku.yRotation,
                width,
                leftDepth,
                rightDepth,
                leftScale,
                rightScale,
                outputWidth
            });
            cache.set(key, sprite);
            return sprite;
        }

        const outputCanvas = document.createElement("canvas");
        outputCanvas.width = Math.ceil(outputWidth * spriteDpr);
        outputCanvas.height = Math.ceil(outputHeight * spriteDpr);
        
        const out = outputCanvas.getContext("2d", { alpha: true });
        out.imageSmoothingEnabled = false;
        out.setTransform(spriteDpr, 0, 0, spriteDpr, 0, 0);
        out.translate(-minX + pad, pad);

        for (let i = 0; i < slices; i++) {
            const x0 = (width * i) / slices;
            const x1 = (width * (i + 1)) / slices;
            const rotX0 = x0 * cosA;
            const rotZ0 = -x0 * sinA;
            const depth0 = focal + rotZ0;
            if (depth0 <= 1) continue;

            const scale0 = focal / depth0;
            const destX0 = rotX0 * scale0;
            const rotX1 = x1 * cosA;
            const rotZ1 = -x1 * sinA;
            const depth1 = focal + rotZ1;
            if (depth1 <= 1) continue;

            const scale1 = focal / depth1;
            const destX1 = rotX1 * scale1;
            const destLeft = Math.min(destX0, destX1);
            const destWidth = Math.abs(destX1 - destX0);

            const destHeight = height * scale0;
            const destY = 0;
            const srcX0 = Math.floor((srcCanvasWidth * i) / slices);
            const srcX1 = Math.floor((srcCanvasWidth * (i + 1)) / slices);
            const srcW = srcX1 - srcX0;
            if (srcW <= 0) continue;

            /*console.log({
                depth0,
                depth1,
                scale0,
                scale1,
                destX0,
                destX1
            });*/

            out.drawImage(
                sprite.canvas,
                srcX0, 0, srcW, srcH,
                destLeft, destY, destWidth, destHeight
            );
        }

        rendered = {
            canvas: outputCanvas,
            width: outputWidth,
            height: outputHeight,
            offsetX: minX - pad,
            offsetY: -pad
        };

        cache.set(key, rendered);
        return rendered;
    }

    mode7_frame(danmaku, time) {
        const elapsed = (number(time) - danmaku.startTime) * 1000;
        if (elapsed < 0) return null;
        if (elapsed > danmaku.lifetime) return null;

        const movementTime = elapsed - danmaku.delay;
        let movementProgress = 0;

        if (danmaku.moveDuration <= 0) {
            movementProgress = movementTime >= 0 ? 1 : 0;
        } else if (movementTime <= 0) {
            movementProgress = 0;
        } else {
            movementProgress = Math.min(1, movementTime / danmaku.moveDuration);
        }

        const eased = mode7_ease(movementProgress, danmaku.linear);
        const x = danmaku.x1 + (danmaku.x2 - danmaku.x1) * eased;
        const y = danmaku.y1 + (danmaku.y2 - danmaku.y1) * eased;
        
        const lifetimeProgress = danmaku.lifetime > 0 ? Math.min(1, Math.max(0, elapsed / danmaku.lifetime)) : 1;
        const opacity = danmaku.opacityFrom + (danmaku.opacityTo - danmaku.opacityFrom) * lifetimeProgress;

        return { x, y, opacity, zRotation: danmaku.zRotation, yRotation: danmaku.yRotation, movementProgress, lifetimeProgress };
    }

    drawMode7(danmaku, time) {
        const frame = this.mode7_frame(danmaku, time);
        if (!frame) return false;

        const sprite = this.getMode7RenderedSprite(danmaku);
        this.ctx.save();
        this.ctx.translate(frame.x, frame.y);
        
        if (frame.zRotation !== 0) {
            this.ctx.rotate(degree(frame.zRotation));
        }
        
        this.ctx.globalAlpha = Math.max(0, Math.min(1, frame.opacity));

        if (danmaku.yRotation === 0) {
            this.ctx.drawImage(sprite.canvas, 0, 0, sprite.width, sprite.height);
        } else {
            this.ctx.drawImage(sprite.canvas, sprite.offsetX, sprite.offsetY, sprite.width, sprite.height);
        }
        
        this.ctx.restore();
        return true;
    }

    mode7frameDanma(currentTime) {
        for (const d of this.activeMode7) {
            if (!this.drawMode7(d, currentTime)) {
                this.activeMode7.delete(d);
            }
        }
    }

    /* ---------------------------------------------------------
     * Standard Sprite Rendering
     * ------------------------------------------------------ */
    fontFor(fixed) {
        const size = fixed ? this.config.fonts.fixed : this.config.fonts.scroll;
        return `${this.config.fonts.weight} ${size}px ${this.config.fonts.family}`;
    }

    getMetrics(text, fixed = false) {
        const key = `${fixed ? "fixed" : "scroll"}:${text}`;
        let cached = this.metricsCache.get(key);
        if (cached) return cached;

        const font = this.fontFor(fixed);
        this.ctx.font = font;
        this.ctx.textBaseline = "alphabetic";

        const metrics = this.ctx.measureText(text);
        cached = {
            font,
            width: metrics.width,
            ascent: metrics.actualBoundingBoxAscent,
            descent: metrics.actualBoundingBoxDescent,
        };
        cached.height = cached.ascent + cached.descent;
        
        this.metricsCache.set(key, cached);
        return cached;
    }

    drawText(ctx, text, color, paddingX, paddingY, metrics) {
        ctx.lineJoin = "round";
        ctx.lineWidth = 2.0;
        ctx.strokeStyle = "#000";
        ctx.strokeText(text, paddingX, paddingY + metrics.ascent);
        ctx.fillStyle = color;
        ctx.fillText(text, paddingX, paddingY + metrics.ascent);
    }

    createSprite(text, fixed, color) {
        const metrics = this.getMetrics(text, fixed);
        const paddingX = 4;
        const paddingY = 10;
        
        const glyphWidth = metrics.width;
        const glyphHeight = metrics.height;
        const logicalWidth = Math.ceil(glyphWidth + paddingX * 2);
        const logicalHeight = Math.ceil(glyphHeight + paddingY * 2);
        const width = Math.ceil(logicalWidth * this.SPRITE_DPR);
        const height = Math.ceil(logicalHeight * this.SPRITE_DPR);

        const canvas = makeCanvas(width, height);
        const ctx = canvas.getContext("2d");

        ctx.scale(this.SPRITE_DPR, this.SPRITE_DPR);
        ctx.font = metrics.font;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";

        this.drawText(ctx, text, color, paddingX, paddingY, metrics);

        return {
            canvas, width: logicalWidth, height: logicalHeight,
            glyphWidth, glyphHeight, glyphX: paddingX, glyphY: paddingY,
            anchorX: paddingX + glyphWidth / 2, anchorY: paddingY + glyphHeight / 2,
        };
    }

    getSprite(text, fixed, color) {
        const key = `${fixed ? "fixed" : "scroll"}|${color}|${text}`;
        let sprite = this.renderCache.get(key);
        if (sprite) return sprite;

        sprite = this.createSprite(text, fixed, color);
        this.renderCache.set(key, sprite);
        return sprite;
    }

    /* ---------------------------------------------------------
     * Layout & Collision Logic
     * ------------------------------------------------------ */
    rebuildLanes() {
        this.topLanes.length = 0;
        this.bottomLanes.length = 0;
        this.centerLanes.length = 0;

        const count = Math.max(1, Math.floor(this.H / this.config.laneHeight));
        for (let i = 0; i < count; i++) {
            this.topLanes.push({ index: i, occupiedUntil: 0 });
            this.bottomLanes.push({ index: i, occupiedUntil: 0 });
            this.centerLanes.push({ index: i, comments: [] });
        }

        for (const c of this.comments) {
            if (c.mode === "scroll" && this.centerLanes[c.laneIndex]) {
                this.centerLanes[c.laneIndex].comments.push(c);
            } else if (c.mode === "top" && this.topLanes[c.laneIndex]) {
                this.topLanes[c.laneIndex].occupiedUntil = Math.max(this.topLanes[c.laneIndex].occupiedUntil, c.born + c.lifetime);
            } else if (c.mode === "bottom" && this.bottomLanes[c.laneIndex]) {
                this.bottomLanes[c.laneIndex].occupiedUntil = Math.max(this.bottomLanes[c.laneIndex].occupiedUntil, c.born + c.lifetime);
            }
        }
    }

    resize() {
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.W = window.innerWidth;
        this.H = window.innerHeight;

        this.canvas.width = Math.floor(this.W * this.dpr);
        this.canvas.height = Math.floor(this.H * this.dpr);
        this.canvas.style.width = `${this.W}px`;
        this.canvas.style.height = `${this.H}px`;

        this.mode7RenderedCache = new WeakMap();

        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.ctx.textBaseline = "middle";
        this.rebuildLanes();
    }

    speedFor(width) {
        return (this.W + width) / this.config.scroll.duration;
    }

    verticalOverlap(a, b) {
        return a.y < b.y + b.height + this.config.scroll.gap && a.y + a.height > b.y - this.config.scroll.gap;
    }

    willScrollCollide(a, b) {
        if (!this.verticalOverlap(a, b)) return false;
        if ((a.vx > 0 && b.vx < 0) || (a.vx < 0 && b.vx > 0)) return true;

        if (a.vx > 0) {
            const gap = a.x - (b.x + b.width + this.config.scroll.gap);
            if (gap <= 0) return true;
            if (a.vx <= b.vx) return false;
            return gap / (a.vx - b.vx) < this.config.scroll.lookahead;
        }

        if (a.vx < 0) {
            const gap = b.x - (a.x + a.width + this.config.scroll.gap);
            if (gap <= 0) return true;
            if (a.vx >= b.vx) return false;
            return gap / (b.vx - a.vx) < this.config.scroll.lookahead;
        }
        return false;
    }

    canUseCenterLane(width, height, vx, laneIndex) {
        const lane = this.centerLanes[laneIndex];
        if (!lane) return false;

        const isReverse = vx < 0;
        const candidate = {
            x: isReverse ? -width : this.W,
            y: this.config.laneHeight / 2 + laneIndex * this.config.laneHeight,
            width, height, vx,
        };

        for (const c of lane.comments) {
            if (this.willScrollCollide(candidate, c)) return false;
        }
        return true;
    }

    findCenterLane(width, height, vx) {
        let leastOccupiedLane = null;
        let minCommentCount = Infinity;

        for (let i = 0; i < this.centerLanes.length; i++) {
            const lane = this.centerLanes[i];

            // Prefer a collision-free lane.
            if (this.canUseCenterLane(width, height, vx, i)) {
                return i;
            }

            // Otherwise remember the least occupied lane.
            if (lane.comments.length < minCommentCount) {
                minCommentCount = lane.comments.length;
                leastOccupiedLane = i;
            }
        }

        // Every lane is unsafe, so permit collision in the least busy lane.
        return leastOccupiedLane;
    }

    /* ---------------------------------------------------------
     * Comment Creation & Lifecycle
     * ------------------------------------------------------ */
    createFixedComment(text, mode, c888) {
        const metrics = this.getMetrics(text, true);
        const color = rgbaFromRGB888(c888);
        const sprite = this.getSprite(text, true, color);
        const lanes = mode === "top" ? this.topLanes : this.bottomLanes;
        const now = performance.now();
        let lane = null;

        // 1. Try to find a lane that is free right now
        for (let i = 0; i < lanes.length; i++) {
            if (lanes[i].occupiedUntil <= now) {
                lane = lanes[i];
                break;
            }
        }

        // 2. If every lane is occupied, pick the one that will become free soonest
        if (!lane) {
            let earliestFreeTime = Infinity;
            for (let i = 0; i < lanes.length; i++) {
                if (lanes[i].occupiedUntil < earliestFreeTime) {
                    earliestFreeTime = lanes[i].occupiedUntil;
                    lane = lanes[i];
                }
            }
        }

        // (Should never happen because lanes always exist, but safe guard)
        if (!lane) return false;

        const lifetime = this.config.fixed.lifetime;
        lane.occupiedUntil = now + lifetime;  // overwrite occupancy

        let y;
        if (mode === "top") {
            y = this.config.laneHeight / 2 + lane.index * this.config.laneHeight;
        } else {
            y = this.H - this.config.laneHeight / 2 - lane.index * this.config.laneHeight;
        }

        this.comments.push({
            text, mode, x: this.W / 2, y,
            width: metrics.width, height: metrics.height,
            sprite, spriteWidth: sprite.width, spriteHeight: sprite.height,
            glyphX: sprite.glyphX, glyphY: sprite.glyphY,
            anchorX: sprite.anchorX, anchorY: sprite.anchorY,
            color, alpha: this.config.style.opacity, font: metrics.font,
            vx: 0, born: now, lifetime, lane,
        });
        return true;
    }

    createScrollComment(text, c888, reverse) {
        const metrics = this.getMetrics(text, false);
        const color = rgbaFromRGB888(c888);
        const sprite = this.getSprite(text, false, color);
        const speed = this.speedFor(metrics.width);
        const vx = reverse == 1 ? -speed : speed;
        const laneIndex = this.findCenterLane(metrics.width, metrics.height, vx);

        if (laneIndex === null) return false;

        const now = performance.now();
        const comment = {
            text, mode: "scroll",
            x: reverse == 1 ? -metrics.width : this.W,
            y: this.config.laneHeight / 2 + laneIndex * this.config.laneHeight,
            width: metrics.width, height: metrics.height,
            sprite: sprite, spriteWidth: sprite.width, spriteHeight: sprite.height,
            glyphX: sprite.glyphX, glyphY: sprite.glyphY,
            anchorX: sprite.anchorX, anchorY: sprite.anchorY,
            color, alpha: this.config.style.opacity, font: metrics.font,
            vx, born: now, lifetime: null, laneIndex,
        };

        this.comments.push(comment);
        this.centerLanes[laneIndex].comments.push(comment);
        return comment;
    }

    createComment(text, mode = "scroll", color = 16777215, reverse = 0) {
        if (mode === "top" || mode === "bottom") {
            return this.createFixedComment(text, mode, color);
        }
        return this.createScrollComment(text, color, reverse);
    }

    removeComment(index) {
        const c = this.comments[index];
        if (!c) return;

        if (c.mode === "scroll") {
            const lane = this.centerLanes[c.laneIndex];
            if (lane) {
                const laneIndex = lane.comments.indexOf(c);
                if (laneIndex !== -1) lane.comments.splice(laneIndex, 1);
            }
        }
        this.comments.splice(index, 1);
    }

    drawComment(c) {
        this.ctx.globalAlpha = c.alpha;
        const glyphCenterX = c.mode === "scroll" ? c.x + c.width / 2 : c.x;
        const spriteX = glyphCenterX - c.anchorX;
        const spriteY = c.y - c.anchorY;

        this.ctx.drawImage(c.sprite.canvas, spriteX, spriteY, c.sprite.width, c.sprite.height);
    }

    drawDanmaFrame(now) {
        if (!now) now = performance.now();
        const dt = Math.max(0, Math.min((now - this.lastTime) / 1000, 0.05));
        this.lastTime = now;

        // Array to hold comments that survive this frame
        const activeComments = [];

        for (let i = 0; i < this.comments.length; i++) {
            const c = this.comments[i];
            let keep = true;

            if (c.mode === "scroll") {
                c.x -= c.vx * dt;
                if (c.x + c.width < -30) {
                    keep = false;
                }
            } else {
                if (now - c.born > c.lifetime) {
                    keep = false;
                }
            }

            if (keep) {
                activeComments.push(c);
                this.drawComment(c);
            } else if (c.mode === "scroll") {
                // Clean up lane references for removed scroll comments
                const lane = this.centerLanes[c.laneIndex];
                if (lane) {
                    const laneIdx = lane.comments.indexOf(c);
                    if (laneIdx !== -1) lane.comments.splice(laneIdx, 1);
                }
            }
        }

        // Swap the array in one clean assignment
        this.comments = activeComments;
        this.ctx.globalAlpha = 1;
    }
}
