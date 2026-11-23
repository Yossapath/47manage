import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { db } from "./firebase";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
  getDocs,
  where
} from "firebase/firestore";

type Role = "admin" | "member";
type Page = "overview" | "payments" | "members" | "reports" | "logs" | "settings";
type AuthView = "login" | "register";

type Player = {
  id: string;
  name: string;
  color: string;
};

// ---- NEW: Dungeon Difficulty System ----
// A Tier is a price-slot within a difficulty, e.g. "1-3 (฿200)" or "4-5 (฿300)"
type DungeonTier = {
  label: string;   // e.g. "1-3", "4-5", "1-5", "เต็มรอบ"
  price: number;   // price for this tier in THB
};

// A Difficulty = one mode within a dungeon, e.g. "Nightmare" or "Hell", with its own tiers
type DungeonDifficulty = {
  name: string;       // e.g. "Nightmare", "Hell", "Infinite", "ระดับเดียว"
  tiers: DungeonTier[];
};

// A DungeonTemplate = one dungeon with multiple difficulties
type DungeonTemplate = {
  id: string;         // unique id
  name: string;       // e.g. "Apo", "Maya95"
  difficulties: DungeonDifficulty[];
};

// Segment for runs where different players carried different tiers
type RunSegment = {
  tierLabel: string;   // e.g. "1-3", "4-5"
  price: number;       // e.g. 200, 300
  players: string[];   // player IDs who played this tier
};

// Legacy flat preset kept for backward compat display only
type DungeonPreset = {
  name: string;
  price: number;
};

type PaymentRow = {
  id: string;
  date: string;
  time: string;
  dungeon: string;        // e.g. "Apo"
  difficulty: string;     // e.g. "Nightmare"
  tier: string;           // e.g. "1-3" or "1-3 + 4-5"
  ctm: string;
  price: number;
  detail: string;
  sale: number;
  players: string[];      // all players involved
  segments?: RunSegment[]; // if split across tiers with different players
  commissionTo: string;
  slip?: string;
  createdAt?: any;
};

type LogItem = {
  id: string;
  time: string;
  user: string;
  action: string;
  target: string;
  type: string;
};

// ---- Default Dungeon Templates ----
const DEFAULT_DUNGEON_TEMPLATES: DungeonTemplate[] = [
  {
    id: "apo",
    name: "Apo",
    difficulties: [
      {
        name: "Nightmare",
        tiers: [
          { label: "1-3", price: 200 },
          { label: "4-5", price: 300 },
          { label: "1-5", price: 500 },
          { label: "5",   price: 200 },
        ],
      },
      {
        name: "Hell",
        tiers: [
          { label: "1-3", price: 400 },
          { label: "4-5", price: 600 },
          { label: "1-5", price: 1000 },
          { label: "5",   price: 400 },
        ],
      },
      {
        name: "Infinite",
        tiers: [
          { label: "1-3", price: 800 },
          { label: "4-5", price: 1200 },
          { label: "1-5", price: 2000 },
        ],
      },
    ],
  },
  {
    id: "maya95",
    name: "Maya95",
    difficulties: [
      {
        name: "ระดับเดียว",
        tiers: [{ label: "เต็มรอบ", price: 300 }],
      },
    ],
  },
];

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

// Calculate the precise wage for a specific player in a given run
function getPlayerWageForRun(
  row: PaymentRow,
  playerId: string,
  commissionRate: number,
  defaultCarryCount: number
): number {
  const comMult = 1 - commissionRate / 100;
  if (row.segments && row.segments.length > 0) {
    let wage = 0;
    for (const seg of row.segments) {
      if (seg.players.includes(playerId)) {
        const count = seg.players.length || 1;
        wage += (seg.price * comMult) / count;
      }
    }
    return wage;
  }
  if (row.players.includes(playerId)) {
    const count = row.players.length || defaultCarryCount;
    return (row.sale * comMult) / count;
  }
  return 0;
}

const DEFAULT_PLAYERS: Player[] = [
  { id: "p1", name: "K.Top", color: "#6557D9" },
  { id: "p2", name: "K.Jamepii", color: "#D65C8D" },
  { id: "p3", name: "K.Joss", color: "#2D8C79" },
  { id: "p4", name: "K.Sprtte", color: "#D0783B" },
  { id: "p5", name: "K.Yugi", color: "#4274B8" },
  { id: "p6", name: "K.Tiew", color: "#7B5CAD" },
  { id: "p7", name: "K.Ohm", color: "#2E8294" },
  { id: "p8", name: "K.Book", color: "#9A6650" },
  { id: "p9", name: "K.Non", color: "#E05D5D" },
  { id: "p10", name: "K.Nut", color: "#4F98CA" },
  { id: "p11", name: "K.Bank", color: "#50B97A" },
];

const DEFAULT_DUNGEONS: DungeonPreset[] = [
  { name: "Apo NM 1-5", price: 600 },
  { name: "Apo NM 3-5", price: 500 },
  { name: "Maya 2", price: 300 },
  { name: "Apo NM 5", price: 200 },
  { name: "The Sunken Temple", price: 12500 },
  { name: "Crimson Citadel", price: 9800 },
  { name: "Frostspire Keep", price: 15000 },
  { name: "Shadow Vault", price: 11400 },
];

const PLAYER_COLORS = [
  "#6557D9", "#D65C8D", "#2D8C79", "#D0783B", "#4274B8",
  "#7B5CAD", "#2E8294", "#9A6650", "#E05D5D", "#4F98CA",
  "#50B97A", "#F2994A", "#9B51E0", "#27AE60", "#2F80ED"
];

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const icons = {
  grid: <Icon><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Icon>,
  table: <Icon><path d="M4 5h16v14H4zM4 10h16M9 5v14" /></Icon>,
  users: <Icon><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM16 3.1a4 4 0 0 1 0 7.8M22 21v-2a4 4 0 0 0-3-3.87" /></Icon>,
  chart: <Icon><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></Icon>,
  settings: <Icon><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63h.01A1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9c.14.6.7 1.01 1.55 1.01H21v4h-.08c-.85 0-1.41.4-1.52.99Z" /></Icon>,
  calendar: <Icon size={17}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></Icon>,
  plus: <Icon size={16}><path d="M12 5v14M5 12h14" /></Icon>,
  filter: <Icon size={16}><path d="M4 6h16M7 12h10M10 18h4" /></Icon>,
  logout: <Icon><path d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /></Icon>,
  coin: <Icon size={21}><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5c-.7-.6-1.7-1-3-1-1.6 0-2.8.8-2.8 2s1 1.8 2.8 2.2c1.8.4 2.8 1 2.8 2.3s-1.2 2.2-2.9 2.2c-1.2 0-2.4-.5-3.2-1.2M12.5 5.5v13" /></Icon>,
  chevron: <Icon size={15}><path d="m9 18 6-6-6-6" /></Icon>,
  history: <Icon><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" /></Icon>,
  search: <Icon size={16}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></Icon>,
  download: <Icon size={16}><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" /></Icon>,
  trash: <Icon size={15}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></Icon>,
  image: <Icon size={16}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></Icon>,
  menu: <Icon size={20}><path d="M4 6h16M4 12h16M4 18h16" /></Icon>,
  x: <Icon size={18}><path d="M18 6 6 18M6 6l12 12" /></Icon>,
  user: <Icon size={16}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></Icon>,
  lock: <Icon size={16}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></Icon>,
  info: <Icon size={16}><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></Icon>,
};

// ======================== LOGIN + REGISTER COMPONENT ========================
function Login({ onLogin }: { onLogin: (role: Role, username: string) => void }) {
  const [view, setView] = useState<AuthView>("login");
  const [role, setRole] = useState<Role>("admin");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Register fields
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    if (role === "admin") {
      if (!username.trim()) {
        setErrorMsg("กรุณากรอกชื่อผู้ใช้");
        setLoading(false);
        return;
      }

      // Try Firestore users collection first
      try {
        const snap = await getDocs(query(
          collection(db, "users"),
          where("username", "==", username.trim()),
          where("role", "==", "admin")
        ));
        if (!snap.empty) {
          const userData = snap.docs[0].data();
          if (userData.password === password) {
            setLoading(false);
            onLogin("admin", username.trim());
            return;
          }
        }
      } catch (_) { /* fallback below */ }

      // Fallback: hardcoded passwords
      const savedAdminPass = localStorage.getItem("47manage_admin_pass") || "admin";
      if (password === savedAdminPass || password === "47family" || password === "admin") {
        setLoading(false);
        onLogin("admin", username.trim());
      } else {
        setErrorMsg("รหัสผ่านไม่ถูกต้อง");
        setLoading(false);
      }
    } else {
      // Member login — check Firestore users collection
      try {
        const snap = await getDocs(query(
          collection(db, "users"),
          where("username", "==", username.trim())
        ));
        if (!snap.empty) {
          const userData = snap.docs[0].data();
          if (userData.password === password) {
            const memberRole = userData.role as Role;
            setLoading(false);
            onLogin(memberRole, username.trim());
            return;
          } else {
            setErrorMsg("รหัสผ่านไม่ถูกต้อง");
            setLoading(false);
            return;
          }
        }
      } catch (_) { /* fall through */ }

      // Allow view-only without password
      const memberName = username.trim() || "สมาชิกทั่วไป";
      setLoading(false);
      onLogin("member", memberName);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!regUsername.trim()) { setErrorMsg("กรุณากรอกชื่อผู้ใช้"); return; }
    if (regPassword.length < 4) { setErrorMsg("รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร"); return; }
    if (regPassword !== regConfirm) { setErrorMsg("รหัสผ่านไม่ตรงกัน"); return; }

    setLoading(true);
    try {
      // Check if username already exists
      const existing = await getDocs(query(
        collection(db, "users"),
        where("username", "==", regUsername.trim())
      ));
      if (!existing.empty) {
        setErrorMsg("ชื่อผู้ใช้นี้มีอยู่แล้ว กรุณาเลือกชื่ออื่น");
        setLoading(false);
        return;
      }

      await addDoc(collection(db, "users"), {
        username: regUsername.trim(),
        password: regPassword,
        role: "member",
        createdAt: serverTimestamp()
      });

      setSuccessMsg(`สมัครสำเร็จ! บัญชี "${regUsername.trim()}" ได้รับยศ Member แล้ว กรุณาเข้าสู่ระบบ`);
      setRegUsername(""); setRegPassword(""); setRegConfirm("");
      setLoading(false);
      setTimeout(() => { setView("login"); setSuccessMsg(""); }, 2500);
    } catch (err: any) {
      setErrorMsg("สมัครไม่สำเร็จ: " + err.message);
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-brand">
        <div className="brand-mark"><span>47</span></div>
        <div><strong>47RAVENGE</strong><small>Reward Management</small></div>
      </div>
      <section className="login-card">
        <div className="login-heading">
          <span className="eyebrow">ระบบจัดการกิลด์</span>
          <h1>{view === "login" ? <>เข้าสู่ระบบจัดการ<br />ค่าตอบแทน</> : <>สมัครสมาชิก<br />ใหม่</>}</h1>
          <p>{view === "login" ? "ตรวจสอบและจัดการรายได้ของทีมอย่างโปร่งใส" : "สร้างบัญชีใหม่เพื่อเข้าดูข้อมูลรายได้ทีม"}</p>
        </div>

        {/* Login / Register Tab */}
        <div className="role-switch" style={{ marginBottom: "16px" }}>
          <button type="button" className={view === "login" ? "active" : ""} onClick={() => { setView("login"); setErrorMsg(""); setSuccessMsg(""); }}>
            เข้าสู่ระบบ
          </button>
          <button type="button" className={view === "register" ? "active" : ""} onClick={() => { setView("register"); setErrorMsg(""); setSuccessMsg(""); }}>
            สมัครสมาชิก
          </button>
        </div>

        {view === "login" ? (
          <>
            <div className="role-switch">
              <button type="button" className={role === "admin" ? "active" : ""} onClick={() => { setRole("admin"); setUsername("admin"); setErrorMsg(""); }}>
                ผู้ดูแลระบบ (Admin)
              </button>
              <button type="button" className={role === "member" ? "active" : ""} onClick={() => { setRole("member"); setUsername(""); setErrorMsg(""); }}>
                สมาชิก (Member)
              </button>
            </div>

            <form onSubmit={handleLogin}>
              <label className="field">
                <span>{role === "admin" ? "ชื่อผู้ใช้ (Username)" : "ชื่อผู้ใช้ (หรือปล่อยว่าง)"}</span>
                <input
                  type="text"
                  required={role === "admin"}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={role === "admin" ? "เช่น admin" : "ชื่อสมาชิก"}
                />
              </label>

              <label className="field">
                <span>รหัสผ่าน (Password){role === "member" ? " (ถ้ามี)" : ""}</span>
                <div className="password-wrap">
                  <input
                    type={showPassword ? "text" : "password"}
                    required={role === "admin"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="กรอกรหัสผ่าน"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? "ซ่อน" : "แสดง"}
                  </button>
                </div>
              </label>

              {errorMsg && <p style={{ color: "#d9534f", fontSize: "12px", marginBottom: "12px", textAlign: "center" }}>⚠️ {errorMsg}</p>}

              <button type="submit" className="login-button" disabled={loading}>
                {loading ? "กำลังตรวจสอบ..." : role === "admin" ? "เข้าสู่ระบบผู้ดูแล" : "เข้าใช้งาน"}
                {!loading && <span>{icons.chevron}</span>}
              </button>
            </form>
            <p className="demo-note">
              {role === "admin"
                ? "💡 บัญชีผู้ดูแล: รหัสเริ่มต้นคือ admin หรือ 47family"
                : "👀 สมัครแล้วจะได้ยศ Member · ติดต่อ Admin เพื่ออัปเกรด"}
            </p>
          </>
        ) : (
          <form onSubmit={handleRegister}>
            <label className="field">
              <span>ชื่อผู้ใช้ (Username)</span>
              <input required autoFocus value={regUsername} onChange={(e) => setRegUsername(e.target.value)} placeholder="เช่น K.Arm หรือ newnick" />
            </label>
            <label className="field">
              <span>รหัสผ่าน (Password)</span>
              <div className="password-wrap">
                <input type={showPassword ? "text" : "password"} required value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="อย่างน้อย 4 ตัวอักษร" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? "ซ่อน" : "แสดง"}</button>
              </div>
            </label>
            <label className="field">
              <span>ยืนยันรหัสผ่าน</span>
              <input type={showPassword ? "text" : "password"} required value={regConfirm} onChange={(e) => setRegConfirm(e.target.value)} placeholder="กรอกรหัสผ่านอีกครั้ง" />
            </label>

            {errorMsg && <p style={{ color: "#d9534f", fontSize: "12px", marginBottom: "12px", textAlign: "center" }}>⚠️ {errorMsg}</p>}
            {successMsg && <p style={{ color: "#27ae60", fontSize: "12px", marginBottom: "12px", textAlign: "center" }}>✅ {successMsg}</p>}

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? "กำลังสมัคร..." : "สมัครสมาชิก (ได้รับยศ Member)"}
              {!loading && <span>{icons.chevron}</span>}
            </button>
            <p className="demo-note">📋 Admin จะอัปเกรด Role ให้ทาง Firestore Console</p>
          </form>
        )}
      </section>
      <p className="login-footer">47RAVENGE © 2026 · ระบบจัดการค่าตอบแทนสมาชิก</p>
    </main>
  );
}

// ======================== AVATAR COMPONENT ========================
function PlayerAvatar({ player, small = false }: { player?: Player; small?: boolean }) {
  if (!player) return <span className={`avatar ${small ? "small" : ""}`} style={{ background: "#999" }}>?</span>;
  return (
    <span
      className={`avatar ${small ? "small" : ""}`}
      style={{ background: player.color }}
      title={player.name}
    >
      {player.name.replace("K.", "").trim().slice(0, 1)}
    </span>
  );
}

// ======================== PLAYER DETAIL MODAL ========================
function PlayerDetailModal({
  row,
  memberList,
  commissionRate,
  defaultCarryCount,
  onClose
}: {
  row: PaymentRow;
  memberList: Player[];
  commissionRate: number;
  defaultCarryCount: number;
  onClose: () => void;
}) {
  const carryCount = row.players.length || defaultCarryCount;
  const totalSale = row.sale;
  const totalCom = (totalSale * commissionRate) / 100;
  const totalWagePool = totalSale - totalCom;

  const comPlayer = memberList.find((p) => p.name === row.commissionTo);
  const diffLabel = [row.difficulty, row.tier].filter(Boolean).join(" · ");

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        style={{ width: "520px", maxHeight: "90vh" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose}>×</button>
        <span className="eyebrow">รายละเอียดการลงดันเจี้ยน</span>
        <h2 style={{ fontSize: "18px", margin: "4px 0 2px" }}>
          {row.dungeon} {diffLabel && <span style={{ color: "#176bca", fontSize: "14px" }}>({diffLabel})</span>}
        </h2>
        <p style={{ fontSize: "12px", color: "#777", marginBottom: "16px" }}>{row.date} · {row.time} น. · CTM: <strong>{row.ctm}</strong></p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "18px" }}>
          <div style={{ background: "#f0f6fc", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
            <small style={{ color: "#888", fontSize: "11px" }}>ยอดขายรวม</small>
            <strong style={{ display: "block", fontSize: "16px", color: "#172033" }}>฿{totalSale.toLocaleString()}</strong>
          </div>
          <div style={{ background: "#fdf3e7", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
            <small style={{ color: "#888", fontSize: "11px" }}>ค่าคอม {commissionRate}%</small>
            <strong style={{ display: "block", fontSize: "16px", color: "#e67e22" }}>฿{Math.round(totalCom).toLocaleString()}</strong>
          </div>
          <div style={{ background: "#edfdf5", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
            <small style={{ color: "#888", fontSize: "11px" }}>กองกลางค่าแรง</small>
            <strong style={{ display: "block", fontSize: "16px", color: "#27ae60" }}>฿{Math.round(totalWagePool).toLocaleString()}</strong>
          </div>
        </div>

        {/* Commission recipient */}
        <div style={{ background: "#fef9ec", border: "1px solid #f0d080", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "18px" }}>💰</span>
          <div>
            <small style={{ color: "#888", fontSize: "11px" }}>ผู้รับค่าคอมมิชชั่น</small>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" }}>
              {comPlayer && <PlayerAvatar player={comPlayer} small />}
              <strong style={{ fontSize: "13px" }}>{row.commissionTo}</strong>
              <span style={{ color: "#e67e22", fontWeight: 700, fontSize: "13px" }}>฿{Math.round(totalCom).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Multi-Tier breakdown if exists */}
        {row.segments && row.segments.length > 0 && (
          <div style={{ marginBottom: "16px", background: "#f4f8fd", border: "1px solid #c9e0f8", borderRadius: "8px", padding: "12px" }}>
            <strong style={{ fontSize: "13px", display: "block", color: "#176bca", marginBottom: "8px" }}>
              🔀 การแบ่งช่วงชั้นและคนลง (Multi-Tier Breakdown)
            </strong>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {row.segments.map((seg, idx) => {
                const segNet = seg.price * (1 - commissionRate / 100);
                const segPerPerson = segNet / (seg.players.length || 1);
                return (
                  <div key={idx} style={{ background: "#fff", border: "1px solid #e1eaf3", borderRadius: "6px", padding: "8px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: "13px", color: "#2c3e50" }}>
                        ชั้น {seg.tierLabel} (฿{seg.price.toLocaleString()})
                      </strong>
                      <span style={{ fontSize: "12px", color: "#27ae60", fontWeight: 700 }}>
                        แบ่งคนละ ฿{Math.round(segPerPerson).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "3px" }}>
                      ทีมแบกช่วงนี้: {seg.players.map((pid) => memberList.find((m) => m.id === pid)?.name || pid).join(", ") || "-"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Per-player breakdown */}
        <strong style={{ fontSize: "13px", display: "block", marginBottom: "10px" }}>
          รายรับสุทธิของทีมแบก ({row.players.length} คน)
        </strong>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "240px", overflowY: "auto" }}>
          {row.players.map((pid, idx) => {
            const p = memberList.find((m) => m.id === pid);
            const playerWage = getPlayerWageForRun(row, pid, commissionRate, defaultCarryCount);
            return (
              <div
                key={pid + idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 14px",
                  background: "#f9fbfd",
                  borderRadius: "8px",
                  border: "1px solid #e8edf3"
                }}
              >
                <PlayerAvatar player={p} />
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: "13px" }}>{p?.name || pid}</strong>
                  <small style={{ display: "block", color: "#888", fontSize: "11px" }}>
                    {row.segments && row.segments.length > 0
                      ? `ลงชั้น: ${row.segments.filter((s) => s.players.includes(pid)).map((s) => s.tierLabel).join(", ") || "-"}`
                      : "ทีมแบก"}
                  </small>
                </div>
                <div style={{ textAlign: "right" }}>
                  <strong style={{ fontSize: "15px", color: "#27ae60" }}>฿{Math.round(playerWage).toLocaleString()}</strong>
                  <small style={{ display: "block", color: "#aaa", fontSize: "10px" }}>สุทธิหลังหักคอม</small>
                </div>
              </div>
            );
          })}
          {row.players.length === 0 && (
            <p style={{ color: "#aaa", fontSize: "12px", textAlign: "center", padding: "20px" }}>ไม่มีข้อมูลทีมแบก</p>
          )}
        </div>

        {/* Slip */}
        {row.slip && (
          <div style={{ marginTop: "16px" }}>
            <strong style={{ fontSize: "13px", display: "block", marginBottom: "8px" }}>🧾 สลิปการโอนเงิน</strong>
            <img src={row.slip} alt="Slip" style={{ width: "100%", borderRadius: "8px", border: "1px solid #ddd" }} />
          </div>
        )}

        <button type="button" className="outline-button" style={{ marginTop: "16px", width: "100%" }} onClick={onClose}>
          ปิดหน้าต่าง
        </button>
      </div>
    </div>
  );
}

// ======================== DASHBOARD COMPONENT ========================
function Dashboard({ role, username, onLogout }: { role: Role; username: string; onLogout: () => void }) {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [memberList, setMemberList] = useState<Player[]>(DEFAULT_PLAYERS);
  const [dungeonTemplates, setDungeonTemplates] = useState<DungeonTemplate[]>(DEFAULT_DUNGEON_TEMPLATES);
  const [defaultCarryCount, setDefaultCarryCount] = useState<number>(4);
  const [commissionRate, setCommissionRate] = useState<number>(10);
  const [adminPass, setAdminPass] = useState<string>("admin");

  const [page, setPage] = useState<Page>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedDungeonFilter, setSelectedDungeonFilter] = useState("ทั้งหมด");
  const [dateFilter, setDateFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedRow, setSelectedRow] = useState<PaymentRow | null>(null);
  const [editRow, setEditRow] = useState<PaymentRow | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [currentSlipBase64, setCurrentSlipBase64] = useState<string>("");
  const [viewSlipUrl, setViewSlipUrl] = useState<string | null>(null);

  // Payment form selectors
  const [formDungeonId, setFormDungeonId] = useState<string>("");
  const [formDiffName, setFormDiffName] = useState<string>("");
  const [formTierLabel, setFormTierLabel] = useState<string>("");
  const [formSaleOverride, setFormSaleOverride] = useState<number>(0);

  const [showMemberForm, setShowMemberForm] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [logFilter, setLogFilter] = useState("ทั้งหมด");
  const [toast, setToast] = useState("");

  const [logs, setLogs] = useState<LogItem[]>([]);

  // Settings temp state
  const [tempAdminPass, setTempAdminPass] = useState("");
  // New dungeon template builder state
  const [newDungeonName, setNewDungeonName] = useState("");
  const [newDiffName, setNewDiffName] = useState("");
  const [newTiers, setNewTiers] = useState<DungeonTier[]>([{ label: "", price: 0 }]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  };

  const addLog = async (action: string, target: string, type: string) => {
    try {
      await addDoc(collection(db, "logs"), {
        time: new Date().toLocaleString("th-TH"),
        user: username,
        action,
        target,
        type,
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.error("Log error", e);
    }
  };

  // ======================== FIRESTORE REALTIME SYNC ========================
  useEffect(() => {
    // 1. Sync Runs
    const qRuns = query(collection(db, "runs"), orderBy("createdAt", "desc"));
    const unsubRuns = onSnapshot(qRuns, (snapshot) => {
      const data: PaymentRow[] = [];
      snapshot.forEach((d) => {
        const val = d.data();
        data.push({
          id: d.id,
          date: val.date || "23-Nov",
          time: val.time || "21:00",
          dungeon: val.dungeon || val.detail || "Apo",
          difficulty: val.difficulty || "",
          tier: val.tier || "",
          ctm: val.ctm || val.customer || "-",
          price: Number(val.price || val.sale) || 0,
          sale: Number(val.sale || val.price) || 0,
          detail: val.detail || "",
          commissionTo: val.commissionTo || val.saleBy || "-",
          players: Array.isArray(val.players) ? val.players : (Array.isArray(val.carryPlayers) ? val.carryPlayers : []),
          slip: val.slip || val.slipUrl || undefined,
          createdAt: val.createdAt
        });
      });
      setRows(data);
    }, (err) => console.error("Runs sync error:", err));

    // 2. Sync Players
    const unsubPlayers = onSnapshot(collection(db, "players"), (snapshot) => {
      if (!snapshot.empty) {
        const data: Player[] = [];
        snapshot.forEach((d) => {
          const val = d.data();
          data.push({ id: d.id, name: val.name, color: val.color || "#2474ca" });
        });
        setMemberList(data);
      } else {
        setMemberList(DEFAULT_PLAYERS);
      }
    });

    // 3. Sync Settings
    const unsubSettings = onSnapshot(doc(db, "settings", "general"), (docSnap) => {
      if (docSnap.exists()) {
        const val = docSnap.data();
        if (val.commissionRate !== undefined) setCommissionRate(val.commissionRate);
        if (val.defaultCarryCount !== undefined) setDefaultCarryCount(val.defaultCarryCount);
        if (val.adminPass !== undefined) setAdminPass(val.adminPass);
      }
    });

    const unsubDungeons = onSnapshot(doc(db, "settings", "dungeons"), (docSnap) => {
      if (docSnap.exists()) {
        const val = docSnap.data();
        // Load new dungeon template system
        if (Array.isArray(val.templates) && val.templates.length > 0) {
          setDungeonTemplates(val.templates);
        }
      }
    });

    // 4. Sync Logs
    const qLogs = query(collection(db, "logs"), orderBy("createdAt", "desc"));
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      const data: LogItem[] = [];
      snapshot.forEach((d) => {
        const val = d.data();
        data.push({
          id: d.id,
          time: val.time || "เมื่อสักครู่",
          user: val.user || "ระบบ",
          action: val.action || "",
          target: val.target || "",
          type: val.type || "ระบบ"
        });
      });
      setLogs(data.slice(0, 40));
    });

    return () => {
      unsubRuns();
      unsubPlayers();
      unsubSettings();
      unsubDungeons();
      unsubLogs();
    };
  }, []);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchDungeon = selectedDungeonFilter === "ทั้งหมด" || row.dungeon === selectedDungeonFilter;
      const matchDate = !dateFilter || row.date.toLowerCase().includes(dateFilter.toLowerCase());
      return matchDungeon && matchDate;
    });
  }, [rows, selectedDungeonFilter, dateFilter]);

  const total = filteredRows.reduce((sum, row) => sum + row.sale, 0);
  const commission = total * (commissionRate / 100);
  const payout = total - commission;
  const activePlayerIds = new Set(filteredRows.flatMap((row) => row.players));

  // Derived flat list of dungeon names for filter dropdowns
  const allDungeonNames = useMemo(() =>
    Array.from(new Set(rows.map((r) => r.dungeon).filter(Boolean))),
    [rows]
  );

  // Derived: selected dungeon template & difficulty
  const selectedTemplate = useMemo(() =>
    dungeonTemplates.find((t) => t.id === formDungeonId) || dungeonTemplates[0],
    [dungeonTemplates, formDungeonId]
  );
  const selectedDiff = useMemo(() =>
    selectedTemplate?.difficulties.find((d) => d.name === formDiffName) || selectedTemplate?.difficulties[0],
    [selectedTemplate, formDiffName]
  );
  const selectedTier = useMemo(() =>
    selectedDiff?.tiers.find((t) => t.label === formTierLabel) || selectedDiff?.tiers[0],
    [selectedDiff, formTierLabel]
  );

  // Weekly income summary (all rows, no filter)
  const weeklySummary = useMemo(() => {
    return memberList
      .map((p) => {
        const pRuns = rows.filter((r) => r.players.includes(p.id));
        const wage = pRuns.reduce((sum, r) => sum + (r.sale * (1 - commissionRate / 100)) / (r.players.length || defaultCarryCount), 0);
        const com = rows.filter((r) => r.commissionTo === p.name).reduce((sum, r) => sum + (r.sale * commissionRate) / 100, 0);
        return { ...p, rounds: pRuns.length, wage, com, grand: wage + com };
      })
      .filter((p) => p.grand > 0)
      .sort((a, b) => b.grand - a.grand);
  }, [rows, memberList, commissionRate, defaultCarryCount]);

  const pageTitles: Record<Page, [string, string]> = {
    overview: ["ภาพรวมค่าตอบแทน", "ติดตามรายได้ ส่วนแบ่งของทีม และสถิติล่าสุด"],
    payments: ["รายการค่าตอบแทน", "จัดการรายการเล่น สลิป และส่วนแบ่งทั้งหมด"],
    members: ["สมาชิกทีม", "รายชื่อสมาชิกและยอดรายได้สะสมของแต่ละคน"],
    reports: ["รายงานสรุป", "วิเคราะห์ยอดขาย ค่าคอม และส่วนแบ่งผู้เล่น"],
    logs: ["Log History", "ประวัติการใช้งานและการเปลี่ยนแปลงในระบบ"],
    settings: ["ตั้งค่าระบบ", "กำหนดรายชื่อดันเจี้ยน ความยาก ราคา และกติกา"],
  };

  const toggleSelectedPlayer = (playerId: string) => {
    setSelectedPlayers((current) =>
      current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId]
    );
  };

  const openAdd = () => {
    setSelectedPlayers([]);
    setCurrentSlipBase64("");
    const firstTemplate = dungeonTemplates[0];
    setFormDungeonId(firstTemplate?.id || "");
    setFormDiffName(firstTemplate?.difficulties[0]?.name || "");
    setFormTierLabel(firstTemplate?.difficulties[0]?.tiers[0]?.label || "");
    setFormSaleOverride(firstTemplate?.difficulties[0]?.tiers[0]?.price || 0);
    setShowAdd(true);
  };

  const openEdit = (row: PaymentRow) => {
    setSelectedPlayers(row.players);
    setCurrentSlipBase64(row.slip || "");
    // Try to match template
    const tmpl = dungeonTemplates.find((t) => t.name === row.dungeon);
    setFormDungeonId(tmpl?.id || "");
    setFormDiffName(row.difficulty || "");
    setFormTierLabel(row.tier || "");
    setFormSaleOverride(row.sale);
    setEditRow(row);
  };

  // ======================== SLIP UPLOAD HANDLER ========================
  const handleSlipFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        const max = 900;
        if (w > max || h > max) {
          if (w > h) { h = Math.round((h * max) / w); w = max; }
          else { w = Math.round((w * max) / h); h = max; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
        setCurrentSlipBase64(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // ======================== SAVE PAYMENT (FIRESTORE) ========================
  const savePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPlayers.length) {
      notify("กรุณาเลือกผู้เล่นอย่างน้อย 1 คน");
      return;
    }
    const data = new FormData(event.currentTarget);
    const saleAmount = Number(data.get("sale")) || formSaleOverride || 0;
    const ctmName = String(data.get("ctm"));
    const detailText = String(data.get("detail"));
    const dateVal = String(data.get("date"));
    const timeVal = String(data.get("time"));
    const commissionToVal = String(data.get("commissionTo"));

    // Build dungeon label: "Apo · Nightmare · 1-3"
    const tmpl = dungeonTemplates.find((t) => t.id === formDungeonId);
    const dungeonName = tmpl?.name || "ไม่ระบุ";
    const diffName = formDiffName || "";
    const tierLbl = formTierLabel || "";

    const payload = {
      date: dateVal,
      time: timeVal,
      dungeon: dungeonName,
      difficulty: diffName,
      tier: tierLbl,
      ctm: ctmName,
      customer: ctmName,
      price: saleAmount,
      sale: saleAmount,
      detail: detailText,
      commissionTo: commissionToVal,
      saleBy: commissionToVal,
      players: selectedPlayers,
      carryPlayers: selectedPlayers,
      slip: currentSlipBase64 || null,
      slipUrl: currentSlipBase64 || null,
      updatedAt: serverTimestamp(),
    };

    const displayLabel = [dungeonName, diffName, tierLbl].filter(Boolean).join(" · ");
    try {
      if (editRow) {
        await updateDoc(doc(db, "runs", editRow.id), payload);
        await addLog("แก้ไขรายการ", `${displayLabel} (฿${saleAmount}) - ${ctmName}`, "แก้ไข");
        notify("บันทึกการแก้ไขรอบแล้ว");
      } else {
        await addDoc(collection(db, "runs"), {
          ...payload,
          createdAt: serverTimestamp()
        });
        await addLog("เพิ่มรายการใหม่", `${displayLabel} (฿${saleAmount}) - ${ctmName}`, "สร้าง");
        notify("เพิ่มรอบดันเจี้ยนใหม่เรียบร้อยแล้ว");
      }
      setShowAdd(false);
      setEditRow(null);
    } catch (err: any) {
      alert("บันทึกไม่สำเร็จ: " + err.message);
    }
  };

  // ======================== DELETE PAYMENT ========================
  const deletePayment = async () => {
    if (!editRow) return;
    if (!confirm(`ยืนยันการลบรายการ "${editRow.dungeon}" (฿${editRow.sale}) หรือไม่?`)) return;
    try {
      await deleteDoc(doc(db, "runs", editRow.id));
      await addLog("ลบรายการ", `${editRow.dungeon} (฿${editRow.sale})`, "ลบ");
      notify("ลบรายการแล้ว");
      setEditRow(null);
    } catch (err: any) {
      alert("ลบไม่สำเร็จ: " + err.message);
    }
  };

  // ======================== ADD MEMBER ========================
  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newMemberName.trim()) {
      notify("กรุณากรอกชื่อสมาชิก");
      return;
    }
    const color = PLAYER_COLORS[memberList.length % PLAYER_COLORS.length];
    try {
      await addDoc(collection(db, "players"), {
        name: newMemberName.trim(),
        color,
        createdAt: serverTimestamp()
      });
      await addLog("เพิ่มสมาชิก", newMemberName.trim(), "สมาชิก");
      notify(`เพิ่ม ${newMemberName.trim()} เข้าทีมแล้ว`);
      setNewMemberName("");
      setShowMemberForm(false);
    } catch (err: any) {
      alert("เพิ่มสมาชิกไม่สำเร็จ: " + err.message);
    }
  };

  // ======================== SETTINGS HANDLERS ========================
  const saveDungeonTemplates = async (updated: DungeonTemplate[]) => {
    try {
      await setDoc(doc(db, "settings", "dungeons"), { templates: updated });
      setDungeonTemplates(updated);
    } catch (err: any) {
      alert("เกิดข้อผิดพลาด: " + err.message);
    }
  };

  const handleAddDungeonTemplate = async (e: FormEvent) => {
    e.preventDefault();
    if (!newDungeonName.trim()) return;
    const newTemplate: DungeonTemplate = {
      id: genId(),
      name: newDungeonName.trim(),
      difficulties: [],
    };
    const updated = [...dungeonTemplates, newTemplate];
    await saveDungeonTemplates(updated);
    await addLog("เพิ่มดันเจี้ยน", newDungeonName.trim(), "ระบบ");
    notify(`เพิ่มดันเจี้ยน "${newDungeonName}" สำเร็จ`);
    setNewDungeonName("");
    setEditingTemplateId(newTemplate.id);
  };

  const handleDeleteDungeonTemplate = async (id: string) => {
    const tmpl = dungeonTemplates.find((t) => t.id === id);
    if (!tmpl) return;
    if (!confirm(`ยืนยันลบดันเจี้ยน "${tmpl.name}" ออกจากระบบ?`)) return;
    const updated = dungeonTemplates.filter((t) => t.id !== id);
    await saveDungeonTemplates(updated);
    await addLog("ลบดันเจี้ยน", tmpl.name, "ระบบ");
    notify(`ลบดันเจี้ยน "${tmpl.name}" แล้ว`);
    if (editingTemplateId === id) setEditingTemplateId(null);
  };

  const handleAddDifficulty = async (templateId: string) => {
    if (!newDiffName.trim()) { notify("กรุณากรอกชื่อความยาก"); return; }
    if (!newTiers.some((t) => t.label.trim())) { notify("กรุณากรอก Tier อย่างน้อย 1 ชั้น"); return; }
    const updated = dungeonTemplates.map((t) => {
      if (t.id !== templateId) return t;
      return {
        ...t,
        difficulties: [
          ...t.difficulties,
          {
            name: newDiffName.trim(),
            tiers: newTiers.filter((ti) => ti.label.trim()).map((ti) => ({ label: ti.label.trim(), price: ti.price })),
          },
        ],
      };
    });
    await saveDungeonTemplates(updated);
    const tmpl = dungeonTemplates.find((t) => t.id === templateId);
    await addLog("เพิ่มความยาก", `${tmpl?.name} · ${newDiffName}`, "ระบบ");
    notify(`เพิ่มความยาก "${newDiffName}" สำเร็จ`);
    setNewDiffName("");
    setNewTiers([{ label: "", price: 0 }]);
  };

  const handleDeleteDifficulty = async (templateId: string, diffName: string) => {
    if (!confirm(`ยืนยันลบความยาก "${diffName}"?`)) return;
    const updated = dungeonTemplates.map((t) => {
      if (t.id !== templateId) return t;
      return { ...t, difficulties: t.difficulties.filter((d) => d.name !== diffName) };
    });
    await saveDungeonTemplates(updated);
    notify(`ลบความยาก "${diffName}" แล้ว`);
  };

  const handleSaveGeneralSettings = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        commissionRate,
        defaultCarryCount,
      };
      if (tempAdminPass.trim()) {
        payload.adminPass = tempAdminPass.trim();
        localStorage.setItem("47manage_admin_pass", tempAdminPass.trim());
        setAdminPass(tempAdminPass.trim());
      }
      await setDoc(doc(db, "settings", "general"), payload, { merge: true });
      await addLog("อัปเดตการตั้งค่าระบบ", `คอมมิชชั่น ${commissionRate}%, คนแบก ${defaultCarryCount} คน`, "ระบบ");
      notify("บันทึกการตั้งค่าระบบเรียบร้อยแล้ว");
      setTempAdminPass("");
    } catch (err: any) {
      alert("เกิดข้อผิดพลาด: " + err.message);
    }
  };

  // Shared table row renderer
  const renderTableRow = (row: PaymentRow, showManage: boolean) => {
    const carryCount = row.players.length || defaultCarryCount;
    const perPlayer = (row.sale * (1 - commissionRate / 100)) / carryCount;
    const diffLabel = [row.difficulty, row.tier].filter(Boolean).join(" · ");
    return (
      <tr key={row.id}>
        <td>
          <strong>{row.date}</strong>
          <small>{row.time} น.</small>
        </td>
        <td>
          <span className="dungeon-name">{row.dungeon}</span>
          {diffLabel && <small style={{ color: "#6080a8" }}>{diffLabel}</small>}
        </td>
        <td><strong>{row.ctm}</strong></td>
        <td>{row.detail}</td>
        <td className="money">฿{row.sale.toLocaleString()}</td>
        <td className="commission">-฿{((row.sale * commissionRate) / 100).toLocaleString()} <small>({row.commissionTo})</small></td>
        <td className="players-cell">
          <button className="player-names" onClick={() => setSelectedRow(row)}>
            {row.players.map((id) => memberList.find((p) => p.id === id)?.name || id).join(", ") || "-"}
          </button>
        </td>
        <td className="payout">฿{Math.round(perPlayer).toLocaleString()}</td>
        <td>
          {row.slip ? (
            <button type="button" onClick={() => setViewSlipUrl(row.slip!)} style={{ color: "#176bca", fontWeight: 700, fontSize: "12px", textDecoration: "underline" }}>
              ดูสลิป
            </button>
          ) : <span style={{ color: "#ccc" }}>-</span>}
        </td>
        {showManage && (
          <td>
            <button className="more-button" onClick={() => openEdit(row)} title="แก้ไข">•••</button>
          </td>
        )}
      </tr>
    );
  };

  return (
    <div className={`app-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      {/* ======================== SIDEBAR ======================== */}
      <aside className="sidebar">
        <div className="side-brand">
          <div className="brand-mark mini"><span>47</span></div>
          {sidebarOpen && <div><strong>47RAVENGE</strong><small>Reward Management</small></div>}
        </div>

        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? "หุบเมนู" : "ขยายเมนู"}
        >
          {sidebarOpen ? icons.x : icons.menu}
        </button>

        <nav>
          {sidebarOpen && <span className="nav-label">เมนูหลัก</span>}
          <button className={`nav-item ${page === "overview" ? "active" : ""}`} onClick={() => setPage("overview")} title="ภาพรวม">
            {icons.grid}{sidebarOpen && <span>ภาพรวม</span>}
          </button>
          <button className={`nav-item ${page === "payments" ? "active" : ""}`} onClick={() => setPage("payments")} title="รายการค่าตอบแทน">
            {icons.table}{sidebarOpen && <span>รายการค่าตอบแทน</span>}{sidebarOpen && <b>{rows.length}</b>}
          </button>
          <button className={`nav-item ${page === "members" ? "active" : ""}`} onClick={() => setPage("members")} title="สมาชิกทีม">
            {icons.users}{sidebarOpen && <span>สมาชิกทีม</span>}{sidebarOpen && <b>{memberList.length}</b>}
          </button>
          <button className={`nav-item ${page === "reports" ? "active" : ""}`} onClick={() => setPage("reports")} title="รายงานสรุป">
            {icons.chart}{sidebarOpen && <span>รายงานสรุป</span>}
          </button>
          <button className={`nav-item ${page === "logs" ? "active" : ""}`} onClick={() => setPage("logs")} title="Log History">
            {icons.history}{sidebarOpen && <span>Log History</span>}
          </button>

          {role === "admin" && (
            <>
              {sidebarOpen && <span className="nav-label second">ผู้ดูแลระบบ</span>}
              <button className={`nav-item ${page === "settings" ? "active" : ""}`} onClick={() => setPage("settings")} title="ตั้งค่าระบบ">
                {icons.settings}{sidebarOpen && <span>ตั้งค่าระบบ</span>}
              </button>
            </>
          )}
        </nav>

        {sidebarOpen && (
          <div className="commission-rule">
            <span>กติกาการแบ่งเงิน</span>
            <strong>หักค่าคอมมิชชั่น {commissionRate}%</strong>
            <p>ยอดคงเหลือแบ่งเท่ากัน {defaultCarryCount} คนแบกในแต่ละรอบ</p>
          </div>
        )}

        <div className="profile">
          <div className="profile-avatar">{username.slice(0, 2).toUpperCase()}</div>
          {sidebarOpen && (
            <div>
              <strong>{username}</strong>
              <small style={{ color: role === "admin" ? "#176bca" : "#666" }}>
                {role === "admin" ? "🛡️ ผู้ดูแลระบบ" : "👀 สมาชิก"}
              </small>
            </div>
          )}
          <button onClick={onLogout} title="ออกจากระบบ">{icons.logout}</button>
        </div>
      </aside>

      {/* ======================== MAIN CONTENT ======================== */}
      <main className="dashboard">
        <header className="topbar">
          <div>
            <p>{new Date().toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
            <h1>{pageTitles[page][0]}</h1>
            <small className="page-subtitle">{pageTitles[page][1]}</small>
          </div>
          <div className="header-actions">
            {(page === "overview" || page === "payments") && role === "admin" && (
              <button className="primary-button" onClick={openAdd}>
                {icons.plus} เพิ่มรอบดันเจี้ยน
              </button>
            )}
            {page === "members" && role === "admin" && (
              <button className="primary-button" onClick={() => setShowMemberForm(true)}>
                {icons.plus} เพิ่มสมาชิก
              </button>
            )}
          </div>
        </header>

        {/* ======================== PAGE: OVERVIEW ======================== */}
        {page === "overview" && (
          <>
            <section className="stats-grid">
              <article className="stat-card main-stat">
                <div className="stat-icon">{icons.coin}</div>
                <span>ยอดรวมทั้งหมด</span>
                <strong>฿{total.toLocaleString()}</strong>
                <small>จาก {filteredRows.length} รอบในระบบ</small>
                <div className="sparkline"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
              </article>
              <article className="stat-card">
                <span>ค่าคอมมิชชั่น <em>{commissionRate}%</em></span>
                <strong>฿{commission.toLocaleString()}</strong>
                <small>รวมคนหาลูกค้าทั้งหมด</small>
              </article>
              <article className="stat-card">
                <span>กองกลางค่าแรง</span>
                <strong className="green">฿{payout.toLocaleString()}</strong>
                <small>แบ่งให้ทีมงานแบก</small>
              </article>
              <article className="stat-card">
                <span>สมาชิกที่ร่วมลง</span>
                <strong>{activePlayerIds.size} <i>คน</i></strong>
                <div className="avatar-row">
                  {[...activePlayerIds].slice(0, 7).map((id) => (
                    <PlayerAvatar key={id} player={memberList.find((p) => p.id === id)} small />
                  ))}
                </div>
              </article>
            </section>

            {/* Overview Recent Table */}
            <section className="content-card">
              <div className="table-heading">
                <div>
                  <h2>รอบดันเจี้ยนล่าสุด</h2>
                  <p>รายการรอบและค่าตอบแทนที่อัปเดตแบบ Realtime</p>
                </div>
                <div className="filters">
                  <label>
                    {icons.filter}
                    <select value={selectedDungeonFilter} onChange={(e) => setSelectedDungeonFilter(e.target.value)}>
                      <option value="ทั้งหมด">ทุกดันเจี้ยน</option>
                      {allDungeonNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>วันที่ / เวลา</th>
                      <th>ดันเจี้ยน · ความยาก · Tier</th>
                      <th>ลูกค้า (CTM)</th>
                      <th>รายละเอียด</th>
                      <th>ยอดขาย</th>
                      <th>คอม {commissionRate}%</th>
                      <th>ทีมแบก</th>
                      <th>ยอดแบ่ง / คน</th>
                      <th>สลิป</th>
                      {role === "admin" && <th>จัดการ</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={role === "admin" ? 10 : 9} style={{ textAlign: "center", padding: "35px", color: "#888" }}>
                          📋 ยังไม่มีรายการรอบในเงื่อนไขที่เลือก
                        </td>
                      </tr>
                    ) : (
                      filteredRows.slice(0, 10).map((row) => renderTableRow(row, role === "admin"))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ===== WEEKLY INCOME SUMMARY ===== */}
            {weeklySummary.length > 0 && (
              <section className="content-card">
                <div className="table-heading">
                  <div>
                    <h2>สรุปส่วนแบ่ง รายได้ผู้เล่นประจำสัปดาห์</h2>
                    <p>คำนวณจากค่าแรงหารเท่า + ค่าคอมมิชชั่นสะสมทั้งหมด</p>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>อันดับ</th>
                        <th>ชื่อผู้เล่น</th>
                        <th>จำนวนรอบ</th>
                        <th>ค่าแรงหารเท่า</th>
                        <th>ค่าคอม {commissionRate}%</th>
                        <th>รายรับสุทธิรวม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weeklySummary.map((p, idx) => (
                        <tr key={p.id}>
                          <td><strong>{idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`}</strong></td>
                          <td>
                            <div className="name-cell">
                              <PlayerAvatar player={p} small />
                              <strong>{p.name}</strong>
                            </div>
                          </td>
                          <td>{p.rounds} รอบ</td>
                          <td style={{ color: "#27ae60", fontWeight: 700 }}>฿{Math.round(p.wage).toLocaleString()}</td>
                          <td style={{ color: "#176bca", fontWeight: 700 }}>฿{Math.round(p.com).toLocaleString()}</td>
                          <td className="money" style={{ fontSize: "14px" }}>฿{Math.round(p.grand).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} style={{ fontWeight: 700, fontSize: "13px", color: "#172033" }}>รวมทั้งหมด</td>
                        <td style={{ color: "#27ae60", fontWeight: 700 }}>฿{Math.round(weeklySummary.reduce((s, p) => s + p.wage, 0)).toLocaleString()}</td>
                        <td style={{ color: "#176bca", fontWeight: 700 }}>฿{Math.round(weeklySummary.reduce((s, p) => s + p.com, 0)).toLocaleString()}</td>
                        <td className="money" style={{ fontSize: "14px" }}>฿{Math.round(weeklySummary.reduce((s, p) => s + p.grand, 0)).toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            )}
          </>
        )}

        {/* ======================== PAGE: PAYMENTS ======================== */}
        {page === "payments" && (
          <section className="content-card">
            <div className="table-heading">
              <div>
                <h2>รายการค่าตอบแทนทั้งหมด ({filteredRows.length} รายการ)</h2>
                <p>บันทึกการลงดันเจี้ยน ส่วนแบ่ง และสลิปโอนเงิน</p>
              </div>
              <div className="filters">
                <input
                  type="text"
                  placeholder="ค้นหาวันที่ (เช่น 23-Nov)..."
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  style={{ height: "35px", border: "1px solid #dce4ec", borderRadius: "5px", padding: "0 10px", fontSize: "12px" }}
                />
                <label>
                  {icons.filter}
                  <select value={selectedDungeonFilter} onChange={(e) => setSelectedDungeonFilter(e.target.value)}>
                    <option value="ทั้งหมด">ทุกดันเจี้ยน</option>
                    {allDungeonNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>วันที่ / เวลา</th>
                    <th>ดันเจี้ยน</th>
                    <th>ลูกค้า (CTM)</th>
                    <th>รายละเอียด</th>
                    <th>ยอดขาย</th>
                    <th>คอม {commissionRate}%</th>
                    <th>ทีมแบก</th>
                    <th>ยอดแบ่ง / คน</th>
                    <th>สลิป</th>
                    {role === "admin" && <th>จัดการ</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={role === "admin" ? 10 : 9} style={{ textAlign: "center", padding: "35px", color: "#888" }}>
                        📋 ไม่พบข้อมูลในเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => renderTableRow(row, role === "admin"))
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>แสดง {filteredRows.length} จาก {rows.length} รายการ</span>
            </div>
          </section>
        )}

        {/* ======================== PAGE: MEMBERS ======================== */}
        {page === "members" && (
          <section className="page-stack">
            <div className="toolbar-card">
              <label className="search-box">
                {icons.search}
                <input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="ค้นหาชื่อสมาชิก..."
                />
              </label>
              <div className="toolbar-meta">
                <strong>{memberList.length}</strong>
                <span>สมาชิกทั้งหมด</span>
              </div>
              <div className="toolbar-meta">
                <strong>{activePlayerIds.size}</strong>
                <span>ร่วมลงดันเจี้ยน</span>
              </div>
              {role === "admin" && (
                <button
                  type="button"
                  className="primary-button"
                  style={{ marginLeft: "auto" }}
                  onClick={() => setShowMemberForm(true)}
                >
                  {icons.plus} เพิ่มสมาชิกใหม่
                </button>
              )}
            </div>

            <div className="member-cards">
              {memberList
                .filter((p) => p.name.toLowerCase().includes(memberSearch.toLowerCase()))
                .map((player) => {
                  const playerRuns = rows.filter((r) => r.players.includes(player.id));
                  const income = playerRuns.reduce((sum, r) => {
                    const count = r.players.length || defaultCarryCount;
                    return sum + (r.sale * (1 - commissionRate / 100)) / count;
                  }, 0);
                  const comIncome = rows
                    .filter((r) => r.commissionTo === player.name)
                    .reduce((sum, r) => sum + (r.sale * commissionRate) / 100, 0);

                  return (
                    <article className="member-card" key={player.id}>
                      <div className="member-card-head">
                        <span className="member-avatar" style={{ background: player.color }}>
                          {player.name.replace("K.", "").trim().slice(0, 1)}
                        </span>
                        <span className="status-dot">พร้อมแบก</span>
                      </div>
                      <h3>{player.name}</h3>
                      <p>สมาชิกทีม 47Ravenge</p>
                      <div className="member-metrics">
                        <div>
                          <span>รอบที่เล่น</span>
                          <strong>{playerRuns.length} รอบ</strong>
                        </div>
                        <div>
                          <span>ค่าแรง</span>
                          <strong style={{ color: "#27ae60" }}>฿{Math.round(income).toLocaleString()}</strong>
                        </div>
                        <div>
                          <span>ค่าคอม</span>
                          <strong style={{ color: "#176bca" }}>฿{Math.round(comIncome).toLocaleString()}</strong>
                        </div>
                        <div>
                          <span>รวมทั้งสิ้น</span>
                          <strong className="money">฿{Math.round(income + comIncome).toLocaleString()}</strong>
                        </div>
                      </div>
                      <button
                        className="outline-button"
                        onClick={() => {
                          setSelectedDungeonFilter("ทั้งหมด");
                          setDateFilter("");
                          setPage("payments");
                          notify(`กำลังแสดงรายการทั้งหมด`);
                        }}
                      >
                        ดูรายการลงดันเจี้ยน
                      </button>
                    </article>
                  );
                })}
            </div>
          </section>
        )}

        {/* ======================== PAGE: REPORTS ======================== */}
        {page === "reports" && (
          <section className="page-stack">
            <div className="report-filter">
              <div>
                <span className="eyebrow">รายงานสรุปผลงาน</span>
                <h2>ภาพรวมรายได้และส่วนแบ่งรายบุคคล</h2>
              </div>
              <button
                className="primary-button"
                onClick={() => {
                  let csv = "วันที่,ดันเจี้ยน,ลูกค้า,ยอดขาย,ค่าคอม,ทีมแบก\n";
                  rows.forEach((r) => {
                    csv += `"${r.date}","${r.dungeon}","${r.ctm}",${r.sale},${(r.sale * commissionRate) / 100},"${r.players.join(";")}"\n`;
                  });
                  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `47manage-report-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  notify("ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว");
                }}
              >
                {icons.download} ส่งออก CSV
              </button>
            </div>

            <div className="report-layout">
              <article className="report-card chart-card">
                <div className="card-title">
                  <div>
                    <h3>ยอดรวมสะสมในระบบ</h3>
                    <p>สรุปการลงดันเจี้ยนทั้งหมด {rows.length} รอบ</p>
                  </div>
                  <strong>฿{total.toLocaleString()}</strong>
                </div>
                <div className="bar-chart">
                  {memberList.slice(0, 7).map((p) => {
                    const pRuns = rows.filter((r) => r.players.includes(p.id));
                    const inc = pRuns.reduce((sum, r) => sum + (r.sale * (1 - commissionRate / 100)) / (r.players.length || 4), 0);
                    const barH = total > 0 ? Math.max(20, Math.min(160, (inc / (total / 3)) * 140)) : 20;
                    return (
                      <div key={p.id}>
                        <span style={{ height: `${barH}px`, background: p.color }}></span>
                        <small>{p.name.slice(0, 5)}</small>
                      </div>
                    );
                  })}
                </div>
              </article>

              <article className="report-card">
                <div className="card-title">
                  <div>
                    <h3>สัดส่วนรายได้</h3>
                    <p>การแบ่งยอดขาย {commissionRate}% คอมมิชชั่น</p>
                  </div>
                </div>
                <div className="donut-wrap">
                  <div className="donut">
                    <strong>{100 - commissionRate}%</strong>
                    <span>ค่าแรงทีม</span>
                  </div>
                  <div className="legend">
                    <span><i className="blue"></i> กองกลางค่าแรง <b>฿{payout.toLocaleString()}</b></span>
                    <span><i className="light"></i> ค่าคอม {commissionRate}% <b>฿{commission.toLocaleString()}</b></span>
                  </div>
                </div>
              </article>
            </div>

            {/* Detailed Member Ranked Table */}
            <div className="content-card">
              <div className="table-heading">
                <div>
                  <h2>อันดับรายรับสุทธิสมาชิก</h2>
                  <p>คำนวณจากค่าแรงที่หารเท่า + ค่าคอมมิชชั่น {commissionRate}% ของแต่ละคน</p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>อันดับ</th>
                      <th>ชื่อสมาชิก</th>
                      <th>จำนวนรอบ</th>
                      <th>ค่าแรงหารเท่า</th>
                      <th>ค่าคอม {commissionRate}%</th>
                      <th>รายรับสุทธิ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberList
                      .map((p) => {
                        const pRuns = rows.filter((r) => r.players.includes(p.id));
                        const wage = pRuns.reduce((sum, r) => sum + (r.sale * (1 - commissionRate / 100)) / (r.players.length || 4), 0);
                        const com = rows.filter((r) => r.commissionTo === p.name).reduce((sum, r) => sum + (r.sale * commissionRate) / 100, 0);
                        return { ...p, rounds: pRuns.length, wage, com, grand: wage + com };
                      })
                      .sort((a, b) => b.grand - a.grand)
                      .map((p, idx) => (
                        <tr key={p.id}>
                          <td><strong>{idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`}</strong></td>
                          <td>
                            <div className="name-cell">
                              <PlayerAvatar player={p} small />
                              <strong>{p.name}</strong>
                            </div>
                          </td>
                          <td>{p.rounds} รอบ</td>
                          <td style={{ color: "#27ae60", fontWeight: 700 }}>฿{Math.round(p.wage).toLocaleString()}</td>
                          <td style={{ color: "#176bca", fontWeight: 700 }}>฿{Math.round(p.com).toLocaleString()}</td>
                          <td className="money" style={{ fontSize: "14px" }}>฿{Math.round(p.grand).toLocaleString()}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ======================== PAGE: LOGS ======================== */}
        {page === "logs" && (
          <section className="content-card">
            <div className="table-heading">
              <div>
                <h2>ประวัติการใช้งาน (Log History)</h2>
                <p>บันทึกการกระทำในระบบแบบ Realtime</p>
              </div>
              <div className="filters">
                <label>
                  {icons.filter}
                  <select value={logFilter} onChange={(e) => setLogFilter(e.target.value)}>
                    <option value="ทั้งหมด">ทุกประเภท</option>
                    <option value="สร้าง">สร้าง</option>
                    <option value="แก้ไข">แก้ไข</option>
                    <option value="ลบ">ลบ</option>
                    <option value="สมาชิก">สมาชิก</option>
                    <option value="ระบบ">ระบบ</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>เวลา</th>
                    <th>ผู้ดำเนินการ</th>
                    <th>การกระทำ</th>
                    <th>เป้าหมาย</th>
                    <th>ประเภท</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: "center", padding: "30px", color: "#888" }}>ยังไม่มีประวัติการทำรายการ</td></tr>
                  ) : (
                    logs
                      .filter((l) => logFilter === "ทั้งหมด" || l.type === logFilter)
                      .map((l) => (
                        <tr key={l.id}>
                          <td><small>{l.time}</small></td>
                          <td><strong>{l.user}</strong></td>
                          <td>{l.action}</td>
                          <td><code className="log-target">{l.target}</code></td>
                          <td><span className={`type-badge type-${l.type}`}>{l.type}</span></td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ======================== PAGE: SETTINGS (ADMIN ONLY) ======================== */}
        {page === "settings" && role === "admin" && (
          <section className="page-stack">
            <div className="settings-layout">
              {/* Card 1: Dungeon Template Management */}
              <div className="settings-card full">
                <div className="settings-title">
                  <div className="settings-icon">🏰</div>
                  <div>
                    <h2>จัดการดันเจี้ยน ความยาก และราคา</h2>
                    <p>สร้างดันเจี้ยน เพิ่มความยาก (NM/Hell/Infinite) และกำหนดราคาแต่ละ Tier</p>
                  </div>
                </div>

                {/* Add new dungeon */}
                <form onSubmit={handleAddDungeonTemplate} style={{ display: "flex", gap: "10px", margin: "16px 0", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    placeholder="ชื่อดันเจี้ยนใหม่ (เช่น Apo, Maya95)"
                    required
                    value={newDungeonName}
                    onChange={(e) => setNewDungeonName(e.target.value)}
                    style={{ flex: 2, height: "38px", border: "1px solid #dce4ec", borderRadius: "5px", padding: "0 12px", fontSize: "13px" }}
                  />
                  <button type="submit" className="primary-button" style={{ height: "38px" }}>
                    + เพิ่มดันเจี้ยนใหม่
                  </button>
                </form>

                {/* Dungeon list */}
                <div className="dungeon-tree">
                  {dungeonTemplates.map((tmpl) => (
                    <div key={tmpl.id} className="dungeon-group">
                      {/* Header */}
                      <div className="dungeon-group-header" onClick={() => setEditingTemplateId(editingTemplateId === tmpl.id ? null : tmpl.id)}>
                        <span className="dungeon-group-name">🏰 {tmpl.name}</span>
                        <span className="dungeon-group-badge">{tmpl.difficulties.length} ความยาก</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteDungeonTemplate(tmpl.id); }}
                          style={{ border: 0, background: "none", color: "#d9534f", cursor: "pointer", marginLeft: "8px" }}
                        >
                          {icons.trash}
                        </button>
                      </div>

                      {/* Difficulties list */}
                      {tmpl.difficulties.length > 0 && (
                        <div className="dungeon-difficulty-list">
                          {tmpl.difficulties.map((diff) => (
                            <div key={diff.name} className="dungeon-difficulty-row">
                              <span className="diff-name">{diff.name || "ระดับเดียว"}</span>
                              <div className="diff-tiers">
                                {diff.tiers.map((tier) => (
                                  <span key={tier.label} className="diff-tier-chip">
                                    ชั้น {tier.label} · <strong>฿{tier.price.toLocaleString()}</strong>
                                  </span>
                                ))}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteDifficulty(tmpl.id, diff.name)}
                                style={{ border: 0, background: "none", color: "#bbb", cursor: "pointer" }}
                              >
                                {icons.trash}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add difficulty panel (expanded) */}
                      {editingTemplateId === tmpl.id && (
                        <div className="dungeon-add-panel">
                          <h4>+ เพิ่มความยากให้ {tmpl.name}</h4>
                          <label className="field">
                            <span>ชื่อความยาก (เช่น Nightmare, Hell, Infinite หรือปล่อยว่างถ้ามีระดับเดียว)</span>
                            <input
                              type="text"
                              value={newDiffName}
                              onChange={(e) => setNewDiffName(e.target.value)}
                              placeholder="เช่น Nightmare"
                            />
                          </label>
                          <strong style={{ fontSize: "12px", display: "block", margin: "10px 0 6px" }}>Tiers และราคา (เพิ่มหลายแถวได้)</strong>
                          {newTiers.map((tier, idx) => (
                            <div key={idx} className="tier-row">
                              <input
                                type="text"
                                placeholder="ชั้น (เช่น 1-3, 4-5, 1-5)"
                                value={tier.label}
                                onChange={(e) => { const t = [...newTiers]; t[idx] = { ...t[idx], label: e.target.value }; setNewTiers(t); }}
                              />
                              <input
                                type="number"
                                placeholder="ราคา (฿)"
                                min={0}
                                value={tier.price || ""}
                                onChange={(e) => { const t = [...newTiers]; t[idx] = { ...t[idx], price: Number(e.target.value) }; setNewTiers(t); }}
                              />
                              <button
                                type="button"
                                onClick={() => setNewTiers(newTiers.filter((_, i) => i !== idx))}
                                style={{ border: 0, background: "none", color: "#bbb", cursor: "pointer" }}
                              >✕</button>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="outline-button"
                            style={{ marginTop: "8px" }}
                            onClick={() => setNewTiers([...newTiers, { label: "", price: 0 }])}
                          >
                            + เพิ่ม Tier
                          </button>
                          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                            <button
                              type="button"
                              onClick={() => setEditingTemplateId(null)}
                              style={{ border: "1px solid #ddd", borderRadius: "4px", padding: "0 14px", height: "36px", background: "#fff" }}
                            >ยกเลิก</button>
                            <button
                              type="button"
                              className="primary-button"
                              onClick={() => handleAddDifficulty(tmpl.id)}
                            >บันทึกความยาก</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {dungeonTemplates.length === 0 && (
                    <p style={{ color: "#aaa", textAlign: "center", padding: "20px" }}>ยังไม่มีดันเจี้ยน — เพิ่มดันเจี้ยนแรกด้านบน</p>
                  )}
                </div>
              </div>

              {/* Card 2: General System Settings */}
              <div className="settings-card">
                <div className="settings-title">
                  <div className="settings-icon">⚙️</div>
                  <div>
                    <h2>ตั้งค่าระบบทั่วไป</h2>
                    <p>กำหนดจำนวนคนแบกและอัตราค่าคอมมิชชั่น</p>
                  </div>
                </div>

                <form onSubmit={handleSaveGeneralSettings} style={{ marginTop: "16px" }}>
                  <label className="setting-field">
                    <span>จำนวนคนแบกเริ่มต้น (ต่อ 1 รอบ)</span>
                    <div>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        value={defaultCarryCount}
                        onChange={(e) => setDefaultCarryCount(Number(e.target.value))}
                      />
                      <b>คน</b>
                    </div>
                    <small>ระบบจะคำนวณค่าแรงหารเท่าตามจำนวนนี้ (ปกติ 4 คน)</small>
                  </label>

                  <label className="setting-field">
                    <span>อัตราค่าคอมมิชชั่นคนหาลูกค้า (%)</span>
                    <div>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={commissionRate}
                        onChange={(e) => setCommissionRate(Number(e.target.value))}
                      />
                      <b>%</b>
                    </div>
                    <small>คิดจากยอดขายเต็มก่อนนำมาหักค่าแรง</small>
                  </label>

                  <label className="field" style={{ marginTop: "16px" }}>
                    <span>เปลี่ยนรหัสผ่านแอดมิน (ปล่อยว่างไว้ถ้าไม่ต้องการเปลี่ยน)</span>
                    <input
                      type="password"
                      placeholder="รหัสผ่านใหม่"
                      value={tempAdminPass}
                      onChange={(e) => setTempAdminPass(e.target.value)}
                    />
                  </label>

                  <button type="submit" className="primary-button" style={{ marginTop: "15px", width: "100%" }}>
                    บันทึกการตั้งค่าระบบ
                  </button>
                </form>
              </div>

              {/* Card 3: Permissions Information */}
              <div className="settings-card">
                <div className="settings-title">
                  <div className="settings-icon">🛡️</div>
                  <div>
                    <h2>ระดับสิทธิ์ในระบบ</h2>
                    <p>สิทธิ์การเข้าถึงสำหรับผู้ดูแลและสมาชิก</p>
                  </div>
                </div>

                <div className="permission-grid">
                  <div>
                    <strong>🛡️ ผู้ดูแลระบบ (Admin)</strong>
                    <span>เพิ่ม/แก้ไข/ลบรอบดันเจี้ยน, จัดการสมาชิก, ตั้งค่าระบบ และส่งออกข้อมูล</span>
                  </div>
                  <div>
                    <strong>👀 สมาชิก (Member)</strong>
                    <span>เข้าตรวจสอบตาราง ยอดเงิน รายได้สะสม สลิปการโอน และดูประวัติได้อย่างโปร่งใส (ดูอย่างเดียว)</span>
                  </div>
                </div>

                <div style={{ marginTop: "14px", padding: "12px 14px", background: "#f0f7ff", borderRadius: "8px", border: "1px solid #c8dff8" }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                    {icons.info}
                    <div>
                      <strong style={{ fontSize: "12px", display: "block" }}>การจัดการ Role ผู้ใช้</strong>
                      <small style={{ color: "#555", lineHeight: 1.5, display: "block", marginTop: "2px" }}>
                        สมาชิกที่สมัครผ่านหน้า Register จะได้ยศ <code>member</code> โดยอัตโนมัติ<br />
                        Admin สามารถอัปเกรด Role เป็น <code>admin</code> ได้ผ่าน Firebase Console → users collection
                      </small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* ======================== MODAL: PLAYER DETAIL ======================== */}
      {selectedRow && (
        <PlayerDetailModal
          row={selectedRow}
          memberList={memberList}
          commissionRate={commissionRate}
          defaultCarryCount={defaultCarryCount}
          onClose={() => setSelectedRow(null)}
        />
      )}

      {/* ======================== MODAL: ADD / EDIT PAYMENT ======================== */}
      {(showAdd || editRow) && (
        <div className="modal-backdrop" onMouseDown={() => { setShowAdd(false); setEditRow(null); }}>
          <form
            className="modal"
            onSubmit={savePayment}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ width: "520px", maxHeight: "90vh" }}
          >
            <button type="button" className="modal-close" onClick={() => { setShowAdd(false); setEditRow(null); }}>×</button>
            <span className="eyebrow">{editRow ? `แก้ไขรอบ ${editRow.dungeon}` : "เพิ่มรอบใหม่"}</span>
            <h2>{editRow ? "แก้ไขข้อมูลรอบดันเจี้ยน" : "บันทึกรอบดันเจี้ยน"}</h2>
            <p>บันทึกรายละเอียด เลือกลูกค้า ทีมแบก และแนบสลิป</p>

            <div className="modal-scroll" style={{ maxHeight: "62vh", overflowY: "auto", paddingRight: "4px" }}>
              <div className="form-grid">
                <label className="field">
                  <span>วันที่</span>
                  <input name="date" type="text" required defaultValue={editRow?.date ?? "23-Nov"} placeholder="เช่น 23-Nov" />
                </label>
                <label className="field">
                  <span>เวลา</span>
                  <input name="time" type="time" required defaultValue={editRow?.time ?? "21:00"} />
                </label>
              </div>

              {/* Level 1: Dungeon */}
              <label className="field">
                <span>ดันเจี้ยน</span>
                <select
                  value={formDungeonId}
                  onChange={(e) => {
                    const tmpl = dungeonTemplates.find((t) => t.id === e.target.value);
                    setFormDungeonId(e.target.value);
                    const firstDiff = tmpl?.difficulties[0];
                    setFormDiffName(firstDiff?.name || "");
                    const firstTier = firstDiff?.tiers[0];
                    setFormTierLabel(firstTier?.label || "");
                    setFormSaleOverride(firstTier?.price || 0);
                  }}
                >
                  {dungeonTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>

              {/* Level 2: Difficulty */}
              {selectedTemplate && selectedTemplate.difficulties.length > 0 && (
                <label className="field">
                  <span>ความยาก</span>
                  <select
                    value={formDiffName}
                    onChange={(e) => {
                      const diff = selectedTemplate.difficulties.find((d) => d.name === e.target.value);
                      setFormDiffName(e.target.value);
                      const firstTier = diff?.tiers[0];
                      setFormTierLabel(firstTier?.label || "");
                      setFormSaleOverride(firstTier?.price || 0);
                    }}
                  >
                    {selectedTemplate.difficulties.map((d) => (
                      <option key={d.name} value={d.name}>{d.name || "ระดับเดียว"}</option>
                    ))}
                  </select>
                </label>
              )}

              {/* Level 3: Tier */}
              {selectedDiff && selectedDiff.tiers.length > 0 && (
                <label className="field">
                  <span>ช่วงชั้น (Tier)</span>
                  <select
                    value={formTierLabel}
                    onChange={(e) => {
                      const tier = selectedDiff.tiers.find((t) => t.label === e.target.value);
                      setFormTierLabel(e.target.value);
                      setFormSaleOverride(tier?.price || 0);
                    }}
                  >
                    {selectedDiff.tiers.map((t) => (
                      <option key={t.label} value={t.label}>ชั้น {t.label} — ฿{t.price.toLocaleString()}</option>
                    ))}
                  </select>
                </label>
              )}

              <div className="form-grid">
                <label className="field">
                  <span>ลูกค้า (CTM)</span>
                  <input name="ctm" required placeholder="ชื่อลูกค้า" defaultValue={editRow?.ctm ?? ""} />
                </label>
                <label className="field">
                  <span>ยอดขายเต็ม (บาท)</span>
                  <input
                    key={formSaleOverride}
                    name="sale"
                    required
                    min="1"
                    type="number"
                    placeholder="400"
                    defaultValue={editRow?.sale ?? formSaleOverride}
                  />
                </label>
              </div>

              <label className="field">
                <span>รายละเอียดเพิ่มเติม</span>
                <input name="detail" placeholder="เช่น ฟูลเคลียร์ / โบนัส" defaultValue={editRow?.detail ?? "ลงรอบปกติ"} />
              </label>

              <label className="field">
                <span>ผู้ได้รับค่าคอมมิชชั่น {commissionRate}% (คนหาลูกค้า)</span>
                <select name="commissionTo" defaultValue={editRow?.commissionTo ?? memberList[0]?.name}>
                  {memberList.map((p) => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </label>

              <div className="picker-heading" style={{ display: "flex", justifyContent: "space-between", margin: "14px 0 6px" }}>
                <strong>เลือกทีมแบก</strong>
                <span style={{ fontSize: "12px", color: selectedPlayers.length === defaultCarryCount ? "#27ae60" : "#e67e22", fontWeight: 700 }}>
                  เลือกแล้ว {selectedPlayers.length}/{defaultCarryCount} คน
                </span>
              </div>

              <div className="player-picker" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                {memberList.map((player) => {
                  const isChecked = selectedPlayers.includes(player.id);
                  return (
                    <label
                      key={player.id}
                      className={isChecked ? "selected" : ""}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: isChecked ? "1.5px solid #176bca" : "1px solid #dce4ec",
                        background: isChecked ? "#edf5fd" : "#fff",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        cursor: "pointer"
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelectedPlayer(player.id)}
                      />
                      <PlayerAvatar player={player} small />
                      <span style={{ fontSize: "12px", fontWeight: 600 }}>{player.name}</span>
                    </label>
                  );
                })}
              </div>

              <div style={{ marginTop: "14px" }}>
                <label className="upload-box" style={{ cursor: "pointer", display: "block" }}>
                  <input type="file" accept="image/*" onChange={handleSlipFile} style={{ display: "none" }} />
                  <div style={{ textAlign: "center", padding: "14px" }}>
                    <span className="upload-icon" style={{ fontSize: "20px" }}>📷</span>
                    <strong style={{ display: "block", marginTop: "4px" }}>
                      {currentSlipBase64 ? "มีรูปสลิปแล้ว (คลิกเพื่อเปลี่ยนรูป)" : "แนบสลิปการโอนเงิน (คลิกเลือกรูปภาพ)"}
                    </strong>
                    <small style={{ color: "#888" }}>รองรับไฟล์รูปภาพ JPG, PNG</small>
                  </div>
                </label>

                {currentSlipBase64 && (
                  <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "10px", padding: "8px", background: "#f0f6fc", borderRadius: "6px" }}>
                    <img src={currentSlipBase64} alt="Preview" style={{ width: "50px", height: "50px", objectFit: "cover", borderRadius: "4px" }} />
                    <span style={{ fontSize: "12px", color: "#176bca", fontWeight: 600 }}>สลิปพร้อมบันทึก</span>
                    <button
                      type="button"
                      onClick={() => setCurrentSlipBase64("")}
                      style={{ marginLeft: "auto", color: "#d9534f", fontSize: "12px", border: 0, background: "none", cursor: "pointer" }}
                    >
                      ✕ ลบสลิป
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              {editRow && (
                <button type="button" className="delete-button" onClick={deletePayment}>
                  {icons.trash} ลบรายการ
                </button>
              )}
              <button
                type="button"
                onClick={() => { setShowAdd(false); setEditRow(null); }}
                style={{ marginLeft: "auto" }}
              >
                ยกเลิก
              </button>
              <button type="submit" className="primary-button">
                บันทึกรายการ
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ======================== MODAL: ADD MEMBER ======================== */}
      {showMemberForm && role === "admin" && (
        <div className="modal-backdrop" onMouseDown={() => setShowMemberForm(false)}>
          <form
            className="modal member-form"
            onSubmit={addMember}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button type="button" className="modal-close" onClick={() => setShowMemberForm(false)}>×</button>
            <span className="eyebrow">สมาชิกใหม่</span>
            <h2>เพิ่มสมาชิกเข้าทีม</h2>
            <p>กรอกเพียงชื่อผู้เล่น ก็สามารถเลือกในรายการดันเจี้ยนได้ทันที (ไม่ต้องกรอกอีเมล)</p>

            <label className="field" style={{ marginTop: "16px" }}>
              <span>ชื่อผู้เล่น / Player Name</span>
              <input
                required
                autoFocus
                placeholder="เช่น K.Arm หรือ นิว"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
              />
            </label>

            <div className="modal-actions" style={{ marginTop: "20px" }}>
              <button type="button" onClick={() => setShowMemberForm(false)}>ยกเลิก</button>
              <button type="submit" className="primary-button">+ เพิ่มสมาชิกเข้าทีม</button>
            </div>
          </form>
        </div>
      )}

      {/* ======================== MODAL: VIEW FULL SLIP ======================== */}
      {viewSlipUrl && (
        <div className="modal-backdrop" onMouseDown={() => setViewSlipUrl(null)}>
          <div
            className="modal"
            style={{ width: "420px", textAlign: "center", padding: "18px" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button type="button" className="modal-close" onClick={() => setViewSlipUrl(null)}>×</button>
            <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px" }}>🧾 สลิปการโอนเงิน</h3>
            <div style={{ maxHeight: "70vh", overflowY: "auto", borderRadius: "6px", border: "1px solid #ddd" }}>
              <img src={viewSlipUrl} alt="Slip" style={{ width: "100%", display: "block" }} />
            </div>
            <button
              type="button"
              className="outline-button"
              style={{ marginTop: "14px", width: "100%" }}
              onClick={() => setViewSlipUrl(null)}
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="toast">
          <span>สำเร็จ</span>
          {toast}
        </div>
      )}
    </div>
  );
}

// ======================== ROOT APP COMPONENT ========================
export default function App() {
  const [session, setSession] = useState<{ role: Role; username: string } | null>(() => {
    const savedRole = localStorage.getItem("47manage_role") as Role | null;
    const savedUser = localStorage.getItem("47manage_username") || "";
    if (savedRole && (savedRole === "admin" || savedRole === "member")) {
      return { role: savedRole, username: savedUser || (savedRole === "admin" ? "Admin" : "Member") };
    }
    return null;
  });

  const handleLogin = (role: Role, username: string) => {
    localStorage.setItem("47manage_role", role);
    localStorage.setItem("47manage_username", username);
    setSession({ role, username });
  };

  const handleLogout = () => {
    localStorage.removeItem("47manage_role");
    localStorage.removeItem("47manage_username");
    setSession(null);
  };

  return session ? (
    <Dashboard role={session.role} username={session.username} onLogout={handleLogout} />
  ) : (
    <Login onLogin={handleLogin} />
  );
}
