import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, provider } from "./firebase";

import { useState, useMemo, useCallback, useEffect } from "react";
import logo from "./assets/logo.png";
const DEPARTMENTS = [
  "Management", "Design & Retouch", "Digital Marketing", "Development", "Operations",
  "Logistics", "Reconciliation", "Web Operations", "Shopify", "Amazon", "Front End Development", "SEO", "AI","Chargeback", "Web Product", "Reporting", "Customer service", "Blog Writing", "Other"
];

const ATTENDANCE_TYPES = {
  P: { label: "Present", color: "#2d6a4f", bg: "#d8f3dc" },
  A: { label: "Absent", color: "#9d0208", bg: "#ffd6d6" },
  H: { label: "Half Day", color: "#e85d04", bg: "#fff1e6" },
  L: { label: "Leave", color: "#6c757d", bg: "#e9ecef" },
  W: { label: "Week Off", color: "#5c6bc0", bg: "#e8eaf6" },
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function getDaysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
function isWeekend(year, month, day) { const d = new Date(year, month, day).getDay(); return d === 0 || d === 6; }
function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }

function saveData(key, data) { try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { console.error("Save failed:", e); } }
function loadData(key) { try { const item = localStorage.getItem(key); return item ? JSON.parse(item) : null; } catch (e) { return null; } }

// Per-month roster helpers: each month has its own snapshot of employees/tasks.
// If a month doesn't yet have a snapshot, fall back to the project-level master list
// (this preserves all pre-existing data without breaking anything).
function getMonthEmployees(project, key) {
  if (!project) return [];
  const md = project.data?.[key];
  if (md && Array.isArray(md.__employees)) return md.__employees;
  return project.employees || [];
}
function getMonthTasks(project, key) {
  if (!project) return [];
  const md = project.data?.[key];
  if (md && Array.isArray(md.__tasks)) return md.__tasks;
  return project.tasks || [];
}

export default function ManhoursDashboard() {
  const [projects, setProjects] = useState([]);
  const updateProjects = (updater) => {
  saveHistory();

  if (typeof updater === "function") {
    setProjects(prev => updater(prev));
  } else {
    setProjects(updater);
  }
};
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [view, setView] = useState("projects");
  const [loaded, setLoaded] = useState(false);
  const [sortAlpha, setSortAlpha] = useState(false);
  const [user, setUser] = useState(null);

  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState("retainer");
  const [hourlyTrackBy, setHourlyTrackBy] = useState("employees");
  const [employees, setEmployees] = useState([]);
  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpDept, setNewEmpDept] = useState(DEPARTMENTS[0]);
  const [tasks, setTasks] = useState([]);
  const [newTaskName, setNewTaskName] = useState("");

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [newItemName, setNewItemName] = useState("");
  const [newItemDept, setNewItemDept] = useState(DEPARTMENTS[0]);
  const [editingProject, setEditingProject] = useState(null);
  const [filterMonth, setFilterMonth] = useState("All");
  const [filterYear, setFilterYear] = useState("All");
  const [invoiceFilter, setInvoiceFilter] = useState("All");
  const [manhoursFilter, setManhoursFilter] = useState("All");

  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);

  const login = async () => {
  try {
    const result = await signInWithPopup(auth, provider);

    if (!result.user.email.endsWith("@aristasystems.in")) {
      alert("Only Arista Systems accounts are allowed");
      await signOut(auth);
      return;
    }

    setUser(result.user);
  } catch (error) {
    console.error(error);
  }
};

const logout = async () => {
  await signOut(auth);
  setUser(null);
};
useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
    setUser(currentUser);
    setLoaded(true);
  });

  return () => unsubscribe();
}, []);

  useEffect(() => { const saved = loadData("manhours-projects-v4"); if (saved && Array.isArray(saved)) setProjects(saved); }, []);
  useEffect(() => { if (loaded) saveData("manhours-projects-v4", projects); }, [projects, loaded]);
  
  const saveHistory = () => {
  setHistory(prev => [...prev, JSON.stringify(projects)]);
  setFuture([]);
};

const undo = () => {
  if (!history.length) return;

  const previous = history[history.length - 1];

  setFuture(prev => [JSON.stringify(projects), ...prev]);
  setProjects(JSON.parse(previous));
  setHistory(prev => prev.slice(0, -1));
};

const redo = () => {
  if (!future.length) return;

  const next = future[0];

  setHistory(prev => [...prev, JSON.stringify(projects)]);
  setProjects(JSON.parse(next));
  setFuture(prev => prev.slice(1));
};
  const activeProject = useMemo(() => {
  return projects.find((p) => p.id === activeProjectId) || null;
}, [projects, activeProjectId]);
  const daysInMonth = useMemo(() => getDaysInMonth(selectedYear, selectedMonth), [selectedYear, selectedMonth]);
  const displayedProjects = useMemo(() => {
  let filtered = [...projects];

  // 🔹 Month + Year filter — check actual data presence, not project creation date.
  // A project shows up if it has data entered for the selected month/year.
  filtered = filtered.filter((p) => {
    const dataKeys = Object.keys(p.data || {}); // keys are "YYYY-M" (0-indexed month)
    const filterMonthIdx = filterMonth === "All" ? null : MONTHS.indexOf(filterMonth);
    const filterYearStr = filterYear === "All" ? null : filterYear;

    let monthYearMatch;
    if (filterMonthIdx === null && filterYearStr === null) {
      // No filter applied -> include everything
      monthYearMatch = true;
    } else {
      // Match if any data key satisfies the active filter(s).
      monthYearMatch = dataKeys.some((k) => {
        const [y, m] = k.split("-");
        const monthOk = filterMonthIdx === null || parseInt(m) === filterMonthIdx;
        const yearOk = filterYearStr === null || y === filterYearStr;
        return monthOk && yearOk;
      });
    }

    // 🔹 Invoice Filter — scoped to the selected month/year when one is set,
    // otherwise checks if the project was invoiced for any month.
    let hasInvoice;
    if (filterMonthIdx !== null && filterYearStr !== null) {
      hasInvoice = !!(p.invoiced || {})[`${filterYearStr}-${filterMonthIdx}`];
    } else if (filterMonthIdx !== null) {
      hasInvoice = Object.entries(p.invoiced || {}).some(([k, v]) => v && parseInt(k.split("-")[1]) === filterMonthIdx);
    } else if (filterYearStr !== null) {
      hasInvoice = Object.entries(p.invoiced || {}).some(([k, v]) => v && k.split("-")[0] === filterYearStr);
    } else {
      hasInvoice = Object.values(p.invoiced || {}).some(Boolean);
    }

    const invoiceMatch =
      invoiceFilter === "All" ||
      (invoiceFilter === "Invoiced" && hasInvoice) ||
      (invoiceFilter === "Not Invoiced" && !hasInvoice);

    // 🔹 Manhours status filter — scoped to selected month/year when set,
    // otherwise checks if manhours are freezed for any month.
    let hasFreezed;
    if (filterMonthIdx !== null && filterYearStr !== null) {
      hasFreezed = !!(p.manhoursFreezed || {})[`${filterYearStr}-${filterMonthIdx}`];
    } else if (filterMonthIdx !== null) {
      hasFreezed = Object.entries(p.manhoursFreezed || {}).some(([k, v]) => v && parseInt(k.split("-")[1]) === filterMonthIdx);
    } else if (filterYearStr !== null) {
      hasFreezed = Object.entries(p.manhoursFreezed || {}).some(([k, v]) => v && k.split("-")[0] === filterYearStr);
    } else {
      hasFreezed = Object.values(p.manhoursFreezed || {}).some(Boolean);
    }

    const manhoursMatch =
      manhoursFilter === "All" ||
      (manhoursFilter === "Completed" && hasFreezed) ||
      (manhoursFilter === "Not Completed" && !hasFreezed);

    return monthYearMatch && invoiceMatch && manhoursMatch;
  });

  // 🔹 Sorting
  if (sortAlpha) {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  return filtered;
}, [projects, sortAlpha, filterMonth, filterYear, invoiceFilter, manhoursFilter]);

  const addEmployee = () => { if (!newEmpName.trim()) return; setEmployees(prev => [...prev, { id: generateId(), name: newEmpName.trim(), department: newEmpDept }]); setNewEmpName(""); };
  const removeEmployee = (id) => setEmployees(prev => prev.filter(e => e.id !== id));
  const addTask = () => { if (!newTaskName.trim()) return; setTasks(prev => [...prev, { id: generateId(), name: newTaskName.trim() }]); setNewTaskName(""); };
  const removeTask = (id) => setTasks(prev => prev.filter(t => t.id !== id));

  const createProject = () => {
    if (!projectName.trim()) return;
    const isTaskMode = projectType === "hourly" && hourlyTrackBy === "tasks";
    if (!isTaskMode && employees.length === 0) return;
    if (isTaskMode && tasks.length === 0) return;
    const np = {
  id: generateId(),
  name: projectName.trim(),
  createdAt: new Date().toISOString(), // ⭐ ADD THIS
  type: projectType,
  trackBy: projectType === "hourly" ? hourlyTrackBy : "employees",
  employees: isTaskMode ? [] : [...employees],
  tasks: isTaskMode ? [...tasks] : [],
  data: {},
  invoiced: {}
};
    updateProjects(prev => [...prev, np]); setActiveProjectId(np.id); resetForm(); setView("data");
  };

  const resetForm = () => { setProjectName(""); setProjectType("retainer"); setHourlyTrackBy("employees"); setEmployees([]); setTasks([]); setNewEmpName(""); setNewEmpDept(DEPARTMENTS[0]); setNewTaskName(""); setNewItemName(""); setNewItemDept(DEPARTMENTS[0]); };
  const canCreate = () => { if (!projectName.trim()) return false; if (projectType === "retainer") return employees.length > 0; if (hourlyTrackBy === "tasks") return tasks.length > 0; return employees.length > 0; };

  const toggleInvoice = (projectId, mk) => { updateProjects(prev => prev.map(p => { if (p.id !== projectId) return p; const inv = { ...(p.invoiced || {}) }; inv[mk] = !inv[mk]; return { ...p, invoiced: inv }; })); };
  const toggleManhoursFreeze = (projectId, mk) => { updateProjects(prev => prev.map(p => { if (p.id !== projectId) return p; const fr = { ...(p.manhoursFreezed || {}) }; fr[mk] = !fr[mk]; return { ...p, manhoursFreezed: fr }; })); };

  const updateAttendance = (empId, day, value) => { const key = `${selectedYear}-${selectedMonth}`; updateProjects(prev => prev.map(p => { if (p.id !== activeProjectId) return p; const data = { ...p.data }; if (!data[key]) data[key] = {}; if (!data[key][empId]) data[key][empId] = {}; data[key][empId][day] = value; return { ...p, data }; })); };
  const updateHours = (itemId, value) => { const key = `${selectedYear}-${selectedMonth}`; updateProjects(prev => prev.map(p => { if (p.id !== activeProjectId) return p; const data = { ...p.data }; if (!data[key]) data[key] = {}; data[key][itemId] = value; return { ...p, data }; })); };

  const cycleAttendance = (empId, day) => {
    const key = `${selectedYear}-${selectedMonth}`;
    const current = activeProject?.data?.[key]?.[empId]?.[day] || "";
    const order = ["", "P", "A", "H", "L", "W"];
    const next = order[(order.indexOf(current) + 1) % order.length];
    updateAttendance(empId, day, next);
  };

  const markWeekends = () => {
    const key = `${selectedYear}-${selectedMonth}`;
    updateProjects(prev => prev.map(p => {
      if (p.id !== activeProjectId) return p;
      const data = { ...p.data }; if (!data[key]) data[key] = {};
      const roster = getMonthEmployees(p, key);
      roster.forEach(emp => { if (!data[key][emp.id]) data[key][emp.id] = {}; for (let d = 1; d <= daysInMonth; d++) { if (isWeekend(selectedYear, selectedMonth, d)) data[key][emp.id][d] = "W"; } });
      return { ...p, data };
    }));
  };

  const markWeekdaysPresent = () => {
    const key = `${selectedYear}-${selectedMonth}`;
    updateProjects(prev => prev.map(p => {
      if (p.id !== activeProjectId) return p;
      const data = { ...p.data }; if (!data[key]) data[key] = {};
      const roster = getMonthEmployees(p, key);
      roster.forEach(emp => { if (!data[key][emp.id]) data[key][emp.id] = {}; for (let d = 1; d <= daysInMonth; d++) { if (!isWeekend(selectedYear, selectedMonth, d)) data[key][emp.id][d] = "P"; } });
      return { ...p, data };
    }));
  };

  const copyFromPreviousMonth = () => {
    let pm = selectedMonth - 1, py = selectedYear;
    if (pm < 0) { pm = 11; py--; }
    const prevKey = `${py}-${pm}`, currKey = `${selectedYear}-${selectedMonth}`;
    updateProjects(prev => prev.map(p => {
      if (p.id !== activeProjectId) return p;
      const prevData = p.data?.[prevKey]; if (!prevData) { alert("No data found for " + MONTHS[pm] + " " + py); return p; }
      const data = { ...p.data };
      const copied = JSON.parse(JSON.stringify(prevData));
      // Ensure the new month has its own roster snapshot (deep-cloned from previous month, or project default).
      if (!Array.isArray(copied.__employees)) copied.__employees = [...((prevData.__employees) || p.employees || [])];
      if (!Array.isArray(copied.__tasks)) copied.__tasks = [...((prevData.__tasks) || p.tasks || [])];
      data[currKey] = copied;
      return { ...p, data };
    }));
  };

  // PER-MONTH ROSTER: Adding or removing employees/tasks only affects the currently selected month.
  // First edit to a month "locks in" its roster (snapshots from project default if needed); other months remain untouched.
  const addEmployeeToProject = () => {
    if (!newItemName.trim()) return;
    const emp = { id: generateId(), name: newItemName.trim(), department: newItemDept };
    const key = `${selectedYear}-${selectedMonth}`;
    updateProjects(prev => prev.map(p => {
      if (p.id !== activeProjectId) return p;
      const data = { ...(p.data || {}) };
      const md = { ...(data[key] || {}) };
      const currentRoster = Array.isArray(md.__employees) ? md.__employees : (p.employees || []);
      md.__employees = [...currentRoster, emp];
      data[key] = md;
      return { ...p, data };
    }));
    setNewItemName("");
  };
  const addTaskToProject = () => {
    if (!newItemName.trim()) return;
    const task = { id: generateId(), name: newItemName.trim() };
    const key = `${selectedYear}-${selectedMonth}`;
    updateProjects(prev => prev.map(p => {
      if (p.id !== activeProjectId) return p;
      const data = { ...(p.data || {}) };
      const md = { ...(data[key] || {}) };
      const currentRoster = Array.isArray(md.__tasks) ? md.__tasks : (p.tasks || []);
      md.__tasks = [...currentRoster, task];
      data[key] = md;
      return { ...p, data };
    }));
    setNewItemName("");
  };
  const removeEmployeeFromProject = (empId) => {
    const key = `${selectedYear}-${selectedMonth}`;
    updateProjects(prev => prev.map(p => {
      if (p.id !== activeProjectId) return p;
      const data = { ...(p.data || {}) };
      const md = { ...(data[key] || {}) };
      const currentRoster = Array.isArray(md.__employees) ? md.__employees : (p.employees || []);
      md.__employees = currentRoster.filter(e => e.id !== empId);
      data[key] = md;
      return { ...p, data };
    }));
  };
  const removeTaskFromProject = (taskId) => {
    const key = `${selectedYear}-${selectedMonth}`;
    updateProjects(prev => prev.map(p => {
      if (p.id !== activeProjectId) return p;
      const data = { ...(p.data || {}) };
      const md = { ...(data[key] || {}) };
      const currentRoster = Array.isArray(md.__tasks) ? md.__tasks : (p.tasks || []);
      md.__tasks = currentRoster.filter(t => t.id !== taskId);
      data[key] = md;
      return { ...p, data };
    }));
  };
  const deleteProject = (id) => { updateProjects(prev => prev.filter(p => p.id !== id)); if (activeProjectId === id) { setActiveProjectId(null); setView("projects"); } };

  const exportCSV = () => {
    if (!activeProject) return;
    const key = `${selectedYear}-${selectedMonth}`, monthData = activeProject.data?.[key] || {}, invStatus = activeProject.invoiced?.[key] ? "Yes" : "No";
    let csv = ""; const ml = `${MONTHS[selectedMonth]} ${selectedYear}`, isTaskMode = activeProject.trackBy === "tasks";
    const monthEmps = getMonthEmployees(activeProject, key);
    const monthTasksList = getMonthTasks(activeProject, key);
    if (activeProject.type === "retainer") {
      csv += `Project: ${activeProject.name}\nType: Retainer\nMonth: ${ml}\nInvoice Created: ${invStatus}\n\n`;
      csv += `Employee,Department,${Array.from({ length: daysInMonth }, (_, i) => i + 1).join(",")},Present,Absent,Half Day,Leave,Week Off\n`;
      monthEmps.forEach(emp => {
        const ed = monthData[emp.id] || {}; let pC=0,aC=0,hC=0,lC=0,wC=0;
        const days = Array.from({ length: daysInMonth }, (_, i) => { const v = ed[i+1] || ""; if(v==="P")pC++;if(v==="A")aC++;if(v==="H")hC++;if(v==="L")lC++;if(v==="W")wC++; return v; });
        csv += `"${emp.name}","${emp.department}",${days.join(",")},${pC},${aC},${hC},${lC},${wC}\n`;
      });
    } else if (isTaskMode) {
      csv += `Project: ${activeProject.name}\nType: Hourly (Task-based)\nMonth: ${ml}\nInvoice Created: ${invStatus}\n\n`;
      csv += `Task,Hours\n`;
      monthTasksList.forEach(t => { csv += `"${t.name}",${monthData[t.id] || 0}\n`; });
      csv += `\nTotal Hours,${monthTasksList.reduce((s, t) => s + (parseFloat(monthData[t.id]) || 0), 0)}\n`;
    } else {
      csv += `Project: ${activeProject.name}\nType: Hourly\nMonth: ${ml}\nInvoice Created: ${invStatus}\n\n`;
      csv += `Employee,Department,Hours\n`;
      monthEmps.forEach(emp => { csv += `"${emp.name}","${emp.department}",${monthData[emp.id] || 0}\n`; });
      csv += `\nTotal Hours,,${monthEmps.reduce((s, e) => s + (parseFloat(monthData[e.id]) || 0), 0)}\n`;
    }
    const blob = new Blob([csv], { type: "text/csv" }), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = `${activeProject.name.replace(/\s+/g, "_")}_${MONTHS[selectedMonth]}_${selectedYear}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const getRetainerSummary = () => {
    if (!activeProject) return {};
    const key = `${selectedYear}-${selectedMonth}`, md = activeProject.data?.[key] || {};
    let totalP=0,totalA=0,totalH=0,totalL=0,totalW=0;
    getMonthEmployees(activeProject, key).forEach(emp => { const d = md[emp.id] || {}; Object.values(d).forEach(v => { if(v==="P")totalP++;if(v==="A")totalA++;if(v==="H")totalH++;if(v==="L")totalL++;if(v==="W")totalW++; }); });
    return { totalP, totalA, totalH, totalL, totalW };
  };

  const getHourlySummary = () => {
    if (!activeProject) return 0;
    const key = `${selectedYear}-${selectedMonth}`, md = activeProject.data?.[key] || {};
    const items = activeProject.trackBy === "tasks" ? getMonthTasks(activeProject, key) : getMonthEmployees(activeProject, key);
    return items.reduce((s, item) => s + (parseFloat(md[item.id]) || 0), 0);
  };

  const getItemCount = () => { if (!activeProject) return 0; const key = `${selectedYear}-${selectedMonth}`; return activeProject.trackBy === "tasks" ? getMonthTasks(activeProject, key).length : getMonthEmployees(activeProject, key).length; };


  const monthKey = `${selectedYear}-${selectedMonth}`;
  if (!loaded) {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f7fb",
        fontSize: 18,
        fontWeight: 600,
        color: "#111827"
      }}
    >
      Loading Dashboard...
    </div>
  );
}

if (!user) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `
  radial-gradient(circle at top left, rgba(99,102,241,0.10), transparent 28%),
  radial-gradient(circle at bottom right, rgba(59,130,246,0.08), transparent 28%),
  linear-gradient(135deg, #f8fafc 0%, #eef2ff 45%, #f1f5f9 100%)
`,
        position: "relative",
        overflow: "hidden",
        fontFamily: "'DM Sans', sans-serif"
      }}
    >
      {/* Background Glow */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "rgba(59,130,246,0.12)",
          filter: "blur(140px)",
          top: -200,
          left: -200
        }}
      />

      {/* Login Card */}
      <div
        style={{
  width: 470,
  padding: "58px 48px",
  borderRadius: 36,
  background: "rgba(255,255,255,0.62)",
  backdropFilter: "blur(28px)",
  WebkitBackdropFilter: "blur(28px)",
  border: "1px solid rgba(255,255,255,0.55)",
  boxShadow: `
  0 40px 100px rgba(15,23,42,0.10),
  0 12px 32px rgba(15,23,42,0.06),
  inset 0 1px 1px rgba(255,255,255,0.8)
`,
  textAlign: "center",
  position: "relative",
  zIndex: 2,
  overflow: "hidden",
  transition: "all 0.3s ease"
}}
      >
        <img
          src={logo}
          alt="Arista Logo"
          style={{
            width: 190,
            marginBottom: 26
          }}
        />

<div
  style={{
    fontSize: 52,
    fontWeight: 900,
    lineHeight: 0.95,
    letterSpacing: "-3px",
    marginBottom: 22,
    background: "linear-gradient(135deg, #0f172a 0%, #334155 45%, #111827 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    textShadow: "0 8px 30px rgba(15,23,42,0.10)"
  }}
>
  Manhours
  <br />
  Dashboard
</div>

        <p
          style={{
            color: "#3b3b44",
            fontSize: 16,
            lineHeight: 1.9,
            marginBottom: 35
          }}
        >
          Unified workspace for project tracking
        </p>

        <button
          onClick={login}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: 16,
            border: "none",
            background: "linear-gradient(135deg, #111827 0%, #1e293b 100%)",
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 12px 30px rgba(15,23,42,0.20)",
            transition: "all 0.25s ease"
          }}
        >
          Continue with Arista Google Account
        </button>

        <div
          style={{
            marginTop: 24,
            fontSize: 12,
            color: "#545b64",
            letterSpacing: "0.3px"
          }}
        >
          Internal Workspace • Secure Access
        </div>
      </div>
    </div>
  );
}

  return (
    <div style={S.root}>
  <header style={S.header}>
    
    <div
      style={S.headerLeft}
      onClick={() => {
        setView("projects");
        setActiveProjectId(null);
        setEditingProject(null);
      }}
    >
      <img src={logo} alt="Arista Logo" style={S.logoImg} />

      <div style={S.logoTextWrap}>
        <h1 style={S.logo}>Manhours</h1>
        <span style={S.logoSub}>Project Tracker</span>
      </div>
    </div>
        <nav style={S.nav}>
          <button style={{ ...S.navBtn, ...(view === "projects" ? S.navBtnActive : {}) }} onClick={() => { setView("projects"); setEditingProject(null); }}>All Projects</button>
          {activeProject && <button style={{ ...S.navBtn, ...(view === "data" ? S.navBtnActive : {}) }} onClick={() => setView("data")}>{activeProject.name}</button>}
          <button style={{ ...S.navBtn, ...S.navBtnNew, ...(view === "setup" ? S.navBtnActive : {}) }} onClick={() => { setView("setup"); resetForm(); }}>+ New Project</button>
          <button
    style={{
      padding: "10px 16px",
      borderRadius: 12,
      border: "none",
      background: "#dc2626",
      color: "#fff",
      fontWeight: 600,
      cursor: "pointer"
    }}
    onClick={logout}
  >
    Logout
  </button>
        </nav>
      </header>

      <main style={S.main}>
        {/* ─── PROJECT LIST ─── */}
        {view === "projects" && (
          <div style={S.section}>
            <div style={S.listHeader}>
  <h2 style={S.sectionTitle}>Your Projects</h2>

  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>

    {/* Month Filter */}
    <select
      value={filterMonth}
      onChange={(e) => setFilterMonth(e.target.value)}
      style={S.monthFilter}
    >
      <option value="All">All Months</option>
      {MONTHS.map((m) => (
        <option key={m} value={m}>{m}</option>
      ))}
    </select>

    {/* Year Filter */}
    <select
      value={filterYear}
      onChange={(e) => setFilterYear(e.target.value)}
      style={S.yearFilter}
    >
      <option value="All">All Years</option>
      {[2024, 2025, 2026, 2027].map((y) => (
        <option key={y} value={y}>{y}</option>
      ))}
    </select>

    {/* Invoice Filter */}
<select
  value={invoiceFilter}
  onChange={(e) => setInvoiceFilter(e.target.value)}
  style={S.invoiceFilter}
>
  <option value="All">All Status</option>
  <option value="Invoiced">Invoice Created</option>
  <option value="Not Invoiced">Not Invoiced</option>
</select>

{/* Manhours Status Filter */}
<select
  value={manhoursFilter}
  onChange={(e) => setManhoursFilter(e.target.value)}
  style={S.invoiceFilter}
>
  <option value="All">All Manhours</option>
  <option value="Completed">Completed</option>
  <option value="Not Completed">Not Completed</option>
</select>

<button
  style={{
    ...S.sortBtn,
    opacity: history.length ? 1 : 0.5,
    cursor: history.length ? "pointer" : "not-allowed"
  }}
  onClick={undo}
  disabled={!history.length}
>
  ↶ Undo
</button>

<button
  style={{
    ...S.sortBtn,
    opacity: future.length ? 1 : 0.5,
    cursor: future.length ? "pointer" : "not-allowed"
  }}
  onClick={redo}
  disabled={!future.length}
>
  ↷ Redo
</button>

    {/* Sort Button */}
    {projects.length > 1 && (
      <button
        style={S.sortBtn}
        onClick={() => setSortAlpha((p) => !p)}
      >
        {sortAlpha ? "✓ Sorted A–Z" : "⇅ Sort A–Z"}
      </button>
    )}

  </div>
</div>
            {projects.length === 0 ? (
              <div style={S.emptyState}><div style={S.emptyIcon}>📊</div><p style={S.emptyText}>No projects yet. Create your first project to start tracking manhours.</p><button style={S.primaryBtn} onClick={() => { setView("setup"); resetForm(); }}>Create Project</button></div>
            ) : (
              <div style={S.projectGrid}>
                {displayedProjects.map(p => {
                  const isTask = p.trackBy === "tasks", count = isTask ? (p.tasks || []).length : p.employees.length, label = isTask ? "task" : "employee";
                  // Card reflects the active filter. If a filter is set to "All", fall back to today's month/year.
                  const _now = new Date();
                  const cardMonthIdx = filterMonth === "All" ? _now.getMonth() : MONTHS.indexOf(filterMonth);
                  const cardYear = filterYear === "All" ? _now.getFullYear() : parseInt(filterYear);
                  const cmk = `${cardYear}-${cardMonthIdx}`;
                  const isInv = p.invoiced?.[cmk] || false;
                  const isFreezed = p.manhoursFreezed?.[cmk] || false;
                  const cardMonthLabel = `${MONTHS[cardMonthIdx].slice(0,3)} ${cardYear}`;
                  return (
                    <div key={p.id} style={S.projectCard}>
                      <div style={S.cardHeader}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ ...S.badge, background: p.type === "retainer" ? "#d8f3dc" : "#e8dff5", color: p.type === "retainer" ? "#2d6a4f" : "#6a3d9a" }}>{p.type === "retainer" ? "Retainer" : "Hourly"}</span>
                          {isTask && <span style={{ ...S.badge, background: "#fff3e0", color: "#e65100" }}>Task-based</span>}
                        </div>
                        <button style={S.deleteBtn} onClick={() => deleteProject(p.id)} title="Delete">Delete</button>
                      </div>
                      <h3 style={S.cardTitle}>{p.name}</h3>
                      <p style={S.cardMeta}>{count} {label}{count !== 1 ? "s" : ""}</p>
                      <div style={S.cardDepts}>
                        {isTask ? (p.tasks || []).slice(0, 4).map(t => <span key={t.id} style={S.deptChip}>{t.name}</span>) : [...new Set(p.employees.map(e => e.department))].map(d => <span key={d} style={S.deptChip}>{d}</span>)}
                      </div>
                      <div style={S.invoiceRow} onClick={(e) => { e.stopPropagation(); toggleInvoice(p.id, cmk); }}>
                        <div style={{ ...S.checkbox, ...(isInv ? S.checkboxChecked : {}) }}>{isInv && "\u2713"}</div>
                        <span style={{ fontSize: 12, color: isInv ? "#2d6a4f" : "#999" }}>{isInv ? `Invoice created (${cardMonthLabel})` : `No invoice (${cardMonthLabel})`}</span>
                      </div>
                      <div style={S.invoiceRow} onClick={(e) => { e.stopPropagation(); toggleManhoursFreeze(p.id, cmk); }}>
                        <div style={{ ...S.checkbox, ...(isFreezed ? S.checkboxChecked : {}) }}>{isFreezed && "\u2713"}</div>
                        <span style={{ fontSize: 12, color: isFreezed ? "#2d6a4f" : "#999" }}>{isFreezed ? `Manhours Completed (${cardMonthLabel})` : `Manhours In Progress (${cardMonthLabel})`}</span>
                      </div>
                      <button style={S.cardBtn} onClick={() => { setActiveProjectId(p.id); setView("data"); }}>Open</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── SETUP ─── */}
        {view === "setup" && (
          <div style={S.section}>
            <h2 style={S.sectionTitle}>New Project</h2>
            <div style={S.formCard}>
              <div style={S.formGroup}><label style={S.label}>Project Name</label><input style={S.input} value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="e.g. Acme Corp Website Redesign" /></div>
              <div style={S.formGroup}>
                <label style={S.label}>Billing Type</label>
                <div style={S.typeToggle}>
                  <button style={{ ...S.typeBtn, ...(projectType === "retainer" ? S.typeBtnActive : {}) }} onClick={() => setProjectType("retainer")}><span style={S.typeBtnIcon}>📅</span><span style={S.typeBtnLabel}>Retainer</span><span style={S.typeBtnDesc}>Track daily attendance</span></button>
                  <button style={{ ...S.typeBtn, ...(projectType === "hourly" ? S.typeBtnActiveAlt : {}) }} onClick={() => setProjectType("hourly")}><span style={S.typeBtnIcon}>⏱</span><span style={S.typeBtnLabel}>Hourly</span><span style={S.typeBtnDesc}>Track hours per month</span></button>
                </div>
              </div>
              {projectType === "hourly" && (
                <div style={S.formGroup}><label style={S.label}>Track By</label>
                  <div style={S.trackByToggle}>
                    <button style={{ ...S.trackByBtn, ...(hourlyTrackBy === "employees" ? S.trackByBtnActive : {}) }} onClick={() => setHourlyTrackBy("employees")}><span style={{ fontSize: 16 }}>👥</span><div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}><span style={S.trackByLabel}>Team Members</span><span style={S.trackByDesc}>Track hours per person</span></div></button>
                    <button style={{ ...S.trackByBtn, ...(hourlyTrackBy === "tasks" ? S.trackByBtnActiveAlt : {}) }} onClick={() => setHourlyTrackBy("tasks")}><span style={{ fontSize: 16 }}>📋</span><div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}><span style={S.trackByLabel}>Tasks</span><span style={S.trackByDesc}>Track hours per task</span></div></button>
                  </div>
                </div>
              )}
              {(projectType === "retainer" || (projectType === "hourly" && hourlyTrackBy === "employees")) && (
                <div style={S.formGroup}><label style={S.label}>Team Members</label>
                  <div style={S.addRow}><input style={{ ...S.input, flex: 2 }} value={newEmpName} onChange={e => setNewEmpName(e.target.value)} placeholder="Employee name" onKeyDown={e => e.key === "Enter" && addEmployee()} /><select style={{ ...S.input, flex: 1 }} value={newEmpDept} onChange={e => setNewEmpDept(e.target.value)}>{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select><button style={S.addBtn} onClick={addEmployee}>Add</button></div>
                  {employees.length > 0 && <div style={S.empList}>{employees.map((emp, i) => (<div key={emp.id} style={S.empRow}><span style={S.empNum}>{i + 1}</span><span style={S.empName}>{emp.name}</span><span style={S.empDeptTag}>{emp.department}</span><button style={S.empRemove} onClick={() => removeEmployee(emp.id)}>Delete</button></div>))}</div>}
                </div>
              )}
              {projectType === "hourly" && hourlyTrackBy === "tasks" && (
                <div style={S.formGroup}><label style={S.label}>Tasks</label>
                  <div style={S.addRow}><input style={{ ...S.input, flex: 1 }} value={newTaskName} onChange={e => setNewTaskName(e.target.value)} placeholder="e.g. UI Design, API Integration" onKeyDown={e => e.key === "Enter" && addTask()} /><button style={S.addBtn} onClick={addTask}>Add</button></div>
                  {tasks.length > 0 && <div style={S.empList}>{tasks.map((t, i) => (<div key={t.id} style={S.empRow}><span style={S.empNum}>{i + 1}</span><span style={S.empName}>{t.name}</span><span style={{ ...S.empDeptTag, background: "#fff3e0", color: "#e65100" }}>Task</span><button style={S.empRemove} onClick={() => removeTask(t.id)}>Delete</button></div>))}</div>}
                </div>
              )}
              <button style={{ ...S.primaryBtn, opacity: canCreate() ? 1 : 0.4 }} onClick={createProject} disabled={!canCreate()}>Create Project & Start Tracking</button>
            </div>
          </div>
        )}

        {/* ─── DATA ENTRY ─── */}
        {view === "data" && (
  !activeProject ? (
    <div
      style={{
        padding: 40,
        textAlign: "center",
        fontSize: 18,
        fontWeight: 600,
        color: "#111827"
      }}
    >
      Loading project...
    </div>
  ) : (
          <div style={S.section}>
            <div style={S.dataHeader}>
              <div>
                <h2 style={S.sectionTitle}>{activeProject.name}</h2>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ ...S.badge, background: activeProject.type === "retainer" ? "#d8f3dc" : "#e8dff5", color: activeProject.type === "retainer" ? "#2d6a4f" : "#6a3d9a" }}>{activeProject.type === "retainer" ? "Retainer" : "Hourly"}</span>
                  {activeProject.trackBy === "tasks" && <span style={{ ...S.badge, background: "#fff3e0", color: "#e65100" }}>Task-based</span>}
                </div>
              </div>
              <div style={S.dataActions}>
                <div style={S.monthPicker}>
                  <select style={S.selectSmall} value={selectedMonth} onChange={e => setSelectedMonth(+e.target.value)}>{MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}</select>
                  <input type="number" style={{ ...S.selectSmall, width: 80 }} value={selectedYear} onChange={e => setSelectedYear(+e.target.value)} min={2020} max={2040} />
                </div>
                <button style={S.exportBtn} onClick={exportCSV}>Export CSV</button>
              </div>
            </div>

            {/* Invoice checkbox */}
            <div style={S.invoiceBar}>
              <div style={S.invoiceBarInner} onClick={() => toggleInvoice(activeProject.id, monthKey)}>
                <div style={{ ...S.checkbox, ...S.checkboxLg, ...(activeProject.invoiced?.[monthKey] ? S.checkboxChecked : {}) }}>{activeProject.invoiced?.[monthKey] && "\u2713"}</div>
                <span style={{ fontSize: 14, fontWeight: 500, color: activeProject.invoiced?.[monthKey] ? "#2d6a4f" : "#666" }}>{activeProject.invoiced?.[monthKey] ? "Invoice created" : "Invoice not created"} for {MONTHS[selectedMonth]} {selectedYear}</span>
              </div>
            </div>

            {/* Manhours Freezed checkbox */}
            <div style={S.invoiceBar}>
              <div style={S.invoiceBarInner} onClick={() => toggleManhoursFreeze(activeProject.id, monthKey)}>
                <div style={{ ...S.checkbox, ...S.checkboxLg, ...(activeProject.manhoursFreezed?.[monthKey] ? S.checkboxChecked : {}) }}>{activeProject.manhoursFreezed?.[monthKey] && "\u2713"}</div>
                <span style={{ fontSize: 14, fontWeight: 500, color: activeProject.manhoursFreezed?.[monthKey] ? "#2d6a4f" : "#666" }}>{activeProject.manhoursFreezed?.[monthKey] ? "Manhours Freezed (Completed)" : "Manhours not freezed (In Progress)"} for {MONTHS[selectedMonth]} {selectedYear}</span>
              </div>
            </div>

            {/* Summary */}
            {activeProject.type === "retainer" ? (
              <div style={S.summaryRow}>
                {(() => { const s = getRetainerSummary(); return (<>
                  <div style={{ ...S.summaryCard, borderLeft: "3px solid #2d6a4f" }}><span style={S.summaryNum}>{s.totalP}</span><span style={S.summaryLabel}>Present</span></div>
                  <div style={{ ...S.summaryCard, borderLeft: "3px solid #9d0208" }}><span style={S.summaryNum}>{s.totalA}</span><span style={S.summaryLabel}>Absent</span></div>
                  <div style={{ ...S.summaryCard, borderLeft: "3px solid #e85d04" }}><span style={S.summaryNum}>{s.totalH}</span><span style={S.summaryLabel}>Half Day</span></div>
                  <div style={{ ...S.summaryCard, borderLeft: "3px solid #6c757d" }}><span style={S.summaryNum}>{s.totalL}</span><span style={S.summaryLabel}>Leave</span></div>
                  <div style={{ ...S.summaryCard, borderLeft: "3px solid #5c6bc0" }}><span style={S.summaryNum}>{s.totalW}</span><span style={S.summaryLabel}>Week Off</span></div>
                </>); })()}
              </div>
            ) : (
              <div style={S.summaryRow}>
                <div style={{ ...S.summaryCard, borderLeft: "3px solid #6a3d9a" }}><span style={S.summaryNum}>{getHourlySummary()}</span><span style={S.summaryLabel}>Total Hours</span></div>
                <div style={{ ...S.summaryCard, borderLeft: "3px solid #495057" }}><span style={S.summaryNum}>{getItemCount()}</span><span style={S.summaryLabel}>{activeProject.trackBy === "tasks" ? "Tasks" : "Team Members"}</span></div>
              </div>
            )}

            {/* Add + Quick Actions */}
            <div style={S.toolStrip}>
              {activeProject.trackBy === "tasks" ? (
                <div style={S.inlineAdd}><span style={S.inlineAddLabel}>Add task:</span><input style={{ ...S.inputSmall, flex: 1 }} value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="Task name" onKeyDown={e => e.key === "Enter" && addTaskToProject()} /><button style={S.addBtnSmall} onClick={addTaskToProject}>+</button></div>
              ) : (
                <div style={S.inlineAdd}><span style={S.inlineAddLabel}>Add member:</span><input style={{ ...S.inputSmall, flex: 1 }} value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="Name" onKeyDown={e => e.key === "Enter" && addEmployeeToProject()} /><select style={S.inputSmall} value={newItemDept} onChange={e => setNewItemDept(e.target.value)}>{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select><button style={S.addBtnSmall} onClick={addEmployeeToProject}>+</button></div>
              )}
              <div style={S.quickActions}>
                <button
  style={{
    ...S.quickBtn,
    background: "#ffffff",
    border: "1px solid #dbe3f0",
    borderRadius: 12,
    padding: "10px 16px",
    fontWeight: 600,
    color: "#1e293b",
    boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
    transition: "all 0.2s ease",
    opacity: history.length ? 1 : 0.45,
    cursor: history.length ? "pointer" : "not-allowed"
  }}
  onClick={undo}
  disabled={!history.length}
>
  ↶ Undo
</button>

<button
  style={{
    ...S.quickBtn,
    background: "#ffffff",
    border: "1px solid #dbe3f0",
    borderRadius: 12,
    padding: "10px 16px",
    fontWeight: 600,
    color: "#1e293b",
    boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
    transition: "all 0.2s ease",
    opacity: future.length ? 1 : 0.45,
    cursor: future.length ? "pointer" : "not-allowed"
  }}
  onClick={redo}
  disabled={!future.length}
>
  ↷ Redo
</button>

                {activeProject.type === "retainer" && <button style={S.quickBtn} onClick={markWeekends}>📅 Mark Weekends Off</button>}
                {activeProject.type === "retainer" && <button style={S.quickBtn} onClick={markWeekdaysPresent}>✅ Mark Weekdays Present</button>}
                <button style={S.quickBtn} onClick={copyFromPreviousMonth}>📋 Copy Previous Month</button>
              </div>
            </div>

            {/* ─── RETAINER TABLE ─── */}
            {activeProject.type === "retainer" && (
              <div style={S.tableWrap}>
                <div style={S.legend}>
                  <span style={S.legendLabel}>Click cells to cycle:</span>
                  {Object.entries(ATTENDANCE_TYPES).filter(([k]) => k).map(([k, v]) => (<span key={k} style={{ ...S.legendItem, background: v.bg, color: v.color }}>{k} = {v.label}</span>))}
                </div>
                <div style={S.tableScroll}>
                  <table style={S.table}>
                    <thead><tr>
                      <th style={{ ...S.th, ...S.stickyCol, minWidth: 150, left: 0, zIndex: 3 }}>Employee</th>
                      <th style={{ ...S.th, ...S.stickyCol2, minWidth: 100, left: 150, zIndex: 3 }}>Dept</th>
                      {Array.from({ length: daysInMonth }, (_, i) => {
                        const we = isWeekend(selectedYear, selectedMonth, i + 1);
                        return <th key={i} style={{ ...S.th, ...S.dayTh, ...(we ? { background: "#e8eaf6", color: "#5c6bc0" } : {}) }}>{i + 1}</th>;
                      })}
                      <th style={S.th}>P</th><th style={S.th}>A</th><th style={S.th}>H</th><th style={S.th}>L</th><th style={S.th}>W</th>
                    </tr></thead>
                    <tbody>
                      {getMonthEmployees(activeProject, `${selectedYear}-${selectedMonth}`).map(emp => {
                        const key = `${selectedYear}-${selectedMonth}`, ed = activeProject.data?.[key]?.[emp.id] || {};
                        let pC=0,aC=0,hC=0,lC=0,wC=0;
                        Object.values(ed).forEach(v=>{if(v==="P")pC++;if(v==="A")aC++;if(v==="H")hC++;if(v==="L")lC++;if(v==="W")wC++;});
                        return (
                          <tr key={emp.id}>
                            <td style={{ ...S.td, ...S.stickyCol, left: 0, fontWeight: 600 }}><div style={S.empCellRow}>{emp.name}<button style={S.tinyRemove} onClick={() => removeEmployeeFromProject(emp.id)}>Delete</button></div></td>
                            <td style={{ ...S.td, ...S.stickyCol2, left: 150, fontSize: 12, color: "#6c757d" }}>{emp.department}</td>
                            {Array.from({ length: daysInMonth }, (_, i) => {
                              const val = ed[i + 1] || "", info = ATTENDANCE_TYPES[val] || ATTENDANCE_TYPES[""], we = isWeekend(selectedYear, selectedMonth, i + 1);
                              return (
  <td
    key={i}
    style={{
      ...S.td,
      ...S.dayCell,
      background: val ? (info?.bg || "#eef2ff") : (we ? "#f0f0fa" : "transparent"),
      color: info?.color || "#64748b",
      cursor: "pointer",
      userSelect: "none"
    }}
    onClick={() => cycleAttendance(emp.id, i + 1)}
    title={info?.label || ""}
  >
    {val || (we ? "\u00b7" : "\u00b7")}
  </td>
);
                            })}
                            <td style={{ ...S.td, ...S.countCell, color: "#2d6a4f" }}>{pC}</td>
                            <td style={{ ...S.td, ...S.countCell, color: "#9d0208" }}>{aC}</td>
                            <td style={{ ...S.td, ...S.countCell, color: "#e85d04" }}>{hC}</td>
                            <td style={{ ...S.td, ...S.countCell, color: "#6c757d" }}>{lC}</td>
                            <td style={{ ...S.td, ...S.countCell, color: "#5c6bc0" }}>{wC}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ─── HOURLY TABLE (Employee) ─── */}
            {activeProject.type === "hourly" && activeProject.trackBy !== "tasks" && (
              <div style={S.tableWrap}>
                <table style={S.table}>
                  <thead><tr>
                    <th style={{ ...S.th, textAlign: "left", minWidth: 200, paddingLeft: 16 }}>Employee</th>
                    <th style={{ ...S.th, textAlign: "left", minWidth: 130 }}>Department</th>
                    <th style={{ ...S.th, minWidth: 160 }}>Hours {MONTHS[selectedMonth].slice(0,3)} {selectedYear}</th>
                    <th style={{ ...S.th, width: 50 }}></th>
                  </tr></thead>
                  <tbody>
                    {getMonthEmployees(activeProject, `${selectedYear}-${selectedMonth}`).map((emp, idx) => {
                      const key = `${selectedYear}-${selectedMonth}`, hours = activeProject.data?.[key]?.[emp.id] || "";
                      return (
                        <tr key={emp.id} style={{ background: idx % 2 === 0 ? "#fff" : "#fafaf8" }}>
                          <td style={{ ...S.td, fontWeight: 600, textAlign: "left", paddingLeft: 16 }}>{emp.name}</td>
                          <td style={{ ...S.td, textAlign: "left" }}><span style={S.deptPill}>{emp.department}</span></td>
                          <td style={S.td}><input type="number" style={S.hoursInput} value={hours} onChange={e => updateHours(emp.id, e.target.value)} placeholder="0" min="0" step="0.5" /></td>
                          <td style={S.td}><button style={S.tinyRemove} onClick={() => removeEmployeeFromProject(emp.id)}>Delete</button></td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: "#f5f3ef" }}>
                      <td style={{ ...S.td, fontWeight: 700, textAlign: "left", paddingLeft: 16 }} colSpan={2}>Total</td>
                      <td style={{ ...S.td, fontWeight: 700, fontSize: 15 }}>{getHourlySummary()} hrs</td>
                      <td style={S.td}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* ─── HOURLY TABLE (Task) ─── */}
            {activeProject.type === "hourly" && activeProject.trackBy === "tasks" && (
              <div style={S.tableWrap}>
                <table style={S.table}>
                  <thead><tr>
                    <th style={{ ...S.th, textAlign: "left", minWidth: 280, paddingLeft: 16 }}>Task</th>
                    <th style={{ ...S.th, minWidth: 160 }}>Hours {MONTHS[selectedMonth].slice(0,3)} {selectedYear}</th>
                    <th style={{ ...S.th, width: 50 }}></th>
                  </tr></thead>
                  <tbody>
                    {getMonthTasks(activeProject, `${selectedYear}-${selectedMonth}`).map((task, idx) => {
                      const key = `${selectedYear}-${selectedMonth}`, hours = activeProject.data?.[key]?.[task.id] || "";
                      return (
                        <tr key={task.id} style={{ background: idx % 2 === 0 ? "#fff" : "#fafaf8" }}>
                          <td style={{ ...S.td, fontWeight: 600, textAlign: "left", paddingLeft: 16 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: "#e65100", fontSize: 10 }}></span>{task.name}</div>
                          </td>
                          <td style={S.td}><input type="number" style={S.hoursInput} value={hours} onChange={e => updateHours(task.id, e.target.value)} placeholder="0" min="0" step="0.5" /></td>
                          <td style={S.td}><button style={S.tinyRemove} onClick={() => removeTaskFromProject(task.id)}>Delete</button></td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: "#f5f3ef" }}>
                      <td style={{ ...S.td, fontWeight: 700, textAlign: "left", paddingLeft: 16 }}>Total</td>
                      <td style={{ ...S.td, fontWeight: 700, fontSize: 15 }}>{getHourlySummary()} hrs</td>
                      <td style={S.td}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )
)}
      </main>
      <footer style={S.footer}><span>@2026 Arista Systems Pvt Ltd.</span></footer>
    </div>
  );
}

const S = {
  root: {
  fontFamily: "'DM Sans', 'Segoe UI', system-ui, -apple-system, sans-serif",
  minHeight: "100vh",

  background: `
    radial-gradient(900px 500px at 50% 30%, rgba(15,23,42,0.06), transparent 60%),
    radial-gradient(700px 400px at 20% 20%, rgba(99,102,241,0.08), transparent 60%),
    radial-gradient(700px 400px at 80% 10%, rgba(16,185,129,0.06), transparent 60%),
    linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%)
  `,

  color: "#0f172a",

  display: "flex",
  flexDirection: "column",

  WebkitFontSmoothing: "antialiased",
  MozOsxFontSmoothing: "grayscale",

  position: "relative",
  overflowX: "hidden"
},

  loadingWrap: {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100vh",      // ⬅️ safer than height (prevents overflow issues)
  gap: 14,                 // ⬅️ slightly better spacing rhythm
  padding: "20px",
  textAlign: "center"
},
  loadingDot: {
  width: 10,                          // ⬅️ slightly more visible
  height: 10,
  borderRadius: "50%",
  background: "#1a1a1a",
  animation: "pulse 1.2s ease-in-out infinite",
  opacity: 0.9
},
  loadingText: {
  fontSize: 13,
  color: "#7a7a7a",        // slightly softer than before
  letterSpacing: 1.2,      // a bit more breathing space
  fontWeight: 500,         // adds polish
  textTransform: "uppercase",
  opacity: 0.85
},
  header: {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",

  padding: "16px 32px", // slightly more breathing space

  borderBottom: "1px solid rgba(0,0,0,0.06)", // softer border
  background: "rgba(255, 255, 255, 0.85)", // slight glass feel
  backdropFilter: "blur(8px)", // premium touch

  position: "sticky",
  top: 0,
  zIndex: 20,

  flexWrap: "wrap",
  gap: 12,

  boxShadow: "0 2px 8px rgba(0,0,0,0.04)" // softer + more depth
},
  headerLeft: {
  display: "flex",
  alignItems: "center",
  gap: 20,
  cursor: "pointer",
},

logoImg: {
  height: 50,
  width: "auto",
  objectFit: "contain",
},

logoTextWrap: {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
},

logo: {
  fontSize: 30,              // ⬅️ slightly tighter (28 → 26 feels sharper)
  fontWeight: 700,
  letterSpacing: "-0.3px",
  margin: 0,
  color: "#111",             // ⬅️ deeper black for contrast
  lineHeight: 1
},

logoSub: {
  fontSize: 14,            // ⬅️ subtle refinement
  color: "#9a9a9a",          // ⬅️ more premium muted tone
  fontWeight: 500,
  letterSpacing: 1.4,        // ⬅️ cleaner uppercase spacing
  textTransform: "uppercase",
  marginTop: 2               // ⬅️ slight vertical alignment tweak
},

  nav: {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",

  padding: "4px",
  borderRadius: 8,
  background: "#fafafa"
},
navBtn: {
  padding: "8px 16px",
  border: "1px solid transparent",     // ⬅️ cleaner look
  borderRadius: 8,

  background: "transparent",           // ⬅️ blends with nav container
  fontSize: 13,
  fontWeight: 500,
  color: "#555",

  cursor: "pointer",

  transition: "all 0.2s ease",

  display: "flex",
  alignItems: "center",
  gap: 6,                              // ⬅️ future-proof for icons

  whiteSpace: "nowrap"
},

navBtnActive: {
  background: "#1a1a1a",
  color: "#fff",

  border: "1px solid #1a1a1a",   // ⬅️ keeps structure clean
  boxShadow: "0 2px 6px rgba(0,0,0,0.12)",

  transform: "translateY(-1px)", // ⬅️ subtle lift effect
},
  navBtnNew: {
  border: "1px dashed #d0d0d0",     // ⬅️ softer dashed border
  color: "#666",                    // ⬅️ better readability
  background: "#fff",

  fontWeight: 500,

  transition: "all 0.2s ease"
},
  main: {
  flex: 1,

  padding: "28px 32px",        // ⬅️ more breathing space

  maxWidth: 1280,              // ⬅️ slightly tighter for better readability
  width: "100%",
  margin: "0 auto",

  boxSizing: "border-box",

  display: "flex",             // ⬅️ prepares for better layout control
  flexDirection: "column",
  gap: 20                      // ⬅️ consistent vertical spacing
},
  section: {
  display: "flex",
  flexDirection: "column",

  gap: 18,                               // ⬅️ slightly more breathing space

  paddingBottom: 14,
  marginBottom: 6,

  borderBottom: "1px solid rgba(0,0,0,0.04)",

  position: "relative"
},

sectionTitle: {
  fontSize: 20,                          // ⬅️ tighter = more product-like
  fontWeight: 700,                       // ⬅️ less heavy, more refined
  letterSpacing: "-0.3px",

  margin: 0,
  color: "#0f172a",                      // ⬅️ premium deep slate tone

  lineHeight: 1.4,

  display: "flex",
  alignItems: "center",
  gap: 8
},
  listHeader: {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",

  gap: 12,
  flexWrap: "wrap",

  paddingBottom: 10,                         // ⬅️ adds structure
  marginBottom: 18,

  borderBottom: "1px solid rgba(0,0,0,0.04)" // ⬅️ subtle divider

},
  sortBtn: {
  padding: "6px 12px",

  border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: 8,

  background: "rgba(255,255,255,0.7)",
  backdropFilter: "blur(6px)",

  fontSize: 12,
  fontWeight: 500,
  color: "#475569",            // ⬅️ premium slate tone

  cursor: "pointer",

  display: "flex",
  alignItems: "center",
  gap: 6,

  transition: "all 0.2s ease",

  whiteSpace: "nowrap"
},
  emptyState: {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",

  padding: "72px 28px",
  margin: "60px auto",

  gap: 20,

  maxWidth: 420,
  textAlign: "center",

  borderRadius: 18,

  background: "rgba(255,255,255,0.7)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",

  border: "1px solid rgba(255,255,255,0.6)",

  boxShadow: `
    0 10px 30px rgba(0,0,0,0.06),
    0 1px 0 rgba(255,255,255,0.6) inset
  `,

  position: "relative",
},
  emptyIcon: {
  fontSize: 40,              // ⬅️ reduced for balance
  marginBottom: 6,           // ⬅️ tighter spacing

  opacity: 0.75,             // ⬅️ softer presence
  filter: "grayscale(20%)",  // ⬅️ subtle premium touch

  lineHeight: 1
},
  emptyText: {
  fontSize: 14,                // ⬅️ slightly tighter for UI feel
  color: "#64748b",            // ⬅️ premium slate tone (better than #888)

  lineHeight: 1.6,             // ⬅️ improves readability
  fontWeight: 400,

  maxWidth: 320,
  margin: "0 auto",

  letterSpacing: "0.2px"       // ⬅️ subtle polish
},
  projectGrid: {
  display: "grid",

  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", // ⬅️ slightly wider cards
  gap: 20,                                                      // ⬅️ more breathing space

  alignItems: "stretch",                                        // ⬅️ consistent card heights
  width: "100%"
},
 projectCard: {
  background: "linear-gradient(180deg, #ffffff 0%, #fbfbfb 100%)",

  borderRadius: 14,                          // ⬅️ more modern
  padding: 20,

  border: "1px solid rgba(15,23,42,0.05)",      // ⬅️ softer border

  display: "flex",
  flexDirection: "column",
  gap: 10,                                   // ⬅️ better spacing

  transition: "all 0.25s ease",

  boxShadow: "0 4px 14px rgba(0,0,0,0.03)"   // ⬅️ subtle depth

}, 
  cardHeader: {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",

  gap: 12,

  marginBottom: 8,

  minHeight: 32
},
  badge: {
  fontSize: 10.5,
  fontWeight: 600,

  padding: "4px 10px",
  borderRadius: 999,                 // ⬅️ perfect pill

  letterSpacing: "0.4px",
  textTransform: "uppercase",

  display: "inline-flex",
  alignItems: "center",
  gap: 4,

  lineHeight: 1,

  background: "rgba(15, 23, 42, 0.04)",   // ⬅️ subtle base layer
  color: "#334155",                      // ⬅️ premium slate tone

  border: "1px solid rgba(15, 23, 42, 0.06)"
},
  deleteBtn: {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",

  minWidth: 72,
  height: 34,

  padding: "0 14px",

  borderRadius: 12,

  background: "rgba(255,255,255,0.88)",
  backdropFilter: "blur(10px)",

  border: "1px solid rgba(15, 23, 42, 0.05)",

  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.2px",
  color: "#0f172a",

  cursor: "pointer",

  transition: "all 0.22s ease",

  lineHeight: 1,

  boxShadow: "0 6px 16px rgba(15, 23, 42, 0.06)",
},

  cardTitle: {
  fontSize: 16,
  fontWeight: 600,
  margin: 0,
  color: "#0f172a",
  letterSpacing: "-0.2px",
  lineHeight: 1.4
},

cardMeta: {
  fontSize: 12.5,
  color: "#64748b",
  margin: 0,
  lineHeight: 1.5
},

cardDepts: {
  display: "flex",
  flexWrap: "wrap",
  gap: 6
},

deptChip: {
  fontSize: 10.5,
  fontWeight: 500,

  padding: "4px 8px",
  borderRadius: 999,

  background: "rgba(15, 23, 42, 0.05)",
  color: "#475569",

  border: "1px solid rgba(15, 23, 42, 0.06)"
},

invoiceRow: {
  display: "flex",
  alignItems: "center",
  gap: 10,

  cursor: "pointer",
  padding: "8px 0",

  borderTop: "1px solid rgba(0,0,0,0.04)",
  marginTop: 6
},

checkbox: {
  width: 18,
  height: 18,

  borderRadius: 6,
  border: "1.5px solid #cbd5f5",

  display: "flex",
  alignItems: "center",
  justifyContent: "center",

  fontSize: 11,
  fontWeight: 700,

  color: "#fff",
  background: "#fff",

  transition: "all 0.2s ease",

  flexShrink: 0
},

checkboxChecked: {
  background: "#0f172a",
  borderColor: "#0f172a",
  boxShadow: "0 2px 6px rgba(0,0,0,0.15)"
},

checkboxLg: {
  width: 22,
  height: 22,
  fontSize: 12
},
  cardBtn: {
  marginTop: 6,
  padding: "10px 0",

  borderRadius: 8,
  border: "1px solid rgba(15, 23, 42, 0.08)",

  background: "#fff",
  color: "#0f172a",

  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "0.2px",

  cursor: "pointer",

  transition: "all 0.2s ease",

  boxShadow: "0 1px 2px rgba(0,0,0,0.04)"
},

formCard: {
  background: "linear-gradient(180deg, #ffffff 0%, #fbfbfb 100%)",

  borderRadius: 16,
  padding: 32,

  border: "1px solid rgba(0,0,0,0.05)",

  maxWidth: 640,
  width: "100%",

  boxShadow: "0 10px 30px rgba(0,0,0,0.04)"
},

formGroup: {
  marginBottom: 22
},

label: {
  display: "block",

  fontSize: 11,
  fontWeight: 600,

  color: "#000000",

  marginBottom: 6,

  letterSpacing: "0.6px",
  textTransform: "uppercase"
},

input: {
  width: "100%",

  padding: "12px 14px",

  borderRadius: 8,
  border: "1px solid rgba(15, 23, 42, 0.08)",

  background: "#ffffff",

  fontSize: 14,
  fontWeight: 500,
  color: "#0f172a",

  outline: "none",
  boxSizing: "border-box",

  transition: "all 0.2s ease",

  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.03)"
},
  addRow: {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center"
},

addBtn: {
  padding: "11px 22px",

  background: "#0f172a",
  color: "#fff",

  border: "none",
  borderRadius: 8,

  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "0.3px",

  cursor: "pointer",
  whiteSpace: "nowrap",

  transition: "all 0.2s ease",

  boxShadow: "0 4px 10px rgba(15, 23, 42, 0.15)"
},

empList: {
  marginTop: 14,
  display: "flex",
  flexDirection: "column",
  gap: 8
},

empRow: {
  display: "flex",
  alignItems: "center",
  gap: 12,

  padding: "10px 14px",

  background: "#ffffff",

  borderRadius: 10,
  border: "1px solid rgba(15, 23, 42, 0.06)",

  transition: "all 0.2s ease",

  boxShadow: "0 2px 6px rgba(0,0,0,0.03)"
},

empNum: {
  fontSize: 11,
  color: "#94a3b8",
  fontWeight: 600,
  width: 22
},

empName: {
  flex: 1,
  fontSize: 14,
  fontWeight: 600,
  color: "#0f172a"
},

empDeptTag: {
  fontSize: 11,

  background: "#f1f5f9",
  color: "#475569",

  padding: "4px 10px",
  borderRadius: 999,

  fontWeight: 500
},

empRemove: {
  background: "transparent",
  border: "none",

  fontSize: 16,
  color: "#cbd5f5",

  cursor: "pointer",

  padding: "2px 6px",
  borderRadius: 6,

  transition: "all 0.2s ease"
},
  typeToggle: {
  display: "flex",
  gap: 14,
},

typeBtn: {
  flex: 1,
  padding: "18px 16px",

  border: "1.5px solid rgba(15, 23, 42, 0.08)",
  borderRadius: 14,

  background: "#ffffff",

  cursor: "pointer",

  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,

  transition: "all 0.25s ease",

  boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
},

typeBtnActive: {
  borderColor: "#2d6a4f",
  background: "#f0fdf4",
  boxShadow: "0 6px 18px rgba(45, 106, 79, 0.18)",
},

typeBtnActiveAlt: {
  borderColor: "#6a3d9a",
  background: "#faf5ff",
  boxShadow: "0 6px 18px rgba(106, 61, 154, 0.18)",
},

typeBtnIcon: {
  fontSize: 26,
  marginBottom: 2,
},

typeBtnLabel: {
  fontSize: 15,
  fontWeight: 700,
  color: "#0f172a",
  letterSpacing: "-0.2px",
},

typeBtnDesc: {
  fontSize: 12,
  color: "#64748b",
},

trackByToggle: {
  display: "flex",
  gap: 12,
},

trackByBtn: {
  flex: 1,
  padding: "14px 16px",

  border: "1.5px solid rgba(15, 23, 42, 0.08)",
  borderRadius: 12,

  background: "#ffffff",

  cursor: "pointer",

  display: "flex",
  alignItems: "center",
  gap: 12,

  transition: "all 0.25s ease",

  boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
},

trackByBtnActive: {
  borderColor: "#6a3d9a",
  background: "#faf5ff",
  boxShadow: "0 6px 18px rgba(106, 61, 154, 0.18)",
},

trackByBtnActiveAlt: {
  borderColor: "#e65100",
  background: "#fff7ed",
  boxShadow: "0 6px 18px rgba(230, 81, 0, 0.18)",
},

trackByLabel: {
  fontSize: 14,
  fontWeight: 600,
  color: "#0f172a",
},

trackByDesc: {
  fontSize: 11,
  color: "#64748b",
},
  primaryBtn: {
  padding: "13px 28px",

  background: "linear-gradient(135deg, #020617, #0f172a)",
  color: "#ffffff",

  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,

  fontSize: 14,
  fontWeight: 600,
  letterSpacing: "0.3px",

  cursor: "pointer",

  transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",

  boxShadow: `
    0 10px 30px rgba(2,6,23,0.35),
    0 1px 0 rgba(255,255,255,0.08) inset
  `,

  position: "relative",
  overflow: "hidden",
},

dataHeader: {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",

  flexWrap: "wrap",
  gap: 18,

  marginBottom: 14
},

dataActions: {
  display: "flex",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap"
},

monthPicker: {
  display: "flex",
  gap: 8
},

selectSmall: {
  padding: "8px 12px",

  border: "1.5px solid rgba(15, 23, 42, 0.08)",
  borderRadius: 8,

  fontSize: 13,
  fontWeight: 500,

  background: "#ffffff",
  color: "#0f172a",

  outline: "none",
  cursor: "pointer",

  transition: "all 0.2s ease"
},

exportBtn: {
  padding: "9px 18px",

  background: "linear-gradient(135deg, #2d6a4f, #1b4332)",
  color: "#ffffff",

  border: "none",
  borderRadius: 8,

  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "0.3px",

  cursor: "pointer",

  transition: "all 0.25s ease",

  boxShadow: "0 5px 14px rgba(45, 106, 79, 0.25)"
},

invoiceBar: {
  background: "#ffffff",

  borderRadius: 10,
  border: "1px solid rgba(15, 23, 42, 0.06)",

  padding: "14px 18px",

  marginBottom: 16,

  boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
},

invoiceBarInner: {
  display: "flex",
  alignItems: "center",
  gap: 12,

  cursor: "pointer"
},

summaryRow: {
  display: "flex",
  gap: 14,
  marginBottom: 16,
  flexWrap: "wrap"
},

summaryCard: {
  background: "#ffffff",

  padding: "16px 22px",

  borderRadius: 12,
  border: "1px solid rgba(15, 23, 42, 0.06)",

  display: "flex",
  flexDirection: "column",
  gap: 4,

  minWidth: 110,

  boxShadow: "0 3px 10px rgba(0,0,0,0.04)",

  transition: "all 0.2s ease"
},

summaryNum: {
  fontSize: 26,
  fontWeight: 800,

  letterSpacing: "-0.6px",

  color: "#0f172a"
},

summaryLabel: {
  fontSize: 11,
  color: "#64748b",

  textTransform: "uppercase",
  letterSpacing: 0.6,
  fontWeight: 500
},
  toolStrip: {
  display: "flex",
  gap: 12,
  marginBottom: 16,
  flexWrap: "wrap",
  alignItems: "stretch"
},

inlineAdd: {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",

  padding: "12px 16px",

  background: "#ffffff",

  borderRadius: 12,
  border: "1px solid rgba(15, 23, 42, 0.06)",

  flex: 1,

  boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
},

inlineAddLabel: {
  fontSize: 12,
  color: "#64748b",
  fontWeight: 500,
  whiteSpace: "nowrap"
},

inputSmall: {
  padding: "8px 12px",

  border: "1.5px solid rgba(15, 23, 42, 0.08)",
  borderRadius: 8,

  fontSize: 13,
  fontWeight: 500,

  outline: "none",

  background: "#ffffff",
  color: "#0f172a",

  transition: "all 0.2s ease"
},

addBtnSmall: {
  width: 34,
  height: 34,

  background: "linear-gradient(135deg, #0f172a, #1e293b)",
  color: "#ffffff",

  border: "none",
  borderRadius: 8,

  fontSize: 18,

  cursor: "pointer",

  display: "flex",
  alignItems: "center",
  justifyContent: "center",

  transition: "all 0.2s ease",

  boxShadow: "0 4px 12px rgba(15, 23, 42, 0.2)"
},

quickActions: {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap"
},

quickBtn: {
  padding: "9px 16px",

  background: "#ffffff",

  border: "1px solid rgba(15, 23, 42, 0.08)",
  borderRadius: 8,

  fontSize: 12,
  fontWeight: 600,

  cursor: "pointer",

  color: "#334155",

  whiteSpace: "nowrap",

  transition: "all 0.2s ease",

  boxShadow: "0 2px 6px rgba(0,0,0,0.04)"
},

tableWrap: {
  background: "#ffffff",

  borderRadius: 14,
  border: "1px solid rgba(15, 23, 42, 0.06)",

  overflow: "hidden",

  boxShadow: "0 6px 20px rgba(0,0,0,0.05)"
},

tableScroll: {
  overflowX: "auto",
  maxHeight: "70vh"
},

table: {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: 13
},

th: {
  padding: "12px 10px",

  background: "#f8fafc",

  borderBottom: "1px solid rgba(15, 23, 42, 0.06)",

  fontSize: 11,
  fontWeight: 700,

  textTransform: "uppercase",
  letterSpacing: "0.6px",

  color: "#64748b",

  position: "sticky",
  top: 0,
  zIndex: 2,

  textAlign: "center",
  whiteSpace: "nowrap"
},

stickyCol: {
  position: "sticky",
  background: "#ffffff",
  zIndex: 3,
  textAlign: "left"
},

stickyCol2: {
  position: "sticky",
  background: "#ffffff",
  zIndex: 3,
  textAlign: "left"
},

dayTh: {
  minWidth: 34,
  padding: "10px 4px"
},

td: {
  padding: "10px",

  borderBottom: "1px solid rgba(15, 23, 42, 0.05)",

  textAlign: "center",
  fontSize: 13,

  color: "#0f172a"
},

dayCell: {
  minWidth: 34,
  padding: "8px 4px",

  fontWeight: 700,
  fontSize: 12,

  borderRight: "1px solid rgba(15, 23, 42, 0.04)",

  transition: "all 0.15s ease"
},

countCell: {
  fontWeight: 700,
  fontSize: 13,

  background: "#f8fafc"
},

empCellRow: {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 6
},

tinyRemove: {
  background: "#ffffff",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  borderRadius: 8,

  padding: "6px 10px",

  fontSize: 12,
  fontWeight: 600,
  color: "#0f172a",

  cursor: "pointer",

  transition: "all 0.2s ease",

  boxShadow: "0 2px 6px rgba(15, 23, 42, 0.05)",
},

hoursInput: {
  width: "100%",
  maxWidth: 120,

  padding: "9px 12px",

  border: "1.5px solid rgba(15, 23, 42, 0.08)",
  borderRadius: 8,

  fontSize: 14,
  fontWeight: 600,

  textAlign: "center",

  outline: "none",

  background: "#ffffff",

  margin: "0 auto",
  display: "block"
},

deptPill: {
  fontSize: 11,

  background: "#f1f5f9",
  color: "#475569",

  padding: "4px 10px",
  borderRadius: 999,

  fontWeight: 500
},

legend: {
  display: "flex",
  gap: 12,
  padding: "12px 16px",

  borderBottom: "1px solid rgba(15, 23, 42, 0.05)",

  alignItems: "center",
  flexWrap: "wrap"
},

legendLabel: {
  fontSize: 11,
  color: "#94a3b8",
  fontWeight: 500
},

legendItem: {
  fontSize: 11,
  fontWeight: 600,

  padding: "4px 10px",

  borderRadius: 6
},

footer: {
  padding: "18px 28px",

  borderTop: "1px solid rgba(15, 23, 42, 0.06)",

  fontSize: 14,
  color: "#64748b",

  textAlign: "center",

  background: "#ffffff"
},
monthFilter: {
  padding: "7px 14px",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 500,
  background: "rgba(255,255,255,0.75)",
  backdropFilter: "blur(8px)",
  cursor: "pointer",
  color: "#0f172a",
  outline: "none",
  transition: "all 0.2s ease",
},

yearFilter: {
  padding: "7px 14px",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 500,
  background: "rgba(255,255,255,0.75)",
  backdropFilter: "blur(8px)",
  cursor: "pointer",
  color: "#0f172a",
  outline: "none",
  transition: "all 0.2s ease",
},
invoiceFilter: {
  padding: "7px 14px",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 500,
  background: "rgba(255,255,255,0.75)",
  backdropFilter: "blur(8px)",
  cursor: "pointer",
  color: "#0f172a",
  outline: "none",
  transition: "all 0.2s ease",
}
};