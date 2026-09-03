/* yybb - 网页语音播报
 * 纯浏览器本地合成（Web Speech API），无需登录、无需后端。
 * 可选：启用 TTS 后端（如 edge-tts）获得真实多音色支持。
 * v1.8 新增：TTS 后端切换、后端朗读队列、后端音色列表
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
  var btnPreview = $("btnPreview");
  var btnRefreshVoices = $("btnRefreshVoices");
  var btnDiag = $("btnDiag");
  var btnDiagTip = $("btnDiagTip");
  var engineNotice = $("engineNotice");
  var diagNotice = $("diagNotice");
  var diagResult = $("diagResult");

  var synth = window.speechSynthesis;
  var voices = [];
  var lastVoiceName = "";  // 按名称记住所选音色
  var ttsBackendVoices = [];  // 后端返回的音色列表
  var sentences = [];
  var current = -1;
  var state = "idle";  // idle | playing | paused
  var previewing = false;

  // TTS 后端模式
  var useTtsBackend = false;
  var ttsBackendUrl = "http://127.0.0.1:8778";  // 默认后端地址
  var ttsBackendEnabled = false;  // 是否已启用

  var tipEl = $("tip");
  var tipTimer = null;
  var tipDefault = tipEl.textContent;

  /* ---------- 非阻塞提示 ---------- */
  function warn(msg) {
    tipEl.textContent = "⚠ " + msg;
    tipEl.style.color = "#d9534f";
    if (tipTimer) clearTimeout(tipTimer);
    tipTimer = setTimeout(function () {
      tipEl.textContent = tipDefault;
      tipEl.style.color = "";
    }, 8000);
  }

  /* ---------- 语言代码 → 中文名 ---------- */
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

  /* ---------- 音色标签 ---------- */
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

  // 浏览器音色标签
  function voiceLabelBrowser(v) {
    var cn = voiceCN(v);
    var lang = langCN(v.lang);
    var online = v.localService ? "" : " · 在线";
    if (cn) return cn[1] + "（" + cn[2] + "）· " + lang + online;
    return lang + " · " + v.name + online;
  }

  // 后端音色标签（TTS 后端返回的是 label，直接显示）
  function voiceLabelBackend(v) {
    return v.label || ("音色 " + v.value);
  }

  /* ---------- TTS 后端 API ---------- */
  async function fetchBackendVoices() {
    try {
      var resp = await fetch(ttsBackendUrl + "/api/voices");
      var data = await resp.json();
      if (data.ISOK && data.DATA) {
        ttsBackendVoices = data.DATA;
        return ttsBackendVoices;
      }
    } catch (e) {
      console.warn("获取后端音色列表失败:", e);
    }
    return [];
  }

  async function fetchTtsAudio(text, voiceType) {
    try {
      var resp = await fetch(ttsBackendUrl + "/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text, voice: voiceType })
      });
      var data = await resp.json();
      if (data.ISOK && data.DATA) {
        return data.DATA;  // base64 MP3
      }
      throw new Error(data.MESSAGE || "后端生成音频失败");
    } catch (e) {
      throw e;
    }
  }

  /* ---------- 音色列表刷新 ---------- */
  function refreshVoices() {
    if (useTtsBackend) {
      // TTS 后端模式
      fetchBackendVoices().then(function (voices) {
        if (!voices.length) {
          // 后端不可用，回退到浏览器模式
          useTtsBackend = false;
          refreshVoicesBrowser();
          return;
        }
        fillVoiceSelect(voices, voiceLabelBackend, true);
      });
    } else {
      refreshVoicesBrowser();
    }
  }

  function refreshVoicesBrowser() {
    voices = synth.getVoices();
    if (!voices.length) return;

    voices.sort(function (a, b) {
      function score(v) {
        var s = 0;
        if (/^zh/i.test(v.lang)) s -= 100;
        if (v.localService) s -= 5;
        if (/Google|Xiaoxiao|Yaoyao|Kangkang|Ting/i.test(v.name)) s -= 2;
        return s;
      }
      return score(a) - score(b);
    });

    fillVoiceSelect(voices, voiceLabelBrowser, false);
  }

  function fillVoiceSelect(items, labelFn, isBackend) {
    var sel = voiceEl;
    sel.innerHTML = "";
    items.forEach(function (v, i) {
      var opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = labelFn(v);
      sel.appendChild(opt);
    });
    restoreVoiceSelection(sel, items, isBackend);
    updateEngineNotice(isBackend);
  }

  function restoreVoiceSelection(sel, items, isBackend) {
    var restored = "";
    if (lastVoiceName) {
      for (var i = 0; i < items.length; i++) {
        var name = isBackend ? items[i].label : items[i].name;
        if (name === lastVoiceName) { sel.value = String(i); restored = sel.value; break; }
      }
    }
    if (!restored) {
      var smartPat = pickSmartDefault(isBackend);
      for (var j = 0; j < items.length; j++) {
        var itemName = isBackend ? items[j].label : items[j].name;
        if (smartPat && smartPat.test(itemName)) { sel.value = String(j); break; }
      }
    }
    if (!restored && !sel.value && items.length) sel.value = "0";
  }

  function updateEngineNotice(isBackend) {
    if (!engineNotice) return;
    // 后端模式下，不显示浏览器限制提示
    if (isBackend) {
      engineNotice.hidden = true;
      return;
    }
    // 浏览器模式下的限制提示
    var isEdge = /Edg\//.test(navigator.userAgent);
    var isWin = /Windows/.test(navigator.userAgent);
    var zhLocalCount = voices.filter(function (v) {
      return /^zh/i.test(v.lang) && v.localService;
    }).length;
    engineNotice.hidden = !(isWin && !isEdge && zhLocalCount > 1);
  }

  /* ---------- 智能默认发音人 ---------- */
  function pickSmartDefault(isBackend) {
    if (isBackend) {
      // TTS 后端默认第一个音色（亲和女声）
      return null;
    }
    var ua = navigator.userAgent;
    var isEdge = /Edg\//.test(ua);
    if (isEdge) {
      return /yunxi/i;  // Edge 默认云希男声
    }
    return /yaoyao/i;  // 其他浏览器默认瑶瑶
  }

  function getVoice() {
    var i = parseInt(voiceEl.value, 10);
    if (isNaN(i)) return null;
    if (useTtsBackend) {
      return ttsBackendVoices[i] || null;
    }
    return voices[i] || null;
  }

  /* ---------- 文本切分 ---------- */
  var MAX_LEN = 110;

  function splitKeepDelim(text, delims) {
    var re = new RegExp("[^" + delims + "]*[" + delims + "]+|[^" + delims + "]+$", "g");
    return text.match(re) || [];
  }

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

  /* ---------- TTS 后端朗读队列 ---------- */
  var ttsQueue = [];
  var ttsPlaying = false;
  var ttsAudioEl = null;

  function initTtsAudio() {
    if (!ttsAudioEl) {
      ttsAudioEl = new Audio();
      ttsAudioEl.addEventListener("ended", ttsNext);
    }
    return ttsAudioEl;
  }

  function ttsSpeakNext() {
    if (state !== "playing") return;
    if (ttsQueue.length === 0) {
      stop();
      return;
    }
    var text = ttsQueue.shift();
    current++;
    markSentence();
    var voiceType = parseInt(voiceEl.value, 10) || 0;

    fetchTtsAudio(text, voiceType).then(function (b64) {
      var audio = initTtsAudio();
      audio.src = "data:audio/mpeg;base64," + b64;
      audio.play();
    }).catch(function (e) {
      console.warn("TTS 生成失败:", e);
      ttsSpeakNext();  // 跳过失败的句子
    });
  }

  function ttsNext() {
    if (state === "playing") {
      ttsSpeakNext();
    }
  }

  /* ---------- 浏览器朗读队列 ---------- */
  function speakIndex(i) {
    var u = new SpeechSynthesisUtterance(sentences[i]);
    var v = getVoice();
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    u.rate = parseFloat(rateEl.value);
    u.pitch = parseFloat(pitchEl.value);
    u.volume = parseFloat(volumeEl.value);
    u.onstart = function () { current = i; markSentence(); };
    u.onend = function () {
      if (state !== "playing") return;
      if (i + 1 < sentences.length) {
        speakIndex(i + 1);
      } else {
        stop();
      }
    };
    u.onerror = function (e) {
      if (e.error === "interrupted" || e.error === "canceled") return;
      console.warn("朗读出错：", e.error);
      stop();
    };
    synth.speak(u);
  }

  /* ---------- 渲染脚本 ---------- */
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

  /* ---------- 播放控制 ---------- */
  function playFrom(i) {
    var text = textEl.value.trim();
    if (!text) { textEl.focus(); return; }

    sentences = splitSentences(text);
    if (!sentences.length) return;
    renderScript();

    previewing = false;
    setPreviewBtn("▶ 试听");

    if (useTtsBackend) {
      // TTS 后端模式
      ttsQueue = sentences.slice(i);
      ttsSpeaking = true;
      state = "playing";
      setButtons();
      ttsSpeakNext();
    } else {
      // 浏览器模式
      if (!synth) { alert("当前浏览器不支持语音合成，请使用 Edge / Chrome / Safari。"); return; }

      var v0 = getVoice();
      if (v0 && /[\u4e00-\u9fff]/.test(text) && !/^zh/i.test(v0.lang)) {
        warn("当前发音人「" + voiceLabelBrowser(v0) + "」不支持中文，请在\"发音人\"中选择标注为中文（简体）的音色。");
      }

      synth.cancel();
      state = "playing";
      setButtons();
      speakIndex(i);
    }
  }

  function stop() {
    state = "idle";
    current = -1;
    previewing = false;
    ttsSpeaking = false;
    ttsQueue = [];
    setPreviewBtn("▶ 试听");
    if (synth) synth.cancel();
    if (ttsAudioEl) { ttsAudioEl.pause(); ttsAudioEl.src = ""; }
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
    if (btnPreview) btnPreview.textContent = text;
  }

  /* ---------- 试听 ---------- */
  btnPreview.addEventListener("click", function () {
    var text = textEl.value.trim();
    if (!text) { textEl.focus(); return; }

    if (previewing && state === "playing") {
      // 暂停
      if (useTtsBackend) {
        if (ttsAudioEl) ttsAudioEl.pause();
        state = "paused";
      } else {
        if (synth) synth.pause();
        state = "paused";
      }
      setPreviewBtn("▶ 继续");
      return;
    }
    if (previewing && state === "paused") {
      // 继续
      if (useTtsBackend) {
        if (ttsAudioEl) ttsAudioEl.play();
        state = "playing";
      } else {
        if (synth) synth.resume();
        state = "playing";
      }
      setPreviewBtn("⏸ 暂停");
      return;
    }

    // 新试听
    stop();
    previewing = true;

    if (useTtsBackend) {
      var previewText = "你好，我是" + (voiceLabelBackend(getVoice()) || "默认") + "，很高兴为你播报。";
      var voiceType = parseInt(voiceEl.value, 10) || 0;
      fetchTtsAudio(previewText, voiceType).then(function (b64) {
        var audio = initTtsAudio();
        audio.src = "data:audio/mpeg;base64," + b64;
        audio.play();
        setPreviewBtn("⏸ 暂停");
      }).catch(function (e) {
        console.warn("预览失败:", e);
        setPreviewBtn("▶ 试听");
      });
    } else {
      if (!synth) { alert("当前浏览器不支持语音合成，请使用 Edge / Chrome / Safari。"); return; }
      var v = getVoice();
      var u = new SpeechSynthesisUtterance("你好，我是" + (v ? voiceLabelBrowser(v) : "默认") + "，很高兴为你播报。");
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
    }
  });

  /* ---------- 暂停/继续/停止 ---------- */
  btnPlay.addEventListener("click", function () { playFrom(0); });

  btnPause.addEventListener("click", function () {
    if (state === "playing") {
      if (useTtsBackend) {
        if (ttsAudioEl) ttsAudioEl.pause();
      } else {
        if (synth) synth.pause();
      }
      state = "paused";
    } else if (state === "paused") {
      if (useTtsBackend) {
        if (ttsAudioEl) ttsAudioEl.play();
      } else {
        if (synth) synth.resume();
      }
      state = "playing";
    }
    setButtons();
  });

  btnStop.addEventListener("click", stop);

  /* ---------- 切换 TTS 后端 ---------- */
  var btnSwitchBackend = $("btnSwitchBackend");
  if (btnSwitchBackend) {
    btnSwitchBackend.addEventListener("click", async function () {
      if (!useTtsBackend) {
        // 尝试启用后端
        var voices = await fetchBackendVoices();
        if (voices.length) {
          useTtsBackend = true;
          ttsBackendEnabled = true;
          btnSwitchBackend.textContent = "🔌 切换为浏览器合成";
          btnSwitchBackend.className = "btn ghost small";
          voiceEl.disabled = false;
          refreshVoices();
          updateEngineNotice(true);
          warn("已切换到 TTS 后端（" + ttsBackendUrl + "），音色由边缘 TTS 生成");
        } else {
          warn("TTS 后端不可用，已回退到浏览器合成");
        }
      } else {
        // 切换回浏览器
        useTtsBackend = false;
        ttsBackendEnabled = false;
        btnSwitchBackend.textContent = "🔌 切换为 TTS 后端";
        btnSwitchBackend.className = "btn primary small";
        voiceEl.disabled = false;
        refreshVoices();
        warn("已切换回浏览器合成");
      }
    });
  }

  /* ---------- 其他事件 ---------- */
  btnRefreshVoices.addEventListener("click", refreshVoices);

  voiceEl.addEventListener("change", function () {
    var v = getVoice();
    if (v) lastVoiceName = v.label || v.name;
  });

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

  window.addEventListener("beforeunload", function () {
    if (synth) synth.cancel();
    if (ttsAudioEl) { ttsAudioEl.pause(); ttsAudioEl.src = ""; }
  });

  /* ---------- 音色诊断 ---------- */
  function diagnoseVoices() {
    if (useTtsBackend) {
      // TTS 后端模式：播放两种音色对比
      if (ttsBackendVoices.length < 2) {
        setDiag("后端只返回了 " + ttsBackendVoices.length + " 种音色，无法对比。", "warn");
        return;
      }
      var a = ttsBackendVoices[0];
      var b = ttsBackendVoices[1];
      setDiag("正在诊断，播放「" + a.label + "」和「" + b.label + "」各一段测试文字，请听是否不同。", "running");

      var step = 0;
      var text = "这是一段测试文字，用于对比两个发音人的音色差异。";

      function playVoice(voice) {
        var voiceType = voice.value;
        fetchTtsAudio(text, voiceType).then(function (b64) {
          var audio = initTtsAudio();
          audio.src = "data:audio/mpeg;base64," + b64;
          audio.onended = function () {
            step++;
            if (step === 1) {
              playVoice(b);
            } else {
              setDiag("已播放「" + a.label + "」和「" + b.label + "」。如果听到不同声音，说明后端正常；如果相同，请检查后端配置。", "ok");
            }
          };
          audio.play();
        }).catch(function (e) {
          setDiag("诊断出错：" + e.message, "fail");
        });
      }
      playVoice(a);
    } else {
      // 浏览器模式
      if (!synth) {
        setDiag("当前浏览器不支持语音合成。", "fail");
        return;
      }
      var zhVoices = voices.filter(function (v) { return /^zh/i.test(v.lang); });
      if (zhVoices.length < 2) {
        setDiag("系统只提供了 " + zhVoices.length + " 个中文发音人，无法对比。", "warn");
        return;
      }
      var a = zhVoices[0];
      var b = zhVoices.filter(function (v) { return v.name !== a.name; })[0];
      if (!b) {
        setDiag("所有中文发音人名字相同，无法对比。", "warn");
        return;
      }

      stop();
      synth.cancel();

      var msg = "正在诊断，请仔细听接下来的两段朗读是否音色不同（一段用「" + voiceLabelBrowser(a) + "」，一段用「" + voiceLabelBrowser(b) + "」）。";
      setDiag(msg + " …", "running");

      var step = 0;
      var text = "这是一段测试文字，用于对比两个发音人的音色差异。";

      function playStep(voice) {
        var u = new SpeechSynthesisUtterance(text);
        u.voice = voice;
        u.lang = voice.lang;
        u.rate = 1.0;
        u.pitch = 1.0;
        u.volume = 1.0;
        u.onend = function () {
          if (step === 0) {
            step = 1;
            playStep(b);
          } else {
            setTimeout(function () {
              var sameFingerprint = (a.name === b.name) && (a.lang === b.lang) && (a.localService === b.localService);
              if (sameFingerprint) {
                setDiag("两个发音人元数据完全相同，很可能被浏览器合并为同一声音。<b>请切换到 Microsoft Edge</b> 打开本页。", "fail");
              } else {
                setDiag("两段朗读分别用了「" + voiceLabelBrowser(a) + "」和「" + voiceLabelBrowser(b) + "」。如果你听到<b>两种不同的声音</b>，说明音色选择正常；如果<b>听起来是同一个声音</b>，说明当前浏览器忽略了发音人设置，请切换到 <b>Microsoft Edge</b> 或 Chrome/Firefox 桌面版。", "ok");
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
  }

  function setDiag(html, level) {
    if (!diagNotice || !diagResult) return;
    diagResult.innerHTML = html;
    diagNotice.hidden = false;
    diagNotice.className = "notice" + (level === "fail" ? " fail" : (level === "warn" ? " warn" : ""));
  }

  if (btnDiag) btnDiag.addEventListener("click", diagnoseVoices);
  if (btnDiagTip) btnDiagTip.addEventListener("click", diagnoseVoices);

  /* ---------- 初始化 ---------- */
  if (synth) {
    refreshVoices();
    synth.onvoiceschanged = refreshVoices;
    [400, 1200, 2500].forEach(function (t) { setTimeout(refreshVoices, t); });
  }

  charCount.textContent = textEl.value.length;
})();
