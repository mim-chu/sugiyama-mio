(function () {
  var DATA_URL = "https://arrow2nd.github.io/omkr-radio/json/tokumei.json";
  var STORAGE_KEY = "personal_player_v1";
  var PAGE_SIZE = 40;

  var audio = document.getElementById("audio");
  var listEl = document.getElementById("episode-list");
  var countEl = document.getElementById("episode-count");
  var searchEl = document.getElementById("episode-search");
  var sortEl = document.getElementById("episode-sort");
  var moreBtn = document.getElementById("more-episodes");
  var emptyEl = document.getElementById("empty-list");
  var errorEl = document.getElementById("load-error");
  var heroTitle = document.getElementById("hero-title");
  var heroMeta = document.getElementById("hero-meta");
  var heroLabel = document.getElementById("hero-label");
  var heroPlay = document.getElementById("hero-play");
  var heroShuffle = document.getElementById("hero-shuffle");
  var shuffleBtn = document.getElementById("btn-shuffle");
  var nowTitle = document.getElementById("now-title");
  var nowMeta = document.getElementById("now-meta");
  var seekEl = document.getElementById("seek");
  var curEl = document.getElementById("time-current");
  var durEl = document.getElementById("time-duration");
  var playBtn = document.getElementById("btn-play");
  var speedEl = document.getElementById("speed");
  var sleepEl = document.getElementById("sleep");
  var officialLink = document.getElementById("official-link");

  var SPECIALS = [
    { number: 1001, special: true, title: "ARuFa・永田のシャッフルコンビラジオ／ARuFaプロデュース「公開収録！ 刺身定食はアリ？ナシ？」", source: "https://omocoro.heteml.net/radio/sp/arunaga01.mp3", link: "https://omocoro.jp/rensai/89893/", pubDate: "Mon, 29 Aug 2016 15:00:00 GMT" },
    { number: 1002, special: true, title: "ARuFa・永田のシャッフルコンビラジオ／永田プロデュース「ARuFaのオナニー2016」", source: "https://omocoro.heteml.net/radio/sp/arunaga02.mp3", link: "https://omocoro.jp/rensai/89893/", pubDate: "Mon, 29 Aug 2016 15:00:00 GMT" },
    { number: 1003, special: true, title: "室木おすし・恐山のシャッフルコンビラジオ", source: "https://omocoro.heteml.net/radio/sp/osusirezan.mp3", link: "https://omocoro.jp/rensai/89981/", pubDate: "Mon, 29 Aug 2016 15:00:00 GMT" },
    { number: 1004, special: true, title: "恐山・かまどのシャッフルコンビラジオ", source: "https://omocoro.heteml.net/radio/sp2/kamado_osorezan.mp3", link: "https://omocoro.jp/rensai/120885/", pubDate: "Sun, 01 Oct 2017 15:00:00 GMT" },
    { number: 1005, special: true, title: "ARuFa・加藤のペポペポラジオ「徹底討論！『カービィ』ってエッチ？ エッチじゃない？」", source: "https://omocoro.heteml.net/radio/sp2/pepopepo_radio.mp3", link: "https://omocoro.jp/radio/121090/", pubDate: "Mon, 02 Oct 2017 15:00:00 GMT" }
  ];

  var TOKUBETSU = { 134: 1, 167: 1, 187: 1, 188: 1, 200: 1, 268: 1, 375: 1, 433: 1, 500: 1 };
  var PARALLEL = {};
  var episodes = []; // ascending by number
  var current = null; // episode object
  var activeFilter = "all";
  var activeRange = 0;
  var limit = PAGE_SIZE;
  var sleepTimer = null;
  var sleepAtEnd = false;
  var lastSave = 0;
  var seeking = false;

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { return JSON.parse(raw); }
    } catch (e) {}
    return { tracks: {}, last: null, speed: 1, shuffle: false };
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  var state = loadState();
  if (!state.tracks) { state.tracks = {}; }

  function record(ep) {
    return state.tracks[String(ep.number)] || { pos: 0, duration: 0, done: false };
  }
  function statusOf(ep) {
    var r = record(ep);
    if (r.done) { return "done"; }
    if (r.pos && r.pos >= 5) { return "mid"; }
    return "unheard";
  }
  function statusLabel(s) {
    if (s === "done") { return "聴了"; }
    if (s === "mid") { return "途中"; }
    return "未聴";
  }
  function fmt(sec) {
    if (!sec || !isFinite(sec)) { sec = 0; }
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var ss = (s < 10 ? "0" : "") + s;
    if (h > 0) { return h + ":" + (m < 10 ? "0" : "") + m + ":" + ss; }
    return m + ":" + ss;
  }
  function fmtDate(pubDate) {
    var d = new Date(pubDate);
    if (isNaN(d.getTime())) { return ""; }
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function filtered() {
    var q = searchEl.value ? searchEl.value.replace(/^\s+|\s+$/g, "").toLowerCase() : "";
    var out = [];
    var i, ep, st;
    for (i = 0; i < episodes.length; i++) {
      ep = episodes[i];
      if (activeRange === "shuffle") { if (!ep.special) { continue; } }
      else if (activeRange === "guest") { if (!ep.guest) { continue; } }
      else if (activeRange === "tokubetsu") { if (!ep.tokubetsu) { continue; } }
      else if (activeRange === "parallel") { if (!ep.parallel) { continue; } }
      else if (activeRange > 0 && (ep.special || ep.number < activeRange || ep.number > activeRange + 99)) { continue; }
      if (activeFilter !== "all") {
        st = statusOf(ep);
        if (st !== activeFilter) { continue; }
      }
      if (q) {
        var hay = (ep.title + " " + ep.number + " 第" + ep.number + "回" + (ep.special ? " シャッフルラジオ スペシャル" : "") + (ep.guest ? " ゲスト" : "") + (ep.tokubetsu ? " 特殊" : "")).toLowerCase();
        if (hay.indexOf(q) === -1) { continue; }
      }
      out.push(ep);
    }
    var dir = (sortEl && sortEl.value === "old") ? 1 : -1;
    out.sort(function (a, b) {
      var da = new Date(a.pubDate).getTime() || 0;
      var db = new Date(b.pubDate).getTime() || 0;
      if (da !== db) { return (da - db) * dir; }
      return (a.number - b.number) * dir;
    });
    return out;
  }

  function render() {
    var items = filtered();
    countEl.innerHTML = items.length + "回";
    emptyEl.style.display = items.length ? "none" : "block";
    var html = "";
    var n = Math.min(limit, items.length);
    for (var i = 0; i < n; i++) {
      var ep = items[i];
      var st = statusOf(ep);
      var playing = current && current.number === ep.number;
      html += '<li data-num="' + ep.number + '"' + (playing ? ' class="playing"' : "") + ">"
        + '<span class="ep-num">' + (ep.special ? "SP" : "第" + ep.number + "回") + '</span>'
        + '<span class="ep-status ' + st + '">' + statusLabel(st) + "</span>"
        + '<div class="ep-title">' + escapeHtml(ep.title) + "</div>"
        + '<div class="ep-date">' + fmtDate(ep.pubDate)
        + (ep.guest ? ' <span class="ep-tag">ゲスト</span>' : "")
        + (ep.tokubetsu ? ' <span class="ep-tag">特殊</span>' : "")
        + "</div>"
        + "</li>";
    }
    listEl.innerHTML = html;
    moreBtn.style.display = items.length > limit ? "block" : "none";
    // Attach clicks (simple loop, old-Safari safe)
    var lis = listEl.getElementsByTagName("li");
    for (var j = 0; j < lis.length; j++) {
      lis[j].onclick = (function (num) {
        return function () { playByNumber(num, true); };
      })(parseInt(lis[j].getAttribute("data-num"), 10));
    }
  }

  function episodeByNumber(num) {
    for (var i = 0; i < episodes.length; i++) {
      if (episodes[i].number === num) { return episodes[i]; }
    }
    return null;
  }
  function randomEpisode(exclude) {
    if (!episodes.length) { return null; }
    if (episodes.length === 1) { return episodes[0]; }
    var ep = null;
    for (var tries = 0; tries < 10; tries++) {
      ep = episodes[Math.floor(Math.random() * episodes.length)];
      if (!exclude || ep.number !== exclude.number) { break; }
    }
    return ep;
  }
  function updateShuffleBtn() {
    var label = state.shuffle ? "シャッフル ON" : "シャッフル OFF";
    if (shuffleBtn) { shuffleBtn.innerHTML = label; }
  }
  function prevEpisode(ep) {
    for (var i = 0; i < episodes.length; i++) {
      if (episodes[i].number === ep.number) {
        return episodes[i - 1] || null;
      }
    }
    return null;
  }
  function nextEpisode(ep) {
    for (var i = 0; i < episodes.length; i++) {
      if (episodes[i].number === ep.number) {
        return episodes[i + 1] || null;
      }
    }
    return null;
  }
  function resumeChoice() {
    if (state.last) {
      var last = episodeByNumber(state.last);
      if (last) {
        if (statusOf(last) !== "done") { return { ep: last, kind: "resume" }; }
        var nx = nextEpisode(last);
        if (nx) { return { ep: nx, kind: "next" }; }
        return { ep: last, kind: "again" };
      }
    }
    return episodes.length ? { ep: episodes[0], kind: "first" } : null;
  }
  function updateHero() {
    var c = resumeChoice();
    if (!c) { return; }
    heroTitle.innerHTML = escapeHtml(c.ep.title);
    heroMeta.innerHTML = c.ep.special ? ("シャッフルラジオ ・ " + fmtDate(c.ep.pubDate)) : ("第" + c.ep.number + "回 ・ " + fmtDate(c.ep.pubDate));
    heroLabel.innerHTML = c.kind === "resume" ? "つづきから" : (c.kind === "next" ? "つぎの回" : "はじめの一回");
    heroPlay.disabled = false;
    heroPlay.innerHTML = c.kind === "resume" ? "続きを聴く" : "この回を聴く";
    heroPlay.onclick = function () { playEpisode(c.ep, true); };
    if (heroShuffle) {
      heroShuffle.disabled = false;
      heroShuffle.onclick = function () {
        var ep = randomEpisode(current);
        if (ep) { playEpisode(ep, true); }
      };
    }
  }

  function playByNumber(num, autoplay) {
    var ep = episodeByNumber(num);
    if (ep) { playEpisode(ep, autoplay); }
  }
  function playEpisode(ep, autoplay) {
    current = ep;
    state.last = ep.number;
    saveState();
    audio.src = ep.source;
    audio.playbackRate = parseFloat(speedEl.value) || state.speed || 1;
    nowTitle.innerHTML = (ep.special ? "" : "第" + ep.number + "回 ") + escapeHtml(ep.title);
    nowMeta.innerHTML = fmtDate(ep.pubDate);
    if (ep.link) {
      officialLink.href = ep.link;
      officialLink.style.display = "inline";
    } else {
      officialLink.style.display = "none";
    }
    setupMediaSession(ep);
    var r = record(ep);
    var startPos = (r.done) ? 0 : (r.pos || 0);
    var onMeta = function () {
      audio.removeEventListener("loadedmetadata", onMeta);
      if (startPos > 5 && audio.duration && startPos < audio.duration - 10) {
        try { audio.currentTime = startPos; } catch (e) {}
      }
      if (autoplay) { try { audio.play(); } catch (e) {} }
    };
    audio.addEventListener("loadedmetadata", onMeta);
    if (autoplay) {
      // Start playing immediately: in background playback iOS may never
      // deliver loadedmetadata, which used to stall auto-advance.
      // Do NOT call audio.load() here: resetting the element in the
      // background can tear down the audio session and the next episode
      // then "plays" silently (progress bar moves, no sound).
      try { audio.preload = "auto"; } catch (e) {}
      try { var pr = audio.play(); if (pr && pr.catch) { pr.catch(function () {}); } } catch (e) {}
      var onCanPlay = function () {
        audio.removeEventListener("canplay", onCanPlay);
        // Nudge the output awake once data is flowing.
        try { var pr2 = audio.play(); if (pr2 && pr2.catch) { pr2.catch(function () {}); } } catch (e) {}
      };
      audio.addEventListener("canplay", onCanPlay);
    }
    render();
  }

  function savePosition(force) {
    if (!current) { return; }
    var now = new Date().getTime();
    if (!force && now - lastSave < 4000) { return; }
    lastSave = now;
    var key = String(current.number);
    var prev = state.tracks[key] || { pos: 0, duration: 0, done: false };
    prev.pos = audio.currentTime || 0;
    if (audio.duration) { prev.duration = audio.duration; }
    if (audio.duration && prev.pos >= audio.duration - 5) { prev.done = true; }
    state.tracks[key] = prev;
    saveState();
  }
  function clearSleep() {
    if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = null; }
    sleepAtEnd = false;
  }
  function applySleep() {
    clearSleep();
    var v = sleepEl.value;
    if (v === "-1") { sleepAtEnd = true; return; }
    var mins = parseInt(v, 10);
    if (mins > 0) {
      sleepTimer = setTimeout(function () { audio.pause(); }, mins * 60 * 1000);
    }
  }

  // Audio events
  audio.addEventListener("play", function () { playBtn.innerHTML = "⏸ 一時停止"; });
  audio.addEventListener("pause", function () { playBtn.innerHTML = "▶ 再生"; savePosition(true); });
  audio.addEventListener("timeupdate", function () {
    if (!seeking && audio.duration) {
      seekEl.value = Math.floor((audio.currentTime / audio.duration) * 100);
    }
    curEl.innerHTML = fmt(audio.currentTime);
    durEl.innerHTML = fmt(audio.duration);
    savePosition(false);
  });
  audio.addEventListener("ended", function () {
    if (current) {
      var key = String(current.number);
      state.tracks[key] = { pos: audio.duration || 0, duration: audio.duration || 0, done: true };
      saveState();
    }
    if (sleepAtEnd) { clearSleep(); render(); return; }
    if (state.shuffle) {
      var rnd = randomEpisode(current);
      if (rnd) { playEpisode(rnd, true); } else { render(); }
      return;
    }
    var nx = current ? nextEpisode(current) : null;
    if (nx) { playEpisode(nx, true); } else { render(); }
  });

  // PiP page support (pip.html): the media element is a <video> there.
  // Move it into the player bar as artwork and wire the PiP button.
  var pipBtn = document.getElementById("btn-pip");
  if (document.getElementById("pip-video")) {
    // The episode element itself has no video track (audio-only file), so
    // iOS refuses PiP on it. A tiny silent video WITH real frames rides in
    // the player bar as artwork, already playing; it carries the PiP
    // window while the episode audio keeps playing alongside it.
    var pv = document.getElementById("pip-video");
    var dbg = document.getElementById("pip-debug");
    var pipStarted = false;
    function pipLog(msg) { if (dbg) { dbg.textContent = "PiP診断: " + msg; } }
    if (pipBtn && pv) {
      var sup = "?";
      try {
        if (typeof pv.webkitSupportsPresentationMode === "function") {
          sup = pv.webkitSupportsPresentationMode("picture-in-picture") ? "対応" : "非対応";
        }
      } catch (e) {}
      pipLog("PiP " + sup + " / 動画の状態 " + pv.readyState);
      pipBtn.onclick = function () {
        // Call synchronously inside the tap: delaying this can make iOS
        // ignore the request entirely.
        try {
          if (pv.paused) { pv.play(); }
          if (typeof pv.webkitSetPresentationMode === "function" &&
              pv.webkitPresentationMode !== "picture-in-picture") {
            pv.webkitSetPresentationMode("picture-in-picture");
            pipStarted = true;
            setTimeout(function () {
              pipLog("モード=" + pv.webkitPresentationMode + " / 状態 " + pv.readyState);
            }, 400);
          } else if (typeof pv.requestPictureInPicture === "function") {
            pv.requestPictureInPicture();
            pipStarted = true;
            pipLog("標準PiPを呼んだ");
          } else {
            pipLog("PiPの入口が見つからない");
          }
        } catch (e) {
          pipLog("エラー " + (e && e.message ? e.message : e));
        }
      };
      pv.onclick = function () {
        try {
          if (typeof pv.webkitEnterFullscreen === "function") { pv.webkitEnterFullscreen(); }
          else if (typeof pv.requestFullscreen === "function") { pv.requestFullscreen(); }
        } catch (e) {}
      };
      audio.addEventListener("play", function () {
        if (pipStarted && pv.paused) { try { pv.play(); } catch (e) {} }
      });
      audio.addEventListener("pause", function () {
        if (pipStarted && !pv.paused) { try { pv.pause(); } catch (e) {} }
      });
    } else if (pipBtn) {
      pipBtn.style.display = "none";
    }
  } else if (pipBtn) {
    pipBtn.style.display = "none";
  }

  // Controls
  playBtn.onclick = function () {
    if (!current) {
      var c = resumeChoice();
      if (c) { playEpisode(c.ep, true); }
      return;
    }
    if (audio.paused) { audio.play(); } else { audio.pause(); }
  };
  function doPrev() {
    if (!current) { return; }
    if (audio.currentTime && audio.currentTime > 5) {
      try { audio.currentTime = 0; } catch (e) {}
      return;
    }
    var pv = prevEpisode(current);
    if (pv) { playEpisode(pv, true); }
  }
  function doNext() {
    if (!current) {
      var c = resumeChoice();
      if (c) { playEpisode(c.ep, true); }
      return;
    }
    if (state.shuffle) {
      var rnd = randomEpisode(current);
      if (rnd) { playEpisode(rnd, true); }
      return;
    }
    var nx2 = nextEpisode(current);
    if (nx2) { playEpisode(nx2, true); }
  }
  document.getElementById("btn-prev").onclick = doPrev;
  document.getElementById("btn-next").onclick = doNext;

  var playerEl = document.getElementById("player");
  var collapseBtn = document.getElementById("btn-collapse");
  function applyCompact() {
    var c = !!state.compact;
    if (playerEl) { playerEl.className = c ? "player compact" : "player"; }
    document.body.className = c ? "compact" : "";
    if (collapseBtn) { collapseBtn.innerHTML = c ? "▲ 大きく" : "▼ 小さく"; }
  }
  if (collapseBtn) {
    collapseBtn.onclick = function () {
      state.compact = !state.compact;
      saveState();
      applyCompact();
    };
  }
  applyCompact();

  function setupMediaSession(ep) {
    try {
      if (!("mediaSession" in navigator)) { return; }
      if (typeof MediaMetadata !== "undefined") {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: (ep.special ? "" : "第" + ep.number + "回 ") + ep.title,
          artist: "匿名ラジオ",
          album: ep.special ? "シャッフルラジオ" : "匿名ラジオ"
        });
      }
      var ms = navigator.mediaSession;
      try { ms.setActionHandler("play", function () { audio.play(); }); } catch (e) {}
      try { ms.setActionHandler("pause", function () { audio.pause(); }); } catch (e) {}
      try { ms.setActionHandler("previoustrack", function () { doPrev(); }); } catch (e) {}
      try { ms.setActionHandler("nexttrack", function () { doNext(); }); } catch (e) {}
      // No seekbackward/seekforward handlers on purpose: when they are set,
      // iOS shows 10-second skip buttons in Control Center instead of the
      // previous/next track buttons.
    } catch (e) {}
  }
  seekEl.onchange = function () {
    if (audio.duration) { audio.currentTime = (seekEl.value / 100) * audio.duration; }
  };
  seekEl.onmousedown = function () { seeking = true; };
  seekEl.ontouchstart = function () { seeking = true; };
  seekEl.onmouseup = function () { seeking = false; };
  seekEl.ontouchend = function () { seeking = false; };
  speedEl.onchange = function () {
    var v = parseFloat(speedEl.value) || 1;
    audio.playbackRate = v;
    state.speed = v; saveState();
  };
  sleepEl.onchange = applySleep;
  if (shuffleBtn) {
    updateShuffleBtn();
    shuffleBtn.onclick = function () {
      state.shuffle = !state.shuffle;
      saveState();
      updateShuffleBtn();
    };
  }
  if (state.speed) {
    // Restore saved speed if present in options
    for (var i = 0; i < speedEl.options.length; i++) {
      if (parseFloat(speedEl.options[i].value) === state.speed) { speedEl.selectedIndex = i; break; }
    }
  }

  // List controls
  searchEl.oninput = function () { limit = PAGE_SIZE; render(); };
  searchEl.onkeyup = function () { limit = PAGE_SIZE; render(); };
  if (sortEl) { sortEl.onchange = function () { limit = PAGE_SIZE; render(); }; }
  moreBtn.onclick = function () { limit += PAGE_SIZE; render(); };
  var filterBox = document.getElementById("filters");
  var fbtns = filterBox.getElementsByTagName("button");
  for (var k = 0; k < fbtns.length; k++) {
    fbtns[k].onclick = (function (btn) {
      return function () {
        activeFilter = btn.getAttribute("data-filter");
        for (var m = 0; m < fbtns.length; m++) { fbtns[m].className = ""; }
        btn.className = "active";
        limit = PAGE_SIZE; render();
      };
    })(fbtns[k]);
  }

  var rangeBox = document.getElementById("ranges");
  if (rangeBox) {
    var rbtns = rangeBox.getElementsByTagName("button");
    for (var r = 0; r < rbtns.length; r++) {
      rbtns[r].onclick = (function (btn) {
        return function () {
          var rv = btn.getAttribute("data-range");
          activeRange = (rv === "shuffle" || rv === "guest" || rv === "tokubetsu" || rv === "parallel") ? rv : (parseInt(rv, 10) || 0);
          for (var m2 = 0; m2 < rbtns.length; m2++) { rbtns[m2].className = ""; }
          btn.className = "active";
          limit = PAGE_SIZE; render();
        };
      })(rbtns[r]);
    }
  }

  // Load catalog via XHR (fetch avoided for old Safari)
  var xhr = new XMLHttpRequest();
  xhr.open("GET", DATA_URL, true);
  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4) { return; }
    if (xhr.status < 200 || xhr.status >= 300) { errorEl.style.display = "block"; heroTitle.innerHTML = "読み込めませんでした"; return; }
    try {
      var data = JSON.parse(xhr.responseText);
      episodes = [];
      for (var i = 0; i < data.length; i++) {
        if (data[i] && data[i].source && data[i].number) { episodes.push(data[i]); }
      }
      for (var s2 = 0; s2 < SPECIALS.length; s2++) { episodes.push(SPECIALS[s2]); }
      episodes.sort(function (a, b) { return a.number - b.number; });
      for (var t = 0; t < episodes.length; t++) {
        episodes[t].guest = episodes[t].title.indexOf("外部ゲスト") !== -1;
        episodes[t].tokubetsu = !!TOKUBETSU[episodes[t].number];
        episodes[t].parallel = !!PARALLEL[episodes[t].number];
      }
      updateHero();
      render();
    } catch (e) {
      errorEl.style.display = "block";
      heroTitle.innerHTML = "読み込めませんでした";
    }
  };
  xhr.onerror = function () { errorEl.style.display = "block"; };
  xhr.send(null);
})();
