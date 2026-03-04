/**
 * Interactive HTML video player template.
 *
 * Generates a self-contained HTML page that embeds a video with
 * playback controls, chapter navigation, and subtitle display.
 * No external dependencies — all CSS and JS are inlined.
 */

/** Options for generating the HTML player page. */
export interface HtmlPlayerOptions {
  /** Video data as a base64-encoded string. */
  readonly videoBase64: string;
  /** Video MIME type (e.g., "video/mp4"). */
  readonly mimeType: string;
  /** Video title from the demo script. */
  readonly title: string;
  /** Chapter markers for navigation. */
  readonly chapters: readonly HtmlChapter[];
  /** Subtitle segments for display. */
  readonly subtitles: readonly HtmlSubtitle[];
}

/** A chapter marker with title and start time. */
export interface HtmlChapter {
  readonly title: string;
  readonly startMs: number;
}

/** A subtitle segment with timing and text. */
export interface HtmlSubtitle {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
}

/**
 * Generate a complete self-contained HTML player page.
 *
 * The output is a single HTML file with embedded video data URI,
 * inline CSS for the dark-themed player UI, and inline JS for
 * playback controls, chapter navigation, keyboard shortcuts, and
 * subtitle rendering.
 *
 * @param options - Player configuration including video data and metadata.
 * @returns Complete HTML document string.
 */
export function generateHtmlPlayer(options: HtmlPlayerOptions): string {
  const { videoBase64, mimeType, title, chapters, subtitles } = options;

  const chapterListHtml =
    chapters.length > 0
      ? `
  <div class="chapters">
    <h2>Chapters</h2>
    <ol class="chapter-list" id="chapterList">
      ${chapters.map((ch, i) => `<li data-time="${ch.startMs / 1000}" data-index="${i}">${escapeHtml(ch.title)}</li>`).join("\n      ")}
    </ol>
  </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — webreel</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #0a0a0a; color: #e5e5e5; font-family: -apple-system, system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; min-height: 100vh; }
.player-container { max-width: 1280px; width: 100%; padding: 24px; }
h1 { font-size: 1.5rem; margin-bottom: 16px; font-weight: 600; }
.video-wrapper { position: relative; background: #000; border-radius: 8px; overflow: hidden; }
video { width: 100%; display: block; }
.subtitle-overlay { position: absolute; bottom: 48px; left: 0; right: 0; text-align: center; pointer-events: none; }
.subtitle-text { display: inline-block; background: rgba(0,0,0,0.75); color: #fff; padding: 6px 16px; border-radius: 4px; font-size: 1rem; max-width: 80%; }
.controls { display: flex; align-items: center; gap: 12px; padding: 12px 0; }
.controls button { background: none; border: none; color: #e5e5e5; cursor: pointer; font-size: 1.2rem; padding: 4px 8px; border-radius: 4px; }
.controls button:hover { background: rgba(255,255,255,0.1); }
.time-display { font-size: 0.85rem; font-variant-numeric: tabular-nums; color: #999; }
.progress-bar { flex: 1; height: 4px; background: #333; border-radius: 2px; cursor: pointer; position: relative; }
.progress-fill { height: 100%; background: #3b82f6; border-radius: 2px; width: 0%; transition: width 0.1s linear; }
.chapters { margin-top: 16px; }
.chapters h2 { font-size: 1.1rem; margin-bottom: 8px; font-weight: 500; }
.chapter-list { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
.chapter-list li { background: #1a1a1a; padding: 6px 14px; border-radius: 20px; font-size: 0.85rem; cursor: pointer; transition: background 0.2s; }
.chapter-list li:hover { background: #2a2a2a; }
.chapter-list li.active { background: #3b82f6; color: #fff; }
.shortcuts { margin-top: 24px; color: #666; font-size: 0.75rem; text-align: center; }
.shortcuts kbd { background: #1a1a1a; padding: 2px 6px; border-radius: 3px; font-family: inherit; }
</style>
</head>
<body>
<div class="player-container">
  <h1>${escapeHtml(title)}</h1>
  <div class="video-wrapper">
    <video id="video" preload="auto">
      <source src="data:${mimeType};base64,${videoBase64}" type="${mimeType}">
    </video>
    <div class="subtitle-overlay"><span class="subtitle-text" id="subtitle" style="display:none"></span></div>
  </div>
  <div class="controls">
    <button id="playBtn" title="Play/Pause (Space)">&#9654;</button>
    <span class="time-display" id="timeDisplay">0:00 / 0:00</span>
    <div class="progress-bar" id="progressBar"><div class="progress-fill" id="progressFill"></div></div>
  </div>${chapterListHtml}
  <div class="shortcuts">
    <kbd>Space</kbd> Play/Pause &nbsp; <kbd>&#8592;</kbd><kbd>&#8594;</kbd> Seek 5s &nbsp; <kbd>F</kbd> Fullscreen
  </div>
</div>
<script>
(function() {
  var video = document.getElementById("video");
  var playBtn = document.getElementById("playBtn");
  var timeDisplay = document.getElementById("timeDisplay");
  var progressBar = document.getElementById("progressBar");
  var progressFill = document.getElementById("progressFill");
  var subtitle = document.getElementById("subtitle");
  var chapterList = document.getElementById("chapterList");
  var subtitles = ${JSON.stringify(subtitles)};
  var chapters = ${JSON.stringify(chapters)};

  function formatTime(sec) {
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function updateSubtitle() {
    var ms = video.currentTime * 1000;
    var active = null;
    for (var i = 0; i < subtitles.length; i++) {
      if (ms >= subtitles[i].startMs && ms < subtitles[i].endMs) { active = subtitles[i]; break; }
    }
    if (active) { subtitle.textContent = active.text; subtitle.style.display = "inline-block"; }
    else { subtitle.style.display = "none"; }
  }

  function updateChapterHighlight() {
    if (!chapterList) return;
    var ms = video.currentTime * 1000;
    var items = chapterList.querySelectorAll("li");
    var activeIdx = 0;
    for (var i = 0; i < chapters.length; i++) {
      if (ms >= chapters[i].startMs) activeIdx = i;
    }
    for (var j = 0; j < items.length; j++) {
      if (j === activeIdx) items[j].classList.add("active");
      else items[j].classList.remove("active");
    }
  }

  video.addEventListener("timeupdate", function() {
    var pct = (video.currentTime / video.duration) * 100;
    progressFill.style.width = pct + "%";
    timeDisplay.textContent = formatTime(video.currentTime) + " / " + formatTime(video.duration);
    updateSubtitle();
    updateChapterHighlight();
  });

  video.addEventListener("play", function() { playBtn.innerHTML = "&#9208;"; });
  video.addEventListener("pause", function() { playBtn.innerHTML = "&#9654;"; });
  video.addEventListener("ended", function() { playBtn.innerHTML = "&#9654;"; });

  playBtn.addEventListener("click", function() {
    if (video.paused) video.play(); else video.pause();
  });

  progressBar.addEventListener("click", function(e) {
    var rect = progressBar.getBoundingClientRect();
    var pct = (e.clientX - rect.left) / rect.width;
    video.currentTime = pct * video.duration;
  });

  if (chapterList) {
    chapterList.addEventListener("click", function(e) {
      var li = e.target.closest ? e.target.closest("li") : e.target;
      if (li && li.dataset && li.dataset.time) {
        video.currentTime = parseFloat(li.dataset.time);
        video.play();
      }
    });
  }

  document.addEventListener("keydown", function(e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    switch(e.key) {
      case " ": e.preventDefault(); if (video.paused) video.play(); else video.pause(); break;
      case "ArrowLeft": video.currentTime = Math.max(0, video.currentTime - 5); break;
      case "ArrowRight": video.currentTime = Math.min(video.duration, video.currentTime + 5); break;
      case "f": case "F":
        if (document.fullscreenElement) document.exitFullscreen();
        else if (video.requestFullscreen) video.requestFullscreen();
        break;
    }
  });
})();
</script>
</body>
</html>`;
}

/**
 * Escape HTML special characters to prevent XSS in user-provided content.
 *
 * @param text - Raw text that may contain HTML special characters.
 * @returns Escaped text safe for embedding in HTML.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
