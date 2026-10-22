/* Intent Lock · Story navigation
   Beats advance by Next/Prev, space, arrow keys, the chapter rail, or scroll.
   "Watch it run" auto-advances on the video's own beat timings (no audio).
   Replay and live playback arrive in Phase 2; this file owns navigation only. */
(function () {
  "use strict";

  var beats = Array.prototype.slice.call(document.querySelectorAll(".beat"));
  var railItems = Array.prototype.slice.call(document.querySelectorAll(".rail-item"));
  var announcer = document.getElementById("announcer");
  var beatNow = document.getElementById("beatNow");
  var progressBar = document.getElementById("progressBar");
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");
  var watchBtn = document.getElementById("watchBtn");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var current = 0;
  var watching = false;
  var watchTimer = null;

  /* Dwell per beat, from the video timestamps: 0:00, 0:12, 0:35, 0:55, 1:35, 2:05, 2:30 */
  var dwell = [12000, 23000, 20000, 40000, 30000, 25000];

  function setActive(i) {
    if (i === current && railItems[i] && railItems[i].classList.contains("is-active")) return;
    current = i;
    railItems.forEach(function (item, j) {
      item.classList.toggle("is-active", j === i);
    });
    beatNow.textContent = String(i + 1);
    progressBar.style.width = ((i + 1) / beats.length) * 100 + "%";
    announcer.textContent = "Beat " + (i + 1) + " of " + beats.length + ": " + beats[i].getAttribute("data-title");
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === beats.length - 1;
  }

  function goTo(i) {
    var target = Math.max(0, Math.min(beats.length - 1, i));
    beats[target].scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    setActive(target);
  }

  function stopWatch() {
    if (!watching) return;
    watching = false;
    if (watchTimer) window.clearTimeout(watchTimer);
    watchTimer = null;
    watchBtn.textContent = "Watch it run";
  }

  function scheduleNext() {
    if (!watching) return;
    if (current >= beats.length - 1) { stopWatch(); return; }
    watchTimer = window.setTimeout(function () {
      goTo(current + 1);
      scheduleNext();
    }, dwell[current]);
  }

  watchBtn.addEventListener("click", function () {
    if (watching) { stopWatch(); return; }
    watching = true;
    watchBtn.textContent = "Stop";
    if (current >= beats.length - 1) goTo(0);
    scheduleNext();
  });

  document.querySelectorAll("[data-goto]").forEach(function (el) {
    el.addEventListener("click", function () {
      stopWatch();
      var target = document.getElementById(el.getAttribute("data-goto"));
      var idx = beats.indexOf(target);
      if (idx >= 0) goTo(idx);
    });
  });

  prevBtn.addEventListener("click", function () { stopWatch(); goTo(current - 1); });
  nextBtn.addEventListener("click", function () { stopWatch(); goTo(current + 1); });

  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === " " || e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "PageDown") {
      /* Space keeps its native button activation when a button has focus. */
      if (e.key === " " && tag === "BUTTON") return;
      e.preventDefault();
      stopWatch();
      goTo(current + 1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      stopWatch();
      goTo(current - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      stopWatch();
      goTo(0);
    } else if (e.key === "End") {
      e.preventDefault();
      stopWatch();
      goTo(beats.length - 1);
    }
  });

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setActive(beats.indexOf(entry.target));
      });
    }, { rootMargin: "-40% 0px -50% 0px", threshold: 0 });
    beats.forEach(function (b) { io.observe(b); });
  }

  setActive(0);
})();
