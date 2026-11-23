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
  getDocs
} from "firebase/firestore";

type Role = "admin" | "member";
type Page = "overview" | "payments" | "members" | "reports" | "logs" | "settings";

type Player = {
  id: string;
  name: string;
  color: string;
};

type DungeonPreset = {
  name: string;
  price: number;
};

type PaymentRow = {
  id: string;
  date: string;
  time: string;
  dungeon: string;
  ctm: string;
  price: number;
  detail: string;
  sale: number;
  players: string[];
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
  image: <Icon size={16}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></Icon>
};

// ======================== LOGIN COMPONENT ========================
function Login({ onLogin }: { onLogin: (role: Role, username: string) => void }) {
  const [role, setRole] = useState<Role>("admin");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (role === "admin") {
      const savedAdminPass = localStorage.getItem("47manage_admin_pass") || "admin";
      if (!username.trim()) {
        setErrorMsg("กรุณากรอกชื่อผู้ใช้");
        return;
      }
      if (password === savedAdminPass || password === "47family" || password === "admin") {
        onLogin("admin", username.trim());
      } else {
        setErrorMsg("รหัสผ่านไม่ถูกต้อง (รหัสเริ่มต้น: admin หรือ 47family)");
      }
    } else {
      const memberName = username.trim() || "สมาชิกทั่วไป";
      onLogin("member", memberName);
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
          <h1>เข้าสู่ระบบจัดการ<br />ค่าตอบแทน</h1>
          <p>ตรวจสอบและจัดการรายได้ของทีมอย่างโปร่งใส</p>
        </div>

        <div className="role-switch">
          <button
            type="button"
            className={role === "admin" ? "active" : ""}
            onClick={() => { setRole("admin"); setUsername("admin"); setErrorMsg(""); }}
          >
            ผู้ดูแลระบบ (Admin)
          </button>
          <button
            type="button"
            className={role === "member" ? "active" : ""}
            onClick={() => { setRole("member"); setUsername("Member"); setErrorMsg(""); }}
          >
            สมาชิก (ดูอย่างเดียว)
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>{role === "admin" ? "ชื่อผู้ใช้ (Username)" : "ชื่อของคุณ (หรือปล่อยว่าง)"}</span>
            <input
              type="text"
              required={role === "admin"}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={role === "admin" ? "เช่น admin" : "ชื่อสมาชิก"}
            />
          </label>

          {role === "admin" && (
            <label className="field">
              <span>รหัสผ่าน (Password)</span>
              <div className="password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่าน"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? "ซ่อน" : "แสดง"}
                </button>
              </div>
            </label>
          )}

          {errorMsg && (
            <p style={{ color: "#d9534f", fontSize: "11px", marginBottom: "12px", textAlign: "center" }}>
              ⚠️ {errorMsg}
            </p>
          )}

          <button type="submit" className="login-button">
            {role === "admin" ? "เข้าสู่ระบบผู้ดูแล" : "เข้าใช้งานในฐานะสมาชิก (ดูอย่างเดียว)"}
            <span>{icons.chevron}</span>
          </button>
        </form>

        <p className="demo-note">
          {role === "admin"
            ? "💡 บัญชีผู้ดูแล: รหัสเริ่มต้นคือ admin หรือ 47family (เปลี่ยนได้ในหน้าตั้งค่า)"
            : "👀 สมาชิกทั่วไป: เข้าดูตาราง ยอดเงิน และสลิปได้แบบ Read-only"}
        </p>
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

// ======================== DASHBOARD COMPONENT ========================
function Dashboard({ role, username, onLogout }: { role: Role; username: string; onLogout: () => void }) {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [memberList, setMemberList] = useState<Player[]>(DEFAULT_PLAYERS);
  const [dungeons, setDungeons] = useState<DungeonPreset[]>(DEFAULT_DUNGEONS);
  const [defaultCarryCount, setDefaultCarryCount] = useState<number>(4);
  const [commissionRate, setCommissionRate] = useState<number>(10);
  const [adminPass, setAdminPass] = useState<string>("admin");

  const [page, setPage] = useState<Page>("overview");
  const [selectedDungeonFilter, setSelectedDungeonFilter] = useState("ทั้งหมด");
  const [dateFilter, setDateFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedRow, setSelectedRow] = useState<PaymentRow | null>(null);
  const [editRow, setEditRow] = useState<PaymentRow | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [currentSlipBase64, setCurrentSlipBase64] = useState<string>("");
  const [viewSlipUrl, setViewSlipUrl] = useState<string | null>(null);

  const [showMemberForm, setShowMemberForm] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [logFilter, setLogFilter] = useState("ทั้งหมด");
  const [toast, setToast] = useState("");

  const [logs, setLogs] = useState<LogItem[]>([]);

  // Settings temp state
  const [newDungeonName, setNewDungeonName] = useState("");
  const [newDungeonPrice, setNewDungeonPrice] = useState("");
  const [tempAdminPass, setTempAdminPass] = useState("");

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
          dungeon: val.dungeon || val.detail || "Apo NM 1-5",
          ctm: val.ctm || val.customer || "-",
          price: Number(val.price || val.sale) || 0,
          sale: Number(val.sale || val.price) || 0,
          detail: val.detail || val.dungeon || "",
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
        // initialize default if empty
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
        if (Array.isArray(val.list) && val.list.length > 0) {
          setDungeons(val.list);
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

  const pageTitles: Record<Page, [string, string]> = {
    overview: ["ภาพรวมค่าตอบแทน", "ติดตามรายได้ ส่วนแบ่งของทีม และสถิติล่าสุด"],
    payments: ["รายการค่าตอบแทน", "จัดการรายการเล่น สลิป และส่วนแบ่งทั้งหมด"],
    members: ["สมาชิกทีม", "รายชื่อสมาชิกและยอดรายได้สะสมของแต่ละคน"],
    reports: ["รายงานสรุป", "วิเคราะห์ยอดขาย ค่าคอม และส่วนแบ่งผู้เล่น"],
    logs: ["Log History", "ประวัติการใช้งานและการเปลี่ยนแปลงในระบบ"],
    settings: ["ตั้งค่าระบบ", "กำหนดรายชื่อดันเจี้ยน จำนวนคนแบก และกติกา"],
  };

  const toggleSelectedPlayer = (playerId: string) => {
    setSelectedPlayers((current) =>
      current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId]
    );
  };

  const openAdd = () => {
    setSelectedPlayers([]);
    setCurrentSlipBase64("");
    setShowAdd(true);
  };

  const openEdit = (row: PaymentRow) => {
    setSelectedPlayers(row.players);
    setCurrentSlipBase64(row.slip || "");
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
    const saleAmount = Number(data.get("sale")) || 0;
    const dungeonName = String(data.get("dungeon"));
    const ctmName = String(data.get("ctm"));
    const detailText = String(data.get("detail"));
    const dateVal = String(data.get("date"));
    const timeVal = String(data.get("time"));
    const commissionToVal = String(data.get("commissionTo"));

    const payload = {
      date: dateVal,
      time: timeVal,
      dungeon: dungeonName,
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

    try {
      if (editRow) {
        await updateDoc(doc(db, "runs", editRow.id), payload);
        await addLog("แก้ไขรายการ", `${dungeonName} (฿${saleAmount}) - ${ctmName}`, "แก้ไข");
        notify("บันทึกการแก้ไขรอบแล้ว");
      } else {
        await addDoc(collection(db, "runs"), {
          ...payload,
          createdAt: serverTimestamp()
        });
        await addLog("เพิ่มรายการใหม่", `${dungeonName} (฿${saleAmount}) - ${ctmName}`, "สร้าง");
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

  // ======================== ADD MEMBER (NO EMAIL REQUIRED) ========================
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
  const handleAddDungeon = async (e: FormEvent) => {
    e.preventDefault();
    if (!newDungeonName.trim()) return;
    const price = Number(newDungeonPrice) || 0;
    const updated = [...dungeons, { name: newDungeonName.trim(), price }];
    try {
      await setDoc(doc(db, "settings", "dungeons"), { list: updated });
      await addLog("เพิ่มดันเจี้ยนในระบบ", `${newDungeonName} (฿${price})`, "ระบบ");
      notify(`เพิ่มดันเจี้ยน "${newDungeonName}" สำเร็จ`);
      setNewDungeonName("");
      setNewDungeonPrice("");
    } catch (err: any) {
      alert("เกิดข้อผิดพลาด: " + err.message);
    }
  };

  const handleDeleteDungeon = async (name: string) => {
    if (!confirm(`ยืนยันลบดันเจี้ยน "${name}" ออกจากระบบ?`)) return;
    const updated = dungeons.filter((d) => d.name !== name);
    try {
      await setDoc(doc(db, "settings", "dungeons"), { list: updated });
      await addLog("ลบดันเจี้ยน", name, "ระบบ");
      notify(`ลบดันเจี้ยน "${name}" แล้ว`);
    } catch (err: any) {
      alert("เกิดข้อผิดพลาด: " + err.message);
    }
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

  return (
    <div className="app-shell">
      {/* ======================== SIDEBAR ======================== */}
      <aside className="sidebar">
        <div className="side-brand">
          <div className="brand-mark mini"><span>47</span></div>
          <div><strong>47RAVENGE</strong><small>Reward Management</small></div>
        </div>

        <nav>
          <span className="nav-label">เมนูหลัก</span>
          <button className={`nav-item ${page === "overview" ? "active" : ""}`} onClick={() => setPage("overview")}>
            {icons.grid}<span>ภาพรวม</span>
          </button>
          <button className={`nav-item ${page === "payments" ? "active" : ""}`} onClick={() => setPage("payments")}>
            {icons.table}<span>รายการค่าตอบแทน</span><b>{rows.length}</b>
          </button>
          <button className={`nav-item ${page === "members" ? "active" : ""}`} onClick={() => setPage("members")}>
            {icons.users}<span>สมาชิกทีม</span><b>{memberList.length}</b>
          </button>
          <button className={`nav-item ${page === "reports" ? "active" : ""}`} onClick={() => setPage("reports")}>
            {icons.chart}<span>รายงานสรุป</span>
          </button>
          <button className={`nav-item ${page === "logs" ? "active" : ""}`} onClick={() => setPage("logs")}>
            {icons.history}<span>Log History</span>
          </button>

          {role === "admin" && (
            <>
              <span className="nav-label second">ผู้ดูแลระบบ</span>
              <button className={`nav-item ${page === "settings" ? "active" : ""}`} onClick={() => setPage("settings")}>
                {icons.settings}<span>ตั้งค่าระบบ</span>
              </button>
            </>
          )}
        </nav>

        <div className="commission-rule">
          <span>กติกาการแบ่งเงิน</span>
          <strong>หักค่าคอมมิชชั่น {commissionRate}%</strong>
          <p>ยอดคงเหลือแบ่งเท่ากัน {defaultCarryCount} คนแบกในแต่ละรอบ</p>
        </div>

        <div className="profile">
          <div className="profile-avatar">{username.slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{username}</strong>
            <small style={{ color: role === "admin" ? "#176bca" : "#666" }}>
              {role === "admin" ? "🛡️ ผู้ดูแลระบบ" : "👀 สมาชิก (ดูอย่างเดียว)"}
            </small>
          </div>
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
                      {dungeons.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
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
                          📋 ยังไม่มีรายการรอบในเงื่อนไขที่เลือก
                        </td>
                      </tr>
                    ) : (
                      filteredRows.slice(0, 10).map((row) => {
                        const carryCount = row.players.length || defaultCarryCount;
                        const perPlayer = (row.sale * (1 - commissionRate / 100)) / carryCount;
                        return (
                          <tr key={row.id}>
                            <td>
                              <strong>{row.date}</strong>
                              <small>{row.time} น.</small>
                            </td>
                            <td>
                              <span className="dungeon-name">{row.dungeon}</span>
                              <small>{row.detail}</small>
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
                                <button
                                  type="button"
                                  onClick={() => setViewSlipUrl(row.slip!)}
                                  style={{ color: "#176bca", fontWeight: 700, fontSize: "11px", textDecoration: "underline" }}
                                >
                                  ดูสลิป
                                </button>
                              ) : <span style={{ color: "#ccc" }}>-</span>}
                            </td>
                            {role === "admin" && (
                              <td>
                                <button className="more-button" onClick={() => openEdit(row)} title="แก้ไข">
                                  •••
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
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
                  style={{ height: "35px", border: "1px solid #dce4ec", borderRadius: "5px", padding: "0 10px", fontSize: "11px" }}
                />
                <label>
                  {icons.filter}
                  <select value={selectedDungeonFilter} onChange={(e) => setSelectedDungeonFilter(e.target.value)}>
                    <option value="ทั้งหมด">ทุกดันเจี้ยน</option>
                    {dungeons.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
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
                    filteredRows.map((row) => {
                      const carryCount = row.players.length || defaultCarryCount;
                      const perPlayer = (row.sale * (1 - commissionRate / 100)) / carryCount;
                      return (
                        <tr key={row.id}>
                          <td>
                            <strong>{row.date}</strong>
                            <small>{row.time} น.</small>
                          </td>
                          <td>
                            <span className="dungeon-name">{row.dungeon}</span>
                            <small>{row.detail}</small>
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
                              <button
                                type="button"
                                onClick={() => setViewSlipUrl(row.slip!)}
                                style={{ color: "#176bca", fontWeight: 700, fontSize: "11px", textDecoration: "underline" }}
                              >
                                ดูสลิป
                              </button>
                            ) : <span style={{ color: "#ccc" }}>-</span>}
                          </td>
                          {role === "admin" && (
                            <td>
                              <button className="more-button" onClick={() => openEdit(row)} title="แก้ไข">
                                •••
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
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
                  {icons.plus} เพิ่มสมาชิกใหม่ (ไม่ต้องกรอกอีเมล)
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
                          <span>รายได้รวม</span>
                          <strong>฿{Math.round(income + comIncome).toLocaleString()}</strong>
                        </div>
                      </div>
                      <button
                        className="outline-button"
                        onClick={() => {
                          setSelectedDungeonFilter("ทั้งหมด");
                          setDateFilter("");
                          setPage("payments");
                          notify(`กำลังแสดงรายการของ ${player.name}`);
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
                    <span><i className="light"></i> ค่าคอม 10% <b>฿{commission.toLocaleString()}</b></span>
                  </div>
                </div>
              </article>
            </div>

            {/* Detailed Member Ranked Table */}
            <div className="content-card">
              <div className="table-heading">
                <div>
                  <h2>อันดับรายรับสุทธิสมาชิก</h2>
                  <p>คำนวณจากค่าแรงที่หารเท่า + ค่าคอมมิชชั่น 10% ของแต่ละคน</p>
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
                      <th>ค่าคอม 10%</th>
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
                          <td className="money" style={{ fontSize: "13px" }}>฿{Math.round(p.grand).toLocaleString()}</td>
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
              {/* Card 1: Dungeon Management */}
              <div className="settings-card full">
                <div className="settings-title">
                  <div className="settings-icon">🏰</div>
                  <div>
                    <h2>ตั้งค่ารายชื่อดันเจี้ยนและราคามาตรฐาน</h2>
                    <p>กำหนดรายชื่อดันเจี้ยนที่จะให้เลือกในฟอร์มบันทึกรอบ</p>
                  </div>
                </div>

                <div style={{ marginTop: "16px" }}>
                  <form onSubmit={handleAddDungeon} style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
                    <input
                      type="text"
                      placeholder="ชื่อดันเจี้ยนใหม่ (เช่น Apo NM 1-5)"
                      required
                      value={newDungeonName}
                      onChange={(e) => setNewDungeonName(e.target.value)}
                      style={{ flex: 2, height: "38px", border: "1px solid #dce4ec", borderRadius: "5px", padding: "0 12px", fontSize: "11px" }}
                    />
                    <input
                      type="number"
                      placeholder="ราคาเริ่มต้น (บาท)"
                      required
                      min="0"
                      value={newDungeonPrice}
                      onChange={(e) => setNewDungeonPrice(e.target.value)}
                      style={{ flex: 1, height: "38px", border: "1px solid #dce4ec", borderRadius: "5px", padding: "0 12px", fontSize: "11px" }}
                    />
                    <button type="submit" className="primary-button" style={{ height: "38px" }}>
                      + เพิ่มดันเจี้ยน
                    </button>
                  </form>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "10px" }}>
                    {dungeons.map((d) => (
                      <div
                        key={d.name}
                        style={{
                          padding: "10px 14px",
                          border: "1px solid #e1e7ee",
                          borderRadius: "6px",
                          background: "#f9fbfd",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between"
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: "12px", color: "#172033" }}>{d.name}</strong>
                          <span style={{ display: "block", fontSize: "10px", color: "#176bca", fontWeight: 700 }}>
                            ฿{d.price.toLocaleString()}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteDungeon(d.name)}
                          style={{ border: 0, background: "none", color: "#d9534f", cursor: "pointer" }}
                          title="ลบดันเจี้ยนนี้"
                        >
                          {icons.trash}
                        </button>
                      </div>
                    ))}
                  </div>
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
              </div>
            </div>
          </section>
        )}
      </main>

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

              <label className="field">
                <span>ดันเจี้ยน / ด่าน</span>
                <select
                  name="dungeon"
                  defaultValue={editRow?.dungeon ?? dungeons[0]?.name}
                  onChange={(e) => {
                    const found = dungeons.find((d) => d.name === e.target.value);
                    if (found) {
                      const saleInput = document.querySelector('input[name="sale"]') as HTMLInputElement;
                      if (saleInput) saleInput.value = String(found.price);
                    }
                  }}
                >
                  {dungeons.map((d) => (
                    <option key={d.name} value={d.name}>{d.name} (฿{d.price.toLocaleString()})</option>
                  ))}
                </select>
              </label>

              <div className="form-grid">
                <label className="field">
                  <span>ลูกค้า (CTM)</span>
                  <input name="ctm" required placeholder="ชื่อลูกค้า" defaultValue={editRow?.ctm ?? ""} />
                </label>
                <label className="field">
                  <span>ยอดขายเต็ม (บาท)</span>
                  <input
                    name="sale"
                    required
                    min="1"
                    type="number"
                    placeholder="400"
                    defaultValue={editRow?.sale ?? dungeons[0]?.price ?? 400}
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
                <span style={{ fontSize: "11px", color: selectedPlayers.length === defaultCarryCount ? "#27ae60" : "#e67e22", fontWeight: 700 }}>
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
                      <span style={{ fontSize: "11px", fontWeight: 600 }}>{player.name}</span>
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
                    <span style={{ fontSize: "11px", color: "#176bca", fontWeight: 600 }}>สลิปพร้อมบันทึก</span>
                    <button
                      type="button"
                      onClick={() => setCurrentSlipBase64("")}
                      style={{ marginLeft: "auto", color: "#d9534f", fontSize: "11px", border: 0, background: "none", cursor: "pointer" }}
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

      {/* ======================== MODAL: ADD MEMBER (NO EMAIL) ======================== */}
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
