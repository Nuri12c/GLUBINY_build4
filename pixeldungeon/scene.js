"use strict";

const TILE = 48;
const MAP_W = 18;
const MAP_H = 18;
const TORCH_WIDTH = 48;
const TORCH_HEIGHT = 72;
const FLOOR = 1;
const WALL = 0;
const map = new Array(MAP_W * MAP_H).fill(WALL);
const cellKey = (x, y) => `${x},${y}`;
const idx = (x, y) => y * MAP_W + x;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
const catCell = { x: 1, y: 5 };
const carve = (x1, y1, x2, y2) => {
  for (let y = y1; y <= y2; y++)
    for (let x = x1; x <= x2; x++)
      map[idx(x, y)] = FLOOR;
};

carve(1, 1, 16, 16);

const spikes = new Set();
for (let y = 8; y <= 9; y++)
  for (let x = 8; x <= 9; x++)
    spikes.add(cellKey(x, y));

const decor = [
  { key: "barrel", x: 2, y: 2, solid: true },
  { key: "barrel", x: 3, y: 2, solid: true },
  { key: "crate", x: 2, y: 3, solid: true },
  { key: "chest", x: 5, y: 2, solid: true },
  { key: "barrel", x: 14, y: 2, solid: true },
  { key: "goldChest", x: 15, y: 2, solid: true },
  { key: "crate", x: 15, y: 3, solid: true },
  { key: "chest", x: 2, y: 14, solid: true },
  { key: "barrel", x: 3, y: 14, solid: true },
  { key: "crate", x: 2, y: 15, solid: true },
  { key: "chest", x: 15, y: 14, solid: true },
  { key: "crate", x: 14, y: 15, solid: true },
  { key: "pot", x: 15, y: 15, solid: true },
  { key: "bannerRed", x: 5, y: 0, wall: true },
  { key: "bannerSkull", x: 12, y: 0, wall: true },
  { key: "web", x: 15, y: 1 },
  { key: "web", x: 2, y: 1 },
  { key: "web", x: 2, y: 12 },
  { key: "cat", ...catCell, solid: true },
  { key: "bones", x: 4, y: 8 },
  { key: "bones", x: 13, y: 8 },
  { key: "rubbleLarge", x: 7, y: 3 },
  { key: "rubblePebbles", x: 10, y: 3 },
  { key: "mossChunk", x: 6, y: 7 },
  { key: "rubbleMedium", x: 11, y: 7 },
  { key: "rubblePebbles", x: 3, y: 11 },
  { key: "mossLarge", x: 14, y: 11 },
  { key: "rubbleLarge", x: 6, y: 12 },
  { key: "mossChunk", x: 11, y: 12 },
  { key: "rubbleMedium", x: 5, y: 14 },
  { key: "mossPebbles", x: 12, y: 14 }
];
const torches = [
  { x: 4, y: 2 },
  { x: 13, y: 2 },
  { x: 1, y: 4 },
  { x: 16, y: 4 },
  { x: 1, y: 13 },
  { x: 16, y: 13 },
  { x: 4, y: 15 },
  { x: 13, y: 15 }
];
const blockedDecor = new Set([
  ...decor.filter((item) => item.solid).map((item) => cellKey(item.x, item.y)),
  ...torches.map((torch) => cellKey(torch.x, torch.y))
]);

const player = { x: 9, y: 15, hp: 24, maxHp: 24, gold: 0, dmg: 4 };
let enemies = [];
let started = false;
let gameOver = false;
let catDialogueOpen = false;
let wasNearCat = false;
let toastTimer;
let dungeonScene;

function reset() {
  player.x = 9;
  player.y = 15;
  player.hp = player.maxHp;
  player.gold = 0;
  dungeonScene?.stopPlayerWalk();
  enemies = [];
  wasNearCat = false;
  closeCatDialogue();
  gameOver = false;
  updateHud();
  dungeonScene?.syncActors();
}

function cellCenter(x, y) {
  return { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
}

function showToast(message) {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 1400);
}

function updateHud() {
  const fraction = Math.max(0, player.hp / player.maxHp);
  const fill = document.getElementById("hp-fill");
  fill.style.width = `${fraction * 100}%`;
  fill.className = fraction > .55 ? "" : fraction > .28 ? "mid" : "low";
  document.getElementById("hp-num").textContent = `${player.hp}/${player.maxHp}`;
  document.getElementById("gold").textContent = player.gold;
}

function renderCatDialogue(text, choices) {
  document.getElementById("dlg-text").textContent = text;
  const choiceList = document.getElementById("dlg-choices");
  choiceList.replaceChildren();
  for (const choice of choices) {
    const button = document.createElement("button");
    button.className = "choice";
    button.type = "button";
    button.textContent = choice.label;
    button.addEventListener("click", choice.onSelect);
    choiceList.append(button);
  }
}

function openCatDialogue() {
  if (!started || gameOver || catDialogueOpen) return;
  catDialogueOpen = true;
  document.getElementById("dialog").classList.remove("hidden");
  renderCatDialogue("Мр-р. У этой стены теплее всего. Ты тоже ищешь выход?", [
    {
      label: "Что там за стеной?",
      onSelect: () => renderCatDialogue("Там капает вода. А иногда оттуда пахнет рыбой!", [
        { label: "Спасибо, я поищу.", onSelect: closeCatDialogue }
      ])
    },
    {
      label: "Просто поздороваться.",
      onSelect: () => renderCatDialogue("Мяу! Тогда привет. Только не наступи мне на хвост.", [
        { label: "Пока, кошечка.", onSelect: closeCatDialogue }
      ])
    }
  ]);
}

function closeCatDialogue() {
  catDialogueOpen = false;
  document.getElementById("dialog")?.classList.add("hidden");
}

function isNearCat(x, y) {
  return Math.abs(x - catCell.x) + Math.abs(y - catCell.y) === 1;
}

function checkCatProximity() {
  const near = isNearCat(player.x, player.y);
  if (near && !wasNearCat) openCatDialogue();
  wasNearCat = near;
}

class DungeonScene extends Phaser.Scene {
  constructor() {
    super({ key: "DungeonScene" });
  }

  preload() {
    this.load.image("floorsAtlas", "assets/floors_compact.png");
    this.load.image("wallsAtlas", "assets/walls_compact.png");
    this.load.image("rugsAtlas", "assets/rugs_compact.png");
    this.load.image("propsAtlas", "assets/props_compact.png");
    this.load.image("actorsAtlas", "assets/actors_compact.png");
    this.load.spritesheet("playerUpWalk", "assets/player_up_walk.png", {
      frameWidth: 128,
      frameHeight: 160
    });
    this.load.spritesheet("playerRightWalk", "assets/player_right_walk.png", {
      frameWidth: 160,
      frameHeight: 160
    });
  }

  create() {
    dungeonScene = this;
    this.cameras.main.setBackgroundColor("#0d0e18");
    this.createAtlasTextures();
    this.createPlayerAnimation();
    this.createCatTexture();
    this.createCatAnimation();
    this.createFireAnimation();
    this.drawRoom();
    this.createLighting();

    this.playerSprite = this.add.sprite(0, 0, "player")
      .setOrigin(0.5, 0.82)
      .setDepth(30);
    this.playerSprite.setDisplaySize(110, 126);
    this.playerWalkTimer = null;
    this.enemySprites = [];
    this.syncActors();

    this.input.keyboard.on("keydown", (event) => {
      if (event.repeat || !started) return;
      if (catDialogueOpen) {
        if (event.code === "Escape") {
          event.preventDefault();
          closeCatDialogue();
        }
        return;
      }
      const direction = {
        ArrowUp: [0, -1], KeyW: [0, -1],
        ArrowDown: [0, 1], KeyS: [0, 1],
        ArrowLeft: [-1, 0], KeyA: [-1, 0],
        ArrowRight: [1, 0], KeyD: [1, 0]
      }[event.code];
      if (direction) {
        event.preventDefault();
        movePlayer(...direction);
      } else if (event.code === "KeyT") {
        attackNearby();
      } else if (event.code === "Space" || event.code === "Period") {
        event.preventDefault();
        endTurn();
      }
    });

    this.scale.on("resize", (size) => this.fitRoom(size.width, size.height));
    this.fitRoom(this.scale.width, this.scale.height);
  }

  createPlayerAnimation() {
    for (const [direction, texture] of [
      ["up", "playerUpWalk"],
      ["right", "playerRightWalk"]
    ]) {
      this.anims.create({
        key: `player-${direction}-walk`,
        frames: this.anims.generateFrameNumbers(texture, { start: 0, end: 3 }),
        frameRate: 10,
        repeat: -1
      });
    }
  }

  playPlayerWalk(direction) {
    if (!this.playerSprite) return;
    const facing = direction === "left" ? "right" : direction;
    const texture = {
      up: "playerUpWalk",
      right: "playerRightWalk"
    }[facing];
    if (this.playerSprite.texture.key !== texture)
      this.playerSprite.setTexture(texture, 0);
    this.playerSprite.setFlipX(direction === "left");
    this.playerSprite.setDisplaySize(110, 126);
    this.playerSprite.play(`player-${facing}-walk`, true);
    this.playerWalkTimer?.remove(false);
    this.playerWalkTimer = this.time.delayedCall(400, () => {
      this.playerWalkTimer = null;
      this.stopPlayerWalk(direction);
    });
  }

  stopPlayerWalk(direction = null) {
    this.playerWalkTimer?.remove(false);
    this.playerWalkTimer = null;
    if (!this.playerSprite) return;
    this.playerSprite.anims.stop();
    const facing = direction === "left" ? "right" : direction;
    const texture = {
      up: "playerUpWalk",
      right: "playerRightWalk"
    }[facing] || "player";
    this.playerSprite.setTexture(texture, 0);
    this.playerSprite.setFlipX(direction === "left");
    this.playerSprite.setDisplaySize(110, 126);
  }

  createAtlasTextures() {
    const wallFrames = {
      wallHorizontal: [4, 4, 175, 100],
      wallVertical: [185, 4, 50, 136],
      wallCornerA: [241, 4, 104, 102],
      wallCornerB: [351, 4, 103, 102]
    };
    for (const [key, [x, y, width, height]] of Object.entries(wallFrames))
      this.extractTexture(key, "wallsAtlas", { x, y, width, height });

    const rugFrames = {
      rugSquare: [4, 4, 130, 128],
      rugWide: [144, 4, 132, 82]
    };
    for (const [key, [x, y, width, height]] of Object.entries(rugFrames))
      this.extractTexture(key, "rugsAtlas", { x, y, width, height }, "border");

    const floorFrames = {
      floorStone0: [4, 4, 49, 44],
      rubbleLarge: [4, 52, 54, 54],
      rubbleMedium: [62, 52, 54, 54],
      rubblePebbles: [120, 52, 54, 40],
      mossChunk: [178, 52, 54, 54],
      mossLarge: [236, 52, 54, 54],
      mossPebbles: [294, 52, 54, 40]
    };
    for (const [key, [x, y, width, height]] of Object.entries(floorFrames))
      this.extractTexture(key, "floorsAtlas", { x, y, width, height }, "border");

    const propsFrames = {
      torch: [4, 4, 92, 140],
      bannerRed: [100, 4, 96, 130],
      bannerSkull: [200, 4, 100, 130],
      web: [304, 4, 120, 115],
      barrel: [4, 148, 90, 103],
      crate: [98, 148, 91, 100],
      chest: [193, 148, 120, 117],
      goldChest: [317, 148, 123, 130],
      pot: [4, 292, 91, 104],
      spikes: [99, 292, 112, 96],
      bones: [215, 292, 110, 103],
      skull: [329, 292, 113, 70]
    };
    for (const [key, [x, y, width, height]] of Object.entries(propsFrames))
      this.extractTexture(key, "propsAtlas", { x, y, width, height }, "border");

    this.extractTorchTextures();
    this.extractActorFrames("player", { x: 4, y: 4, width: 118, height: 126 });
    this.extractActorFrames("goblin", { x: 126, y: 4, width: 112, height: 112 });
    this.extractActorFrames("skeleton", { x: 242, y: 4, width: 110, height: 116 });
  }

  extractTexture(key, atlasKey, bounds, maskMode) {
    const source = this.textures.get(atlasKey).getSourceImage();
    const texture = this.textures.createCanvas(key, bounds.width, bounds.height);
    const context = texture.getContext();
    context.drawImage(
      source,
      bounds.x, bounds.y, bounds.width, bounds.height,
      0, 0, bounds.width, bounds.height
    );
    if (maskMode === "border") this.removeBorderBackground(context, bounds.width, bounds.height);
    texture.refresh();
  }

  removeBorderBackground(context, width, height) {
    const image = context.getImageData(0, 0, width, height);
    const { data } = image;
    const red = data[0], green = data[1], blue = data[2];
    const isBackground = (pixel) => {
      const offset = pixel * 4;
      return Math.max(data[offset], data[offset + 1], data[offset + 2]) < 48
        && Math.abs(data[offset] - red) < 11
        && Math.abs(data[offset + 1] - green) < 11
        && Math.abs(data[offset + 2] - blue) < 11;
    };
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let tail = 0, head = 0;
    const add = (x, y) => {
      const pixel = y * width + x;
      if (!visited[pixel] && isBackground(pixel)) {
        visited[pixel] = 1;
        queue[tail++] = pixel;
      }
    };
    for (let x = 0; x < width; x++) {
      add(x, 0);
      add(x, height - 1);
    }
    for (let y = 0; y < height; y++) {
      add(0, y);
      add(width - 1, y);
    }
    while (head < tail) {
      const pixel = queue[head++];
      data[pixel * 4 + 3] = 0;
      const x = pixel % width, y = Math.floor(pixel / width);
      if (x > 0) add(x - 1, y);
      if (x + 1 < width) add(x + 1, y);
      if (y > 0) add(x, y - 1);
      if (y + 1 < height) add(x, y + 1);
    }
    context.putImageData(image, 0, 0);
  }

  extractTorchTextures() {
    const source = this.textures.get("torch").getSourceImage();
    const width = source.width, height = source.height;
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
    sourceContext.drawImage(source, 0, 0);

    const pixels = sourceContext.getImageData(0, 0, width, height);
    const body = sourceContext.getImageData(0, 0, width, height);
    const flame = sourceContext.createImageData(width, height);
    for (let y = 0; y < Math.min(72, height); y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const [red, green, blue, alpha] = pixels.data.slice(offset, offset + 4);
        const isFlame = alpha > 0 && red > 165 && green > 45
          && red > green * 1.08 && green > blue * 1.12;
        if (!isFlame) continue;
        flame.data.set(pixels.data.slice(offset, offset + 4), offset);
        body.data[offset + 3] = 0;
      }
    }

    const bodyTexture = this.textures.createCanvas("torchBody", width, height);
    bodyTexture.getContext().putImageData(body, 0, 0);
    bodyTexture.refresh();

    const flameCanvas = document.createElement("canvas");
    flameCanvas.width = width;
    flameCanvas.height = height;
    flameCanvas.getContext("2d").putImageData(flame, 0, 0);
    for (let frame = 0; frame < 4; frame++) {
      const key = `torchFlame${frame}`;
      const texture = this.textures.createCanvas(key, width, height);
      const context = texture.getContext();
      for (let y = 0; y < Math.min(72, height); y++) {
        const offset = Math.round(Math.sin(y * 0.19 + frame * Math.PI / 2) * 2);
        context.drawImage(flameCanvas, 0, y, width, 1, offset, y, width, 1);
      }
      texture.refresh();
    }
  }

  extractActorFrames(name, bounds) {
    const source = this.textures.get("actorsAtlas").getSourceImage();
    const base = document.createElement("canvas");
    base.width = bounds.width;
    base.height = bounds.height;
    const context = base.getContext("2d", { willReadFrequently: true });
    context.drawImage(
      source,
      bounds.x, bounds.y, bounds.width, bounds.height,
      0, 0, bounds.width, bounds.height
    );
    const pixels = context.getImageData(0, 0, bounds.width, bounds.height);
    const { data, width, height } = pixels;
    const foreground = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const offset = i * 4;
      const r = data[offset], g = data[offset + 1], b = data[offset + 2];
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      foreground[i] = chroma > 34 && Math.max(r, g, b) > 46
        || Math.min(r, g, b) > 125 ? 1 : 0;
    }
    const keep = foreground.slice();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (foreground[y * width + x]) continue;
        for (let dy = -2; dy <= 2 && !keep[y * width + x]; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height && foreground[ny * width + nx]) {
              keep[y * width + x] = 1;
              break;
            }
          }
        }
      }
    }
    for (let i = 0; i < width * height; i++)
      if (!keep[i]) data[i * 4 + 3] = 0;
    context.putImageData(pixels, 0, 0);
    const texture = this.textures.createCanvas(name, width, height);
    texture.getContext().drawImage(base, 0, 0);
    texture.refresh();
  }

  createFireAnimation() {
    this.anims.create({
      key: "torch-fire",
      frames: [0, 1, 2, 3].map((frame) => ({ key: `torchFlame${frame}` })),
      frameRate: 8,
      repeat: -1
    });
  }

  createCatTexture() {
    for (let frame = 0; frame < 4; frame++) {
      const texture = this.textures.createCanvas(`catFrame${frame}`, 32, 30);
      this.drawCatFrame(texture.getContext(), frame);
      texture.refresh();
    }
  }

  drawCatFrame(context, frame) {
    context.imageSmoothingEnabled = false;
    const pixel = (x, y, width, height, color) => {
      context.fillStyle = color;
      context.fillRect(x, y, width, height);
    };

    pixel(7, 27, 19, 2, "rgba(0,0,0,0.42)");
    const tailY = frame % 2 ? 8 : 10;
    pixel(22, 16, 5, 4, "#28212a");
    pixel(25, 12, 4, 6, "#28212a");
    pixel(23, tailY, 5, 5, "#28212a");
    pixel(24, tailY + 1, 3, 3, "#c18358");
    pixel(10, 13, 14, 11, "#28212a");
    pixel(11, 13, 12, 9, "#8f5840");
    pixel(12, 15, 7, 6, "#c18358");
    pixel(18, 17, 4, 4, "#603b37");
    pixel(10, 21, 6, 5, "#28212a");
    pixel(18, 21, 6, 5, "#28212a");
    pixel(11, 21, 4, 3, "#c18358");
    pixel(19, 21, 4, 3, "#c18358");

    pixel(8, 3, 5, 7, "#28212a");
    pixel(7, 5, 6, 6, "#28212a");
    pixel(20, 3, 5, 7, "#28212a");
    pixel(19, 5, 6, 6, "#28212a");
    pixel(9, 4, 3, 4, "#c46c70");
    pixel(21, 4, 3, 4, "#c46c70");
    pixel(7, 7, 19, 10, "#28212a");
    pixel(8, 7, 17, 8, "#8f5840");
    pixel(9, 8, 6, 4, "#c18358");
    pixel(18, 8, 6, 4, "#c18358");
    if (frame === 3) {
      pixel(11, 11, 3, 1, "#28212a");
      pixel(20, 11, 3, 1, "#28212a");
    } else {
      pixel(11, 10, 2, 2, "#c7d85a");
      pixel(20, 10, 2, 2, "#c7d85a");
      pixel(12, 10, 1, 2, "#28212a");
      pixel(21, 10, 1, 2, "#28212a");
    }
    pixel(16, 13, 2, 1, "#d58a92");
    pixel(3, 12, 5, 1, "#d9b8a2");
    pixel(4, 14, 4, 1, "#d9b8a2");
    pixel(24, 12, 5, 1, "#d9b8a2");
    pixel(24, 14, 4, 1, "#d9b8a2");

  }

  createCatAnimation() {
    this.anims.create({
      key: "cat-idle",
      frames: [0, 1, 2, 3].map((frame) => ({ key: `catFrame${frame}` })),
      frameRate: 4,
      repeat: -1
    });
  }

  drawRoom() {
    this.add.rectangle(MAP_W * TILE / 2, MAP_H * TILE / 2, MAP_W * TILE, MAP_H * TILE, 0x0d0e18)
      .setDepth(-1);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const center = cellCenter(x, y);
        if (map[idx(x, y)] !== FLOOR) continue;
        this.add.image(center.x, center.y, "floorStone0")
          .setDisplaySize(TILE + 6, TILE + 6)
          .setDepth(0);
      }
    }

    this.drawWallRuns();

    this.add.image(...Object.values(cellCenter(5, 5)), "rugSquare")
      .setDisplaySize(170, 136).setDepth(1);
    this.add.image(...Object.values(cellCenter(12, 5)), "rugWide")
      .setDisplaySize(166, 100).setDepth(1);

    for (const item of decor) {
      if (item.wall && (item.key === "bannerRed" || item.key === "bannerSkull")) {
        this.addImage(item.key, item.x, item.y, 52, 72, 12);
      } else {
        const sizes = {
          web: [70, 68],
          bones: [70, 54],
          rubbleLarge: [44, 44],
          rubbleMedium: [46, 44],
          rubblePebbles: [38, 28],
          mossChunk: [42, 42],
          mossLarge: [46, 44],
          mossPebbles: [38, 28],
          cat: [44, 40]
        };
        const size = sizes[item.key] || [58, 64];
          if (item.key === "cat") {
            const position = cellCenter(item.x, item.y);
            this.add.sprite(position.x, position.y, "catFrame0")
              .setDisplaySize(44, 40)
              .setDepth(31)
              .play("cat-idle");
          } else {
            this.addImage(item.key, item.x, item.y, size[0], size[1], 12 + item.y * 0.01);
          }
      }
    }

    this.addImage("spikes", 8.5, 8.5, TILE * 2, TILE * 2, 8);

    for (const torch of torches) {
      this.addImage("torchBody", torch.x, torch.y, TORCH_WIDTH, TORCH_HEIGHT, 12 + torch.y * 0.01);
      this.addTorchFlame(torch.x, torch.y, TORCH_WIDTH, TORCH_HEIGHT, 20 + torch.y * 0.01);
    }
  }

  drawWallRuns() {
    const cornerA = this.textures.get("wallCornerA").getSourceImage();
    const cornerB = this.textures.get("wallCornerB").getSourceImage();
    const width = MAP_W * TILE;
    const height = MAP_H * TILE;
    const horizontalStart = TILE / 2 + cornerA.width / 2;
    const horizontalEnd = width - horizontalStart;
    const verticalStart = TILE / 2 + cornerA.height / 2;
    const verticalEnd = height - verticalStart;
    const horizontalHeight = cornerA.height;
    const verticalWidth = cornerA.width / 2;
    this.wallRunIndex = 0;

    this.drawWallRun(
      "wallHorizontal",
      horizontalStart,
      TILE / 2 - horizontalHeight / 2,
      horizontalEnd - horizontalStart,
      horizontalHeight
    );
    this.drawWallRun(
      "wallHorizontal",
      horizontalStart,
      height - TILE / 2 - horizontalHeight / 2,
      horizontalEnd - horizontalStart,
      horizontalHeight
    );
    this.drawWallRun(
      "wallVertical",
      TILE / 2 - verticalWidth / 2,
      verticalStart,
      verticalWidth,
      verticalEnd - verticalStart,
      true
    );
    this.drawWallRun(
      "wallVertical",
      width - TILE / 2 - verticalWidth / 2,
      verticalStart,
      cornerB.width / 2,
      verticalEnd - verticalStart
    );

    const corners = [
      { key: "wallCornerA", x: TILE / 2, y: TILE / 2 },
      { key: "wallCornerB", x: width - TILE / 2, y: TILE / 2 },
      { key: "wallCornerA", x: TILE / 2, y: height - TILE / 2, flipY: true },
      { key: "wallCornerB", x: width - TILE / 2, y: height - TILE / 2, flipY: true }
    ];
    for (const corner of corners) {
      this.add.image(corner.x, corner.y, corner.key)
        .setFlipY(Boolean(corner.flipY))
        .setDepth(5);
    }
  }

  drawWallRun(textureKey, startX, startY, width, height, flipX = false) {
    const wall = this.textures.get(textureKey).getSourceImage();
    const horizontal = width > height;
    const runWidth = Math.max(1, Math.round(width));
    const runHeight = Math.max(1, Math.round(height));
    const centerX = startX + runWidth / 2;
    const centerY = startY + runHeight / 2;
    const textureKeyForRun = `${textureKey}-run-${++this.wallRunIndex}`;
    const texture = this.textures.createCanvas(textureKeyForRun, runWidth, runHeight);
    const context = texture.getContext();
    if (flipX) {
      context.translate(runWidth, 0);
      context.scale(-1, 1);
    }

    const tileLength = horizontal ? wall.width : wall.height;
    const runLength = horizontal ? runWidth : runHeight;
    for (let offset = 0; offset < runLength; offset += tileLength) {
      const length = Math.min(tileLength, runLength - offset);
      if (horizontal)
        context.drawImage(wall, 0, 0, length, wall.height, offset, 0, length, runHeight);
      else
        context.drawImage(wall, 0, 0, wall.width, length, 0, offset, runWidth, length);
    }
    texture.refresh();
    this.add.image(centerX, centerY, textureKeyForRun).setDepth(4);
  }

  addImage(key, x, y, width, height, depth) {
    const position = cellCenter(x, y);
    return this.add.image(position.x, position.y, key)
      .setDisplaySize(width, height)
      .setDepth(depth);
  }

  addTorchFlame(x, y, width, height, depth) {
    const position = cellCenter(x, y);
    return this.add.sprite(position.x, position.y, "torchFlame0")
      .setDisplaySize(width, height)
      .setDepth(depth + 0.01)
      .play("torch-fire");
  }

  createLighting() {
    this.add.rectangle(
      MAP_W * TILE / 2,
      MAP_H * TILE / 2,
      MAP_W * TILE,
      MAP_H * TILE,
      0x080d19
    ).setAlpha(0.42).setDepth(15);

    const texture = this.textures.createCanvas("torchGlow", 200, 200);
    const context = texture.getContext();
    const gradient = context.createRadialGradient(100, 100, 2, 100, 100, 100);
    gradient.addColorStop(0, "rgba(255,180,91,0.58)");
    gradient.addColorStop(0.38, "rgba(255,139,56,0.34)");
    gradient.addColorStop(1, "rgba(255,112,38,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 200, 200);
    texture.refresh();

    this.torchLights = torches.map((torch) => {
      const center = cellCenter(torch.x, torch.y);
      return this.add.image(center.x, center.y, "torchGlow")
        .setDisplaySize(220, 220)
        .setAlpha(0.74)
        .setDepth(17);
    });
  }

  fitRoom(width, height) {
    const padding = 32;
    const framedWidth = MAP_W * TILE + padding * 2;
    const framedHeight = MAP_H * TILE + padding * 2;
    const zoom = Math.min(width / framedWidth, height / framedHeight);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(MAP_W * TILE / 2, MAP_H * TILE / 2);
  }

  syncActors(animate = false) {
    if (!this.playerSprite) return;
    const playerPosition = cellCenter(player.x, player.y);
    this.moveSprite(this.playerSprite, playerPosition, animate);

    const textures = { goblin: "goblin", skeleton: "skeleton", skull: "skull" };
    enemies.forEach((enemy, index) => {
      let sprite = this.enemySprites[index];
      if (!sprite) {
        sprite = this.add.sprite(0, 0, textures[enemy.type]).setDepth(30);
        this.enemySprites[index] = sprite;
      }
      sprite.setTexture(textures[enemy.type]);
      sprite.setOrigin(0.5, enemy.type === "goblin" ? 0.86 : 0.88);
      sprite.setDisplaySize(
        enemy.type === "goblin" ? 112 : enemy.type === "skull" ? 58 : 110,
        enemy.type === "goblin" ? 112 : enemy.type === "skull" ? 64 : 116
      );
      const position = cellCenter(enemy.x, enemy.y);
      this.moveSprite(sprite, position, animate);
    });
    this.enemySprites.slice(enemies.length).forEach((sprite) => sprite.setVisible(false));
    this.enemySprites.slice(0, enemies.length).forEach((sprite) => sprite.setVisible(true));
  }

  moveSprite(sprite, position, animate) {
    if (animate) {
      this.tweens.add({
        targets: sprite,
        x: position.x,
        y: position.y,
        duration: 105,
        ease: "Linear"
      });
    } else {
      sprite.setPosition(position.x, position.y);
    }
  }

  update(time) {
    this.torchLights?.forEach((light, index) => {
      light.setAlpha(0.58 + Math.sin(time / 155 + index * 1.7) * 0.12);
    });
  }
}

function isWalkable(x, y) {
  return inBounds(x, y) && map[idx(x, y)] === FLOOR
    && !blockedDecor.has(cellKey(x, y))
    && !spikes.has(cellKey(x, y));
}

function attackNearby(target) {
  if (!started || gameOver || catDialogueOpen) return;
  const enemy = target || enemies.find((item) =>
    Math.abs(item.x - player.x) + Math.abs(item.y - player.y) === 1
  );
  if (!enemy) {
    showToast("Нет врага рядом");
    return;
  }
  enemy.hp -= player.dmg;
  if (enemy.hp <= 0) {
    enemies = enemies.filter((item) => item !== enemy);
    player.gold += enemy.type === "skeleton" ? 8 : 4;
    showToast(`${enemy.name} повержен`);
  } else {
    showToast(`Удар по ${enemy.name}`);
  }
  endTurn();
}

function movePlayer(dx, dy) {
  if (!started || catDialogueOpen) return;
  if (gameOver) {
    reset();
    return;
  }
  const nx = player.x + dx, ny = player.y + dy;
  if (!inBounds(nx, ny) || map[idx(nx, ny)] !== FLOOR) {
    showToast("Каменная стена преграждает путь");
    return;
  }
  if (spikes.has(cellKey(nx, ny))) {
    showToast("Шипы преграждают проход");
    return;
  }
  const enemy = enemies.find((item) => item.x === nx && item.y === ny);
  if (enemy) {
    attackNearby(enemy);
    return;
  }
  if (blockedDecor.has(cellKey(nx, ny))) {
    if (nx === catCell.x && ny === catCell.y) {
      openCatDialogue();
      return;
    }
    showToast("Путь загорожен");
    return;
  }
  player.x = nx;
  player.y = ny;
  const facing = dx === 0 && dy === -1 ? "up"
    : dx === 1 && dy === 0 ? "right"
    : dx === -1 && dy === 0 ? "left"
    : null;
  if (facing) dungeonScene?.playPlayerWalk(facing);
  else dungeonScene?.stopPlayerWalk();
  endTurn();
  checkCatProximity();
}

function nextStepToward(enemy) {
  const start = cellKey(enemy.x, enemy.y);
  const queue = [{ x: enemy.x, y: enemy.y }];
  const previous = new Map([[start, null]]);
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  let targetKey = null;
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    if (current.x === player.x && current.y === player.y) {
      targetKey = cellKey(current.x, current.y);
      break;
    }
    for (const [dx, dy] of directions) {
      const x = current.x + dx, y = current.y + dy;
      const key = cellKey(x, y);
      if (previous.has(key) || !inBounds(x, y)) continue;
      const occupied = enemies.some((other) => other !== enemy && other.x === x && other.y === y);
      if (occupied || (x !== player.x || y !== player.y) && !isWalkable(x, y)) continue;
      previous.set(key, cellKey(current.x, current.y));
      queue.push({ x, y });
    }
  }
  if (!targetKey) return null;
  let step = targetKey;
  while (previous.get(step) && previous.get(step) !== start)
    step = previous.get(step);
  const [x, y] = step.split(",").map(Number);
  return { x, y };
}

function endTurn() {
  if (!started || gameOver || catDialogueOpen) return;
  for (const enemy of enemies) {
    const distance = Math.abs(enemy.x - player.x) + Math.abs(enemy.y - player.y);
    if (distance === 1) {
      player.hp = Math.max(0, player.hp - enemy.dmg);
      showToast(`${enemy.name} наносит ${enemy.dmg} урона`);
      if (player.hp === 0) {
        gameOver = true;
        showToast("Ты пал в зале стражей — нажми, чтобы начать заново");
        break;
      }
      continue;
    }
    if (distance > 8) continue;
    const step = nextStepToward(enemy);
    if (step) {
      enemy.x = step.x;
      enemy.y = step.y;
    }
  }
  updateHud();
  dungeonScene?.syncActors(true);
}

document.querySelectorAll(".dbtn").forEach((button) => {
  button.addEventListener("click", () => {
    const directions = {
      up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]
    };
    movePlayer(...directions[button.dataset.dir]);
  });
});

document.getElementById("btn-wait").addEventListener("click", endTurn);
document.getElementById("btn-talk").addEventListener("click", () => attackNearby());
document.getElementById("btn-start").addEventListener("click", () => {
  started = true;
  document.getElementById("start").classList.add("hidden");
  reset();
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") event.preventDefault();
  if (event.code === "Escape" && catDialogueOpen) {
    event.preventDefault();
    closeCatDialogue();
  }
});

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  backgroundColor: "#0d0e18",
  pixelArt: true,
  scene: [DungeonScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
});
