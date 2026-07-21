"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { CheckCircle2, Edit, ListTodo, Loader2, PauseCircle, PlayCircle, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  assignedUserId: string | null;
  priority: string;
  dueDate: string | null;
  status: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdAt: string;
  assignedUserName: string | null;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
}

const priorityStyles: Record<string, string> = {
  urgent: "inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium bg-[#FEF2F2] text-[#DC2626]",
  high: "inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium bg-[#FFF7ED] text-[#EA580C]",
  medium: "inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium bg-[#FFFBEB] text-[#D97706]",
  low: "inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium bg-[#F0FDF4] text-[#16A34A]",
};

export default function TasksPage() {
  const { data: session } = useSession();
  const admin = String((session?.user as Record<string, unknown> | undefined)?.roleName || "").toLowerCase() === "admin";
  const [data, setData] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<string>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const pageSize = 10;

  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    status: "open",
    dueDate: "",
    assignedUserId: "",
  });

  const fetchData = () => {
    fetch("/api/tasks?pageSize=100")
      .then((res) => { if (!res.ok) throw new Error("Failed to fetch"); return res.json(); })
      .then((json) => { setData(json.data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if ((showCreate || editingTask) && admin) {
      fetch("/api/users?all=1")
        .then((r) => r.json())
        .then((j) => setUsers(j.data || []))
        .catch(() => {});
    }
  }, [admin, editingTask, showCreate]);

  const resetForm = () => {
    setForm({ title: "", description: "", priority: "medium", status: "open", dueDate: "", assignedUserId: "" });
    setEditingTask(null);
  };

  const openCreate = () => {
    resetForm();
    setShowCreate(true);
  };

  const openEdit = (task: TaskItem) => {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
      assignedUserId: task.assignedUserId || "",
    });
    setShowCreate(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, any> = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        status: form.status,
        dueDate: form.dueDate || null,
        assignedUserId: form.assignedUserId || null,
      };
      const res = await fetch(editingTask ? `/api/tasks/${editingTask.id}` : "/api/tasks", {
        method: editingTask ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(editingTask ? "Failed to update task" : "Failed to create task");
      toast.success(editingTask ? "Task updated" : "Task created");
      setShowCreate(false);
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save task");
    } finally {
      setSaving(false);
    }
  };

  const updateTaskStatus = async (task: TaskItem, status: string) => {
    const key = `${task.id}-${status}`;
    setActionLoading(key);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      toast.success(`Task ${status.replace(/_/g, " ")}`);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setActionLoading(null);
    }
  };

  const deleteTask = async (task: TaskItem) => {
    if (!confirm(`Delete task "${task.title}"?`)) return;
    const key = `${task.id}-delete`;
    setActionLoading(key);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete task");
      toast.success("Task deleted");
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete task");
    } finally {
      setActionLoading(null);
    }
  };

  const canManageTask = (task: TaskItem) => admin || task.assignedUserId === (session?.user as Record<string, unknown> | undefined)?.id;

  const filtered = data.filter((item) => {
    if (statusFilter && item.status !== statusFilter) return false;
    if (priorityFilter && item.priority !== priorityFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return item.title.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q) || item.assignedUserName?.toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    let aVal = a[sortField as keyof TaskItem] ?? "";
    let bVal = b[sortField as keyof TaskItem] ?? "";
    if (typeof aVal === "string") aVal = aVal.toLowerCase();
    if (typeof bVal === "string") bVal = bVal.toLowerCase();
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const stats = {
    total: data.length,
    open: data.filter((d) => d.status === "open").length,
    inProgress: data.filter((d) => d.status === "in_progress").length,
    completed: data.filter((d) => d.status === "completed").length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">Tasks</h1>
          <p className="text-[13px] text-[#6B7280] mt-0.5">Internal task management and assignments</p>
        </div>
        <button className="flex items-center gap-1.5 h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" /> {admin ? "Add Task / Notification" : "Add Task"}
        </button>
      </div>

      {error && (
        <div className="rounded-[10px] border border-red-200 bg-red-50 p-3 text-[13px] text-red-600 font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-4">
          <p className="text-[12px] text-[#6B7280] mb-1">Total Tasks</p>
          <p className="text-[26px] font-bold text-[#111827]">{stats.total}</p>
        </div>
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-4">
          <p className="text-[12px] text-[#6B7280] mb-1">Open</p>
          <p className="text-[26px] font-bold text-[#4F46E5]">{stats.open}</p>
        </div>
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-4">
          <p className="text-[12px] text-[#6B7280] mb-1">In Progress</p>
          <p className="text-[26px] font-bold text-[#D97706]">{stats.inProgress}</p>
        </div>
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-4">
          <p className="text-[12px] text-[#6B7280] mb-1">Completed</p>
          <p className="text-[26px] font-bold text-[#16A34A]">{stats.completed}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
          <input placeholder="Search tasks..." className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white pl-9 pr-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151] max-sm:text-[12px]" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="blocked">Blocked</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151] max-sm:text-[12px]" value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}>
          <option value="">All Priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <div className="ml-auto text-[12px] text-[#6B7280]">
          {!loading && `${filtered.length} tasks`}
        </div>
      </div>

      <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB]">
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider cursor-pointer hover:text-[#111827]" onClick={() => { if (sortField === "title") setSortDir(sortDir === "asc" ? "desc" : "asc"); else { setSortField("title"); setSortDir("asc"); } }}>Title {sortField === "title" && (sortDir === "asc" ? "↑" : "↓")}</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider cursor-pointer hover:text-[#111827]" onClick={() => { if (sortField === "priority") setSortDir(sortDir === "asc" ? "desc" : "asc"); else { setSortField("priority"); setSortDir("asc"); } }}>Priority {sortField === "priority" && (sortDir === "asc" ? "↑" : "↓")}</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider cursor-pointer hover:text-[#111827]" onClick={() => { if (sortField === "status") setSortDir(sortDir === "asc" ? "desc" : "asc"); else { setSortField("status"); setSortDir("asc"); } }}>Status {sortField === "status" && (sortDir === "asc" ? "↑" : "↓")}</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Assigned To</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider cursor-pointer hover:text-[#111827]" onClick={() => { if (sortField === "dueDate") setSortDir(sortDir === "asc" ? "desc" : "asc"); else { setSortField("dueDate"); setSortDir("asc"); } }}>Due Date {sortField === "dueDate" && (sortDir === "asc" ? "↑" : "↓")}</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider cursor-pointer hover:text-[#111827]" onClick={() => { if (sortField === "createdAt") setSortDir(sortDir === "asc" ? "desc" : "asc"); else { setSortField("createdAt"); setSortDir("asc"); } }}>Created {sortField === "createdAt" && (sortDir === "asc" ? "↑" : "↓")}</th>
                <th className="text-right text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-[#F1F5F9]">
                    <td className="px-3 py-2.5"><div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "160px" }} /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "56px" }} /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "64px" }} /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "96px" }} /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "80px" }} /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "80px" }} /></td>
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12">
                    <EmptyState icon={ListTodo} title="No tasks" description="Tasks will appear here once created" />
                  </td>
                </tr>
              ) : (
                paginated.map((task) => (
                  <tr key={task.id} className="border-t border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                          <ListTodo className="h-3.5 w-3.5 text-amber-600" />
                        </div>
                        <span className="text-[13px] font-medium text-[#111827]">{task.title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={priorityStyles[task.priority] || priorityStyles.medium}>
                        {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge value={task.status} label={task.status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} />
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-[#6B7280]">{task.assignedUserName || "Public"}</td>
                    <td className="px-3 py-2.5 text-[13px] text-[#374151]">
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-[#6B7280]">
                      {new Date(task.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2.5">
                      {canManageTask(task) ? (
                        <div className="flex items-center justify-end gap-1">
                          <button title="Edit" onClick={() => openEdit(task)} className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[#4F46E5] hover:bg-[#EEF2FF]">
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          {task.status !== "completed" && (
                            <button title="Complete" onClick={() => updateTaskStatus(task, "completed")} disabled={actionLoading === `${task.id}-completed`} className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[#16A34A] hover:bg-[#ECFDF5] disabled:opacity-50">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {task.status === "blocked" ? (
                            <button title="Reopen" onClick={() => updateTaskStatus(task, "open")} disabled={actionLoading === `${task.id}-open`} className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[#4F46E5] hover:bg-[#EEF2FF] disabled:opacity-50">
                              <PlayCircle className="h-3.5 w-3.5" />
                            </button>
                          ) : task.status !== "completed" && (
                            <button title="Pause / Block" onClick={() => updateTaskStatus(task, "blocked")} disabled={actionLoading === `${task.id}-blocked`} className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[#EA580C] hover:bg-[#FFF7ED] disabled:opacity-50">
                              <PauseCircle className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button title="Delete" onClick={() => deleteTask(task)} disabled={actionLoading === `${task.id}-delete`} className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[#DC2626] hover:bg-[#FEF2F2] disabled:opacity-50">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="block text-right text-[12px] text-[#9CA3AF]">View only</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          <button className="h-[30px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] hover:bg-[#F9FAFB] disabled:opacity-40" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button key={p} className={`h-[30px] w-[30px] rounded-[7px] text-[12px] font-medium transition-colors ${p === page ? "bg-[#4F46E5] text-white" : "border border-[#E5E7EB] bg-white text-[#374151] hover:bg-[#F9FAFB]"}`} onClick={() => setPage(p)}>{p}</button>
          ))}
          <button className="h-[30px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] hover:bg-[#F9FAFB] disabled:opacity-40" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTask ? "Edit Task" : admin ? "Add Task / Notification" : "Add Task"}</DialogTitle>
            <DialogDescription>{admin ? "Leave assignment public to notify every user, or assign it to one user only." : "Create or update a task assigned to you."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[#374151]">Title *</label>
              <input
                placeholder="Task title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[#374151]">Description</label>
              <textarea
                placeholder="Optional description..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="flex w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 py-2 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 min-h-[80px] resize-y"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-[#374151]">Priority</label>
                <select className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151]" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-[#374151]">Status</label>
                <select className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151]" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-[#374151]">Due Date</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-[#374151]">Assign To</label>
                {admin ? (
                  <select className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151]" value={form.assignedUserId} onChange={(e) => setForm({ ...form, assignedUserId: e.target.value })}>
                    <option value="">Public notification - everyone</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="flex h-[34px] items-center rounded-[7px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-[13px] font-medium text-[#374151]">
                    Me
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <button className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB]" onClick={() => { setShowCreate(false); resetForm(); }} disabled={saving}>Cancel</button>
            <button className="h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
              {editingTask ? "Save Changes" : "Create Task"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
