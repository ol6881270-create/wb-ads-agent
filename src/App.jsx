import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

const COLORS = {
  bg: "#0a0e1a",
  surface: "#111827",
  card: "#1a2235",
  border: "#1e3a5f",
  accent: "#3b82f6",
  accentGlow: "rgba(59,130,246,0.15)",
  green: "#10b981",
  red: "#ef4444",
  yellow: "#f59e0b",
  text: "#e2e8f0",
  muted: "#64748b",
  wb: "#cb11ab",
};

const API_KEY = "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";

async function askClaude(prompt) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
      "HTTP-Referer": "http://localhost:5173",
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "Ошибка получения ответа";
}

export default function WBAgent() {
  const [files, setFiles] = useState([]);
  const [parsedData, setParsedData] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef();
  const chatEndRef = useRef();

  const handleFiles = useCallback(async (fileList) => {
    const newData = [];
    for (const file of fileList) {
      try {
        const data = await file.arrayBuffer();
        const wb = (await import("xlsx")).read(data);
        const sheets = {};
        wb.SheetNames.forEach((name) => {
          sheets[name] = (await import("xlsx")).utils.sheet_to_json(wb.Sheets[name], { defval: "" });
        });
        newData.push({ name: file.name, sheets });
      } catch (e) {}
    }
    setParsedData((prev) => [...prev, ...newData]);
    setFiles((prev) => [...prev, ...fileList]);
    if (newData.length > 0) {
      setMessages((prev) => [...prev, { role: "assistant", text: "Файлы загружены! Задайте вопрос." }]);
    }
  }, []);

  const send = async (text) => {
    const msg = text || input.trim();
    if (!msg) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setLoading(true);
    let ctx = parsedData.map(f => {
      return Object.entries(f.sheets).map(([s, rows]) =>
        `Файл: ${f.name}, Лист: ${s}\n${JSON.stringify(rows.slice(0, 50))}`
      ).join("\n");
    }).join("\n\n");
    const prompt = `Ты эксперт по рекламе Wildberries. Анализируй данные и давай конкретные рекомендации на русском.\n\nДанные:\n${ctx}\n\nВопрос: ${msg}`;
    try {
      const answer = await askClaude(prompt);
      setMessages((prev) => [...prev, { role: "assistant", text: answer }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", text: "Ошибка соединения." }]);
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", color: "#e2e8f0", fontFamily: "sans-serif", padding: 24 }}>
      <h2 style={{ color: "#cb11ab", marginBottom: 16 }}>WB Ads Intelligence</h2>
      <div onClick={() => fileInputRef.current?.click()} style={{ border: "2px dashed #1e3a5f", borderRadius: 12, padding: 32, textAlign: "center", cursor: "pointer", marginBottom: 16 }}>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" multiple style={{ display: "none" }} onChange={(e) => handleFiles(Array.from(e.target.files))} />
        📂 Перетащи Excel файлы или нажми сюда
      </div>
      <div style={{ background: "#111827", borderRadius: 12, padding: 16, minHeight: 300, maxHeight: 400, overflowY: "auto", marginBottom: 16 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 10, background: m.role === "user" ? "#3b82f6" : "#1a2235", maxWidth: "80%", marginLeft: m.role === "user" ? "auto" : 0, whiteSpace: "pre-wrap", fontSize: 14 }}>{m.text}</div>
        ))}
        {loading && <div style={{ color: "#64748b", fontSize: 13 }}>⏳ Анализирую...</div>}
        <div ref={chatEndRef} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {["Анализ кампаний", "Какие кластеры чистить?", "CTR по ключам", "ДРР по кампаниям", "Рекомендации по ставкам"].map((q, i) => (
          <button key={i} onClick={() => send(q)} style={{ background: "#1a2235", border: "1px solid #1e3a5f", borderRadius: 8, padding: "6px 12px", color: "#e2e8f0", cursor: "pointer", fontSize: 13 }}>{q}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Задай вопрос по данным..." style={{ flex: 1, background: "#1a2235", border: "1px solid #1e3a5f", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 14, outline: "none" }} />
        <button onClick={() => send()} disabled={loading} style={{ background: "#3b82f6", border: "none", borderRadius: 8, padding: "10px 20px", color: "white", cursor: "pointer", fontWeight: 600 }}>→</button>
      </div>
    </div>
  );
}