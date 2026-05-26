(function () {
  const $ = (id) => document.getElementById(id);

  const form = $("usage-form");
  const statusBox = $("status");
  const baseUrlInput = $("base-url");
  const keyInput = $("api-key");
  const daysInput = $("days");
  const timezoneInput = $("timezone");
  const startDateInput = $("start-date");
  const endDateInput = $("end-date");
  const themeInput = $("theme");
  const demoButton = $("demo");
  const isLocalFile = location.protocol === "file:";
  const themeStorageKey = "key-usage-lookup-theme";

  function setStatus(message, type) {
    statusBox.textContent = message;
    statusBox.className = "status" + (type ? " " + type : "");
  }

  function defaultBaseUrl() {
    if (location.protocol === "http:" || location.protocol === "https:") {
      const path = location.pathname || "/";
      const slash = path.lastIndexOf("/");
      const parent = slash > 0 ? path.slice(0, slash) : "";
      return location.origin + parent;
    }
    return "https://mckameila.xyz";
  }

  function getInitialAPIKey() {
    const params = new URLSearchParams(location.search);
    return (
      params.get("apikey") ||
      params.get("api_key") ||
      params.get("key") ||
      params.get("token") ||
      ""
    ).trim();
  }

  function fmtNumber(value) {
    const n = Number(value || 0);
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(n);
  }

  function fmtUsd(value) {
    const n = Number(value || 0);
    return "$" + n.toFixed(n >= 1 ? 4 : 6).replace(/0+$/, "").replace(/\.$/, "");
  }

  function fmtDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString("zh-CN");
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pct(used, limit) {
    const u = Number(used || 0);
    const l = Number(limit || 0);
    if (l <= 0) return 0;
    return Math.min(100, Math.max(0, (u / l) * 100));
  }

  function applyTheme(theme) {
    const next = theme === "light" || theme === "dark" ? theme : "auto";
    if (next === "auto") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", next);
    }
    themeInput.value = next;
    try {
      localStorage.setItem(themeStorageKey, next);
    } catch (err) {
      // localStorage can be unavailable in strict privacy modes.
    }
  }

  function initialTheme() {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get("theme");
    if (fromUrl === "light" || fromUrl === "dark" || fromUrl === "auto") return fromUrl;
    try {
      const stored = localStorage.getItem(themeStorageKey);
      if (stored === "light" || stored === "dark" || stored === "auto") return stored;
    } catch (err) {
      // Keep the default when storage is blocked.
    }
    return "auto";
  }

  function buildUrl() {
    const base = baseUrlInput.value.trim().replace(/\/+$/, "");
    const params = new URLSearchParams();
    params.set("days", daysInput.value || "7");
    if (timezoneInput.value.trim()) params.set("timezone", timezoneInput.value.trim());
    if (startDateInput.value) params.set("start_date", startDateInput.value);
    if (endDateInput.value) params.set("end_date", endDateInput.value);
    return base + "/v1/usage?" + params.toString();
  }

  function rangeLabel() {
    const days = Number(daysInput.value || 7);
    if (days === 1) return "最近 1 天";
    return "最近 " + days + " 天";
  }

  function renderBadges(data) {
    const badges = $("badges");
    badges.innerHTML = "";
    const entries = [
      [data.isValid ? "有效" : "无效", data.isValid ? "ok" : "warn"],
      [data.status || "unknown", data.status === "active" ? "ok" : "warn"],
      [data.mode || "unknown", ""]
    ];
    for (const [text, cls] of entries) {
      const span = document.createElement("span");
      span.className = "badge" + (cls ? " " + cls : "");
      span.textContent = text;
      badges.appendChild(span);
    }
  }

  function renderSummary(data) {
    $("summary-title").textContent = data.status ? "Key 状态：" + data.status : "用量已加载";
    $("summary-subtitle").textContent = "模式：" + (data.mode || "-") + " · 单位：" + (data.unit || "USD");

    const usage = data.usage || {};
    const today = usage.today || {};
    const total = usage.total || {};
    const stats = [
      ["今日请求", fmtNumber(today.requests)],
      ["今日 Tokens", fmtNumber(today.total_tokens)],
      ["今日费用", fmtUsd(today.actual_cost)],
      ["累计费用", fmtUsd(total.actual_cost)]
    ];

    $("stats").innerHTML = stats.map(([label, value]) => (
      '<div class="stat"><div class="label">' + esc(label) + '</div><div class="value">' + esc(value) + '</div></div>'
    )).join("");
    renderBadges(data);
  }

  function sumDailyUsage(rows) {
    return rows.reduce((total, row) => {
      total.requests += Number(row.requests || 0);
      total.total_tokens += Number(row.total_tokens || 0);
      total.input_tokens += Number(row.input_tokens || 0);
      total.output_tokens += Number(row.output_tokens || 0);
      total.cache_read_tokens += Number(row.cache_read_tokens || 0);
      total.cache_write_tokens += Number(row.cache_write_tokens || row.cache_creation_tokens || 0);
      total.actual_cost += Number(row.actual_cost || 0);
      total.cost += Number(row.cost || 0);
      return total;
    }, {
      requests: 0,
      total_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      actual_cost: 0,
      cost: 0
    });
  }

  function renderRangeStats(data) {
    const rows = Array.isArray(data.daily_usage) ? data.daily_usage : [];
    const days = Math.max(1, Number(daysInput.value || 7));
    $("range-title").textContent = rangeLabel() + "统计";
    if (!rows.length) {
      $("range-subtitle").textContent = "当前响应没有返回每日用量明细。";
      $("range-stats").innerHTML = [
        ["范围请求", "-"],
        ["范围 Tokens", "-"],
        ["范围费用", "-"],
        ["日均请求", "-"]
      ].map(([label, value]) => (
        '<div class="stat"><div class="label">' + esc(label) + '</div><div class="value">' + esc(value) + '</div></div>'
      )).join("");
      return;
    }

    const total = sumDailyUsage(rows);
    const actualDays = rows.length;
    $("range-subtitle").textContent = "基于接口返回的 " + actualDays + " 条每日记录汇总。";
    const stats = [
      ["范围请求", fmtNumber(total.requests)],
      ["范围 Tokens", fmtNumber(total.total_tokens)],
      ["范围费用", fmtUsd(total.actual_cost)],
      ["日均请求", fmtNumber(total.requests / days)]
    ];

    $("range-stats").innerHTML = stats.map(([label, value]) => (
      '<div class="stat"><div class="label">' + esc(label) + '</div><div class="value">' + esc(value) + '</div></div>'
    )).join("");
  }

  function renderRateLimits(data) {
    const target = $("rate-limits");
    const rows = Array.isArray(data.rate_limits) ? data.rate_limits : [];
    if (!rows.length) {
      target.className = "empty";
      target.textContent = "暂无限速数据。";
      return;
    }
    target.className = "rate-list";
    target.innerHTML =
      rows.map((row) => {
        const width = pct(row.used, row.limit).toFixed(2);
        return '<div class="rate-row">' +
          '<div class="rate-window">' + esc(row.window || "-") + '</div>' +
          '<div class="rate-main">' +
            '<div class="rate-usage"><span>' + fmtUsd(row.used) + ' / ' + fmtUsd(row.limit) + '</span><span class="rate-remaining">剩余 ' + fmtUsd(row.remaining) + '</span></div>' +
            '<div class="meter"><span style="width:' + width + '%"></span></div>' +
          '</div>' +
          '<div class="rate-reset">重置<br>' + esc(fmtDate(row.reset_at)) + '</div>' +
        '</div>';
      }).join("");
  }

  function renderQuota(data) {
    const target = $("quota");
    const quota = data.quota;
    const subscription = data.subscription;
    if (quota) {
      target.className = "";
      const width = pct(quota.used, quota.limit).toFixed(2);
      target.innerHTML = '<table><tbody>' +
        '<tr><th>总额度</th><td class="num">' + fmtUsd(quota.limit) + '</td></tr>' +
        '<tr><th>已用</th><td class="num">' + fmtUsd(quota.used) + '</td></tr>' +
        '<tr><th>剩余</th><td class="num">' + fmtUsd(quota.remaining) + '</td></tr>' +
        '<tr><th>进度</th><td><div class="meter"><span style="width:' + width + '%"></span></div></td></tr>' +
      '</tbody></table>';
      return;
    }
    if (subscription) {
      target.className = "";
      target.innerHTML = '<table><tbody>' +
        '<tr><th>日额度</th><td class="num">' + fmtUsd(subscription.daily_usage_usd) + ' / ' + fmtUsd(subscription.daily_limit_usd) + '</td></tr>' +
        '<tr><th>周额度</th><td class="num">' + fmtUsd(subscription.weekly_usage_usd) + ' / ' + fmtUsd(subscription.weekly_limit_usd) + '</td></tr>' +
        '<tr><th>月额度</th><td class="num">' + fmtUsd(subscription.monthly_usage_usd) + ' / ' + fmtUsd(subscription.monthly_limit_usd) + '</td></tr>' +
        '<tr><th>过期时间</th><td>' + esc(fmtDate(subscription.expires_at)) + '</td></tr>' +
      '</tbody></table>';
      return;
    }
    if (typeof data.balance === "number" || typeof data.remaining === "number") {
      target.className = "";
      target.innerHTML = '<table><tbody>' +
        '<tr><th>剩余</th><td class="num">' + fmtUsd(data.remaining) + '</td></tr>' +
        '<tr><th>余额</th><td class="num">' + fmtUsd(data.balance) + '</td></tr>' +
      '</tbody></table>';
      return;
    }
    target.className = "empty";
    target.textContent = "暂无额度数据。";
  }

  function renderDailyUsage(data) {
    const target = $("daily-usage");
    const rows = Array.isArray(data.daily_usage) ? data.daily_usage : [];
    if (!rows.length) {
      target.className = "empty";
      target.textContent = "暂无每日用量数据。";
      return;
    }
    target.className = "";
    target.innerHTML = '<div class="table-scroll"><table><thead><tr><th>日期</th><th class="num">请求数</th><th class="num">Tokens</th><th class="num">实际费用</th></tr></thead><tbody>' +
      rows.map((row) => '<tr>' +
        '<td>' + esc(row.date || "-") + '</td>' +
        '<td class="num">' + fmtNumber(row.requests) + '</td>' +
        '<td class="num">' + fmtNumber(row.total_tokens) + '</td>' +
        '<td class="num">' + fmtUsd(row.actual_cost) + '</td>' +
      '</tr>').join("") +
    '</tbody></table></div>';
  }

  function renderModelStats(data) {
    const target = $("model-stats");
    const rows = Array.isArray(data.model_stats) ? data.model_stats : [];
    if (!rows.length) {
      target.className = "empty";
      target.textContent = "暂无模型统计数据。";
      return;
    }
    target.className = "";
    target.innerHTML = '<div class="table-scroll"><table><thead><tr><th>模型</th><th class="num">请求数</th><th class="num">Tokens</th><th class="num">实际费用</th></tr></thead><tbody>' +
      rows.map((row) => '<tr>' +
        '<td>' + esc(row.model || "-") + '</td>' +
        '<td class="num">' + fmtNumber(row.requests) + '</td>' +
        '<td class="num">' + fmtNumber(row.total_tokens) + '</td>' +
        '<td class="num">' + fmtUsd(row.actual_cost) + '</td>' +
      '</tr>').join("") +
    '</tbody></table></div>';
  }

  function render(data) {
    renderSummary(data);
    renderRangeStats(data);
    renderRateLimits(data);
    renderQuota(data);
    renderDailyUsage(data);
    renderModelStats(data);
    $("raw").textContent = JSON.stringify(data, null, 2);
  }

  function loadDemo() {
    const now = new Date();
    const date = (offset) => {
      const d = new Date(now);
      d.setDate(d.getDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    render({
      isValid: true,
      mode: "quota_limited",
      status: "active",
      unit: "USD",
      rate_limits: [
        { window: "5h", limit: 10, used: 2.4, remaining: 7.6, reset_at: new Date(now.getTime() + 2 * 3600 * 1000).toISOString() },
        { window: "1d", limit: 100, used: 18.9, remaining: 81.1, reset_at: new Date(now.getTime() + 12 * 3600 * 1000).toISOString() },
        { window: "7d", limit: 1000, used: 143.6, remaining: 856.4, reset_at: new Date(now.getTime() + 4 * 86400 * 1000).toISOString() }
      ],
      quota: { limit: 50, used: 8.75, remaining: 41.25, unit: "USD" },
      usage: {
        average_duration_ms: 824,
        rpm: 0.6,
        tpm: 1842,
        today: { requests: 12, input_tokens: 24800, output_tokens: 5100, cache_creation_tokens: 600, cache_read_tokens: 2200, total_tokens: 32700, cost: 0.82, actual_cost: 0.41 },
        total: { requests: 186, input_tokens: 382000, output_tokens: 80100, cache_creation_tokens: 12600, cache_read_tokens: 48200, total_tokens: 522900, cost: 13.48, actual_cost: 6.74 }
      },
      daily_usage: [
        { date: date(-6), requests: 14, input_tokens: 21000, output_tokens: 4300, cache_read_tokens: 900, cache_write_tokens: 300, total_tokens: 26500, actual_cost: 0.33 },
        { date: date(-5), requests: 18, input_tokens: 27400, output_tokens: 6200, cache_read_tokens: 1200, cache_write_tokens: 500, total_tokens: 35300, actual_cost: 0.45 },
        { date: date(-4), requests: 22, input_tokens: 31800, output_tokens: 7100, cache_read_tokens: 1800, cache_write_tokens: 700, total_tokens: 41400, actual_cost: 0.53 },
        { date: date(-3), requests: 28, input_tokens: 45200, output_tokens: 9800, cache_read_tokens: 2400, cache_write_tokens: 900, total_tokens: 58300, actual_cost: 0.72 },
        { date: date(-2), requests: 36, total_tokens: 96400, actual_cost: 1.18 },
        { date: date(-1), requests: 28, total_tokens: 72100, actual_cost: 0.86 },
        { date: date(0), requests: 12, total_tokens: 32700, actual_cost: 0.41 }
      ],
      model_stats: [
        { model: "claude-sonnet-4", requests: 112, total_tokens: 338100, actual_cost: 4.32 },
        { model: "gpt-5-codex", requests: 74, total_tokens: 184800, actual_cost: 2.42 }
      ]
    });
    setStatus("已加载示例数据，可用于本地预览。", "ok");
  }

  applyTheme(initialTheme());
  baseUrlInput.value = defaultBaseUrl();
  keyInput.value = getInitialAPIKey();
  if (isLocalFile) {
    demoButton.classList.remove("hidden");
    setStatus("当前是本地文件预览。浏览器会阻止 file:// 页面携带 Authorization 跨域请求线上接口；示例按钮可查看渲染效果，真实查询请通过站点 URL 打开本页。", "");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const key = keyInput.value.trim();
    if (!key) {
      setStatus("请先输入 API Key。", "err");
      keyInput.focus();
      return;
    }

    const url = buildUrl();
    if (isLocalFile) {
      setStatus("本地 file:// 页面发起带 Authorization 的跨域请求通常会被浏览器 CORS 拦截。请通过 https://mckameila.xyz/key-usage-lookup.html 打开后查询。", "err");
      return;
    }

    setStatus("正在查询：" + url, "");
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": "Bearer " + key,
          "Accept": "application/json"
        }
      });
      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (err) {
        throw new Error("HTTP " + response.status + ": " + text);
      }
      if (!response.ok) {
        throw new Error("HTTP " + response.status + ": " + JSON.stringify(data));
      }
      render(data);
      setStatus("查询成功。HTTP " + response.status + "。", "ok");
    } catch (err) {
      setStatus(err && err.message ? err.message : String(err), "err");
    }
  });

  demoButton.addEventListener("click", loadDemo);

  themeInput.addEventListener("change", () => {
    applyTheme(themeInput.value);
  });

  $("clear").addEventListener("click", () => {
    keyInput.value = "";
    startDateInput.value = "";
    endDateInput.value = "";
    $("raw").textContent = "{}";
    setStatus("已清空。", "");
  });
})();
