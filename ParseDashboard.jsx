import { useState, useEffect, useRef } from "react";

const SUPABASE_URL = "https://nytdhsfeqotlxckmnrcb.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55dGRoc2ZlcW90bHhja21ucmNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MTUxNDUsImV4cCI6MjA5ODI5MTE0NX0.pp-nEmlJcTn3el6u7mKP_JT5U_P2mNznV42XdtRMkvM";
const EDGE_URL = `${SUPABASE_URL}/functions/v1/apify-search`;
const H = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };

const STATUS_STYLES = {
  "не звонили":    { bg: "#E6F1FB", color: "#0C447C" },
  "не дозвонились":{ bg: "#FCEBEB", color: "#791F1F" },
  "отказ":         { bg: "#FCEBEB", color: "#A32D2D" },
  "перезвонить":   { bg: "#FAEEDA", color: "#633806" },
  "интересно":     { bg: "#EAF3DE", color: "#3B6D11" },
  "клиент":        { bg: "#E1F5EE", color: "#085041" },
};
const STATUSES = Object.keys(STATUS_STYLES);

export default function ParseDashboard() {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("US");
  const [limit, setLimit] = useState(100);
  const [searching, setSearching] = useState(false);
  const [runId, setRunId] = useState(null);
  const [runStatus, setRunStatus] = useState("");
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(0);
  const pollRef = useRef(null);
  const PER_PAGE = 20;

  const fetchBusinesses = async () => {
    setLoading(true);
    try {
      let url = `${SUPABASE_URL}/rest/v1/businesses?select=*&order=created_at.desc&limit=500`;
      const res = await fetch(url, { headers: H });
      const data = await res.json();
      setBusinesses(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchBusinesses(); }, []);

  const startSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setRunStatus("🚀 Запускаем поиск в Apify...");
    setRunId(null);
    try {
      const res = await fetch(EDGE_URL, {
        method: "POST",
        headers: { ...H, "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), city: city.trim(), country: country.trim(), limit }),
      });
      const data = await res.json();
      if (data.runId) {
        setRunId(data.runId);
        setRunStatus(`⏳ Поиск запущен (ID: ${data.runId.slice(0,8)}...). Ждём результатов...`);
        pollRef.current = setInterval(async () => {
          try {
            const r = await fetch(`https://api.apify.com/v2/acts/compass~crawler-google-places/runs/${data.runId}?token=apify_api_jwQndUhu7YI6saACUwvrzhQVeXnD8Y0swTCV`);
            const d = await r.json();
            const status = d?.data?.status;
            if (status === "SUCCEEDED") {
              clearInterval(pollRef.current);
              setRunStatus("✅ Готово! Загружаем данные...");
              setTimeout(async () => { await fetchBusinesses(); setSearching(false); setRunStatus(""); }, 3000);
            } else if (status === "FAILED" || status === "ABORTED") {
              clearInterval(pollRef.current);
              setRunStatus("❌ Ошибка при парсинге");
              setSearching(false);
            } else {
              setRunStatus(`⏳ Статус: ${status}... собрано данных, ждём завершения`);
            }
          } catch {}
        }, 5000);
      } else {
        setRunStatus(`❌ Ошибка: ${data.error || "Неизвестная ошибка"}`);
        setSearching(false);
      }
    } catch (e) {
      setRunStatus(`❌ ${e.message}`);
      setSearching(false);
    }
  };

  const filtered = businesses.filter(b => {
    if (filterQuery && !(b.title||"").toLowerCase().includes(filterQuery.toLowerCase()) && !(b.search_query||"").toLowerCase().includes(filterQuery.toLowerCase())) return false;
    if (filterCity && (b.city||"").toLowerCase() !== filterCity.toLowerCase()) return false;
    if (filterCategory && (b.category_name||"") !== filterCategory) return false;
    if (filterStatus && (b.call_status||"не звонили") !== filterStatus) return false;
    return true;
  });

  const paginated = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  const cities = [...new Set(businesses.map(b => b.city).filter(Boolean))].sort();
  const categories = [...new Set(businesses.map(b => b.category_name).filter(Boolean))].sort();
  const queries = [...new Set(businesses.map(b => b.search_query).filter(Boolean))].sort();

  const updateStatus = async (id, status) => {
    setBusinesses(prev => prev.map(b => b.id === id ? { ...b, call_status: status } : b));
    await fetch(`${SUPABASE_URL}/rest/v1/businesses?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...H, "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify({ call_status: status }),
    });
  };

  return (
    <div style={{ background: "#0a0e1a", minHeight: "100vh", color: "#fff", fontFamily: "system-ui,sans-serif", fontSize: 13 }}>

      {/* HEADER */}
      <div style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
        <span style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>NDA Corp — Parser Dashboard</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{businesses.length} записей в базе</span>
      </div>

      <div style={{ padding: "16px 20px", maxWidth: 1200, margin: "0 auto" }}>

        {/* SEARCH FORM */}
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "18px 20px", marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#3b82f6", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
            🔍 Новый поиск через Apify
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px 100px auto", gap: 10, alignItems: "end" }}>
            <div>
              <label style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.45)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Что ищем</label>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="accountant, plumber, dentist..."
                onKeyDown={e => e.key === "Enter" && startSearch()}
                style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.45)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Город</label>
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="San Diego, Los Angeles..."
                style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.45)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Страна</label>
              <input value={country} onChange={e => setCountry(e.target.value)} placeholder="US"
                style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.45)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Лимит</label>
              <input type="number" value={limit} onChange={e => setLimit(Number(e.target.value))} min={10} max={500}
                style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none" }} />
            </div>
            <button onClick={startSearch} disabled={searching || !query.trim()}
              style={{ background: searching ? "rgba(59,130,246,0.4)" : "linear-gradient(135deg,#3b82f6,#1d4ed8)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: searching ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
              {searching ? "⏳ Поиск..." : "🚀 Запустить"}
            </button>
          </div>
          {runStatus && (
            <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 8, fontSize: 12, color: "#93c5fd" }}>
              {runStatus}
            </div>
          )}
        </div>

        {/* STATS ROW */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Всего записей", val: businesses.length, color: "#60a5fa" },
            { label: "Уникальных городов", val: cities.length, color: "#a78bfa" },
            { label: "Категорий", val: categories.length, color: "#34d399" },
            { label: "Поисковых запросов", val: queries.length, color: "#fb923c" },
            { label: "Не звонили", val: businesses.filter(b=>!b.call_status||b.call_status==="не звонили").length, color: "#3b82f6" },
            { label: "Клиентов", val: businesses.filter(b=>b.call_status==="клиент").length, color: "#22c55e" },
          ].map((s,i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* FILTERS */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <input value={filterQuery} onChange={e=>{setFilterQuery(e.target.value);setPage(0);}} placeholder="🔍 Поиск по названию..."
            style={{ flex:1, minWidth:160, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, padding:"7px 12px", color:"#fff", fontSize:12, outline:"none" }} />
          <select value={filterCity} onChange={e=>{setFilterCity(e.target.value);setPage(0);}}
            style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, padding:"7px 10px", color:"#fff", fontSize:12 }}>
            <option value="">Все города</option>
            {cities.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterCategory} onChange={e=>{setFilterCategory(e.target.value);setPage(0);}}
            style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, padding:"7px 10px", color:"#fff", fontSize:12 }}>
            <option value="">Все категории</option>
            {categories.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterStatus} onChange={e=>{setFilterStatus(e.target.value);setPage(0);}}
            style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, padding:"7px 10px", color:"#fff", fontSize:12 }}>
            <option value="">Все статусы</option>
            {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={()=>{setFilterQuery("");setFilterCity("");setFilterCategory("");setFilterStatus("");setPage(0);}}
            style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, padding:"7px 12px", color:"rgba(255,255,255,0.6)", fontSize:12, cursor:"pointer" }}>
            Сбросить
          </button>
          <span style={{ marginLeft:"auto", fontSize:11, color:"rgba(255,255,255,0.4)", alignSelf:"center" }}>
            {filtered.length} из {businesses.length}
          </span>
        </div>

        {/* TABLE */}
        <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, overflow:"hidden" }}>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ background:"rgba(255,255,255,0.05)", borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
                  {["Лого","Название","Телефон","Категория","Адрес","Рейтинг","Статус","Запрос","Карта"].map(h=>(
                    <th key={h} style={{ padding:"10px 10px", textAlign:"left", fontSize:10, fontWeight:600, color:"rgba(255,255,255,0.45)", textTransform:"uppercase", letterSpacing:"0.06em", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} style={{ padding:40, textAlign:"center", color:"rgba(255,255,255,0.3)" }}>Загружаем данные...</td></tr>
                ) : paginated.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding:40, textAlign:"center", color:"rgba(255,255,255,0.3)" }}>Ничего не найдено</td></tr>
                ) : paginated.map((b,ri) => {
                  const ss = STATUS_STYLES[b.call_status] || STATUS_STYLES["не звонили"];
                  return (
                    <tr key={b.id} style={{ borderBottom:"1px solid rgba(255,255,255,0.05)", background: ri%2===0?"transparent":"rgba(255,255,255,0.015)", cursor:"pointer" }}
                      onClick={()=>setSelected(selected?.id===b.id?null:b)}>
                      <td style={{ padding:"8px 10px" }}>
                        {b.image_url
                          ? <img src={b.image_url} alt="" style={{ width:36, height:36, borderRadius:8, objectFit:"cover", display:"block" }} onError={e=>{e.target.style.display="none"}} />
                          : <div style={{ width:36, height:36, borderRadius:8, background:"rgba(255,255,255,0.08)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>🏢</div>
                        }
                      </td>
                      <td style={{ padding:"8px 10px", maxWidth:180 }}>
                        <div style={{ fontWeight:600, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.title}</div>
                        {b.subtitle && <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginTop:1 }}>{b.subtitle}</div>}
                      </td>
                      <td style={{ padding:"8px 10px", whiteSpace:"nowrap" }}>
                        <a href={`tel:${b.phone_unformatted||b.phone}`} onClick={e=>e.stopPropagation()}
                          style={{ color:"#60a5fa", textDecoration:"none" }}>{b.phone||"—"}</a>
                      </td>
                      <td style={{ padding:"8px 10px", color:"rgba(255,255,255,0.55)", maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.category_name||"—"}</td>
                      <td style={{ padding:"8px 10px", color:"rgba(255,255,255,0.5)", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.address||"—"}</td>
                      <td style={{ padding:"8px 10px", whiteSpace:"nowrap" }}>
                        {b.total_score ? <span style={{ color:"#f59e0b" }}>★ {b.total_score}</span> : "—"}
                        {b.reviews_count ? <span style={{ color:"rgba(255,255,255,0.3)", fontSize:10 }}> ({b.reviews_count})</span> : ""}
                      </td>
                      <td style={{ padding:"8px 10px" }} onClick={e=>e.stopPropagation()}>
                        <select value={b.call_status||"не звонили"} onChange={e=>updateStatus(b.id,e.target.value)}
                          style={{ background:ss.bg, color:ss.color, border:"none", borderRadius:20, padding:"3px 8px", fontSize:11, fontWeight:600, cursor:"pointer" }}>
                          {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{ padding:"8px 10px", color:"rgba(255,255,255,0.4)", fontSize:11 }}>{b.search_query||"—"}</td>
                      <td style={{ padding:"8px 10px" }}>
                        {b.url && <a href={b.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
                          style={{ color:"#3b82f6", textDecoration:"none", fontSize:11 }}>Maps ↗</a>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* PAGINATION */}
          {totalPages > 1 && (
            <div style={{ padding:"12px 16px", borderTop:"1px solid rgba(255,255,255,0.06)", display:"flex", gap:6, alignItems:"center", justifyContent:"center" }}>
              <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}
                style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:6, padding:"4px 12px", color:"#fff", cursor:page===0?"not-allowed":"pointer", fontSize:12 }}>←</button>
              {Array.from({length:Math.min(totalPages,7)}).map((_,i)=>{
                const p = totalPages<=7?i:page<4?i:page>totalPages-4?totalPages-7+i:page-3+i;
                return <button key={p} onClick={()=>setPage(p)}
                  style={{ background:page===p?"#3b82f6":"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:6, padding:"4px 10px", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:page===p?700:400 }}>{p+1}</button>;
              })}
              <button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page===totalPages-1}
                style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:6, padding:"4px 12px", color:"#fff", cursor:page===totalPages-1?"not-allowed":"pointer", fontSize:12 }}>→</button>
            </div>
          )}
        </div>

        {/* DETAIL PANEL */}
        {selected && (
          <div style={{ marginTop:16, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:14, padding:20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
              <div style={{ display:"flex", gap:14, alignItems:"center" }}>
                {selected.image_url && <img src={selected.image_url} alt="" style={{ width:60, height:60, borderRadius:10, objectFit:"cover" }} />}
                <div>
                  <div style={{ fontSize:16, fontWeight:800 }}>{selected.title}</div>
                  <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)", marginTop:3 }}>{selected.category_name}</div>
                  {selected.subtitle && <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)" }}>{selected.subtitle}</div>}
                </div>
              </div>
              <button onClick={()=>setSelected(null)} style={{ background:"rgba(255,255,255,0.08)", border:"none", borderRadius:8, padding:"6px 14px", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:12 }}>✕ Закрыть</button>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:14 }}>
              {[
                { label:"📞 Телефон", val: selected.phone_unformatted||selected.phone, link:`tel:${selected.phone_unformatted}` },
                { label:"📍 Адрес", val: selected.address },
                { label:"🏙️ Город", val: `${selected.city||""}${selected.state?", "+selected.state:""}${selected.postal_code?" "+selected.postal_code:""}` },
                { label:"🌍 Страна", val: selected.country_code },
                { label:"⭐ Рейтинг", val: selected.total_score ? `${selected.total_score} (${selected.reviews_count||0} отзывов)` : "—" },
                { label:"📸 Фото", val: selected.images_count ? `${selected.images_count} фото` : "нет" },
                { label:"🔍 Запрос", val: `${selected.search_query||""}${selected.search_city?" / "+selected.search_city:""}` },
                { label:"📅 Спарсено", val: selected.scraped_at ? new Date(selected.scraped_at).toLocaleString("ru") : "—" },
                { label:"🌐 Сайт", val: selected.website||"нет сайта", link: selected.website },
                { label:"📌 Google Maps", val: selected.url ? "Открыть ↗" : "—", link: selected.url },
              ].map((f,i)=>(
                <div key={i} style={{ background:"rgba(255,255,255,0.03)", borderRadius:10, padding:"10px 14px" }}>
                  <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginBottom:4, textTransform:"uppercase", letterSpacing:"0.05em" }}>{f.label}</div>
                  {f.link && f.val && f.val!=="—"
                    ? <a href={f.link} target="_blank" rel="noopener noreferrer" style={{ color:"#60a5fa", fontSize:12, textDecoration:"none" }}>{f.val}</a>
                    : <div style={{ fontSize:12, color:"rgba(255,255,255,0.8)" }}>{f.val||"—"}</div>
                  }
                </div>
              ))}
            </div>

            {selected.opening_hours && (() => {
              try {
                const hours = typeof selected.opening_hours === "string" ? JSON.parse(selected.opening_hours) : selected.opening_hours;
                return (
                  <div style={{ marginTop:14, background:"rgba(255,255,255,0.03)", borderRadius:10, padding:"10px 14px" }}>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.05em" }}>🕐 Часы работы</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:4 }}>
                      {hours.map((h,i)=>(
                        <div key={i} style={{ fontSize:11, color:"rgba(255,255,255,0.7)" }}>
                          <span style={{ color:"rgba(255,255,255,0.4)", marginRight:6 }}>{h.day}:</span>{h.hours}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              } catch { return null; }
            })()}

            {selected.description && (
              <div style={{ marginTop:14, background:"rgba(255,255,255,0.03)", borderRadius:10, padding:"10px 14px" }}>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.05em" }}>📝 Описание</div>
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.7)", lineHeight:1.6 }}>{selected.description}</div>
              </div>
            )}
          </div>
        )}

        <div style={{ height:40 }} />
      </div>
    </div>
  );
}
