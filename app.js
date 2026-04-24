(function () {
  const STORAGE_KEY = "xhs-custom-words-v1";
  const AUTO_DETECT_DELAY = 220;
  const EXAMPLE_TEXT =
    "这款产品真的是全网第一，7天见效，快速瘦身没副作用。想拿资料可以加微信 vx：beauty8888，或者直接打 13800138000。现在做这个副业闭眼赚，月入过万不是问题。";

  const elements = {
    contentInput: document.getElementById("contentInput"),
    customWords: document.getElementById("customWords"),
    highlightBox: document.getElementById("highlightBox"),
    resultSwitcher: document.getElementById("resultSwitcher"),
    detailList: document.getElementById("detailList"),
    polishBox: document.getElementById("polishBox"),
    rewriteMeta: document.getElementById("rewriteMeta"),
    summaryGrid: document.getElementById("summaryGrid"),
    textCounter: document.getElementById("textCounter"),
    bankVersion: document.getElementById("bankVersion"),
    ruleCount: document.getElementById("ruleCount"),
    heroMeta: document.getElementById("heroMeta"),
    customHint: document.getElementById("customHint"),
    fillExample: document.getElementById("fillExample"),
    clearText: document.getElementById("clearText"),
    runPolish: document.getElementById("runPolish"),
    runCheck: document.getElementById("runCheck"),
    saveCustomWords: document.getElementById("saveCustomWords"),
    copyHits: document.getElementById("copyHits"),
    copyPolished: document.getElementById("copyPolished")
  };

  const state = {
    activeResultView: "detail",
    autoDetectTimer: null,
    syncingScroll: false
  };

  const EXACT_REPLACEMENTS = {
    "全网第一": "更受欢迎",
    "全国第一": "表现比较突出",
    "中国第一": "表现比较突出",
    "第一品牌": "较受欢迎",
    "销量第一": "销量表现较突出",
    "最佳": "更合适",
    "最好": "更适合",
    "最优": "更优选",
    "顶级": "高品质",
    "遥遥领先": "表现突出",
    "全网最低价": "价格有参考空间",
    "100%有效": "效果因人而异",
    "100 %有效": "效果因人而异",
    "无副作用": "体验感受因人而异",
    "零风险": "建议理性判断",
    "0风险": "建议理性判断",
    "月入过万": "有机会带来额外收入",
    "日入过千": "有机会获得收入",
    "加微信": "欢迎站内交流",
    "微信联系": "欢迎站内交流",
    "加微": "欢迎站内交流",
    "加v": "欢迎站内交流",
    "加vx": "欢迎站内交流",
    "微信号": "站内沟通方式",
    "QQ号": "站内沟通方式",
    "QQ群": "站内交流群",
    "vx": "站内交流",
    "私域": "站内咨询",
    "增强免疫力": "日常营养补充",
    "提高免疫力": "日常营养补充",
    "提升免疫力": "日常营养补充",
    "减肥": "饮食管理参考",
    "瘦身": "体态管理参考",
    "祛痘": "清洁护理",
    "美白祛斑": "提亮肤感",
    "淡斑": "匀净肤感",
    "防脱发": "头发护理",
    "改善睡眠": "睡前放松体验",
    "帮助睡眠": "睡前放松体验",
    "治疗": "护理",
    "医疗": "护理",
    "药用": "配方相关",
    "药物": "成分相关",
    "美白针": "相关项目",
    "水光针": "相关项目"
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

    const deduped = Array.from(
      new Map(
        matches.map((item) => [
          [
            item.start,
            item.end,
            item.categoryId,
            item.label,
            item.matchedText
          ].join(":"),
          item
        ])
      ).values()
    );

    return deduped.sort((left, right) => {
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
    return { text, customWords, matches };
  }

  function fallbackReplacement(match) {
    const { categoryId, matchedText } = match;

    if (EXACT_REPLACEMENTS[matchedText]) {
      return EXACT_REPLACEMENTS[matchedText];
    }

    if (categoryId === "absolute_terms") {
      if (/(第一|NO\.?1|TOP\.?1)/iu.test(matchedText)) {
        return "表现比较突出";
      }

      if (/(最低价|最便宜|亏本价)/u.test(matchedText)) {
        return "价格有参考空间";
      }

      if (/(首发|首创|首款|首个|首家)/u.test(matchedText)) {
        return "较早推出";
      }

      if (/(永久|唯一|独家|无敌|绝对|完美)/u.test(matchedText)) {
        return "更贴近实际体验";
      }

      if (matchedText === "最") {
        return "更";
      }

      return "表现不错";
    }

    if (categoryId === "medical_health") {
      if (/(安全|无痛)/u.test(matchedText)) {
        return "体验感受因人而异";
      }

      if (/(推荐官|体验官)/u.test(matchedText)) {
        return "体验分享";
      }

      if (/(针|注射|手术|治疗|医疗|医治|药)/u.test(matchedText)) {
        return "相关护理";
      }

      return "相关体验";
    }

    if (categoryId === "food_claims") {
      if (/(减肥|瘦身|减脂|塑形|塑身|瘦腿|瘦肚|减腹)/u.test(matchedText)) {
        return "体态管理参考";
      }

      if (/(免疫|抵抗力|记忆力)/u.test(matchedText)) {
        return "日常营养补充";
      }

      if (/(睡眠|失眠)/u.test(matchedText)) {
        return "睡前放松体验";
      }

      if (/(护肝|保肝|养肝|胃|肠道|通便|便秘|补血)/u.test(matchedText)) {
        return "日常饮食搭配";
      }

      return "日常营养搭配";
    }

    if (categoryId === "cosmetic_claims") {
      if (/(美白|斑|焕白|嫩白|增白|亮白|变白)/u.test(matchedText)) {
        return "提亮肤感";
      }

      if (/(育发|固发|防脱发|掉发|发量)/u.test(matchedText)) {
        return "头发护理";
      }

      if (/(除臭|异味|狐臭|腋臭)/u.test(matchedText)) {
        return "清新气味体验";
      }

      return "基础护理";
    }

    if (categoryId === "guarantee_terms") {
      if (/(退款|售后)/u.test(matchedText)) {
        return "具体售后以平台规则为准";
      }

      if (/(见效|生效|解决)/u.test(matchedText)) {
        return "感受因人而异";
      }

      if (/(无副作用|无风险|不反弹|不复发)/u.test(matchedText)) {
        return "建议结合个人情况判断";
      }

      return "具体情况因人而异";
    }

    if (categoryId === "finance_terms") {
      if (/(月入|日入|年入|收益|回报|升值)/u.test(matchedText)) {
        return "仅作经验分享";
      }

      return "理性判断";
    }

    if (categoryId === "contact_diversion") {
      if (/(淘宝|闲鱼|抖音|拼多多|京东|链接|外链|平台外)/u.test(matchedText)) {
        return "可在平台内继续了解";
      }

      return "欢迎站内交流";
    }

    if (categoryId === "gray_illegal") {
      return "合规信息";
    }

    if (categoryId === "superstition") {
      if (/(风水|算命|八字|塔罗|占卜|开光|佛牌)/u.test(matchedText)) {
        return "传统文化话题";
      }

      return "美好寓意";
    }

    return "更中性的表达";
  }

  function buildPolishResult(text, matches) {
    if (!text.trim()) {
      return {
        polishedText: "",
        appliedMatches: [],
        totalEdits: 0
      };
    }

    const appliedMatches = pickHighlightMatches(matches).map((match) => ({
      ...match,
      replacement: fallbackReplacement(match)
    }));

    let cursor = 0;
    const chunks = [];

    appliedMatches.forEach((match) => {
      chunks.push(text.slice(cursor, match.start));
      chunks.push(match.replacement);
      cursor = match.end;
    });

    chunks.push(text.slice(cursor));

    const polishedText = chunks
      .join("")
      .replace(/(欢迎站内交流|站内交流|站内沟通方式)\s*[:：]?\s*[a-zA-Z0-9_-]{3,}/gu, "欢迎站内交流")
      .replace(/(欢迎站内交流)\s+(站内交流|站内沟通方式)/gu, "$1")
      .replace(/(欢迎站内交流)\s*[，,]?\s*(欢迎站内交流)/gu, "$1")
      .replace(/\b1[3-9][0-9]{9}\b/gu, "欢迎站内交流")
      .replace(/(?:联系|加|咨询)\s*欢迎站内交流/gu, "欢迎站内交流")
      .replace(/或者\s*欢迎站内交流/gu, "欢迎站内交流")
      .replace(/(欢迎站内交流)\s*[，,]?\s*(欢迎站内交流)/gu, "$1")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s+([，。！？；：,.!?;:])/g, "$1")
      .replace(/([，。！？；：,.!?;:]){2,}/g, "$1")
      .trim();

    return {
      polishedText,
      appliedMatches,
      totalEdits: appliedMatches.length
    };
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
      elements.highlightBox.textContent = "暂无内容，请先输入正文并点击“开始检测”。";
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

  function setActiveResultView(view) {
    state.activeResultView = view;

    elements.resultSwitcher.querySelectorAll("[data-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view);
    });

    document.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.classList.toggle("is-hidden", panel.dataset.panel !== view);
    });
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
    requestAnimationFrame(() => {
      state.syncingScroll = false;
    });
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

  function renderPolish(text, matches) {
    if (!text.trim()) {
      elements.rewriteMeta.textContent = "还没有生成润色稿。";
      elements.polishBox.textContent = "暂无内容。";
      return;
    }

    const result = buildPolishResult(text, matches);

    if (!matches.length) {
      elements.rewriteMeta.textContent = "未发现明显违规词，原文已经比较稳妥。";
      elements.polishBox.textContent = text;
      return;
    }

    const uniqueCategories = new Set(result.appliedMatches.map((item) => item.categoryLabel)).size;
    elements.rewriteMeta.textContent = `已自动处理 ${result.totalEdits} 处命中，覆盖 ${uniqueCategories} 类风险。建议把这版当作草稿，再人工顺一遍语气。`;
    elements.polishBox.textContent = result.polishedText;
  }

  function detectNow() {
    const { text, matches } = getDetectionResult();

    renderSummary(matches);
    renderHighlights(text, matches);
    renderDetails(matches, text);
    renderPolish(text, matches);
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
      "支持原文高亮预览"
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

  function copyPolishedText() {
    const { text, matches } = getDetectionResult();
    const result = buildPolishResult(text, matches);

    if (!result.polishedText) {
      elements.customHint.textContent = "没有可复制的润色稿";
      return;
    }

    navigator.clipboard.writeText(result.polishedText).then(
      () => {
        elements.customHint.textContent = "润色稿已复制";
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
    elements.runPolish.addEventListener("click", () => {
      detectNow();
      setActiveResultView("polish");
    });
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
    elements.copyPolished.addEventListener("click", copyPolishedText);
    elements.resultSwitcher.addEventListener("click", (event) => {
      const target = event.target.closest("[data-view]");

      if (!target) {
        return;
      }

      setActiveResultView(target.dataset.view);
    });
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
    renderPolish("", []);
    setActiveResultView(state.activeResultView);
    bindEvents();
  }

  init();
})();
