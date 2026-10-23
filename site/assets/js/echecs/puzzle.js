// Puzzle du jour (page échecs) : un mat forcé en 2 ou 3 coups, le même pour
// tout le monde ce jour-là, tiré de puzzles.json (tools/puzzles-echecs.mjs).
// On touche une pièce puis sa case ; l'adversaire répond tout seul. Le
// dernier coup accepte tout mat, les autres sont le seul coup qui force le
// mat aussi vite (vérifié à la génération). Puzzles résolus gardés dans ce
// navigateur. chess.js du site (Chess, version 0.10 : in_checkmate…).
// Sans « ?. » : vieilles WebView Android (voir main.js).
(function () {
  var box = document.getElementById("chess-puzzle");
  if (!box || typeof Chess !== "function" || !window.fetch) return;
  var boardEl = box.querySelector("[data-puzzle-board]");
  var statusEl = box.querySelector("[data-puzzle-status]");
  var titleEl = box.querySelector("[data-puzzle-title]");
  var STORAGE = "scepi-echecs-puzzle";
  var NAMES = { p: "pion", n: "cavalier", b: "fou", r: "tour", q: "dame", k: "roi" };
  var FILES = "abcdefgh";

  var pad = function (n) {
    return (n < 10 ? "0" : "") + n;
  };
  var now = new Date();
  var date = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
  // Numéro du jour (depuis le 1er janvier 2026, à midi UTC : pas d'effet d'heure d'été).
  var day = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12) - Date.UTC(2026, 0, 1, 12)) / 864e5);

  var puzzle, game, step, selected, solved, hint, locked;

  function solvedDays() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE)) || {};
    } catch (e) {
      return {};
    }
  }
  function markSolved() {
    var days = solvedDays();
    days[date] = 1;
    var keys = Object.keys(days).sort();
    while (keys.length > 120) delete days[keys.shift()];
    try {
      localStorage.setItem(STORAGE, JSON.stringify(days));
    } catch (e) {}
  }

  function say(text) {
    statusEl.textContent = text;
  }

  var me = function () {
    return puzzle.fen.split(" ")[1];
  };
  var colorName = function (c) {
    return c === "w" ? "blancs" : "noirs";
  };

  function render() {
    var white = me() === "w";
    var targets = {};
    if (selected)
      game.moves({ square: selected, verbose: true }).forEach(function (m) {
        targets[m.to] = true;
      });
    var html = "";
    for (var r = 0; r < 8; r++)
      for (var f = 0; f < 8; f++) {
        var file = white ? f : 7 - f;
        var rank = white ? 8 - r : r + 1;
        var sq = FILES[file] + rank;
        var p = game.get(sq);
        var cls = "pz-square " + ((file + rank) % 2 ? "is-light" : "is-dark");
        if (sq === selected) cls += " is-selected";
        if (targets[sq]) cls += p ? " is-capture" : " is-target";
        if (sq === hint) cls += " is-hint";
        var label = sq + (p ? ", " + NAMES[p.type] + " " + (p.color === "w" ? "blanc" : "noir") : "");
        html +=
          '<button type="button" class="' + cls + '" data-square="' + sq + '" aria-label="' + label + '"' +
          (locked ? " disabled" : "") + ">" +
          (p ? '<img src="/assets/images/echecs/cburnett/' + p.color + p.type.toUpperCase() + '.svg" alt="" draggable="false">' : "") +
          "</button>";
      }
    boardEl.innerHTML = html;
  }

  function reset() {
    game = new Chess(puzzle.fen);
    step = 0;
    selected = hint = null;
    locked = solved;
    render();
  }

  function uciMove(u) {
    return game.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" });
  }

  function finish(text) {
    locked = true;
    selected = hint = null;
    render();
    say(text);
  }

  function tryMove(from, to) {
    var want = puzzle.solution[step];
    // Promotion : celle de la solution si c'est ce coup-là, sinon dame.
    var promo = want.slice(0, 4) === from + to && want[4] ? want[4] : "q";
    var m = game.move({ from: from, to: to, promotion: promo });
    selected = hint = null;
    if (!m) return render();
    var last = step === puzzle.solution.length - 1;
    var right = from + to === want.slice(0, 4) || (last && game.in_checkmate());
    if (!right) {
      render();
      locked = true;
      say("Pas ce coup-là : il ne force pas le mat. Réessaie.");
      setTimeout(function () {
        game.undo();
        locked = false;
        render();
      }, 700);
      return;
    }
    if (last) {
      solved = true;
      markSolved();
      return finish("Échec et mat ! Puzzle du jour résolu. Reviens demain pour le suivant.");
    }
    render();
    locked = true;
    say("Bien vu. L’adversaire répond…");
    setTimeout(function () {
      var reply = uciMove(puzzle.solution[step + 1]);
      step += 2;
      locked = false;
      render();
      say("Il a joué " + reply.san + ". À toi : encore " + (puzzle.solution.length - step + 1) / 2 + " coup(s) pour mater.");
    }, 550);
  }

  boardEl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-square]");
    if (!btn || locked) return;
    var sq = btn.getAttribute("data-square");
    var p = game.get(sq);
    if (selected && selected !== sq && !(p && p.color === me())) return tryMove(selected, sq);
    selected = p && p.color === me() && selected !== sq ? sq : null;
    render();
    var again = boardEl.querySelector('[data-square="' + sq + '"]');
    if (again) again.focus();
  });

  box.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-puzzle-action]");
    if (!btn) return;
    var action = btn.getAttribute("data-puzzle-action");
    if (action === "reset") {
      reset();
      say(solved ? "Déjà résolu aujourd’hui." : "Position de départ : " + colorName(me()) + " jouent et matent en " + puzzle.mat + ".");
    } else if (action === "hint" && !locked) {
      hint = puzzle.solution[step].slice(0, 2);
      render();
      say("Indice : la pièce à jouer est en " + hint + ".");
    } else if (action === "solution") {
      reset();
      locked = true;
      var i = 0;
      var play = function () {
        if (i >= puzzle.solution.length) return finish("Solution : " + game.history().join(", ") + ".");
        uciMove(puzzle.solution[i++]);
        render();
        setTimeout(play, 650);
      };
      play();
    }
  });

  fetch("/assets/js/echecs/puzzles.json")
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (data) {
      if (!data || !data.puzzles || !data.puzzles.length) return;
      var list = data.puzzles;
      puzzle = list[((day % list.length) + list.length) % list.length];
      solved = !!solvedDays()[date];
      titleEl.textContent = "Les " + colorName(me()) + " jouent et matent en " + puzzle.mat;
      box.hidden = false;
      reset();
      say(solved ? "Déjà résolu aujourd’hui : reviens demain pour le suivant." : "Touche une pièce, puis la case où la jouer.");
    })
    .catch(function () {});
})();
