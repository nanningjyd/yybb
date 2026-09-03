/* yybb - 网页语音播报
 * 纯浏览器本地合成（Web Speech API），无需登录、无需后端。
 * v1.7 新增：音色诊断、智能默认音色推荐、强化 voice 选择兼容性
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var textEl = $("text");
  var voiceEl = $("voice");
  var rateEl = $("rate"), pitchEl = $("pitch"), volumeEl = $("volume");
  var rateOut = $("rateOut"), pitchOut = $("pitchOut"), volumeOut = $("volumeOut");
  var btnPlay = $("btnPlay"), btnPause = $("btnPause"), btnStop = $("btnStop");
  var scriptCard = $("scriptCard"), scriptEl = $("script"), progressEl = $("progress");
  var charCount = $("charCount");

  var synth = window.speechSynthesis;
  var voices = [];
  var lastVoiceName = "";  // 按名称记住所选音色，音色列表异步分批到达时也能恢复
  var sentences = [];      // 切分后的句子数组
  var current = -1;        // 正在朗读的句子下标
  var state = "idle";      // idle | playing | paused
  var previewing = false;  // 是否正在试听

  var tipEl = $("tip");
  var tipTimer = null;
  var tipDefault = tipEl.textContent;

  // 非阻塞提示：8 秒后自动恢复
  function warn(msg) {
    tipEl.textContent = "⚠ " + msg;
    tipEl.style.color = "#d9534f";
    if (tipTimer) clearTimeout(tipTimer);
    tipTimer = setTimeout(function () {
      tipEl.textContent = tipDefault;
      tipEl.style.color = "";
    }, 8000);
  }

  /* ---------- 音色列表 ---------- */

  // 语言代码 → 中文名
  var LANG_CN = {
    "zh-CN": "中文（简体）", "zh-HK": "中文（粤语）", "zh-TW": "中文（繁体）", "zh": "中文",
    "en-US": "英语（美国）", "en-GB": "英语（英国）", "en-AU": "英语（澳大利亚）", "en-IN": "英语（印度）", "en": "英语",
    "ja-JP": "日语", "ko-KR": "韩语", "fr-FR": "法语", "de-DE": "德语", "es-ES": "西班牙语",
    "es-MX": "西班牙语（墨西哥）", "pt-BR": "葡萄牙语（巴西）", "it-IT": "意大利语", "ru-RU": "俄语",
    "ar-SA": "阿拉伯语", "hi-IN": "印地语", "th-TH": "泰语", "vi-VN": "越南语", "yue-CN": "粤语"
  };

  function langCN(lang) {
    if (!lang) return "未知语言";
    if (LANG_CN[lang]) return LANG_CN[lang];
    var prefix = lang.split("-")[0].toLowerCase();
    if (LANG_CN[prefix]) return LANG_CN[prefix];
    return lang;
  }

  // 常见发音人的中文名与性别（按英文名/拼音匹配）
  var VOICE_CN = [
    [/kangkang/i, "康康", "男声"],
    [/yaoyao/i, "瑶瑶", "女声"],
    [/huihui/i, "慧慧", "女声"],
    [/xiaoxiao/i, "晓晓", "女声"],
    [/xiaohan/i, "晓涵", "女声"],
    [/xiaomo/i, "晓墨", "女声"],
    [/xiaoqiu/i, "晓秋", "女声"],
    [/xiaorui/i, "晓睿", "女声"],
    [/xiaoshuang/i, "晓双", "童声"],
    [/xiaoxuan/i, "晓萱", "女声"],
    [/xiaoyan/i, "晓颜", "女声"],
    [/xiaoyi/i, "晓伊", "女声"],
    [/xiaoyou/i, "晓悠", "童声"],
    [/xiaozhen/i, "晓甄", "女声"],
    [/yunxi/i, "云希", "男声"],
    [/yunyang/i, "云扬", "男声"],
    [/yunjian/i, "云健", "男声"],
    [/yunfeng/i, "云枫", "男声"],
    [/yunhao/i, "云皓", "男声"],
    [/yunye/i, "云野", "男声"],
    [/yunze/i, "云泽", "男声"],
    [/ting[- ]?ting/i, "婷婷", "女声"],
    [/mei[- ]?jia/i, "美佳", "女声"],
    [/sin[- ]?ji/i, "善怡", "女声"],
    [/sin[- ]?j/i, "善怡", "女声"],
    [/(普通话|mandarin)/i, "Google 普通话", "女声"],
    [/(香港话|cantonese)/i, "Google 粤语", "女声"]
  ];

  function voiceCN(voice) {
    for (var i = 0; i < VOICE_CN.length; i++) {
      if (VOICE_CN[i][0].test(voice.name)) return VOICE_CN[i];
    }
    return null;
  }

  // 下拉框显示文本：已知音色用「中文名（性别）· 语言」，未知音色用「语言中文名 · 原名」
  function voiceLabel(v) {
    var cn = voiceCN(v);
    var lang = langCN(v.lang);
    var online = v.localService ? "" : " · 在线";
    if (cn) return cn[1] + "（" + cn[2] + "）· " + lang + online;
    return lang + " · " + v.name + online;
  }

  function refreshVoices() {
    voices = synth.getVoices();
    if (!voices.length) return;

    // 就地排序：下拉框的序号必须和 getVoice() 取的数组保持同一个顺序
    voices.sort(function (a, b) {
      function score(v) {
        var s = 0;
        if (/^zh/i.test(v.lang)) s -= 100;              // 中文优先
        if (v.localService) s -= 5;                      // 本地音色优先
        if (/Google|Xiaoxiao|Yaoyao|Kangkang|Ting/i.test(v.name)) s -= 2;
        return s;
      }
      return score(a) - score(b);
    });

    var sel = voiceEl;
    sel.innerHTML = "";
    voices.forEach(function (v, i) {
      var opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = voiceLabel(v);
      sel.appendChild(opt);
    });
    // 恢复用户上次选的音色（按名称）；没有历史选择时，用智能默认
    var restored = "";
    if (lastVoiceName) {
      for (var i = 0; i < voices.length; i++) {
        if (voices[i].name === lastVoiceName) { sel.value = String(i); restored = sel.value; break; }
      }
    }
    if (!restored) {
      var zhIdx = -1, yaoIdx = -1, smartIdx = -1;
      var smartPat = pickSmartDefault();
      for (var j = 0; j < voices.length; j++) {
        if (/^zh/i.test(voices[j].lang)) {
          if (zhIdx === -1) zhIdx = j;
          if (/yaoyao/i.test(voices[j].name)) { yaoIdx = j; }
          if (smartPat && smartPat.test(voices[j].name)) { smartIdx = j; break; }
        }
      }
      // 优先智能默认（Edge 上会选云希男声），其次瑶瑶，其次第一个中文
      if (smartIdx !== -1) sel.value = String(smartIdx);
      else if (yaoIdx !== -1) sel.value = String(yaoIdx);
      else if (zhIdx !== -1) sel.value = String(zhIdx);
    }
    if (!restored && !sel.value && voices.length) sel.value = "0";

    // 非Edge的Chromium内核在Windows上有"忽略发音人选择"的已知缺陷，给出提示
    var engineNotice = $("engineNotice");
    if (engineNotice) {
      var isEdge = /Edg\//.test(navigator.userAgent);
      var isWin = /Windows/.test(navigator.userAgent);
      var zhLocalCount = voices.filter(function (v) {
        return /^zh/i.test(v.lang) && v.localService;
      }).length;
      engineNotice.hidden = !(isWin && !isEdge && zhLocalCount > 1);
    }
  }

  function getVoice() {
    var i = parseInt(voiceEl.value, 10);
    return voices[i] || null;
  }

  if (synth) {
    refreshVoices();
    // Chrome 首次打开时音色列表异步加载；部分内核还会分批到达，延迟再刷新几次
    synth.onvoiceschanged = refreshVoices;
    [400, 1200, 2500].forEach(function (t) { setTimeout(refreshVoices, t); });
  }
  $("btnRefreshVoices").addEventListener("click", refreshVoices);

  // 用户手动换音色时记住名称，供刷新列表后恢复
  voiceEl.addEventListener("change", function () {
    var v = getVoice();
    if (v) lastVoiceName = v.name;
  });

  // 试听当前选中的发音人；试听中再点一次可暂停/继续
  $("btnPreview").addEventListener("click", function () {
    if (!synth) { alert("当前浏览器不支持语音合成，请使用 Edge / Chrome / Safari。"); return; }

    // 试听中 → 暂停
    if (previewing && synth.speaking && !synth.paused) {
      synth.pause();
      setPreviewBtn("▶ 继续");
      return;
    }
    // 已暂停 → 继续
    if (previewing && synth.paused) {
      synth.resume();
      setPreviewBtn("⏸ 暂停");
      return;
    }

    // 全新试听
    stop();
    previewing = true;
    var v = getVoice();
    var u = new SpeechSynthesisUtterance("你好，我是" + (v ? voiceLabel(v) : "默认") + "，很高兴为你播报。");
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    u.rate = parseFloat(rateEl.value);
    u.pitch = parseFloat(pitchEl.value);
    u.volume = parseFloat(volumeEl.value);
    u.onend = function () {
      previewing = false;
      setPreviewBtn("▶ 试听");
    };
    u.onerror = function (e) {
      if (e.error === "interrupted" || e.error === "canceled") return;
      previewing = false;
      setPreviewBtn("▶ 试听");
    };
    synth.speak(u);
    setPreviewBtn("⏸ 暂停");
  });

  /* ---------- 文本切分 ---------- */

  // 按标点切分并保留标点。delims 是字符类内容（不含 ^ ）。
  function splitKeepDelim(text, delims) {
    var re = new RegExp("[^" + delims + "]*[" + delims + "]+|[^" + delims + "]+$", "g");
    return text.match(re) || [];
  }

  // 按句末标点/换行切分；单句超过 MAX_LEN 再按逗号等次级标点细分，
  // 避免个别浏览器对超长朗读文本静默截断。
  var MAX_LEN = 110;

  function splitSentences(text) {
    var rough = splitKeepDelim(text, "。！？!?；;\\n\\r");
    var result = [];
    rough.forEach(function (seg) {
      seg = seg.trim();
      if (!seg) return;
      if (seg.length <= MAX_LEN) {
        result.push(seg);
        return;
      }
      // 超长句按次级标点继续切
      var sub = splitKeepDelim(seg, "，,、：:—");
      var buf = "";
      sub.forEach(function (piece) {
        if ((buf + piece).length > MAX_LEN && buf) {
          result.push(buf.trim());
          buf = piece;
        } else {
          buf += piece;
        }
      });
      if (buf.trim()) result.push(buf.trim());
    });
    return result;
  }

  /* ---------- 播放队列 ---------- */

  function renderScript() {
    scriptEl.innerHTML = "";
    sentences.forEach(function (s, i) {
      var div = document.createElement("div");
      div.className = "sentence";
      div.textContent = s;
      div.addEventListener("click", function () { playFrom(i); });
      scriptEl.appendChild(div);
    });
    scriptCard.hidden = sentences.length === 0;
    updateProgress();
  }

  function markSentence() {
    var nodes = scriptEl.children;
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].className = "sentence" +
        (i === current ? " current" : (current !== -1 && i < current ? " done" : ""));
    }
    if (current >= 0 && nodes[current]) {
      nodes[current].scrollIntoView({ block: "nearest" });
    }
    updateProgress();
  }

  function updateProgress() {
    progressEl.textContent = (current + 1 > 0 ? current + 1 : 0) + " / " + sentences.length;
  }

  function speakIndex(i) {
    var u = new SpeechSynthesisUtterance(sentences[i]);
    var v = getVoice();
    if (v) {
      u.voice = v;
      u.lang = v.lang; // 部分引擎按语言路由，同时设置更可靠
    }
    u.rate = parseFloat(rateEl.value);
    u.pitch = parseFloat(pitchEl.value);
    u.volume = parseFloat(volumeEl.value);
    u.onstart = function () { current = i; markSentence(); };
    u.onend = function () {
      if (state !== "playing") return; // 已被停止/替换
      if (i + 1 < sentences.length) {
        speakIndex(i + 1);
      } else {
        stop();
      }
    };
    u.onerror = function (e) {
      // 被主动 cancel 时的中断不算错误
      if (e.error === "interrupted" || e.error === "canceled") return;
      console.warn("朗读出错：", e.error);
      stop();
    };
    synth.speak(u);
  }

  function playFrom(i) {
    if (!synth) { alert("当前浏览器不支持语音合成，请使用 Edge / Chrome / Safari。"); return; }
    var text = textEl.value.trim();
    if (!text) { textEl.focus(); return; }

    // 防呆：文本是中文但发音人不支持中文时，提前提醒（此时浏览器往往无声播放）
    var v0 = getVoice();
    if (v0 && /[\u4e00-\u9fff]/.test(text) && !/^zh/i.test(v0.lang)) {
      warn("当前发音人「" + voiceLabel(v0) + "」不支持中文，请在“发音人”中选择标注为中文（简体）的音色。");
    }

    sentences = splitSentences(text);
    if (!sentences.length) return;
    renderScript();

    // 结束可能的试听状态
    previewing = false;
    setPreviewBtn("▶ 试听");

    synth.cancel();
    state = "playing";
    setButtons();
    speakIndex(i);
  }

  function stop() {
    state = "idle";
    current = -1;
    previewing = false;
    setPreviewBtn("▶ 试听");
    synth.cancel();
    setButtons();
    markSentence();
  }

  function setButtons() {
    btnPlay.textContent = state === "playing" ? "↻ 重新播报" : "▶ 开始播报";
    btnPause.textContent = state === "paused" ? "▶ 继续" : "⏸ 暂停";
    btnPause.disabled = state === "idle";
    btnStop.disabled = state === "idle";
  }

  function setPreviewBtn(text) {
    $("btnPreview").textContent = text;
  }

  /* ---------- 事件绑定 ---------- */

  btnPlay.addEventListener("click", function () { playFrom(0); });

  btnPause.addEventListener("click", function () {
    if (state === "playing") {
      synth.pause();
      state = "paused";
    } else if (state === "paused") {
      synth.resume();
      state = "playing";
    }
    setButtons();
  });

  btnStop.addEventListener("click", stop);

  $("btnClear").addEventListener("click", function () {
    textEl.value = "";
    charCount.textContent = "0";
    sentences = [];
    renderScript();
    textEl.focus();
  });

  $("btnPaste").addEventListener("click", function () {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (t) {
        textEl.value += (textEl.value && textEl.value.slice(-1) !== "\n" ? "\n" : "") + t;
        charCount.textContent = textEl.value.length;
        textEl.scrollTop = textEl.scrollHeight;
      }).catch(function () {
        textEl.focus();
      });
    } else {
      textEl.focus();
    }
  });

  textEl.addEventListener("input", function () {
    charCount.textContent = textEl.value.length;
  });

  [[rateEl, rateOut], [pitchEl, pitchOut], [volumeEl, volumeOut]].forEach(function (pair) {
    pair[0].addEventListener("input", function () {
      pair[1].textContent = parseFloat(pair[0].value).toFixed(1);
    });
  });

  // 离开页面时停止朗读，避免声音残留
  window.addEventListener("beforeunload", function () { synth && synth.cancel(); });

  /* ---------- 智能默认发音人推荐 ----------
   * 源站（gxezb）通过腾讯云 TTS 后端生成真实音频，所以它的 7 种音色都是真正不同的声音。
   * yybb 用浏览器 speechSynthesis，在不同浏览器/内核下表现差异很大：
   *   - Edge: 支持真实在线音色（云希男声、晓晓女声），可完全区分
   *   - Chrome/桌面浏览器: 通常支持区分
   *   - 微信/QQ/钉钉内置浏览器、部分 WebView: 会忽略 utterance.voice，把所有中文音色合成同一女声
   *
   * 智能默认：根据 UA 自动选一个该浏览器下最可能区分开的发音人。
   */
  function pickSmartDefault() {
    var ua = navigator.userAgent;
    var isEdge = /Edg\//.test(ua);
    // Edge 上有真实在线音色，默认用"云希(男声)"—— 与系统默认慧慧女声对比最明显
    if (isEdge) {
      return /yunxi/i;
    }
    // Windows 本地音色，默认"瑶瑶"是标准女声；如果希望默认男声，可以改成康康
    // 这里沿用历史行为：默认女声（瑶瑶）
    return /yaoyao/i;
  }

  // 在 refreshVoices 里替换原来的"默认瑶瑶"逻辑，改为智能默认
  // （保留原有 lastVoiceName 恢复优先）
  // —— 已内联到 refreshVoices 中（见下方）

  /* ---------- 音色诊断 ----------
   * 播放同一段文本两次，分别用两种候选发音人。如果用户听到是同一个声音，
   * 说明当前浏览器忽略了 utterance.voice 设置。
   */
  function diagnoseVoices() {
    if (!synth) {
      setDiag("当前浏览器不支持语音合成。", "fail");
      return;
    }
    var zhVoices = voices.filter(function (v) { return /^zh/i.test(v.lang); });
    if (zhVoices.length < 2) {
      setDiag("系统只提供了 " + zhVoices.length + " 个中文发音人，无法对比。", "warn");
      return;
    }
    // 选两个名字差异最大的中文发音人
    var a = zhVoices[0];
    var b = zhVoices.filter(function (v) { return v.name !== a.name; })[0];
    if (!b) {
      setDiag("所有中文发音人名字相同，无法对比。", "warn");
      return;
    }

    stop();
    synth.cancel();

    var msg = "正在诊断，请仔细听接下来的两段朗读是否音色不同（一段用「" + voiceLabel(a) + "」，一段用「" + voiceLabel(b) + "」）。";
    setDiag(msg + " …", "running");

    var step = 0;
    var text = "这是一段测试文字，用于对比两个发音人的音色差异。";

    function playStep(i) {
      var u = new SpeechSynthesisUtterance(text);
      u.voice = i;
      u.lang = i.lang;
      u.rate = 1.0;
      u.pitch = 1.0;
      u.volume = 1.0;
      u.onend = function () {
        if (step === 0) {
          step = 1;
          playStep(b);
        } else {
          // 两段都播完，等待 1.5 秒后给结论（避免用户还没听完就出结论）
          setTimeout(function () {
            // 判断：如果两个发音人的 name/lang/localService 完全相同，几乎肯定被合并
            var sameFingerprint = (a.name === b.name) && (a.lang === b.lang) && (a.localService === b.localService);
            if (sameFingerprint) {
              setDiag("两个发音人元数据完全相同，很可能被浏览器合并为同一声音。<b>请切换到 Microsoft Edge</b> 打开本页，可获得真正的多音色支持。", "fail");
            } else {
              // 元数据不同 —— 在正常浏览器里应该能区分
              setDiag("两段朗读分别用了「" + voiceLabel(a) + "」和「" + voiceLabel(b) + "」。如果你听到<b>两种不同的声音</b>，说明音色选择正常，可以关闭本页提示；如果<b>听起来是同一个声音</b>，说明当前浏览器忽略了发音人设置，请切换到 <b>Microsoft Edge</b> 或 Chrome/Firefox 桌面版。", "ok");
            }
          }, 1500);
        }
      };
      u.onerror = function (e) {
        if (e.error === "interrupted" || e.error === "canceled") return;
        setDiag("诊断朗读出错：" + e.error, "fail");
      };
      synth.speak(u);
    }
    playStep(a);
  }

  function setDiag(html, level) {
    var el = $("diagNotice");
    var r = $("diagResult");
    if (!el || !r) return;
    r.innerHTML = html;
    el.hidden = false;
    el.className = "notice" + (level === "fail" ? " fail" : (level === "warn" ? " warn" : ""));
  }

  // 诊断按钮
  if ($("btnDiag")) $("btnDiag").addEventListener("click", diagnoseVoices);
  if ($("btnDiagTip")) $("btnDiagTip").addEventListener("click", diagnoseVoices);

  charCount.textContent = textEl.value.length;
})();
