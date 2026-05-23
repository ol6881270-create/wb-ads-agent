import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

const COLORS = {
  bg: "#0a0e1a", surface: "#111827", card: "#1a2235", border: "#1e3a5f",
  accent: "#3b82f6", accentGlow: "rgba(59,130,246,0.15)", green: "#10b981",
  red: "#ef4444", yellow: "#f59e0b", text: "#e2e8f0", muted: "#64748b", wb: "#cb11ab",
};

const GEMINI_KEY = "AIzaSyCE5DN25PrYSNbDRuJuBXIbGWme89HKPWM";

async function askGemini(prompt, images = []) {
  const parts = [];
  for (const img of images) {
    parts.push({ inline_data: { mime_type: img.type, data: img.base64 } });
  }
  parts.push({ text: prompt });
  const res = await fetch(`/api/gemini`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }] }),
  });
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "Ошибка получения ответа";
}

function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "binary" });
        const sheets = {};
        wb.SheetNames.forEach((name) => { sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" }); });
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

export default function WBAgent() {
  const [files, setFiles] = useState([]);
  const [parsedData, setParsedData] = useState([]);
  const [images, setImages] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef();
  const imageInputRef = useRef();
  const chatEndRef = useRef();

  const handleFiles = useCallback(async (fileList) => {
    setUploadLoading(true);
    const newFiles = []; const newData = [];
    for (const file of fileList) {
      if (file.type.startsWith("image/")) {
        const base64 = await toBase64(file);
        setImages((prev) => [...prev, { name: file.name, base64, type: file.type }]);
        setMessages((prev) => [...prev, { role: "assistant", text: `🖼️ Скрин загружен: ${file.name}` }]);
        continue;
      }
      try {
        const sheets = await parseExcel(file);
        newFiles.push({ name: file.name, sheets });
        newData.push({ name: file.name, sheets });
      } catch (e) { console.error("Ошибка парсинга:", e); }
    }
    setFiles((prev) => [...prev, ...newFiles]);
    setParsedData((prev) => [...prev, ...newData]);
    setUploadLoading(false);
    if (newData.length > 0) {
      setMessages((prev) => [...prev, { role: "assistant", text: `✅ Загружено ${newData.length} Excel файл(ов). Задай вопрос!` }]);
    }
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    handleFiles(Array.from(e.dataTransfer.files));
  }, [handleFiles]);

  const buildContext = () => {
    if (parsedData.length === 0) return "";
    let ctx = "Данные из Excel файлов:\n\n";
    parsedData.forEach((file) => {
      ctx += `=== ${file.name} ===\n`;
      Object.entries(file.sheets).forEach(([sheetName, rows]) => {
        ctx += `Лист: ${sheetName} (${rows.length} строк)\n`;
        if (rows.length > 0) {
          ctx += `Колонки: ${Object.keys(rows[0]).join(", ")}\n`;
          ctx += JSON.stringify(rows.slice(0, 50)) + "\n";
          if (rows.length > 50) ctx += `... и ещё ${rows.length - 50} строк\n`;
        }
        ctx += "\n";
      });
    });
    return ctx;
  };

  const send = async (text) => {
    const msg = text || input.trim();
    if (!msg) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setLoading(true);
    const context = buildContext();
    const prompt = `Ты эксперт по рекламе на Wildberries. Отвечай на русском языке. Давай конкретные рекомендации с цифрами.\n${context ? "ДАННЫЕ:\n" + context : "Данные не загружены."}\n\nВопрос: ${msg}`;
    try {
      const answer = await askGemini(prompt, images);
      setMessages((prev) => [...prev, { role: "assistant", text: answer }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", text: "Ошибка соединения." }]);
    }
    setLoading(false);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const quickActions = ["Проанализируй кампании", "Какие кластеры чистить?", "CTR по ключам", "Кампании СРБ", "Рекомендации по поставкам"];

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "Inter, sans-serif", display: "flex", flexDirection: "column" }}>
      <div style={{ background: COLORS.surface, borderBottom: `1px solid ${COLORS.border}`, padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, background: COLORS.wb, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>WB</div>
        <div><div style={{ fontWeight: 700, fontSize: 16 }}>WB Ads Intelligence</div><div style={{ fontSize: 12, color: COLORS.muted }}>Анализ рекламных кампаний</div></div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {files.map((f, i) => <span key={i} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "4px 8px", fontSize: 12 }}>📊 {f.name.slice(0, 20)}</span>)}
          {images.map((f, i) => <span key={i} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "4px 8px", fontSize: 12 }}>🖼️ {f.name.slice(0, 20)}</span>)}
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 900, width: "100%", margin: "0 auto", padding: 20, gap: 16 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <div onDrop={onDrop} onDragOver={(e) => e.preventDefault()} onClick={() => fileInputRef.current?.click()}
            style={{ flex: 1, border: `2px dashed ${COLORS.border}`, borderRadius: 12, padding: 24, textAlign: "center", cursor: "pointer" }}>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" multiple style={{ display: "none" }} onChange={(e) => handleFiles(Array.from(e.target.files))} />
            {uploadLoading ? <div style={{ color: COLORS.accent }}>⏳ Загружаю...</div> : <><div style={{ fontSize: 28 }}>📊</div><div style={{ fontWeight: 600, fontSize: 14 }}>Excel файлы</div><div style={{ fontSize: 12, color: COLORS.muted }}>xlsx, xls</div></>}
          </div>
          <div onClick={() => imageInputRef.current?.click()}
            style={{ flex: 1, border: `2px dashed ${COLORS.border}`, borderRadius: 12, padding: 24, textAlign: "center", cursor: "pointer" }}>
            <input ref={imageInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => handleFiles(Array.from(e.target.files))} />
            <div style={{ fontSize: 28 }}>🖼️</div><div style={{ fontWeight: 600, fontSize: 14 }}>Скриншоты</div><div style={{ fontSize: 12, color: COLORS.muted }}>jpg, png</div>
          </div>
        </div>
        {(parsedData.length > 0 || images.length > 0) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {quickActions.map((q, i) => <button key={i} onClick={() => send(q)} disabled={loading}
              style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 14px", color: COLORS.text, cursor: "pointer", fontSize: 13 }}>{q}</button>)}
          </div>
        )}
        <div style={{ flex: 1, background: COLORS.surface, borderRadius: 12, border: `1px solid ${COLORS.border}`, padding: 16, minHeight: 300, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
          {messages.length === 0 ? <div style={{ margin: "auto", textAlign: "center", color: COLORS.muted }}><div style={{ fontSize: 40 }}>🤖</div><div>Загрузи Excel или скриншоты и задай вопрос</div></div>
            : messages.map((m, i) => <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", background: m.role === "user" ? COLORS.accent : COLORS.card, border: m.role === "user" ? "none" : `1px solid ${COLORS.border}`, borderRadius: 12, padding: "10px 14px", maxWidth: "85%", whiteSpace: "pre-wrap", fontSize: 14 }}>{m.text}</div>)}
          {loading && <div style={{ alignSelf: "flex-start", background: COLORS.card, borderRadius: 12, padding: "10px 14px", fontSize: 13, color: COLORS.muted }}>⏳ Анализирую...</div>}
          <div ref={chatEndRef} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Задай вопрос по данным..." disabled={loading}
            style={{ flex: 1, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 14px", color: COLORS.text, fontSize: 14, outline: "none" }} />
          <button onClick={() => send()} disabled={loading || !input.trim()}
            style={{ background: COLORS.accent, border: "none", borderRadius: 8, padding: "10px 20px", color: "white", cursor: "pointer", fontWeight: 600 }}>→</button>
        </div>
      </div>
    </div>
  );
}
