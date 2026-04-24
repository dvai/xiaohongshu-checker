(function () {
  const STORAGE_KEY = "xhs-custom-words-v1";
  const AUTO_DETECT_DELAY = 220;
  const EXAMPLE_TEXT =
    "这款产品真的是全网第一，7天见效，快速瘦身没副作用。想拿资料可以加微信 vx：beauty8888，或者直接打 13800138000。现在做这个副业闭眼赚，月入过万不是问题。";

  const elements = {
    contentInput: document.getElementById("contentInput"),
    customWords: document.getElementById("customWords"),
    highlightBox: document.getElementById("highlightBox"),
    detailList: document.getElementById("detailList"),
    summaryGrid: document.getElementById("summaryGrid"),
    textCounter: document.getElementById("textCounter"),
    bankVersion: document.getElementById("bankVersion"),
    ruleCount: document.getElementById("ruleCount"),
    heroMeta: document.getElementById("heroMeta"),
    customHint: document.getElementById("customHint"),
    fillExample: document.getElementById("fillExample"),
    clearText: document.getElementById("clearText"),
    runCheck: document.getElementById("runCheck"),
    saveCustomWords: document.getElementById("saveCustomWords"),
    copyHits: document.getElementById("copyHits")
  };

  const state = {
    autoDetectTimer: null,
    syncingScroll: false
  };

  function escapeHtml(value) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function severityWeight(severity) {
    return { high: 3, medium: 2, low: 1 }[severity] || 1;
  }

  function severityLabel(severity) {
    return { high: "高风险", medium: "中风险", low: "低风险" }[severity] || "提示";
  }

  function normalizeCustomWords(rawValue) {
    return Array.from(
      new Set(
        rawValue
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
  }

  function loadCustomWords() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      return [];
    }
  }

  function saveCustomWords() {
    const words = normalizeCustomWords(elements.customWords.value);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
    elements.customWords.value = words.join("\n");
    elements.customHint.textContent = `已保存 ${words.length} 个自定义词`;
    return words;
  }

  function buildRules(customWords) {
    const rules = [];

    window.WORD_BANK.categories.forEach((category) => {
      category.keywords.forEach((keyword) => {
        rules.push({
          source: "keyword",
          label: keyword,
          categoryId: category.id,
          categoryLabel: category.label,
          severity: category.severity,
          suggestion: category.suggestion,
          regex: new RegExp(escapeRegex(keyword), "giu")
        });
      });

      category.patterns.forEach((patternItem) => {
        rules.push({
          source: "pattern",
          label: patternItem.label || patternItem.pattern,
          categoryId: category.id,
          categoryLabel: category.label,
          severity: patternItem.severity || category.severity,
          suggestion: patternItem.suggestion || category.suggestion,
          regex: new RegExp(patternItem.pattern, patternItem.flags || "giu")
        });
      });
    });

    customWords.forEach((word) => {
      rules.push({
        source: "custom",
        label: word,
        categoryId: "custom_words",
        categoryLabel: "自定义词库",
        severity: "medium",
        suggestion: "这是你自己补充的风险词，请结合具体上下文手动调整。",
        regex: new RegExp(escapeRegex(word), "giu")
      });
    });

    return rules;
  }

  function runDetection(text, customWords) {
    const matches = [];
    const rules = buildRules(customWords);

    rules.forEach((rule) => {
      const regex = new RegExp(rule.regex.source, rule.regex.flags);
      let match = regex.exec(text);

      while (match) {
        const matchedText = match[0];

        if (!matchedText) {
          regex.lastIndex += 1;
          match = regex.exec(text);
          continue;
        }

        matches.push({
          label: rule.label,
          source: rule.source,
          categoryId: rule.categoryId,
          categoryLabel: rule.categoryLabel,
          severity: rule.severity,
          suggestion: rule.suggestion,
          start: match.index,
          end: match.index + matchedText.length,
          matchedText
        });

        if (regex.lastIndex === match.index) {
          regex.lastIndex += 1;
        }

        match = regex.exec(text);
      }
    });

    return Array.from(
      new Map(
        matches.map((item) => [
          [item.start, item.end, item.categoryId, item.label, item.matchedText].join(":"),
          item
        ])
      ).values()
    ).sort((left, right) => {
      if (left.start !== right.start) {
        return left.start - right.start;
      }

      if (left.end !== right.end) {
        return right.end - left.end;
      }

      return severityWeight(right.severity) - severityWeight(left.severity);
    });
  }

  function pickHighlightMatches(matches) {
    const chosen = [];
    let cursor = -1;

    matches.forEach((match) => {
      if (match.start >= cursor) {
        chosen.push(match);
        cursor = match.end;
      }
    });

    return chosen;
  }

  function getSnippet(text, start, end) {
    const prefix = Math.max(0, start - 14);
    const suffix = Math.min(text.length, end + 14);
    const before = text.slice(prefix, start).trimStart();
    const hit = text.slice(start, end);
    const after = text.slice(end, suffix).trimEnd();
    return `${before}${hit}${after}`;
  }

  function groupMatches(matches, text) {
    const grouped = new Map();

    matches.forEach((match) => {
      const key = [match.categoryId, match.matchedText, match.label].join("::");

      if (!grouped.has(key)) {
        grouped.set(key, {
          ...match,
          count: 1,
          snippet: getSnippet(text, match.start, match.end)
        });
        return;
      }

      grouped.get(key).count += 1;
    });

    return Array.from(grouped.values()).sort((left, right) => {
      if (severityWeight(right.severity) !== severityWeight(left.severity)) {
        return severityWeight(right.severity) - severityWeight(left.severity);
      }

      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.start - right.start;
    });
  }

  function getDetectionResult() {
    const text = elements.contentInput.value;
    const customWords = normalizeCustomWords(elements.customWords.value);
    const matches = runDetection(text, customWords);
    return { text, matches };
  }

  function renderSummary(matches) {
    const categoryCount = new Set(matches.map((item) => item.categoryId)).size;
    const highCount = matches.filter((item) => item.severity === "high").length;
    const mediumCount = matches.filter((item) => item.severity === "medium").length;
    const riskLevel = highCount > 0 ? "高风险" : mediumCount > 0 ? "中风险" : matches.length > 0 ? "低风险" : "通过";

    const cards = [
      {
        title: "整体结论",
        value: riskLevel,
        caption: highCount > 0 ? "建议优先处理高风险词" : "未发现明显高风险词"
      },
      {
        title: "命中次数",
        value: String(matches.length),
        caption: "同一词重复出现会重复计数"
      },
      {
        title: "命中分类",
        value: String(categoryCount),
        caption: "涉及的规则分类数量"
      },
      {
        title: "高风险命中",
        value: String(highCount),
        caption: "导流、疗效、违法等优先改"
      }
    ];

    elements.summaryGrid.innerHTML = cards
      .map(
        (card) => `
          <article class="summary-card">
            <span>${escapeHtml(card.title)}</span>
            <strong>${escapeHtml(card.value)}</strong>
            <span>${escapeHtml(card.caption)}</span>
          </article>
        `
      )
      .join("");
  }

  function renderHighlights(text, matches) {
    if (!text.trim()) {
      elements.highlightBox.textContent = "暂无内容，请先输入正文并点击“立即检测”。";
      return;
    }

    if (!matches.length) {
      elements.highlightBox.textContent = "未发现明显违规词，可以继续人工复核语气、夸大描述和导流表达。";
      return;
    }

    const visibleMatches = pickHighlightMatches(matches);
    let cursor = 0;
    const chunks = [];

    visibleMatches.forEach((match) => {
      chunks.push(escapeHtml(text.slice(cursor, match.start)));
      chunks.push(
        `<mark class="hit ${match.severity}">${escapeHtml(
          text.slice(match.start, match.end)
        )}</mark>`
      );
      cursor = match.end;
    });

    chunks.push(escapeHtml(text.slice(cursor)));
    elements.highlightBox.innerHTML = chunks.join("");
  }

  function renderDetails(matches, text) {
    if (!matches.length) {
      elements.detailList.innerHTML = '<div class="empty-state">未发现明显违规词。</div>';
      return;
    }

    const groups = groupMatches(matches, text);

    elements.detailList.innerHTML = groups
      .map(
        (item) => `
          <article class="detail-item">
            <div class="detail-item-head">
              <div>
                <h3>${escapeHtml(item.matchedText)}</h3>
                <div class="detail-meta">
                  <span class="risk-badge ${item.severity}">${escapeHtml(
                    severityLabel(item.severity)
                  )}</span>
                  <span class="tag">${escapeHtml(item.categoryLabel)}</span>
                  <span class="tag">命中 ${item.count} 次</span>
                  <span class="tag">${
                    item.source === "pattern" ? "规则匹配" : item.source === "custom" ? "自定义词" : "关键词"
                  }</span>
                </div>
              </div>
            </div>
            <p>${escapeHtml(item.suggestion)}</p>
            <span class="detail-sample">${escapeHtml(item.snippet)}</span>
          </article>
        `
      )
      .join("");
  }

  function syncScrollBetween(source, target) {
    if (state.syncingScroll) {
      return;
    }

    const sourceMax = source.scrollHeight - source.clientHeight;
    const targetMax = target.scrollHeight - target.clientHeight;

    if (sourceMax <= 0 || targetMax <= 0) {
      target.scrollTop = 0;
      return;
    }

    state.syncingScroll = true;
    target.scrollTop = (source.scrollTop / sourceMax) * targetMax;
    const releaseSync =
      window.requestAnimationFrame ||
      function (callback) {
        return window.setTimeout(callback, 16);
      };
    releaseSync(() => {
      state.syncingScroll = false;
    });
  }

  function detectNow() {
    const { text, matches } = getDetectionResult();
    renderSummary(matches);
    renderHighlights(text, matches);
    renderDetails(matches, text);
    syncScrollBetween(elements.contentInput, elements.highlightBox);
  }

  function scheduleDetect() {
    window.clearTimeout(state.autoDetectTimer);
    state.autoDetectTimer = window.setTimeout(detectNow, AUTO_DETECT_DELAY);
  }

  function updateTextCounter() {
    elements.textCounter.textContent = `${elements.contentInput.value.length} 字`;
  }

  function renderMeta() {
    const categoryCount = window.WORD_BANK.categories.length;
    const keywordCount = window.WORD_BANK.categories.reduce(
      (total, category) => total + category.keywords.length + category.patterns.length,
      0
    );

    elements.bankVersion.textContent = window.WORD_BANK.version;
    elements.ruleCount.textContent = String(keywordCount);
    elements.heroMeta.innerHTML = [
      `词库分类 ${categoryCount} 类`,
      `基础规则 ${keywordCount} 条`,
      "支持自定义词库",
      "支持左右对照预览"
    ]
      .map((item) => `<span class="meta-pill">${escapeHtml(item)}</span>`)
      .join("");
  }

  function copyHitWords() {
    const { text, matches } = getDetectionResult();
    const grouped = groupMatches(matches, text);
    const payload = grouped.map((item) => `${item.matchedText}｜${item.categoryLabel}`).join("\n");

    if (!payload) {
      elements.customHint.textContent = "没有可复制的命中词";
      return;
    }

    navigator.clipboard.writeText(payload).then(
      () => {
        elements.customHint.textContent = "命中词已复制";
      },
      () => {
        elements.customHint.textContent = "复制失败，请手动复制";
      }
    );
  }

  function bindEvents() {
    elements.contentInput.addEventListener("input", () => {
      updateTextCounter();
      scheduleDetect();
    });
    elements.contentInput.addEventListener("scroll", () => {
      syncScrollBetween(elements.contentInput, elements.highlightBox);
    });
    elements.highlightBox.addEventListener("scroll", () => {
      syncScrollBetween(elements.highlightBox, elements.contentInput);
    });
    elements.runCheck.addEventListener("click", detectNow);
    elements.fillExample.addEventListener("click", () => {
      elements.contentInput.value = EXAMPLE_TEXT;
      updateTextCounter();
      detectNow();
    });
    elements.clearText.addEventListener("click", () => {
      elements.contentInput.value = "";
      updateTextCounter();
      detectNow();
    });
    elements.saveCustomWords.addEventListener("click", () => {
      saveCustomWords();
      detectNow();
    });
    elements.copyHits.addEventListener("click", copyHitWords);
  }

  function init() {
    const customWords = loadCustomWords();
    elements.customWords.value = customWords.join("\n");
    elements.customHint.textContent = customWords.length
      ? `已加载 ${customWords.length} 个自定义词`
      : "未保存";

    renderMeta();
    renderSummary([]);
    updateTextCounter();
    bindEvents();
  }

  init();
})();
