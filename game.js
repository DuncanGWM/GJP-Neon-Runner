(() => {
  const WIDTH = 960;
  const HEIGHT = 540;
  const GROUND_Y = 450;
  const FIXED_STEP = 1 / 60;
  const MAX_DT = 0.1;

  const KEYS = {
    jump: [" ", "ArrowUp", "w", "W"],
    slide: ["ArrowDown", "s", "S"],
  };

  class Pool {
    constructor(create, size) {
      this.create = create;
      this.items = Array.from({ length: size }, () => create());
    }

    acquire() {
      const item = this.items.find((entry) => !entry.active);
      return item || null;
    }

    activeItems() {
      return this.items.filter((entry) => entry.active);
    }

    reset() {
      this.items.forEach((item) => {
        item.active = false;
      });
    }
  }

  class SoundManager {
    constructor() {
      this.muted = false;
      this.ctx = null;
    }

    ensureContext() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
    }

    tone({ frequency = 440, duration = 0.1, type = "sine", volume = 0.2, sweep = 0 }) {
      if (this.muted) return;
      this.ensureContext();

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, now);
      if (sweep !== 0) {
        osc.frequency.linearRampToValueAtTime(frequency + sweep, now + duration);
      }

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    }

    playJump() {
      this.tone({ frequency: 380, duration: 0.13, type: "triangle", volume: 0.18, sweep: 130 });
    }

    playHit() {
      this.tone({ frequency: 180, duration: 0.2, type: "sawtooth", volume: 0.24, sweep: -120 });
    }

    playCoin() {
      this.tone({ frequency: 640, duration: 0.1, type: "square", volume: 0.18, sweep: 90 });
      this.tone({ frequency: 850, duration: 0.07, type: "square", volume: 0.12, sweep: -50 });
    }

    toggleMute() {
      this.muted = !this.muted;
      return this.muted;
    }
  }

  class RunnerGame {
    constructor() {
      this.canvas = document.getElementById("gameCanvas");
      this.ctx = this.canvas.getContext("2d");
      this.scoreEl = document.getElementById("scoreValue");
      this.tokenEl = document.getElementById("tokenValue");
      this.highEl = document.getElementById("highScoreValue");
      this.startMenu = document.getElementById("startMenu");
      this.pauseMenu = document.getElementById("pauseMenu");
      this.gameOverMenu = document.getElementById("gameOverMenu");
      this.finalScoreEl = document.getElementById("finalScore");
      this.finalTokensEl = document.getElementById("finalTokens");
      this.signImage = new Image();
      this.signImage.src = "assets/gjp-sign.svg";

      this.sounds = new SoundManager();

      this.player = {
        x: 140,
        y: GROUND_Y - 70,
        width: 48,
        height: 70,
        defaultHeight: 70,
        slideHeight: 40,
        vy: 0,
        jumping: false,
        sliding: false,
        slideTimer: 0,
      };

      this.gravity = 2400;
      this.jumpVelocity = -900;
      this.speed = 380;
      this.baseSpeed = 380;
      this.maxSpeed = 860;
      this.distance = 0;
      this.score = 0;
      this.tokens = 0;
      this.highScore = Number(localStorage.getItem("gjp-neon-highscore") || 0);
      this.highEl.textContent = this.highScore;

      this.state = "start";
      this.debug = false;
      this.lastFrame = 0;
      this.accumulator = 0;
      this.fps = 0;
      this.fpsCounter = { elapsed: 0, frames: 0 };

      this.spawnTimer = 0;
      this.tokenTimer = 3;
      this.spawnInterval = 1.35;

      this.bgLayers = [
        { speed: 35, color: "#111835", offset: 0, bars: 16, heightMin: 40, heightMax: 120 },
        { speed: 80, color: "#172247", offset: 0, bars: 14, heightMin: 65, heightMax: 180 },
        { speed: 140, color: "#24356f", offset: 0, bars: 12, heightMin: 90, heightMax: 220 },
      ];

      this.sign = {
        x: WIDTH + 400,
        y: 120,
        width: 180,
        height: 90,
        speedFactor: 0.48,
      };

      this.obstacles = new Pool(
        () => ({ active: false, x: 0, y: 0, width: 40, height: 40, type: "block" }),
        28,
      );
      this.tokensPool = new Pool(
        () => ({ active: false, x: 0, y: 0, radius: 14, bob: 0 }),
        20,
      );

      this.bindEvents();
      this.updateHud();
      requestAnimationFrame((t) => this.loop(t));
    }

    bindEvents() {
      document.getElementById("startButton").addEventListener("click", () => this.start());
      document.getElementById("resumeButton").addEventListener("click", () => this.togglePause(false));
      document.getElementById("restartButton").addEventListener("click", () => this.restart());

      const muteButton = document.getElementById("muteButton");
      muteButton.addEventListener("click", () => {
        const muted = this.sounds.toggleMute();
        muteButton.textContent = muted ? "🔇 Muted" : "🔊 Sound";
      });

      const debugButton = document.getElementById("debugButton");
      debugButton.addEventListener("click", () => {
        this.debug = !this.debug;
        debugButton.textContent = this.debug ? "🐞 Debug On" : "🐞 Debug";
      });

      window.addEventListener("keydown", (event) => {
        if (["P", "p"].includes(event.key)) {
          this.togglePause();
          return;
        }
        if (["R", "r"].includes(event.key)) {
          this.restart();
          return;
        }

        if (KEYS.jump.includes(event.key)) {
          event.preventDefault();
          this.jump();
          return;
        }

        if (KEYS.slide.includes(event.key)) {
          event.preventDefault();
          this.slide();
        }
      });

      let touchStartY = 0;
      this.canvas.addEventListener("touchstart", (event) => {
        touchStartY = event.changedTouches[0].clientY;
      });

      this.canvas.addEventListener("touchend", (event) => {
        const touchY = event.changedTouches[0].clientY;
        const delta = touchY - touchStartY;
        if (delta > 45) {
          this.slide();
        } else {
          this.jump();
        }
      });

      this.canvas.addEventListener("click", () => {
        if (this.state === "start") {
          this.start();
        } else {
          this.jump();
        }
      });
    }

    start() {
      if (this.state === "running") return;
      this.restart();
      this.state = "running";
      this.setOverlay("start", false);
      this.setOverlay("pause", false);
      this.setOverlay("gameover", false);
    }

    restart() {
      this.distance = 0;
      this.score = 0;
      this.tokens = 0;
      this.speed = this.baseSpeed;
      this.spawnTimer = 0;
      this.tokenTimer = 2.5;
      this.spawnInterval = 1.35;
      this.player.y = GROUND_Y - this.player.defaultHeight;
      this.player.height = this.player.defaultHeight;
      this.player.vy = 0;
      this.player.jumping = false;
      this.player.sliding = false;
      this.player.slideTimer = 0;
      this.obstacles.reset();
      this.tokensPool.reset();
      this.state = "running";
      this.updateHud();
      this.setOverlay("start", false);
      this.setOverlay("pause", false);
      this.setOverlay("gameover", false);
    }

    togglePause(force = null) {
      if (this.state === "start" || this.state === "gameover") return;
      const shouldPause = force === null ? this.state === "running" : !force;
      this.state = shouldPause ? "paused" : "running";
      this.setOverlay("pause", shouldPause);
    }

    gameOver() {
      this.state = "gameover";
      this.sounds.playHit();
      this.highScore = Math.max(this.highScore, this.score);
      localStorage.setItem("gjp-neon-highscore", String(this.highScore));
      this.highEl.textContent = this.highScore;
      this.finalScoreEl.textContent = `Score: ${this.score}`;
      this.finalTokensEl.textContent = `Tokens: ${this.tokens}`;
      this.setOverlay("gameover", true);
    }

    setOverlay(name, visible) {
      const map = {
        start: this.startMenu,
        pause: this.pauseMenu,
        gameover: this.gameOverMenu,
      };
      map[name].classList.toggle("visible", visible);
    }

    jump() {
      if (this.state !== "running") return;
      if (this.player.jumping) return;
      this.player.vy = this.jumpVelocity;
      this.player.jumping = true;
      this.player.sliding = false;
      this.player.height = this.player.defaultHeight;
      this.sounds.playJump();
    }

    slide() {
      if (this.state !== "running") return;
      if (this.player.jumping) return;
      this.player.sliding = true;
      this.player.slideTimer = 0.5;
      this.player.height = this.player.slideHeight;
      this.player.y = GROUND_Y - this.player.height;
    }

    spawnObstacle() {
      const obstacle = this.obstacles.acquire();
      if (!obstacle) return;

      const tallChance = Math.random();
      obstacle.active = true;
      obstacle.width = 36 + Math.random() * 34;

      if (tallChance > 0.72) {
        obstacle.height = 90 + Math.random() * 55;
        obstacle.y = GROUND_Y - obstacle.height - 30;
        obstacle.type = "hanging";
      } else {
        obstacle.height = 40 + Math.random() * 72;
        obstacle.y = GROUND_Y - obstacle.height;
        obstacle.type = "ground";
      }
      obstacle.x = WIDTH + 40;
    }

    spawnToken() {
      const token = this.tokensPool.acquire();
      if (!token) return;
      token.active = true;
      token.radius = 13;
      token.x = WIDTH + 40;
      token.y = GROUND_Y - 130 - Math.random() * 160;
      token.bob = Math.random() * Math.PI * 2;
    }

    intersects(a, b) {
      return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    }

    update(dt) {
      this.speed = Math.min(this.maxSpeed, this.speed + 6 * dt);
      this.distance += this.speed * dt;
      this.score = Math.floor(this.distance / 8) + this.tokens * 75;

      this.spawnInterval = Math.max(0.55, this.spawnInterval - 0.008 * dt);
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = this.spawnInterval * (0.86 + Math.random() * 0.45);
        this.spawnObstacle();
      }

      this.tokenTimer -= dt;
      if (this.tokenTimer <= 0) {
        this.tokenTimer = 2.4 + Math.random() * 3.3;
        if (Math.random() > 0.35) this.spawnToken();
      }

      this.player.vy += this.gravity * dt;
      this.player.y += this.player.vy * dt;

      if (this.player.y >= GROUND_Y - this.player.height) {
        this.player.y = GROUND_Y - this.player.height;
        this.player.vy = 0;
        this.player.jumping = false;
      }

      if (this.player.sliding) {
        this.player.slideTimer -= dt;
        if (this.player.slideTimer <= 0) {
          this.player.sliding = false;
          this.player.height = this.player.defaultHeight;
          this.player.y = GROUND_Y - this.player.height;
        }
      }

      this.bgLayers.forEach((layer) => {
        layer.offset = (layer.offset + layer.speed * dt + this.speed * dt * 0.07) % WIDTH;
      });

      this.sign.x -= this.speed * this.sign.speedFactor * dt;
      if (this.sign.x + this.sign.width < -120) {
        this.sign.x = WIDTH + 360 + Math.random() * 300;
      }

      this.obstacles.activeItems().forEach((obstacle) => {
        obstacle.x -= this.speed * dt;
        if (obstacle.x + obstacle.width < -40) {
          obstacle.active = false;
          return;
        }

        if (this.intersects(this.player, obstacle)) {
          this.gameOver();
        }
      });

      this.tokensPool.activeItems().forEach((token) => {
        token.x -= this.speed * dt;
        token.bob += dt * 4;
        if (token.x + token.radius < -30) {
          token.active = false;
          return;
        }

        const hitbox = {
          x: token.x - token.radius,
          y: token.y + Math.sin(token.bob) * 6 - token.radius,
          width: token.radius * 2,
          height: token.radius * 2,
        };

        if (this.intersects(this.player, hitbox)) {
          token.active = false;
          this.tokens += 1;
          this.sounds.playCoin();
        }
      });

      this.updateHud();
    }

    drawBackground() {
      const { ctx } = this;
      const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      gradient.addColorStop(0, "#0a0f25");
      gradient.addColorStop(0.6, "#11193a");
      gradient.addColorStop(1, "#24142f");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      this.bgLayers.forEach((layer, layerIndex) => {
        const spacing = WIDTH / layer.bars;
        ctx.fillStyle = layer.color;
        ctx.globalAlpha = 0.8;
        for (let i = -1; i <= layer.bars + 1; i += 1) {
          const x = i * spacing - layer.offset;
          const wave = Math.abs(Math.sin((i + layerIndex) * 1.7));
          const h = layer.heightMin + wave * (layer.heightMax - layer.heightMin);
          ctx.fillRect(x, GROUND_Y - h, spacing * 0.72, h);
        }
      });
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#1f3258";
      ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);
      ctx.fillStyle = "rgba(51,243,255,0.25)";
      ctx.fillRect(0, GROUND_Y, WIDTH, 4);

      if (this.signImage.complete) {
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.drawImage(this.signImage, this.sign.x, this.sign.y, this.sign.width, this.sign.height);
        ctx.restore();
      }
    }

    drawPlayer() {
      const { ctx, player } = this;
      ctx.save();
      ctx.shadowColor = "#33f3ff";
      ctx.shadowBlur = 16;
      const gradient = ctx.createLinearGradient(player.x, player.y, player.x + player.width, player.y + player.height);
      gradient.addColorStop(0, "#31e5ff");
      gradient.addColorStop(1, "#8f6cff");
      ctx.fillStyle = gradient;
      ctx.fillRect(player.x, player.y, player.width, player.height);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(player.x + 28, player.y + 12, 10, 10);
      ctx.restore();
    }

    drawObstacles() {
      const { ctx } = this;
      this.obstacles.activeItems().forEach((obstacle) => {
        ctx.save();
        ctx.shadowColor = obstacle.type === "hanging" ? "#ff43c7" : "#ff8e4a";
        ctx.shadowBlur = 14;
        ctx.fillStyle = obstacle.type === "hanging" ? "#be40d8" : "#ff5f48";
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
        ctx.restore();
      });
    }

    drawTokens() {
      const { ctx } = this;
      this.tokensPool.activeItems().forEach((token) => {
        const y = token.y + Math.sin(token.bob) * 6;
        ctx.save();
        ctx.translate(token.x, y);
        ctx.shadowColor = "#f4ff70";
        ctx.shadowBlur = 16;
        ctx.fillStyle = "#ffe95a";
        ctx.beginPath();
        ctx.arc(0, 0, token.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#232327";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("GJP", 0, 1);
        ctx.restore();
      });
    }

    drawDebug() {
      if (!this.debug) return;
      const obstacleCount = this.obstacles.activeItems().length;
      const tokenCount = this.tokensPool.activeItems().length;
      this.ctx.save();
      this.ctx.fillStyle = "rgba(6,12,24,0.8)";
      this.ctx.fillRect(12, 12, 220, 80);
      this.ctx.fillStyle = "#8cfaff";
      this.ctx.font = "13px monospace";
      this.ctx.fillText(`FPS: ${this.fps.toFixed(1)}`, 24, 34);
      this.ctx.fillText(`Speed: ${this.speed.toFixed(1)}`, 24, 54);
      this.ctx.fillText(`Objects: ${obstacleCount + tokenCount}`, 24, 74);
      this.ctx.restore();
    }

    render() {
      this.drawBackground();
      this.drawTokens();
      this.drawObstacles();
      this.drawPlayer();
      this.drawDebug();
    }

    updateHud() {
      this.scoreEl.textContent = this.score;
      this.tokenEl.textContent = this.tokens;
      this.highEl.textContent = this.highScore;
    }

    loop(timestamp) {
      const dt = Math.min(MAX_DT, (timestamp - this.lastFrame) / 1000 || FIXED_STEP);
      this.lastFrame = timestamp;

      this.fpsCounter.elapsed += dt;
      this.fpsCounter.frames += 1;
      if (this.fpsCounter.elapsed >= 0.25) {
        this.fps = this.fpsCounter.frames / this.fpsCounter.elapsed;
        this.fpsCounter.elapsed = 0;
        this.fpsCounter.frames = 0;
      }

      if (this.state === "running") {
        this.accumulator += dt;
        while (this.accumulator >= FIXED_STEP) {
          this.update(FIXED_STEP);
          this.accumulator -= FIXED_STEP;
        }
      }

      this.render();
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  window.addEventListener("load", () => {
    new RunnerGame();
  });
})();
