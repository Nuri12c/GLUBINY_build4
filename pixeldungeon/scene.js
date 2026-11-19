"use strict";

const TILE = 48;
const MAP_W = 22;
const MAP_H = 18;
const PLAYER_DISPLAY_WIDTH = 78;
const PLAYER_DISPLAY_HEIGHT = 88;
const FLOOR = 1;
const WALL = 0;
const map = new Array(MAP_W * MAP_H).fill(WALL);
const cellKey = (x, y) => `${x},${y}`;
const idx = (x, y) => y * MAP_W + x;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
const catCell = { x: 2, y: 5 };
const roomAmbient = [
  { x: 1, y: 1, width: 8, height: 16, level: 0 },
  { x: 13, y: 1, width: 8, height: 16, level: 0 }
];
const carve = (x1, y1, x2, y2) => {
  for (let y = y1; y <= y2; y++)
    for (let x = x1; x <= x2; x++)
      map[idx(x, y)] = FLOOR;
};

carve(1, 1, 20, 16);

const corridorRows = new Set([8, 9]);
for (let y = 1; y <= 16; y++)
  if (!corridorRows.has(y))
    for (let x = 9; x <= 12; x++)
      map[idx(x, y)] = WALL;

const decor = [{ key: "cat", ...catCell, solid: true }];
const blockedDecor = new Set(decor.filter((item) => item.solid)
  .map((item) => cellKey(item.x, item.y)));

const player = { x: 3, y: 7, hp: 24, maxHp: 24, gold: 0, dmg: 4 };
let enemies = [];
let started = false;
let gameOver = false;
let catDialogueOpen = false;
let wasNearCat = false;
let toastTimer;
let dungeonScene;

function reset() {
  player.x = 3;
  player.y = 7;
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
    this.load.image("actorsAtlas", "assets/actors_compact.png");
    this.load.spritesheet("playerDownWalk", "assets/player_down_walk.png", {
      frameWidth: 128,
      frameHeight: 160
    });
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
    this.drawRoom();
    this.createVisionOverlay();

    this.playerSprite = this.add.sprite(0, 0, "playerDownWalk", 0)
      .setOrigin(0.5, 0.82)
      .setFlipX(true)
      .setDepth(30);
    this.playerSprite.setDisplaySize(PLAYER_DISPLAY_WIDTH, PLAYER_DISPLAY_HEIGHT);
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
      ["down", "playerDownWalk"],
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
      down: "playerDownWalk",
      up: "playerUpWalk",
      right: "playerRightWalk"
    }[facing];
    if (this.playerSprite.texture.key !== texture)
      this.playerSprite.setTexture(texture, 0);
    this.playerSprite.setFlipX(direction === "left");
    this.playerSprite.setDisplaySize(PLAYER_DISPLAY_WIDTH, PLAYER_DISPLAY_HEIGHT);
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
    const facing = direction === "left" ? "right" : direction || "down";
    const texture = {
      down: "playerDownWalk",
      up: "playerUpWalk",
      right: "playerRightWalk"
    }[facing];
    this.playerSprite.setTexture(texture, 0);
    this.playerSprite.setFlipX(direction === "left" || facing === "down");
    this.playerSprite.setDisplaySize(PLAYER_DISPLAY_WIDTH, PLAYER_DISPLAY_HEIGHT);
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

    const floorFrames = {
      floorStone0: [4, 4, 49, 44]
    };
    for (const [key, [x, y, width, height]] of Object.entries(floorFrames))
      this.extractTexture(key, "floorsAtlas", { x, y, width, height }, "border");

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
    this.drawInternalWalls();

    for (const item of decor) {
      const position = cellCenter(item.x, item.y);
      this.add.sprite(position.x, position.y, "catFrame0")
        .setDisplaySize(44, 40)
        .setDepth(14)
        .play("cat-idle");
    }
  }

  drawInternalWalls() {
    const cornerA = this.textures.get("wallCornerA").getSourceImage();
    const wallWidth = cornerA.width / 2;
    for (let x = 9; x <= 12; x++) {
      const ranges = x === 9 || x === 12
        ? [[1, 7], [10, 16]]
        : [[1, 6], [11, 16]];
      for (const [firstRow, lastRow] of ranges) {
        const height = (lastRow - firstRow + 1) * TILE;
        const centerX = (x + 0.5) * TILE;
        const centerY = (firstRow + lastRow + 1) * TILE / 2;
        this.drawWallRun(
          "wallVertical",
          centerX - wallWidth / 2,
          centerY - height / 2,
          wallWidth,
          height,
          x === 9
        );
      }
    }

    const wallHeight = this.textures.get("wallHorizontal").getSourceImage().height;
    const width = TILE * 2;
    for (const y of [7, 10]) {
      const centerX = 11 * TILE;
      const centerY = (y + 0.5) * TILE;
      this.drawWallRun(
        "wallHorizontal",
        centerX - width / 2,
        centerY - wallHeight / 2,
        width,
        wallHeight,
        false,
        true
      );
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

  drawWallRun(textureKey, startX, startY, width, height, flipX = false, horizontalOverride = null) {
    const wall = this.textures.get(textureKey).getSourceImage();
    const horizontal = horizontalOverride ?? width > height;
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

  fitRoom(width, height) {
    const zoom = Math.min(width / (TILE * 12), height / (TILE * 8));
    this.cameras.main.setZoom(zoom);
    this.cameras.main.setBounds(
      -TILE,
      -TILE,
      (MAP_W + 2) * TILE,
      (MAP_H + 2) * TILE
    );
    if (this.playerSprite)
      this.cameras.main.startFollow(this.playerSprite, true, 0.12, 0.12);
  }

  createVisionOverlay() {
    const width = MAP_W * TILE;
    const height = MAP_H * TILE;
    this.visionTexture = this.textures.createCanvas("visionOverlay", width, height);
    this.visionContext = this.visionTexture.getContext();
    this.visionImage = this.add.image(width / 2, height / 2, "visionOverlay")
      .setDepth(29);
    this.updateVisionOverlay();
  }

  updateVisionOverlay() {
    const width = MAP_W * TILE;
    const height = MAP_H * TILE;
    const center = cellCenter(player.x, player.y);
    const context = this.visionContext;
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(16, 19, 30, 0.56)";
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "destination-out";
    for (const room of roomAmbient) {
      if (room.level <= 0) continue;
      context.fillStyle = `rgba(0, 0, 0, ${Math.min(room.level, 1)})`;
      context.fillRect(
        room.x * TILE,
        room.y * TILE,
        room.width * TILE,
        room.height * TILE
      );
    }
    const maskFade = context.createRadialGradient(
      center.x, center.y, TILE * 0.9,
      center.x, center.y, TILE * 5.5
    );
    maskFade.addColorStop(0, "rgba(0, 0, 0, 1)");
    maskFade.addColorStop(0.2, "rgba(0, 0, 0, 0.98)");
    maskFade.addColorStop(0.5, "rgba(0, 0, 0, 0.82)");
    maskFade.addColorStop(0.78, "rgba(0, 0, 0, 0.34)");
    maskFade.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = maskFade;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "source-over";
    this.visionTexture.refresh();
  }

  syncActors(animate = false) {
    if (!this.playerSprite) return;
    const playerPosition = cellCenter(player.x, player.y);
    this.moveSprite(this.playerSprite, playerPosition, animate);
    this.updateVisionOverlay();

    const textures = { goblin: "goblin", skeleton: "skeleton", skull: "skull" };
    enemies.forEach((enemy, index) => {
      let sprite = this.enemySprites[index];
      if (!sprite) {
        sprite = this.add.sprite(0, 0, textures[enemy.type]).setDepth(28);
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

}

function isWalkable(x, y) {
  return inBounds(x, y) && map[idx(x, y)] === FLOOR
    && !blockedDecor.has(cellKey(x, y));
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
    : dx === 0 && dy === 1 ? "down"
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
