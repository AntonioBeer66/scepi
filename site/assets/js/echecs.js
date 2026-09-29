(function () {
  const board = document.querySelector("#chess-board");
  if (!board || typeof Chess !== "function") return;
  const files = "abcdefgh",
    glyphs = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
    pieceSvg = (type, color = "w") => `<img class="chess-piece-svg" src="../assets/echecs/cburnett/${color}${type.toUpperCase()}.svg" alt="" draggable="false">`;
  const soundFiles = { move: "move.wav", capture: "capture.wav", checkmate: "checkmate.wav", castle: "castle.wav" };
  const playSound = (name) => {
    const file = soundFiles[name];
    if (!file) return;
    const audio = new Audio(`../assets/echecs/sounds/${file}`);
    audio.volume = 0.55;
    audio.play().catch(() => {});
  };
  let profiles = {},
    suppressNextBoardClick = false;
  let game = new Chess(),
    selected = null,
    drag = null,
    animation = null,
    visualAnimation = null,
    arrows = [],
    circles = [],
    timeline = [],
    timelineIndex = 0,
    moveHistory = [],
    gameStarted = false,
    gameEnded = false,
    playerColor = "w",
    selectedColorMode = "w",
    lastDialogue = "",
    nextDialoguePly = 0,
    pendingAnnotations = null,
    rightDrag = null,
    model = null,
    styleProfile = null,
    botTimer,
    botThinking = false,
    engine;
  const $ = (id) => document.querySelector(id);
  if (
    typeof Chess.prototype.is_checkmate !== "function" &&
    typeof Chess.prototype.in_checkmate === "function"
  )
    Chess.prototype.is_checkmate = Chess.prototype.in_checkmate;
  if (
    typeof game.is_checkmate !== "function" &&
    typeof game.in_checkmate === "function"
  )
    Object.getPrototypeOf(game).is_checkmate = function () {
      return this.in_checkmate();
    };
  const isCheckmate = () =>
    typeof game.in_checkmate === "function" && game.in_checkmate();
  function buildBotPanel() {
    const panel = document.querySelector(".chess-side-panel");
    if (!panel) return;
    panel.innerHTML =
      '<div class="chess-bot-header"><span aria-hidden="true">🤖</span><h2>Jouer contre des robots</h2></div><div class="chess-bot-conversation"><div class="chess-bot-portrait" aria-hidden="true">♞</div><div class="chess-bot-message" id="chess-bot-message">Bonjour ! Prêt à jouer ?</div></div><div class="chess-bot-selection"><label class="chess-select-label" for="chess-profile">Adversaire</label><select id="chess-profile" class="chess-profile"><option value="chavent">Chavent</option><option value="mathieu_212">Mathieu 212</option></select><p id="chess-profile-copy" class="chess-profile-copy"></p></div><div class="chess-move-list"><div class="chess-list-heading"><span class="eyebrow">PARTIE EN COURS</span><span id="chess-move-count">0 coups</span></div><div id="chess-moves-list" class="chess-moves-list"><p class="chess-empty">Aucun coup pour le moment.</p></div></div><span id="chess-bot-name" hidden></span><span id="chess-moves" hidden></span><span id="chess-turn" hidden></span>';
  }
  function buildBoardPlayers() {
    const shell = document.querySelector(".chess-board-shell");
    if (!shell || shell.dataset.playersBuilt) return;
    shell.dataset.playersBuilt = "true";
    shell.insertAdjacentHTML(
      "beforebegin",
      '<div class="chess-player chess-player-top"><div class="chess-player-avatar" aria-hidden="true">♞</div><div class="chess-player-info"><strong id="chess-top-player">Chavent</strong><span id="chess-top-rating">(1500)</span><div class="chess-capture-line"><div class="chess-captures" id="chess-top-captures"></div><strong class="chess-material" id="chess-top-material"></strong></div></div></div>',
    );
    shell.insertAdjacentHTML(
      "afterend",
      '<div class="chess-player chess-player-bottom"><div class="chess-player-avatar" aria-hidden="true">♙</div><div class="chess-player-info"><strong>Vous</strong><div class="chess-capture-line"><div class="chess-captures" id="chess-bottom-captures"></div><strong class="chess-material" id="chess-bottom-material"></strong></div></div></div>',
    );
  }
  function buildBotSelection() {
    const selection = document.querySelector(".chess-bot-selection");
    if (!selection || selection.dataset.gridBuilt) return;
    selection.dataset.gridBuilt = "true";
    selection.innerHTML +=
      '<div class="chess-bot-grid"><button type="button" class="chess-bot-option is-selected" data-profile="chavent"><span class="chess-option-avatar">♞</span><strong>Chavent</strong><small>(1500)</small></button><button type="button" class="chess-bot-option" data-profile="mathieu_212"><span class="chess-option-avatar">♟</span><strong>Mathieu 212</strong><small>(1000)</small></button></div><button type="button" class="button chess-start-button" id="chess-start">Nouvelle partie</button>';
    selection.querySelectorAll(".chess-bot-option").forEach((option) =>
      option.addEventListener("click", () => {
        const profile = $("#chess-profile");
        profile.value = option.dataset.profile;
        profile.dispatchEvent(new Event("change"));
        selection
          .querySelectorAll(".chess-bot-option")
          .forEach((item) =>
            item.classList.toggle("is-selected", item === option),
          );
      }),
    );
    $("#chess-start").addEventListener("click", () => {
      gameStarted = true;
      reset();
    });
  }
  function buildBotSelectionDescription() {
    const selection = document.querySelector(".chess-bot-selection");
    if (!selection || selection.dataset.descriptionBuilt) return;
    selection.dataset.descriptionBuilt = "true";
    const description = document.createElement("p");
    description.id = "chess-selection-description";
    description.className = "chess-selection-description";
    description.textContent = "Description du bot à venir.";
    const grid = selection.querySelector(".chess-bot-grid");
    if (grid) grid.after(description);
    const update = () => {
      description.textContent =
        $("#chess-profile").value === "mathieu_212"
          ? "Description de Mathieu 212 à venir."
          : "Description de Chavent à venir.";
    };
    $("#chess-profile").addEventListener("change", update);
    update();
  }
  function buildColorSelection() {
    const selection = document.querySelector(".chess-bot-selection"),
      start = $("#chess-start");
    if (!selection || !start) return;
    const modes = document.createElement("div");
    modes.className = "chess-color-modes";
    modes.innerHTML =
      '<button type="button" class="chess-color-mode is-selected" data-color="w" aria-label="Jouer les blancs">♔</button><button type="button" class="chess-color-mode" data-color="random" aria-label="Couleur aléatoire">?</button><button type="button" class="chess-color-mode" data-color="b" aria-label="Jouer les noirs">♚</button>';
    start.before(modes);
    modes.querySelectorAll(".chess-color-mode").forEach((button) =>
      button.addEventListener("click", () => {
        modes
          .querySelectorAll(".chess-color-mode")
          .forEach((item) =>
            item.classList.toggle("is-selected", item === button),
          );
        playerColor =
          button.dataset.color === "random"
            ? Math.random() < 0.5
              ? "w"
              : "b"
            : button.dataset.color;
      }),
    );
    $("#chess-start").addEventListener("click", () => {
      if (playerColor === "b") {
        setTimeout(botMove, 240);
      }
    });
  }
  function applyProfileConfig(config) {
    profiles = Object.fromEntries(
      config.profiles.map((profile) => [
        profile.id,
        {
          ...profile,
          file: `../assets/echecs/${profile.model}`,
          profile: `../assets/echecs/${profile.style}`,
          copy: profile.description,
        },
      ]),
    );
    const select = $("#chess-profile"),
      grid = document.querySelector(".chess-bot-grid");
    if (select) {
      select.innerHTML = config.profiles
        .map(
          (profile) => `<option value="${profile.id}">${profile.name}</option>`,
        )
        .join("");
      select.addEventListener("change", () => {
        const current = profiles[select.value];
        if (!current) return;
        $("#chess-bot-message").textContent = randomDialogue(current.selection_dialogue || current.dialogue);
        $("#chess-selection-description").textContent =
          current.description || "";
        $("#chess-top-player").textContent = current.name;
        $("#chess-top-rating").textContent = `(${current.rating})`;
        const portrait = $(".chess-bot-portrait"),
          boardPortrait = $(".chess-player-top .chess-player-avatar");
        [portrait, boardPortrait].forEach((target) => {
          if (target && current.picture) {
            target.textContent = "";
            target.style.backgroundImage = `url(${current.picture})`;
            target.style.backgroundSize =
              target === portrait ? "contain" : "cover";
            target.style.backgroundPosition = "center";
          }
        });
      });
    }
    if (grid) {
      grid.innerHTML = config.profiles
        .map(
          (profile, index) =>
            `<button type="button" class="chess-bot-option${index === 0 ? " is-selected" : ""}" data-profile="${profile.id}"><span class="chess-option-avatar" style="background-image:url('${profile.picture}')"> </span><strong>${profile.name}</strong><small>(${profile.rating})</small></button>`,
        )
        .join("");
      grid.querySelectorAll(".chess-bot-option").forEach((option) =>
        option.addEventListener("click", () => {
          select.value = option.dataset.profile;
          select.dispatchEvent(new Event("change"));
          grid
            .querySelectorAll(".chess-bot-option")
            .forEach((item) =>
              item.classList.toggle("is-selected", item === option),
            );
        }),
      );
    }
    if (select) {
      select.dispatchEvent(new Event("change"));
    }
  }
  function renderBoardPlayers() {
    const counts = {
        w: { p: 8, n: 2, b: 2, r: 2, q: 1 },
        b: { p: 8, n: 2, b: 2, r: 2, q: 1 },
      },
      values = { p: 1, n: 3, b: 3, r: 5, q: 9 },
      current = {
        w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
        b: { p: 0, n: 0, b: 0, r: 0, q: 0 },
      };
    game
      .board()
      .flat()
      .forEach((piece) => {
        if (piece && piece.type !== "k") current[piece.color][piece.type] += 1;
      });
    const captured = (owner) =>
      Object.keys(counts[owner]).flatMap((type) =>
        Array(Math.max(0, counts[owner][type] - current[owner][type])).fill(
          type,
        ),
      );
    const botSide = playerColor === "w" ? "b" : "w",
      top = captured(playerColor),
      bottom = captured(botSide),
      score = (side) =>
        Object.keys(values).reduce(
          (total, type) => total + current[side][type] * values[type],
          0,
        );
    const topCaptures = $("#chess-top-captures"),
      bottomCaptures = $("#chess-bottom-captures");
    if (topCaptures)
    topCaptures.innerHTML = top.map((type) => pieceSvg(type, playerColor)).join("");
    if (bottomCaptures)
    bottomCaptures.innerHTML = bottom.map((type) => pieceSvg(type, botSide)).join("");
    const topMaterial = $("#chess-top-material"),
      bottomMaterial = $("#chess-bottom-material"),
      difference = score(botSide) - score(playerColor);
    if (topMaterial)
      topMaterial.textContent = difference > 0 ? `+${difference}` : "";
    if (bottomMaterial)
      bottomMaterial.textContent =
        difference < 0 ? `+${Math.abs(difference)}` : "";
    const sidePanel = document.querySelector(".chess-side-panel");
    if (sidePanel) sidePanel.classList.toggle("is-game-started", gameStarted);
  }
  const name = (file, rank) => files[file] + (8 - rank);
  const pos = (square) => ({
    file: files.indexOf(square[0]),
    rank: 8 - Number(square[1]),
  });
  let squareAt = (event) => {
    const rect = board.getBoundingClientRect();
    const file = Math.floor(((event.clientX - rect.left) / rect.width) * 8);
    const rank = Math.floor(((event.clientY - rect.top) / rect.height) * 8);
    return file >= 0 && file < 8 && rank >= 0 && rank < 8
      ? name(file, rank)
      : null;
  };
  class StockfishEngine {
    constructor() {
      const script = new URL("../assets/echecs/stockfish.js", document.baseURI);
      this.worker = new Worker(script);
      this.ready = new Promise((resolve) => {
        this.resolveReady = resolve;
      });
      this.waiters = [];
      this.failed = false;
      this.worker.onmessage = (event) => {
        const line = typeof event.data === "string" ? event.data.trim() : "";
        if (line === "uciok") this.worker.postMessage("isready");
        if (line === "readyok") this.resolveReady();
        this.waiters.forEach((waiter) => waiter(line));
      };
      this.worker.onerror = () => {
        this.failed = true;
      };
      this.worker.postMessage("uci");
    }
    async analyse(fen) {
      if (this.failed) return [];
      try {
        await Promise.race([
          this.ready,
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Stockfish startup timeout")),
              8000,
            ),
          ),
        ]);
      } catch (error) {
        this.failed = true;
        return [];
      }
      return new Promise((resolve) => {
        const candidates = new Map();
        let finished = false;
        const finish = (result) => {
          if (finished) return;
          finished = true;
          this.waiters = this.waiters.filter((waiter) => waiter !== onLine);
          clearTimeout(timeout);
          resolve(result);
        };
        const timeout = setTimeout(() => {
          try {
            this.worker.postMessage("stop");
          } catch (error) {}
          finish([...candidates.values()].sort((a, b) => b.score - a.score));
        }, 8000);
        const onLine = (line) => {
          if (
            line.startsWith("info") &&
            line.includes("multipv") &&
            line.includes(" pv ")
          ) {
            const multipv = Number((line.match(/multipv (\d+)/) || [])[1]);
            const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
            const pv = line.split(" pv ")[1].split(" ")[0];
            if (multipv && scoreMatch && pv) {
              const mate = scoreMatch[1] === "mate" ? Number(scoreMatch[2]) : null;
              candidates.set(multipv, {
                move: pv,
                mate,
                score:
                  mate === null
                    ? Number(scoreMatch[2])
                    : mate > 0
                      ? 100000 - mate * 1000
                      : -100000 + Math.abs(mate) * 1000,
              });
            }
          }
          if (line.startsWith("bestmove"))
            finish([...candidates.values()].sort((a, b) => b.score - a.score));
        };
        this.waiters.push(onLine);
        this.worker.postMessage("stop");
        this.worker.postMessage("setoption name MultiPV value 8");
        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage("go depth 10");
      });
    }
  }
  function highlightLastMove() {
    const lastMove = timeline[timelineIndex]?.lastMove,
      wanted = new Set(lastMove ? [lastMove.from, lastMove.to] : []);
    board.querySelectorAll(".chess-square.is-last-move").forEach((square) => {
      if (!wanted.has(square.dataset.square))
        square.classList.remove("is-last-move");
    });
    wanted.forEach((square) =>
      board
        .querySelector(`.chess-square[data-square="${square}"]`)
        ?.classList.add("is-last-move"),
    );
  }
  function highlightCheck() {
    board
      .querySelectorAll(".chess-square.is-check")
      .forEach((square) => square.classList.remove("is-check"));
    if (!game.in_check()) return;
    game.board().forEach((row, rank) =>
      row.forEach((piece, file) => {
        if (piece?.type === "k" && piece.color === game.turn())
          board
            .querySelector(`.chess-square[data-square="${name(file, rank)}"]`)
            ?.classList.add("is-check");
      }),
    );
  }
  function randomDialogue(lines) {
    const choices = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
    return choices[Math.floor(Math.random() * choices.length)] || "";
  }
  function showBotDialogue(lines) {
    const choices = lines
      .filter(Boolean)
      .filter((line) => line !== lastDialogue);
    lastDialogue =
      choices[Math.floor(Math.random() * (choices.length || lines.length))] ||
      lines[0] ||
      "";
    const message = $("#chess-bot-message");
    message.textContent = lastDialogue;
    message.classList.remove("is-updating");
    void message.offsetWidth;
    message.classList.add("is-updating");
  }
  function startBotDialogue() {
    const current = profiles[$("#chess-profile").value],
      lines = Array.isArray(current?.game_dialogue)
        ? current.game_dialogue
        : [];
    showBotDialogue(lines);
    nextDialoguePly = (Math.floor(Math.random() * 4) + 2) * 2;
  }
  function maybeBotDialogue() {
    if (
      !gameStarted ||
      game.turn() !== "b" ||
      !moveHistory.length ||
      moveHistory.length < nextDialoguePly
    )
      return;
    const current = profiles[$("#chess-profile").value],
      lines = Array.isArray(current?.game_dialogue)
        ? current.game_dialogue.filter(Boolean)
        : [];
    if (!lines.length) return;
    showBotDialogue(lines);
    nextDialoguePly =
      moveHistory.length + (Math.floor(Math.random() * 4) + 2) * 2;
  }
  function status(main) {
    $("#chess-status").innerHTML = `<strong>${main}</strong>`;
    highlightLastMove();
    highlightCheck();
    renderBoardPlayers();
    maybeBotDialogue();
  }
  function showGameEndModal(title) {
    let modal = $("#chess-game-end-modal");
    const current = profiles[$("#chess-profile").value] || {};
    const lost =
      title.includes("abandonnée") ||
      (game.is_checkmate() && game.turn() === playerColor);
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "chess-game-end-modal";
      modal.className = "chess-game-end-modal";
      modal.innerHTML =
        '<div class="chess-game-end-dialog" role="dialog" aria-modal="true" aria-labelledby="chess-game-end-title"><button type="button" class="chess-game-end-close" aria-label="Fermer">×</button><h2 id="chess-game-end-title"></h2><p class="chess-game-end-winner"></p><div class="chess-game-end-bot"><div class="chess-game-end-portrait"></div><div class="chess-game-end-message"></div></div><div class="chess-game-end-actions"><button type="button" data-end-action="bot">Jouer contre un autre bot</button><button type="button" data-end-action="revenge">Revanche</button></div><div class="chess-game-end-analysis"><span>Analyser la partie</span><button type="button" data-end-action="chess">Chess.com</button><button type="button" data-end-action="lichess">Lichess</button></div></div>';
      document.querySelector(".chess-board-panel")?.appendChild(modal);
      const close = () => modal.classList.remove("is-visible");
      modal
        .querySelector(".chess-game-end-close")
        .addEventListener("click", close);
      modal
        .querySelector('[data-end-action="bot"]')
        .addEventListener("click", () => {
          close();
          gameStarted = false;
          reset();
          const selected = profiles[$("#chess-profile").value];
          if (selected)
            showBotDialogue(
              selected.selection_dialogue || selected.dialogue || [],
            );
        });
      modal
        .querySelector('[data-end-action="revenge"]')
        .addEventListener("click", () => {
          close();
          gameStarted = true;
          reset();
          startBotDialogue();
          if (playerColor === "b") setTimeout(botMove, 240);
        });
      modal
        .querySelector('[data-end-action="chess"]')
        .addEventListener("click", () =>
          window.open("https://www.chess.com/analysis", "_blank", "noopener"),
        );
      modal
        .querySelector('[data-end-action="lichess"]')
        .addEventListener("click", () =>
          window.open("https://lichess.org/analysis", "_blank", "noopener"),
        );
    }
    const portrait = modal.querySelector(".chess-game-end-portrait"),
      message = modal.querySelector(".chess-game-end-message"),
      winner = modal.querySelector(".chess-game-end-winner");
    if (portrait && current.picture)
      portrait.style.backgroundImage = `url(${current.picture})`;
    if (message)
      message.textContent = lost
        ? "Bien joué… Cette fois, la victoire est à vous. Une revanche ?"
        : "Quelle partie ! Je prends ma revanche dès que vous voulez.";
    $("#chess-game-end-title").textContent = title;
    if (winner)
      winner.textContent = lost
        ? `${current.name || "Le bot"} a gagné`
        : "Vous avez gagné";
    modal.classList.add("is-visible");
  }
  function endGame(title) {
    gameStarted = true;
    gameEnded = true;
    document.querySelector(".chess-side-panel")?.classList.add("is-game-ended");
    status("Historique");
    const statusArea = $("#chess-status");
    if (statusArea) {
      statusArea.innerHTML =
        '<button type="button" class="button outline chess-toggle-end">Résultat</button>';
      statusArea
        .querySelector(".chess-toggle-end")
        .addEventListener("click", () => {
          const modal = $("#chess-game-end-modal");
          if (modal?.classList.contains("is-visible"))
            modal.classList.remove("is-visible");
          else {
            showGameEndModal(title);
            updateEndDialogue(title);
          }
        });
    }
    setTimeout(() => {
      showGameEndModal(title);
      updateEndDialogue(title);
    }, 500);
  }
  function gamePgn() {
    const current = profiles[$("#chess-profile").value] || {},
      now = new Date(),
      date = now.toISOString().slice(0, 10).replaceAll("-", "."),
      time = now.toISOString().slice(11, 19),
      white = playerColor === "w" ? "Vous" : current.name || "Bot",
      black = playerColor === "b" ? "Vous" : current.name || "Bot",
      checkmate =
        typeof game.in_checkmate === "function" && game.in_checkmate(),
      result = checkmate ? (game.turn() === "w" ? "0-1" : "1-0") : "*",
      winner = result === "1-0" ? white : result === "0-1" ? black : "-",
      termination = checkmate ? `${winner} won by checkmate` : titleForPgn();
    const headers = [
      `[Event "Play vs Bot"]`,
      `[Site "Local"]`,
      `[Date "${date}"]`,
      `[Round "-"]`,
      `[White "${white}"]`,
      `[Black "${black}"]`,
      `[Result "${result}"]`,
      `[CurrentPosition "${game.fen()}"]`,
      `[UTCDate "${date}"]`,
      `[UTCTime "${time}"]`,
      `[WhiteElo "${playerColor === "w" ? "" : current.rating || ""}"]`,
      `[BlackElo "${playerColor === "b" ? "" : current.rating || ""}"]`,
      `[Termination "${termination}"]`,
    ];
    const pgnMoves = moveHistory.slice(0, timelineIndex);
    return `${headers.join("\n")}\n\n${pgnMoves
      .map((move, index) =>
        index % 2 === 0 ? `${index / 2 + 1}. ${move}` : `${move}`,
      )
      .join(" ")} ${result}`;
  }
  function titleForPgn() {
    return gameEnded ? "Game ended" : "Game in progress";
  }
  function updateEndDialogue(title) {
    const current = profiles[$("#chess-profile").value] || {};
    const botWon =
      title.includes("abandonnée") ||
      (typeof game.in_checkmate === "function" &&
        game.in_checkmate() &&
        game.turn() === playerColor);
    const lines = botWon ? current.bot_win_dialogue : current.bot_loss_dialogue;
    const message = randomDialogue(lines);
    if (message) $(".chess-game-end-message").textContent = message;
  }
  function drawArrows(preview) {
    const svg = $("#chess-arrows");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.innerHTML =
      '<defs><marker id="chess-arrowhead" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4z" fill="#f4c600" /></marker></defs>';
    const list = preview ? [...arrows, [preview.from, preview.to]] : arrows;
    list.forEach(([from, to]) => {
      const a = pos(from),
        b = pos(to),
        line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      Object.entries({
        x1: a.file * 12.5 + 6.25,
        y1: a.rank * 12.5 + 6.25,
        x2: b.file * 12.5 + 6.25,
        y2: b.rank * 12.5 + 6.25,
      }).forEach(([key, value]) => line.setAttribute(key, value));
      line.setAttribute("class", "chess-arrow");
      line.setAttribute("marker-end", "url(#chess-arrowhead)");
      svg.appendChild(line);
    });
    circles.forEach((square) => {
      const point = pos(square),
        circle = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "circle",
        );
      circle.setAttribute("cx", point.file * 12.5 + 6.25);
      circle.setAttribute("cy", point.rank * 12.5 + 6.25);
      circle.setAttribute("r", "5.4");
      circle.setAttribute("class", "chess-circle");
      svg.appendChild(circle);
    });
  }
  function renderMoves() {
    const history = game.history();
    $("#chess-moves").textContent = history.length;
    $("#chess-move-count").textContent =
      `${history.length} coup${history.length === 1 ? "" : "s"}`;
    const list = $("#chess-moves-list");
    if (!history.length) {
      list.innerHTML = '<p class="chess-empty">Aucun coup pour le moment.</p>';
      return;
    }
    list.innerHTML = "";
    for (let i = 0; i < history.length; i += 2) {
      const row = document.createElement("div");
      row.className = "chess-move-row";
      row.innerHTML = `<span>${i / 2 + 1}.</span><strong>${history[i]}</strong><strong>${history[i + 1] || ""}</strong>`;
      list.appendChild(row);
    }
    list.scrollTop = list.scrollHeight;
  }
  function render() {
    board
      .querySelectorAll(".chess-square, .chess-piece")
      .forEach((element) => element.remove());
    const activeAnimation = animation;
    if (activeAnimation) {
      visualAnimation = activeAnimation;
      setTimeout(() => {
        if (visualAnimation === activeAnimation) visualAnimation = null;
      }, 420);
    }
    const legal = selected
      ? game.moves({ square: selected, verbose: true })
      : [];
    const targets = new Set(legal.map((move) => move.to));
    const timelineAnimations = [];
    game.board().forEach((row, rank) =>
      row.forEach((piece, file) => {
        const square = name(file, rank),
          cell = document.createElement("button");
        cell.type = "button";
        cell.dataset.square = square;
        cell.className = `chess-square ${(file + rank) % 2 ? "dark" : "light"}`;
        cell.style.left = `${file * 12.5}%`;
        cell.style.top = `${rank * 12.5}%`;
        cell.setAttribute("role", "gridcell");
        cell.setAttribute(
          "aria-label",
          `${square}${piece ? ` ${piece.color === "w" ? "blanc" : "noir"}` : " vide"}`,
        );
        if (square === selected) cell.classList.add("is-selected");
        if (targets.has(square))
          cell.classList.add(piece ? "is-capture" : "is-target");
        cell.addEventListener("click", () => choose(square));
        board.appendChild(cell);
        if (piece) {
          const element = document.createElement("div");
          element.dataset.square = square;
          element.className = `chess-piece ${piece.color === "w" ? "white" : "black"}`;
          element.innerHTML = pieceSvg(piece.type, piece.color);
          element.style.left = `${file * 12.5}%`;
          element.style.top = `${rank * 12.5}%`;
          if (piece.color !== playerColor)
            element.addEventListener("click", () => choose(square));
          element.addEventListener("pointerdown", (event) =>
            startDrag(event, square, piece.color),
          );
          const from =
            activeAnimation && activeAnimation.to === square
              ? pos(activeAnimation.from)
              : null;
          if (from) {
            element.classList.add("is-timeline-animating");
            element.style.left = `${from.file * 12.5}%`;
            element.style.top = `${from.rank * 12.5}%`;
            timelineAnimations.push({ element, file, rank });
          }
          board.appendChild(element);
        }
      }),
    );
    animation = null;
    drawArrows();
    renderMoves();
    $("#chess-turn").textContent = game.game_over()
      ? "—"
      : game.turn() === "w"
        ? "♙"
        : "♟";
    highlightCheck();
    if (timelineAnimations.length) {
      requestAnimationFrame(() => {
        timelineAnimations.forEach(({ element, file, rank }) => {
          element.offsetWidth;
          setTimeout(() => {
            element.style.left = `${file * 12.5}%`;
            element.style.top = `${rank * 12.5}%`;
          }, 20);
        });
      });
    }
    if (premoveFrom && gameStarted && !gameEnded && game.turn() !== playerColor)
      requestAnimationFrame(() => {
        if (
          premoveFrom &&
          gameStarted &&
          !gameEnded &&
          game.turn() !== playerColor
        )
          renderPremoveSelection(premoveFrom);
      });
  }
  function move(from, to, animate = true, promotion = "q") {
    beginMove();
    const played = game.move({ from, to, promotion });
    if (!played) return false;
    finishMove(played);
    selected = null;
    animation = animate ? { from, to } : null;
    arrows = [];
    circles = [];
    render();
    if (game.game_over())
      endGame(game.is_checkmate() ? "Échec et mat" : "Partie terminée");
    else if (game.turn() !== playerColor) {
      status("Le profil réfléchit…", "Il cherche un coup à son image");
      botTimer = setTimeout(botMove, 240);
    } else status("À vous de jouer", `${played.from} → ${played.to}`);
    return true;
  }
  function clearSelection() {
    selected = null;
    board
      .querySelectorAll(
        ".chess-square.is-selected, .chess-square.is-target, .chess-square.is-capture",
      )
      .forEach((cell) =>
        cell.classList.remove("is-selected", "is-target", "is-capture"),
      );
  }
  function snapshot() {
    return {
      fen: game.fen(),
      arrows: arrows.map((arrow) => [...arrow]),
      circles: [...circles],
      lastMove: null,
    };
  }
  function beginMove() {
    if (!timeline.length) timeline = [snapshot()];
    else {
      const current = snapshot();
      current.lastMove = timeline[timelineIndex].lastMove || null;
      if (pendingAnnotations) {
        current.arrows = pendingAnnotations.arrows;
        current.circles = pendingAnnotations.circles;
      }
      timeline[timelineIndex] = current;
    }
    pendingAnnotations = null;
    timeline = timeline.slice(0, timelineIndex + 1);
  }
  function finishMove(movePlayed) {
    const actualMove = movePlayed || game.history({ verbose: true }).pop();
    timeline.push({
      fen: game.fen(),
      arrows: [],
      circles: [],
      lastMove: actualMove
        ? { from: actualMove.from, to: actualMove.to }
        : null,
    });
    timelineIndex += 1;
  }
  function syncAnnotations() {
    if (timeline[timelineIndex]) {
      timeline[timelineIndex].arrows = arrows.map((arrow) => [...arrow]);
      timeline[timelineIndex].circles = [...circles];
    }
  }
  function restoreTimeline(index, animate = true) {
    if (index < 0 || index >= timeline.length || index === timelineIndex)
      return;
    clearTimeout(botTimer);
    const previousIndex = timelineIndex;
    const state = timeline[index];
    const transition =
      index > previousIndex ? state.lastMove : timeline[previousIndex].lastMove;
    timelineIndex = index;
    game = new Chess(state.fen);
    selected = null;
    arrows = state.arrows.map((arrow) => [...arrow]);
    circles = [...state.circles];
    animation =
      animate && transition
        ? {
            from: index > previousIndex ? transition.from : transition.to,
            to: index > previousIndex ? transition.to : transition.from,
          }
        : null;
    render();
    status(
      index === timeline.length - 1 ? "À vous de jouer" : "Historique",
      index
        ? `${index} demi-coup${index === 1 ? "" : "s"} joué${index === 1 ? "" : "s"}`
        : "Position initiale",
    );
  }
  const isPromotionSquare = (square) =>
    square && (square[1] === "1" || square[1] === "8");
  function needsPromotion(from, to) {
    const piece = game.get(from);
    return Boolean(
      piece &&
        piece.type === "p" &&
        piece.color === playerColor &&
        isPromotionSquare(to),
    );
  }
  function showPromotionChooser(from, to, animate = true) {
    board.querySelector(".chess-promotion-chooser")?.remove();
    const target = pos(to),
      chooser = document.createElement("div");
    chooser.className = `chess-promotion-chooser ${playerColor === "w" ? "is-white" : "is-black"}`;
    chooser.dataset.from = from;
    chooser.dataset.to = to;
    chooser.style.left = `${target.file * 12.5}%`;
    chooser.style.top = `${to[1] === "8" ? 0 : 37.5}%`;
    chooser.innerHTML =
      ["q", "n", "r", "b"]
        .map(
          (type) =>
            `<button type="button" data-promotion="${type}" aria-label="Promouvoir en ${type === "q" ? "dame" : type === "n" ? "cavalier" : type === "r" ? "tour" : "fou"}">${pieceSvg(type, playerColor)}</button>`,
        )
        .join("") +
      '<button type="button" class="chess-promotion-cancel" aria-label="Annuler">×</button>';
    board.appendChild(chooser);
    chooser.querySelectorAll("[data-promotion]").forEach((button) =>
      button.addEventListener("click", () => {
        const promotion = button.dataset.promotion;
        chooser.remove();
        selected = null;
        move(from, to, animate, promotion);
      }),
    );
    chooser
      .querySelector(".chess-promotion-cancel")
      .addEventListener("click", () => {
        chooser.remove();
        selected = from;
        showSelection(from);
      });
  }
  function choose(square) {
    if (
      !gameStarted ||
      gameEnded ||
      game.game_over() ||
      game.turn() !== playerColor
    )
      return;
    const piece = game.get(square);
    if (piece && piece.color === playerColor) {
      if (selected === square) {
        clearSelection();
        return;
      }
      selected = square;
      showSelection(square);
      return;
    }
    if (selected) {
      if (needsPromotion(selected, square)) {
        showPromotionChooser(selected, square);
        return;
      }
      if (!move(selected, square)) clearSelection();
    }
  }
  function startDrag(event, square, color) {
    if (
      !gameStarted ||
      gameEnded ||
      event.button !== 0 ||
      color !== playerColor ||
      game.turn() !== playerColor ||
      game.game_over()
    )
      return;
    event.preventDefault();
    const wasSelected = selected === square;
    selected = square;
    showSelection(square);
    const element = board.querySelector(
      `.chess-piece[data-square="${square}"]`,
    );
    if (!element) return;
    drag = { origin: square, element, moved: false, wasSelected };
    drag.element.classList.add("is-dragging");
    drag.element.setPointerCapture(event.pointerId);
  }
  board.addEventListener("pointermove", (event) => {
    if (drag) {
      drag.moved = true;
      const rect = board.getBoundingClientRect();
      const x =
        playerColor === "b"
          ? rect.right - event.clientX
          : event.clientX - rect.left;
      const y =
        playerColor === "b"
          ? rect.bottom - event.clientY
          : event.clientY - rect.top;
      drag.element.style.left = `${x - drag.element.offsetWidth / 2}px`;
      drag.element.style.top = `${y - drag.element.offsetHeight / 2}px`;
    }
    if (rightDrag) {
      const target = squareAt(event);
      if (target) drawArrows({ from: rightDrag.from, to: target });
    }
  });
  board.addEventListener("pointerup", (event) => {
    if (drag) {
      const current = drag;
      drag = null;
      current.element.classList.remove("is-dragging");
      if (current.moved) {
        const target = squareAt(event);
        if (target === current.origin) {
          const origin = pos(current.origin);
          current.element.style.left = `${origin.file * 12.5}%`;
          current.element.style.top = `${origin.rank * 12.5}%`;
          selected = current.origin;
          showSelection(current.origin);
        } else if (target && needsPromotion(current.origin, target)) {
          const origin = pos(current.origin);
          current.element.style.left = `${origin.file * 12.5}%`;
          current.element.style.top = `${origin.rank * 12.5}%`;
          selected = current.origin;
          showSelection(current.origin);
          showPromotionChooser(current.origin, target, false);
        } else if (target && !move(current.origin, target, false)) render();
        else if (!target) render();
      } else if (current.wasSelected) clearSelection();
      else {
        selected = current.origin;
        showSelection(current.origin);
      }
    }
    if (rightDrag) {
      const target = squareAt(event);
      if (target) {
        if (target === rightDrag.from) {
          const existingCircle = circles.indexOf(target);
          if (existingCircle >= 0) circles.splice(existingCircle, 1);
          else circles.push(target);
        } else {
          const existingArrow = arrows.findIndex(
            ([from, to]) => from === rightDrag.from && to === target,
          );
          if (existingArrow >= 0) arrows.splice(existingArrow, 1);
          else arrows.push([rightDrag.from, target]);
        }
      }
      rightDrag = null;
      syncAnnotations();
      drawArrows();
    }
  });
  board.addEventListener("pointerdown", (event) => {
    if (event.button === 0) {
      pendingAnnotations = {
        arrows: arrows.map((arrow) => [...arrow]),
        circles: [...circles],
      };
      arrows = [];
      circles = [];
      syncAnnotations();
      drawArrows();
    }
    if (event.button === 2) {
      event.preventDefault();
      const square = squareAt(event);
      if (square) rightDrag = { from: square };
    }
  });
  board.addEventListener("contextmenu", (event) => event.preventDefault());
  async function botMove() {
    if (gameEnded || game.game_over() || game.turn() !== "b") return;
    const profile = styleProfile || {};
    let candidates = [];
    try {
      candidates = engine ? await engine.analyse(game.fen()) : [];
    } catch (error) {
      candidates = [];
    }
    const legalMoves = game.moves({ verbose: true });
    if (!candidates.length) {
      const fallback =
        legalMoves[Math.floor(Math.random() * legalMoves.length)];
      if (!fallback) return;
      beginMove();
      game.move(fallback);
      finishMove();
      animation = { from: fallback.from, to: fallback.to };
      render();
      if (game.game_over())
        endGame(isCheckmate() ? "Échec et mat" : "Partie terminée");
      else status("À vous de jouer", `${fallback.from} → ${fallback.to}`);
      return;
    }
    const rates = profile.rates_per_own_move || {};
    const styleWeight = profile.bot_usage?.style_weight ?? 0.2;
    const randomness = profile.bot_usage?.randomness ?? 0.65;
    const bestScore = candidates[0].score;
    const scored = candidates
      .map((candidate) => {
        const move = {
          from: candidate.move.slice(0, 2),
          to: candidate.move.slice(2, 4),
          promotion: candidate.move[4] || "",
        };
        const legal = legalMoves.find(
          (item) => item.from === move.from && item.to === move.to,
        );
        if (!legal) return null;
        let style = 0;
        let givesCheck = false;
        if (legal.captured) style += 1.5 + (rates.captures || 0);
        if (legal.flags && legal.flags.includes("k"))
          style += 0.5 + (rates.castles || 0);
        if (legal.promotion) style += 0.25 + (rates.promotions || 0);
        try {
          game.move(legal);
          givesCheck = game.in_check();
          game.undo();
        } catch (error) {}
        if (givesCheck) style += 1.2 + (rates.checks || 0);
        const styleBonus =
          candidate.score >= bestScore - 120 ? style * 10 * styleWeight : 0;
        return {
          move,
          mate: candidate.mate,
          score:
            candidate.score +
            styleBonus +
            (Math.random() * 2 - 1) * randomness * 100,
        };
      })
      .filter(Boolean);
    const ranked = scored.sort((a, b) => b.score - a.score);
    const rating = Number(profiles[$("#chess-profile").value]?.rating) || 1000;
    const weakness = Math.max(0, Math.min(1, (1400 - rating) / 500));
    const poolSize = Math.min(
      ranked.length,
      rating < 1100 ? 5 : rating < 1300 ? 3 : 2,
    );
    const positionKey = game.fen().split(" ").slice(0, 2).join(" ");
    const learnedMoves = Array.isArray(model?.positions?.[positionKey])
      ? model.positions[positionKey]
      : [];
    const learnedCandidates = ranked
      .map((candidate) => {
        const learned = learnedMoves.find(
          ([move]) =>
            move ===
            candidate.move.from + candidate.move.to + candidate.move.promotion,
        );
        return { candidate, frequency: learned?.[1] || 0 };
      })
      .filter(({ frequency }) => frequency > 0);
    const learnedTotal = learnedCandidates.reduce(
      (total, item) => total + item.frequency,
      0,
    );
    let learnedChoice = null;
    if (learnedTotal) {
      let roll = Math.random() * learnedTotal;
      learnedChoice =
        learnedCandidates.find(({ frequency }) => (roll -= frequency) < 0)
          ?.candidate || learnedCandidates[0].candidate;
    }
    const trainedMoveWeight = profile.bot_usage?.training_move_weight ?? 0.75;
    const chosen =
      learnedChoice && Math.random() < trainedMoveWeight
        ? learnedChoice.move
        : ranked[Math.floor(Math.pow(Math.random(), 1 + weakness) * poolSize)]
            ?.move ||
          ranked[0]?.move ||
          legalMoves[0];
    if (!chosen) return;
    beginMove();
    game.move(chosen);
    finishMove();
    animation = { from: chosen.from, to: chosen.to };
    render();
    if (game.game_over())
      endGame(isCheckmate() ? "Échec et mat" : "Partie terminée");
    else status("À vous de jouer", `${chosen.from} → ${chosen.to}`);
  }
  async function loadProfile(value) {
    const profile = profiles[value];
    $("#chess-bot-name").textContent = profile.name;
    $("#chess-profile-copy").textContent = profile.copy;
    try {
      const responses = await Promise.all([
        fetch(profile.file),
        fetch(profile.profile),
      ]);
      model = await responses[0].json();
      styleProfile = await responses[1].json();
    } catch (error) {
      model = null;
      styleProfile = null;
    }
    reset();
    if (window.location.protocol === "file:") {
      status(
        "Serveur local requis",
        "Lancez « python3 -m http.server 8000 --directory site » puis ouvrez http://127.0.0.1:8000.",
      );
      return;
    }
    if (!engine) {
      try {
        engine = new StockfishEngine();
      } catch (error) {
        engine = null;
      }
    }
  }
  function reset() {
    clearTimeout(botTimer);
    if (engine?.worker) engine.worker.postMessage("stop");
    botThinking = false;
    gameEnded = false;
    document
      .querySelector(".chess-side-panel")
      ?.classList.remove("is-game-ended");
    document
      .querySelector("#chess-game-end-modal")
      ?.classList.remove("is-visible");
    game = new Chess();
    selected = null;
    arrows = [];
    circles = [];
    pendingAnnotations = null;
    lastDialogue = "";
    nextDialoguePly = (Math.floor(Math.random() * 5) + 3) * 2;
    timeline = [snapshot()];
    timelineIndex = 0;
    animation = null;
    $("#chess-position-title").textContent =
      `Défi · ${profiles[$("#chess-profile").value].name}`;
    status("À vous de jouer", "Les blancs commencent");
    render();
  }
  function addNavigation() {
    const resetButton = $("#chess-reset"),
      navigation = document.createElement("div");
    navigation.className = "chess-navigation";
    navigation.innerHTML =
      '<button class="button outline chess-nav-button" id="chess-first" type="button" aria-label="Revenir au début">|‹</button><button class="button outline chess-nav-button" id="chess-previous" type="button" aria-label="Coup précédent">←</button><button class="button outline chess-nav-button" id="chess-next" type="button" aria-label="Coup suivant">→</button><button class="button outline chess-nav-button" id="chess-last" type="button" aria-label="Aller à la fin">›|</button>';
    resetButton.parentNode.insertBefore(navigation, resetButton);
    resetButton.insertAdjacentHTML(
      "beforebegin",
      '<button class="button outline chess-give-up" id="chess-give-up" type="button">Abandonner</button>',
    );
    $("#chess-give-up").addEventListener("click", () => {
      if (!gameStarted || game.game_over()) return;
      clearTimeout(botTimer);
      if (engine?.worker) engine.worker.postMessage("stop");
      botThinking = false;
      gameStarted = false;
      endGame("Partie abandonnée");
    });
    $("#chess-first").addEventListener("click", () =>
      restoreTimeline(0, false),
    );
    $("#chess-previous").addEventListener("click", () =>
      restoreTimeline(timelineIndex - 1),
    );
    $("#chess-next").addEventListener("click", () =>
      restoreTimeline(timelineIndex + 1),
    );
    $("#chess-last").addEventListener("click", () =>
      restoreTimeline(timeline.length - 1, false),
    );
    document.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") restoreTimeline(timelineIndex - 1);
      if (event.key === "ArrowRight") restoreTimeline(timelineIndex + 1);
    });
  }
  const originalRenderBoardPlayers = renderBoardPlayers;
  renderBoardPlayers = function () {
    originalRenderBoardPlayers();
    board.classList.toggle("is-flipped", playerColor === "b");
    const shell = board.closest(".chess-board-shell");
    if (shell) {
      shell.classList.toggle("is-flipped", playerColor === "b");
      const labels = shell.nextElementSibling?.querySelectorAll("span");
      if (labels)
        labels.forEach((label, index) => {
          label.textContent = (playerColor === "b" ? "hgfedcba" : "abcdefgh")[
            index
          ];
        });
    }
  };
  const originalSquareAt = squareAt;
  squareAt = (event) => {
    const square = originalSquareAt(event);
    if (!square || playerColor !== "b") return square;
    return files[7 - files.indexOf(square[0])] + (9 - Number(square[1]));
  };
  const premoves = [];
  let premoveFrom = null,
    premoveDrag = null;
  const premoveObserver = new MutationObserver(() => {
    if (premoveDrag?.from) {
      const source = board.querySelector(
        `.chess-piece[data-square="${premoveDrag.from}"]`,
      );
      if (source) {
        source.style.visibility = "hidden";
        premoveDrag.source = source;
      }
      renderPremoveSelection(premoveDrag.from);
    }
    premoves.forEach((queued) =>
      board
        .querySelector(`.chess-square[data-square="${queued.to}"]`)
        ?.classList.add("is-premove"),
    );
    const lastMove = timeline[timelineIndex]?.lastMove;
    if (lastMove)
      [lastMove.from, lastMove.to].forEach((square) =>
        board
          .querySelector(`.chess-square[data-square="${square}"]`)
          ?.classList.add("is-last-move"),
      );
  });
  premoveObserver.observe(board, { childList: true });
  const premoveFen = () => {
    const fen = game.fen().split(" ");
    if (fen[1] !== playerColor) {
      fen[1] = playerColor;
      fen[3] = "-";
    }
    return fen.join(" ");
  };
  const premoveTargets = (square, position) => {
    const piece = position.get(square);
    if (!piece) return [];
    const file = files.indexOf(square[0]),
      rank = Number(square[1]),
      targets = [];
    const add = (file, rank) => {
      if (file >= 0 && file < 8 && rank >= 1 && rank <= 8)
        targets.push(files[file] + rank);
    };
    if (piece.type === "n" || piece.type === "k") {
      const offsets =
        piece.type === "n"
          ? [
              [1, 2],
              [2, 1],
              [2, -1],
              [1, -2],
              [-1, -2],
              [-2, -1],
              [-2, 1],
              [-1, 2],
            ]
          : [
              [1, 1],
              [1, 0],
              [1, -1],
              [0, 1],
              [0, -1],
              [-1, 1],
              [-1, 0],
              [-1, -1],
            ];
      offsets.forEach(([df, dr]) =>
        add(file + df, rank + (piece.color === "w" ? dr : -dr)),
      );
    } else if (piece.type === "p") {
      const direction = piece.color === "w" ? 1 : -1;
      add(file, rank + direction);
      if (rank === (piece.color === "w" ? 2 : 7))
        add(file, rank + direction * 2);
      add(file - 1, rank + direction);
      add(file + 1, rank + direction);
    } else {
      const directions =
        piece.type === "b"
          ? [
              [1, 1],
              [1, -1],
              [-1, 1],
              [-1, -1],
            ]
          : piece.type === "r"
            ? [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
              ]
            : [
                [1, 1],
                [1, -1],
                [-1, 1],
                [-1, -1],
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
              ];
      directions.forEach(([df, dr]) => {
        for (let step = 1; step < 8; step += 1)
          add(file + df * step, rank + dr * step);
      });
    }
    return targets;
  };
  const projectPremove = (position, queued) => {
    const piece = position.get(queued.from);
    if (!piece) return null;
    position.remove(queued.to);
    position.remove(queued.from);
    position.put(
      {
        color: piece.color,
        type:
          piece.type === "p" && (queued.to[1] === "1" || queued.to[1] === "8")
            ? "q"
            : piece.type,
      },
      queued.to,
    );
    const fen = position.fen().split(" ");
    fen[1] = playerColor;
    fen[3] = "-";
    return new Chess(fen.join(" "));
  };
  const renderPremoveSelection = (square) => {
    const preview = premovePosition();
    board
      .querySelectorAll(
        ".chess-square.is-selected, .chess-square.is-target, .chess-square.is-capture",
      )
      .forEach((cell) =>
        cell.classList.remove("is-selected", "is-target", "is-capture"),
      );
    board
      .querySelector(`.chess-square[data-square="${square}"]`)
      ?.classList.add("is-selected");
    premoveTargets(square, preview).forEach((target) =>
      board
        .querySelector(`.chess-square[data-square="${target}"]`)
        ?.classList.add(preview.get(target) ? "is-capture" : "is-target"),
    );
    premoveFrom = square;
  };
  const premoveSquare = (event) => {
    const piece = event.target.closest?.(".chess-piece"),
      square =
        piece?.dataset.square ||
        event.target.closest?.(".chess-square")?.dataset.square ||
        squareAt(event);
    let projected = square;
    if (piece)
      premoves.forEach((queued) => {
        if (queued.from === projected) projected = queued.to;
      });
    if (!visualAnimation) return projected;
    if (piece && visualAnimation.to === projected) return visualAnimation.from;
    if (!piece && visualAnimation.from === projected && !game.get(projected))
      return visualAnimation.to;
    return projected;
  };
  const premovePiece = (square, visualPiece) =>
    game.get(square) ||
    (visualPiece && game.get(visualPiece.dataset.square)) ||
    (() => {
      const queued = [...premoves].reverse().find((item) => item.to === square);
      return queued ? game.get(premoves[0]?.from) : null;
    })();
  const premovePosition = () => {
    let position = new Chess(premoveFen());
    premoves.forEach((queued) => {
      position = projectPremove(position, queued) || position;
    });
    return position;
  };
  const markPremoves = (preserveTargets = false) => {
    board
      .querySelectorAll(
        preserveTargets
          ? ".chess-piece.is-premove"
          : ".chess-square.is-premove, .chess-piece.is-premove",
      )
      .forEach((node) => {
        node.classList.remove("is-premove");
        node.style.left = node.dataset.originalLeft || node.style.left;
        node.style.top = node.dataset.originalTop || node.style.top;
      });
    let position;
    try {
      position = new Chess(premoveFen());
    } catch (error) {
      premoves.length = 0;
      return;
    }
    const valid = [];
    for (const queued of premoves) {
      const legal = premoveTargets(queued.from, position).includes(queued.to);
      if (!legal) break;
      valid.push(queued);
      position = projectPremove(position, queued);
      if (!position) break;
    }
    premoves.splice(0, premoves.length, ...valid);
    valid.forEach((queued) => {
      const target = board.querySelector(
          `.chess-square[data-square="${queued.to}"]`,
        ),
        piece = board.querySelector(
          `.chess-piece[data-square="${queued.from}"]`,
        );
      target?.classList.add("is-premove");
      if (piece) {
        if (!piece.dataset.originalLeft) {
          piece.dataset.originalLeft = piece.style.left;
          piece.dataset.originalTop = piece.style.top;
        }
        const destination = pos(queued.to);
        piece.style.transition = "none";
        piece.style.left = `${destination.file * 12.5}%`;
        piece.style.top = `${destination.rank * 12.5}%`;
      }
    });
  };
  const queuePremove = (from, to) => {
    const position = premovePosition(),
      legal = premoveTargets(from, position).includes(to);
    if (!legal) {
      premoveFrom = from;
      renderPremoveSelection(from);
      return false;
    }
    premoves.push({ from, to, promotion: "q" });
    premoveFrom = null;
    return true;
  };
  const showSelection = (square) => {
    board
      .querySelectorAll(
        ".chess-square.is-selected, .chess-square.is-target, .chess-square.is-capture",
      )
      .forEach((cell) =>
        cell.classList.remove("is-selected", "is-target", "is-capture"),
      );
    board
      .querySelector(`.chess-square[data-square="${square}"]`)
      ?.classList.add("is-selected");
    game
      .moves({ square, verbose: true })
      .forEach((candidate) =>
        board
          .querySelector(`.chess-square[data-square="${candidate.to}"]`)
          ?.classList.add(candidate.captured ? "is-capture" : "is-target"),
      );
  };
  const normalChoose = choose;
  choose = (square) => {
    if (gameStarted && !gameEnded && game.turn() !== playerColor) {
      const piece = game.get(square);
      if (!premoveFrom && piece?.color === playerColor) {
        premoveFrom = square;
        renderPremoveSelection(square);
      } else if (premoveFrom) {
        queuePremove(premoveFrom, square);
        selected = null;
        render();
      }
      return;
    }
    normalChoose(square);
  };
  const normalStartDrag = startDrag;
  startDrag = (event, square, color) => {
    if (
      gameStarted &&
      !gameEnded &&
      game.turn() !== playerColor &&
      event.button === 0 &&
      color === playerColor
    ) {
      event.preventDefault();
      premoveFrom = square;
      premoveDrag = { pointerId: event.pointerId, from: square };
      return;
    }
    normalStartDrag(event, square, color);
  };
  const playPremove = () => {
    if (
      !gameStarted ||
      gameEnded ||
      game.turn() !== playerColor ||
      !premoves.length
    )
      return;
    const queued = premoves[0],
      legal = game
        .moves({ square: queued.from, verbose: true })
        .find((candidate) => candidate.to === queued.to);
    if (!legal) {
      premoves.length = 0;
      premoveFrom = null;
      markPremoves();
      return;
    }
    premoves.shift();
    premoveFrom = null;
    move(queued.from, queued.to, false);
    markPremoves(true);
  };
  board.addEventListener(
    "click",
    (event) => {
      if (!gameStarted || gameEnded || game.turn() === playerColor) return;
      const square = premoveSquare(event);
      if (!square) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const visualPiece = event.target.closest?.(".chess-piece"),
        piece = premovePiece(square, visualPiece);
      if (piece?.color === playerColor) {
        premoveFrom = square;
        renderPremoveSelection(square);
        requestAnimationFrame(() => {
          if (
            premoveFrom === square &&
            gameStarted &&
            !gameEnded &&
            game.turn() !== playerColor
          )
            renderPremoveSelection(square);
        });
      } else if (premoveFrom) {
        queuePremove(premoveFrom, square);
        selected = null;
        render();
        markPremoves(true);
      }
    },
    true,
  );
  board.addEventListener(
    "pointerdown",
    (event) => {
      if (
        !gameStarted ||
        gameEnded ||
        game.turn() === playerColor ||
        event.button !== 0
      )
        return;
      const square = premoveSquare(event),
        visualPiece = event.target.closest?.(".chess-piece"),
        piece = square && premovePiece(square, visualPiece);
      if (piece?.color !== playerColor) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      premoveFrom = square;
      renderPremoveSelection(square);
      const source =
        board.querySelector(
          `.chess-piece[data-square="${visualPiece?.dataset.square || premoves[0]?.from || square}"]`,
        ) || visualPiece;
      let element = source;
      if (source) {
        element = source.cloneNode(true);
        element.classList.add("chess-drag-ghost");
        element.classList.add("is-dragging");
        element.style.position = "fixed";
        element.style.left = `${event.clientX - source.getBoundingClientRect().width / 2}px`;
        element.style.top = `${event.clientY - source.getBoundingClientRect().height / 2}px`;
        element.style.width = `${source.getBoundingClientRect().width}px`;
        element.style.height = `${source.getBoundingClientRect().height}px`;
        document.body.appendChild(element);
        source.style.visibility = "hidden";
      }
      premoveDrag = {
        pointerId: event.pointerId,
        from: square,
        element,
        source,
      };
      board.setPointerCapture(event.pointerId);
    },
    true,
  );
  board.addEventListener(
    "pointermove",
    (event) => {
      if (
        !premoveDrag ||
        event.pointerId !== premoveDrag.pointerId ||
        !premoveDrag.element
      )
        return;
      event.preventDefault();
      premoveDrag.element.style.left = `${event.clientX - premoveDrag.element.offsetWidth / 2}px`;
      premoveDrag.element.style.top = `${event.clientY - premoveDrag.element.offsetHeight / 2}px`;
      if (game.turn() === playerColor) showSelection(premoveDrag.from);
      else renderPremoveSelection(premoveDrag.from);
    },
    true,
  );
  const finishPremoveDrag = (event) => {
    if (!premoveDrag || event.pointerId !== premoveDrag.pointerId) return;
    const current = premoveDrag;
    premoveDrag = null;
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = squareAt(event),
      targetPiece = target ? premovePosition().get(target) : null;
    current.element?.remove();
    if (current.source?.isConnected) current.source.style.visibility = "";
    if (game.turn() === playerColor) {
      premoveFrom = null;
      if (
        target &&
        target !== current.from &&
        !move(current.from, target, false)
      ) {
        selected = current.from;
        showSelection(current.from);
      } else if (!target || target === current.from) {
        selected = current.from;
        showSelection(current.from);
      }
    } else if (
      target &&
      target !== current.from &&
      (!targetPiece || targetPiece.color !== playerColor)
    ) {
      queuePremove(current.from, target);
      markPremoves();
    }
    if (board.hasPointerCapture?.(event.pointerId))
      board.releasePointerCapture(event.pointerId);
  };
  board.addEventListener("pointerup", finishPremoveDrag, true);
  window.addEventListener(
    "pointerup",
    (event) => {
      if (premoveDrag?.pointerId === event.pointerId)
        suppressNextBoardClick = true;
    },
    true,
  );
  window.addEventListener(
    "click",
    (event) => {
      if (!suppressNextBoardClick) return;
      suppressNextBoardClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
  board.addEventListener("pointercancel", finishPremoveDrag, true);
  setInterval(() => {
    if (!gameStarted) {
      premoves.length = 0;
      premoveFrom = null;
      return;
    }
    playPremove();
  }, 50);
  buildBotPanel();
  const portraitLabel = document.createElement("div");
  portraitLabel.className = "chess-bot-portrait-label";
  $(".chess-bot-portrait").after(portraitLabel);
  $(".chess-bot-portrait").setAttribute("data-rating", "1500");
  buildBotSelection();
  buildBotSelectionDescription();
  buildColorSelection();
  document.querySelectorAll(".chess-color-mode").forEach((button) =>
    button.addEventListener("click", () => {
      selectedColorMode = button.dataset.color;
      playerColor = selectedColorMode === "random" ? "w" : selectedColorMode;
      const coordinateLabels = document.querySelectorAll(".chess-files span");
      coordinateLabels.forEach((label, index) => {
        label.textContent = (playerColor === "b" ? "hgfedcba" : "abcdefgh")[
          index
        ];
      });
      renderBoardPlayers();
      render();
    }),
  );
  $("#chess-start").addEventListener("click", () => {
    if (selectedColorMode === "random") {
      playerColor = Math.random() < 0.5 ? "w" : "b";
      renderBoardPlayers();
      render();
      if (playerColor === "b") setTimeout(botMove, 240);
    }
  });
  $("#chess-start").addEventListener("click", startBotDialogue);
  $("#chess-profile").addEventListener("change", () => {
    const current = profiles[$("#chess-profile").value],
      label = $(".chess-bot-portrait-label");
    if (current && label)
      label.innerHTML = `<strong>${current.name}</strong> - ${current.rating}`;
  });
  $("#chess-reset").addEventListener("click", () => {
    const current = profiles[$("#chess-profile").value];
    if (current)
      showBotDialogue(
        Array.isArray(current.selection_dialogue)
          ? current.selection_dialogue
          : current.dialogue || [],
      );
  });
  buildBoardPlayers();
  const originalFinishMove = finishMove;
  finishMove = function (movePlayed) {
    if (!gameStarted) {
      game = new Chess();
      return;
    }
    originalFinishMove(movePlayed);
    const notation = game.history().pop();
    moveHistory = moveHistory.slice(0, Math.max(0, timelineIndex - 1));
    if (notation) moveHistory.push(notation);
  };
  const originalReset = reset;
  reset = function () {
    moveHistory = [];
    originalReset();
  };
  renderMoves = function () {
    const history = moveHistory;
    $("#chess-moves").textContent = history.length;
    $("#chess-move-count").textContent =
      `${timelineIndex} / ${history.length} coups`;
    const list = $("#chess-moves-list");
    if (!history.length) {
      list.innerHTML = '<p class="chess-empty">Aucun coup pour le moment.</p>';
      return;
    }
    list.innerHTML = "";
    for (let i = 0; i < history.length; i += 2) {
      const row = document.createElement("div");
      row.className = "chess-move-row";
      if (i < timelineIndex) row.classList.add("is-played");
      row.innerHTML = `<span>${i / 2 + 1}.</span><strong>${history[i]}</strong><strong>${history[i + 1] || ""}</strong>`;
      list.appendChild(row);
    }
    list.scrollTop = list.scrollHeight;
  };
  renderMoves = function () {
    const history = moveHistory;
    $("#chess-moves").textContent = history.length;
    const currentPly = Math.min(timelineIndex, history.length);
    $("#chess-move-count").textContent =
      `${currentPly} / ${history.length} coups`;
    const list = $("#chess-moves-list");
    if (!history.length) {
      list.innerHTML = '<p class="chess-empty">Aucun coup pour le moment.</p>';
      return;
    }
    list.innerHTML = "";
    for (let i = 0; i < history.length; i += 2) {
      const row = document.createElement("div");
      row.className = "chess-move-row";
      const number = document.createElement("span");
      number.textContent = `${i / 2 + 1}.`;
      row.appendChild(number);
      [i, i + 1].forEach((ply) => {
        if (!history[ply]) {
          row.appendChild(document.createElement("span"));
          return;
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chess-move-button";
        button.dataset.ply = String(ply + 1);
        button.textContent = history[ply];
        if (currentPly === ply + 1) button.classList.add("is-current");
        row.appendChild(button);
      });
      list.appendChild(row);
    }
    list
      .querySelectorAll(".chess-move-button")
      .forEach((button) =>
        button.addEventListener("click", () =>
          restoreTimeline(Number(button.dataset.ply)),
        ),
      );
    list.scrollTop = list.scrollHeight;
  };
  const originalBotMove = botMove;
  const endGameWithDraws = endGame,
    originalShowGameEndModal = showGameEndModal,
    originalUpdateEndDialogue = updateEndDialogue;
  endGame = function (title) {
    endGameWithDraws(title === "Partie terminée" ? "Égalité" : title);
  };
  showGameEndModal = function (title) {
    originalShowGameEndModal(title);
    if (title === "Égalité") {
      const winner = document.querySelector(".chess-game-end-winner");
      if (winner) winner.textContent = "Égalité";
    }
  };
  updateEndDialogue = function (title) {
    if (title !== "Égalité") return originalUpdateEndDialogue(title);
    const current = profiles[$("#chess-profile").value] || {},
      lines = current.draw_dialogue;
    const message = randomDialogue(lines);
    if (message) $(".chess-game-end-message").textContent = message;
  };
  botMove = async function () {
    botThinking = true;
    const originalTurn = game.turn.bind(game);
    let firstTurnCheck = true;
    if (playerColor === "b")
      game.turn = () =>
        firstTurnCheck ? ((firstTurnCheck = false), "b") : originalTurn();
    try {
      await originalBotMove();
    } finally {
      game.turn = originalTurn;
      botThinking = false;
      if (premoves?.length) queueMicrotask(playPremove);
      else premoveFrom = null;
    }
  };
  const soundMove = move;
  move = function (from, to, animate = true) { const before = game.history().length; const result = soundMove(from, to, animate); if (result && game.history().length > before) { const played = game.history({ verbose: true }).at(-1); if (game.game_over() && isCheckmate()) playSound("checkmate"); else playSound(played?.flags?.includes("k") || played?.flags?.includes("q") ? "castle" : played?.flags?.includes("c") || played?.flags?.includes("e") ? "capture" : "move"); } return result; };
  const soundBotMove = botMove;
  botMove = async function () { const before = game.history().length; await soundBotMove(); if (game.history().length > before) { const played = game.history({ verbose: true }).at(-1); if (game.game_over() && isCheckmate()) playSound("checkmate"); else playSound(played?.flags?.includes("k") || played?.flags?.includes("q") ? "castle" : played?.flags?.includes("c") || played?.flags?.includes("e") ? "capture" : "move"); } };
  document.addEventListener(
    "click",
    (event) => {
      if (
        botThinking &&
        event.target.closest(
          "#chess-first, #chess-previous, #chess-next, #chess-last, .chess-move-button",
        )
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  document.addEventListener(
    "click",
    (event) => {
      const action = event.target.closest?.("[data-end-action]");
      if (!action || !["chess", "lichess"].includes(action.dataset.endAction))
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const encoded = encodeURIComponent(gamePgn());
      const url =
        action.dataset.endAction === "chess"
          ? `https://www.chess.com/analysis?tab=analysis&pgn=${encoded}`
          : `https://lichess.org/analysis/pgn/${encoded}`;
      const opened = window.open(url, "_blank");
      if (!opened) window.location.assign(url);
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        botThinking &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  const boardPanel = document.querySelector(".chess-board-panel"),
    sidePanelHeight = document.querySelector(".chess-side-panel");
  const syncSidePanelHeight = () => {
    if (boardPanel && sidePanelHeight)
      sidePanelHeight.style.height = `${boardPanel.getBoundingClientRect().height}px`;
  };
  requestAnimationFrame(syncSidePanelHeight);
  window.addEventListener("resize", syncSidePanelHeight);
  $("#chess-reset").addEventListener("click", () => {
    gameStarted = false;
    reset();
  });
  $("#chess-profile").addEventListener("change", (event) =>
    loadProfile(event.target.value),
  );
  addNavigation();
  const navigation = document.querySelector(".chess-navigation"),
    sidePanel = document.querySelector(".chess-side-panel"),
    boardFooter = document.querySelector(".chess-board-footer");
  if (boardFooter && navigation)
    boardFooter.insertBefore(navigation, $("#chess-reset"));
  if (boardFooter && sidePanel) sidePanel.appendChild(boardFooter);
  fetch("../assets/echecs/config.json")
    .then((response) => response.json())
    .then((config) => {
      config.profiles.forEach((profile) => {
        profile.selection_dialogue = Array.isArray(profile.selection_dialogue)
          ? profile.selection_dialogue
          : [profile.selection_dialogue].filter(Boolean);
        profile.game_dialogue = Array.isArray(profile.game_dialogue)
          ? profile.game_dialogue
          : [profile.game_dialogue].filter(Boolean);
        profile.dialogue = profile.selection_dialogue;
      });
      applyProfileConfig(config);
      $("#chess-bot-message").textContent = randomDialogue(
        profiles[config.profiles[0].id].selection_dialogue,
      );
      loadProfile(config.profiles[0].id);
    })
    .catch(() =>
      status(
        "Profils indisponibles",
        "Impossible de charger la configuration des bots.",
      ),
    );
})();
