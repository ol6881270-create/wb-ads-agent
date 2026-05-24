import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

const C = {
  bg: "#0f1117", surf: "#1a1d2e", card: "#1e2235", border: "#2a3050",
  accent: "#6c63ff", green: "#00d97e", red: "#f44336", yellow: "#ffb300",
  text: "#e8eaf6", muted: "#8892b0", wb: "#cb11ab",
};

const GEMINI_KEY = "AIzaSyCE5DN25PrYSNbDRuJuBXIbGWme89HKPWM";

async function askGemini(prompt, images = []) {
  const parts = [];
  for (const img of images) parts.push({ inline_data: { mime_type: img.type, data: img.base64 } });
  parts.push({ text: prompt });
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }] }),
  });
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "Ошибка";
}

function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "binary" });
        const sheets = {};
        wb.SheetNames.forEach((n) => { sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: "" }); });
        resolve(sheets);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function MetricCard({ label, value, sub, icon, color }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px", flex: 1, minWidth: 150 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
        <div style={{ fontSize: 24 }}>{icon}</div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || C.text, margin: "8px 0 4px" }}>{value}</div>
      <div style={{ fontSize: 12, color: C.muted }}>{sub}</div>
    </div>
  );
}

function renderAI(text) {
  return text.split("\n").map((line, i) => {
    if (!line.trim()) return <div key={i} style={{ height: 8 }} />;
    if (line.startsWith("## ")) return <div key={i} style={{ fontWeight: 700, fontSize: 15, color: C.accent, marginTop: 16, marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${C.border}` }}>{line.slice(3)}</div>;
    if (line.startsWith("# ")) return <div key={i} style={{ fontWeight: 700, fontSize: 17, color: C.wb, marginTop: 12, marginBottom: 6 }}>{line.slice(2)}</div>;
    if (line.match(/^[-•]\s/)) return <div key={i} style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 14 }}><span style={{ color: C.accent }}>▸</span><span>{line.slice(2)}</span></div>;
    if (line.match(/^\d+\.\s/)) return <div key={i} style={{ padding: "3px 0 3px 16px", fontSize: 14 }}><span style={{ color: C.accent, fontWeight: 700 }}>{line.match(/^\d+/)[0]}.</span> {line.replace(/^\d+\.\s/, "")}</div>;
    if (line.match(/^[✅❌🔴🟡🟢⚠️📊📈📉💡🎯🏆]/)) return <div key={i} style={{ background: C.surf, borderRadius: 8, padding: "8px 12px", margin: "4px 0", fontSize: 14, border: `1px solid ${C.border}` }}>{line}</div>;
    if (line.startsWith("**") && line.endsWith("**")) return <div key={i} style={{ fontWeight: 700, marginTop: 8, fontSize: 14 }}>{line.replace(/\*\*/g, "")}</div>;
    return <div key={i} style={{ fontSize: 14, lineHeight: 1.7, color: C.text }}>{line}</div>;
  });
}

export default function WBAgent() {
  const [tab, setTab] = useState("upload");
  const [files, setFiles] = useState([]);
  const [parsedData, setParsedData] = useState([]);
  const [images, setImages] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const fileInputRef = useRef();
  const imageInputRef = useRef();
  const chatEndRef = useRef();

  const extractMetrics = (data) => {
    let totalSpend = 0, totalOrders = 0, totalViews = 0, totalClicks = 0;
    data.forEach(file => {
      Object.values(file.sheets).forEach(rows => {
        rows.forEach(row => {
          const keys = Object.keys(row).map(k => k.toLowerCase());
          keys.forEach((k, i) => {
            const v = parseFloat(Object.values(row)[i]) || 0;
            if (k.includes("затрат") || k.includes("расход") || k.includes("spend")) totalSpend += v;
            if (k.includes("заказ") || k.includes("order")) totalOrders += v;
            if (k.includes("показ") || k.includes("view") || k.includes("impress")) totalViews += v;
            if (k.includes("клик") || k.includes("click")) totalClicks += v;
          });
        });
      });
    });
    const drr = totalSpend && totalOrders ? ((totalSpend / (totalOrders * 1000)) * 100).toFixed(1) : null;
    const ctr = totalViews ? ((totalClicks / totalViews) * 100).toFixed(2) : null;
    setMetrics({ totalSpend, totalOrders, totalViews, totalClicks, drr, ctr });
  };

  const handleFiles = useCallback(async (fileList) => {
    const newData = [];
    for (const file of fileList) {
      if (file.type.startsWith("image/")) {
        const base64 = await toBase64(file);
        setImages(prev => [...prev, { name: file.name, base64, type: file.type }]);
        continue;
      }
      try {
        const sheets = await parseExcel(file);
        newData.push({ name: file.name, sheets });
      } catch (e) { console.error(e); }
    }
    if (newData.length > 0) {
      setFiles(prev => [...prev, ...newData]);
      setParsedData(prev => { const updated = [...prev, ...newData]; extractMetrics(updated); return updated; });
      setTab("overview");
    }
  }, []);

  const onDrop = useCallback((e) => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files)); }, [handleFiles]);

  const buildContext = () => {
    if (!parsedData.length) return "";
    let ctx = "Данные:\n";
    parsedData.forEach(f => {
      ctx += `\n=== ${f.name} ===\n`;
      Object.entries(f.sheets).forEach(([name, rows]) => {
        ctx += `Лист: ${name} (${rows.length} строк)\n`;
        if (rows.length) { ctx += `Колонки: ${Object.keys(rows[0]).join(", ")}\n`; ctx += JSON.stringify(rows.slice(0, 40)) + "\n"; }
      });
    });
    return ctx;
  };

  const send = async (text) => {
    const msg = text || input.trim();
    if (!msg) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: msg }]);
    setLoading(true);
    setTab("chat");
    const ctx = buildContext();
    const prompt = `Ты эксперт по рекламе на Wildberries и Ozon. Отвечай структурировано на русском: используй ## для разделов, emoji ✅🔴🟡💡🎯 для статусов, списки - для рекомендаций, конкретные цифры.\n${ctx ? ctx : "Данные не загружены."}\n\nВопрос: ${msg}`;
    try {
      const answer = await askGemini(prompt, images);
      setMessages(prev => [...prev, { role: "assistant", text: answer }]);
    } catch { setMessages(prev => [...prev, { role: "assistant", text: "Ошибка соединения." }]); }
    setLoading(false);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const tabs = [
    { id: "upload", label: "📁 Загрузка" },
    { id: "overview", label: "📊 Обзор" },
    { id: "chat", label: "🤖 AI Чат" },
  ];

  const quickActions = [
    "Анализ кампаний: показы, CTR, ДРР, заказы",
    "Анализ кластеров — что чистить?",
    "Рекламный vs органический трафик",
    "Анализ скрина из Джема",
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ background: C.surf, borderBottom: `1px solid ${C.border}`, padding: "14px 24px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ width: 38, height: 38, background: C.wb, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15 }}>WB</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>WB Ads Intelligence</div>
          <div style={{ fontSize: 11, color: C.muted }}>Анализ рекламных кампаний</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {files.length > 0 && <span style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "4px 12px", fontSize: 12, color: C.green }}>● {files.length} файл(ов) загружено</span>}
          {images.length > 0 && <span style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "4px 12px", fontSize: 12, color: C.accent }}>🖼️ {images.length} скрин(ов)</span>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: C.surf, borderBottom: `1px solid ${C.border}`, padding: "0 24px", display: "flex", gap: 4 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "12px 20px", background: "none", border: "none", borderBottom: tab === t.id ? `2px solid ${C.accent}` : "2px solid transparent", color: tab === t.id ? C.accent : C.muted, cursor: "pointer", fontSize: 14, fontWeight: tab === t.id ? 600 : 400 }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>

        {/* UPLOAD TAB */}
        {tab === "upload" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div onDrop={onDrop} onDragOver={e => e.preventDefault()} onClick={() => fileInputRef.current?.click()}
                style={{ background: C.card, border: `2px dashed ${C.border}`, borderRadius: 16, padding: 40, textAlign: "center", cursor: "pointer" }}>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" multiple style={{ display: "none" }} onChange={e => handleFiles(Array.from(e.target.files))} />
                <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Excel отчёты</div>
                <div style={{ fontSize: 13, color: C.muted }}>Перетащи или нажми для загрузки</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Поддерживаются .xlsx, .xls</div>
              </div>
              <div onClick={() => imageInputRef.current?.click()}
                style={{ background: C.card, border: `2px dashed ${C.border}`, borderRadius: 16, padding: 40, textAlign: "center", cursor: "pointer" }}>
                <input ref={imageInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => handleFiles(Array.from(e.target.files))} />
                <div style={{ fontSize: 40, marginBottom: 12 }}>🖼️</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Скриншоты из Джема</div>
                <div style={{ fontSize: 13, color: C.muted }}>Нажми для загрузки скринов</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>jpg, png, webp</div>
              </div>
            </div>
            {(files.length > 0 || images.length > 0) && (
              <div style={{ background: C.card, borderRadius: 16, padding: 20, border: `1px solid ${C.border}` }}>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>Загруженные файлы</div>
                {files.map((f, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontSize: 14 }}><span>📊</span><span>{f.name}</span><span style={{ marginLeft: "auto", color: C.muted, fontSize: 12 }}>{Object.values(f.sheets).reduce((s, r) => s + r.length, 0)} строк</span></div>)}
                {images.map((f, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontSize: 14 }}><span>🖼️</span><span>{f.name}</span></div>)}
              </div>
            )}
          </div>
        )}

        {/* OVERVIEW TAB */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {metrics && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                <MetricCard label="Показы" value={metrics.totalViews > 1000 ? (metrics.totalViews/1000).toFixed(1)+"K" : metrics.totalViews} icon="👁️" color={C.text} sub="всего" />
                <MetricCard label="Клики" value={metrics.totalClicks} icon="🖱️" color={C.accent} sub="переходов" />
                <MetricCard label="CTR" value={metrics.ctr ? metrics.ctr+"%" : "—"} icon="📈" color={parseFloat(metrics.ctr) > 1 ? C.green : C.yellow} sub="кликабельность" />
                <MetricCard label="Заказы" value={metrics.totalOrders} icon="🛍️" color={C.green} sub="по рекламе" />
                <MetricCard label="Расход" value={metrics.totalSpend > 1000 ? (metrics.totalSpend/1000).toFixed(1)+"K ₽" : metrics.totalSpend+"₽"} icon="💸" color={C.red} sub="затраты" />
                <MetricCard label="ДРР" value={metrics.drr ? metrics.drr+"%" : "—"} icon="🎯" color={parseFloat(metrics.drr) < 10 ? C.green : C.red} sub={parseFloat(metrics.drr) < 10 ? "в норме" : "высокий"} />
              </div>
            )}
            <div style={{ background: C.card, borderRadius: 16, padding: 20, border: `1px solid ${C.border}` }}>
              <div style={{ fontWeight: 600, marginBottom: 16 }}>Быстрый анализ</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {quickActions.map((q, i) => (
                  <button key={i} onClick={() => send(q)} disabled={loading}
                    style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", color: C.text, cursor: "pointer", fontSize: 13, textAlign: "left", fontWeight: 500 }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CHAT TAB */}
        {tab === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {(files.length > 0 || images.length > 0) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {quickActions.map((q, i) => (
                  <button key={i} onClick={() => send(q)} disabled={loading}
                    style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "8px 16px", color: C.text, cursor: "pointer", fontSize: 13 }}>
                    {q}
                  </button>
                ))}
              </div>
            )}
            <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 20, minHeight: 400, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", maxHeight: 600 }}>
              {messages.length === 0 ? (
                <div style={{ margin: "auto", textAlign: "center", color: C.muted }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
                  <div style={{ fontWeight: 600, color: C.text, marginBottom: 8 }}>Загрузи файлы и задай вопрос</div>
                  <div style={{ fontSize: 13 }}>Анализ кампаний, кластеров и рекомендации</div>
                </div>
              ) : messages.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
                  {m.role === "user" ? (
                    <div style={{ background: C.accent, borderRadius: "16px 16px 4px 16px", padding: "12px 16px", fontSize: 14 }}>{m.text}</div>
                  ) : (
                    <div style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: "4px 16px 16px 16px", padding: "16px 20px" }}>
                      {renderAI(m.text)}
                    </div>
                  )}
                </div>
              ))}
              {loading && <div style={{ alignSelf: "flex-start", background: C.surf, borderRadius: 12, padding: "12px 16px", fontSize: 13, color: C.muted }}>⏳ Анализирую данные...</div>}
              <div ref={chatEndRef} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
                placeholder={files.length > 0 || images.length > 0 ? "Задай вопрос по данным..." : "Сначала загрузи файлы..."}
                disabled={loading}
                style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", color: C.text, fontSize: 14, outline: "none" }} />
              <button onClick={() => send()} disabled={loading || !input.trim()}
                style={{ background: C.accent, border: "none", borderRadius: 12, padding: "12px 24px", color: "white", cursor: "pointer", fontWeight: 600, fontSize: 15 }}>→</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
