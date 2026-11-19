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
      if (activeRange > 0 && (ep.number < activeRange || ep.number > activeRange + 99)) { continue; }
      if (activeFilter !== "all") {
        st = statusOf(ep);
        if (st !== activeFilter) { continue; }
      }
      if (q) {
        var hay = (ep.title + " " + ep.number + " 第" + ep.number + "回").toLowerCase();
        if (hay.indexOf(q) === -1) { continue; }
      }
      out.push(ep);
    }
    if (sortEl.value === "new") { out.reverse(); }
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
        + '<span class="ep-num">第' + ep.number + '回</span>'
        + '<span class="ep-status ' + st + '">' + statusLabel(st) + "</span>"
        + '<div class="ep-title">' + escapeHtml(ep.title) + "</div>"
        + '<div class="ep-date">' + fmtDate(ep.pubDate) + "</div>"
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
    heroMeta.innerHTML = "第" + c.ep.number + "回 ・ " + fmtDate(c.ep.pubDate);
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
    nowTitle.innerHTML = "第" + ep.number + "回 " + escapeHtml(ep.title);
    nowMeta.innerHTML = fmtDate(ep.pubDate);
    if (ep.link) {
      officialLink.href = ep.link;
      officialLink.style.display = "inline";
    } else {
      officialLink.style.display = "none";
    }
    var r = record(ep);
    var startPos = (r.done) ? 0 : (r.pos || 0);
    var onMeta = function () {
      audio.removeEventListener("loadedmetadata", onMeta);
      if (startPos > 5 && audio.duration && startPos < audio.duration - 10) {
        try { audio.currentTime = startPos; } catch (e) {}
      }
      if (autoplay) { audio.play(); }
    };
    audio.addEventListener("loadedmetadata", onMeta);
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

  // Controls
  playBtn.onclick = function () {
    if (!current) {
      var c = resumeChoice();
      if (c) { playEpisode(c.ep, true); }
      return;
    }
    if (audio.paused) { audio.play(); } else { audio.pause(); }
  };
  document.getElementById("btn-back").onclick = function () {
    audio.currentTime = Math.max(0, (audio.currentTime || 0) - 10);
  };
  document.getElementById("btn-fwd").onclick = function () {
    if (audio.duration) { audio.currentTime = Math.min(audio.duration, (audio.currentTime || 0) + 30); }
    else { audio.currentTime = (audio.currentTime || 0) + 30; }
  };
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
  sortEl.onchange = function () { limit = PAGE_SIZE; render(); };
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
          activeRange = parseInt(btn.getAttribute("data-range"), 10) || 0;
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
      episodes.sort(function (a, b) { return a.number - b.number; });
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
