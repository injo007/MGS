"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { ImageIcon, Plus, Inbox, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

interface UserItem {
  id: string;
  name: string;
  email: string;
  image: string | null;
  roleId: string;
  roleName: string | null;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}

interface RoleOption {
  id: string;
  name: string;
}

interface UserSavePayload {
  name: string;
  email: string;
  image: string | null;
  roleId: string | null;
  status: string;
  password?: string;
}

export default function UsersPage() {
  const [data, setData] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    image: "",
    password: "",
    roleId: "",
    status: "active",
  });

  const userInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const avatarImage = (image: string | null, name: string, className = "h-8 w-8") => (
    <div className={`${className} overflow-hidden rounded-full bg-[#EEF2FF] flex items-center justify-center text-[11px] font-bold text-[#4F46E5] ring-1 ring-[#E5E7EB]`}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        <span>{userInitials(name)}</span>
      )}
    </div>
  );

  const setImageFromFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error("Image must be 1 MB or smaller");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, image: String(reader.result || "") }));
    reader.onerror = () => toast.error("Failed to read image");
    reader.readAsDataURL(file);
  };

  const fetchData = () => {
    fetch("/api/users?pageSize=100")
      .then((res) => { if (!res.ok) throw new Error("Failed to fetch"); return res.json(); })
      .then((json) => { setData(json.data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (showCreate || editingUser) {
      fetch("/api/roles")
        .then((r) => r.json())
        .then((j) => setRoles(j.data || []))
        .catch(() => {});
    }
  }, [showCreate, editingUser]);

  const openCreate = () => {
    setEditingUser(null);
    setForm({ name: "", email: "", image: "", password: "", roleId: "", status: "active" });
    setShowCreate(true);
  };

  const openEdit = (user: UserItem) => {
    setForm({
      name: user.name,
      email: user.email,
      image: user.image || "",
      password: "",
      roleId: user.roleId || "",
      status: user.status,
    });
    setEditingUser(user);
    setShowCreate(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    if (!editingUser && !form.password) {
      toast.error("Password is required for new users");
      return;
    }
    setSaving(true);
    try {
      if (editingUser) {
        const body: UserSavePayload = {
          name: form.name.trim(),
          email: form.email.trim(),
          image: form.image.trim() || null,
          roleId: form.roleId || null,
          status: form.status,
        };
        if (form.password) body.password = form.password;
        const res = await fetch(`/api/users/${editingUser.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to update user");
        }
        const updated = await res.json();
        window.dispatchEvent(new CustomEvent("cloudops:user-updated", { detail: updated }));
        toast.success("User updated");
      } else {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            email: form.email.trim(),
            image: form.image.trim() || null,
            password: form.password,
            roleId: form.roleId || null,
            status: form.status,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to create user");
        }
        toast.success("User created");
      }
      setShowCreate(false);
      setEditingUser(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">Users</h1>
          <p className="text-[13px] text-[#6B7280] mt-0.5">Manage team members and their access levels</p>
        </div>
        <button
          className="flex items-center gap-1.5 h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors"
          onClick={openCreate}
        >
          <Plus className="h-3.5 w-3.5" /> Add User
        </button>
      </div>

      {error && (
        <div className="rounded-[7px] bg-red-50 border border-red-200 p-3 text-[13px] text-red-600">
          {error}
        </div>
      )}

      <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB]">
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">User</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Role</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Status</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Last Login</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-[#F1F5F9]">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-[#F1F5F9] animate-pulse" />
                        <div className="space-y-1">
                          <div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "112px" }} />
                          <div className="h-3 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "144px" }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5"><div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "72px" }} /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "56px" }} /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "80px" }} /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "48px" }} /></td>
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr className="border-t border-[#F1F5F9]">
                  <td colSpan={5} className="px-3 py-12 text-center">
                    <Inbox className="h-8 w-8 text-[#9CA3AF] mx-auto mb-2" />
                    <p className="text-[13px] text-[#6B7280]">No users found</p>
                  </td>
                </tr>
              ) : (
                data.map((user) => (
                  <tr key={user.id} className="border-t border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors group">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        {avatarImage(user.image, user.name)}
                        <div>
                          <p className="text-[13px] font-medium text-[#111827]">{user.name}</p>
                          <p className="text-[12px] text-[#6B7280]">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium bg-[#EEF2FF] text-[#4F46E5]">
                        {user.roleName || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge value={user.status} />
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-[#6B7280]">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "Never"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          className="text-[13px] font-medium text-[#4F46E5] hover:text-[#4338CA] transition-colors"
                          onClick={() => openEdit(user)}
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) setEditingUser(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Edit User" : "Add User"}</DialogTitle>
            <DialogDescription>{editingUser ? "Update user details" : "Invite a new team member"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
              {avatarImage(form.image, form.name || "User", "h-12 w-12")}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[#111827]">User image</p>
                <p className="mt-0.5 text-[12px] text-[#6B7280]">Use an image URL or upload a small square image.</p>
              </div>
              {form.image && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, image: "" })}
                  className="flex h-8 w-8 items-center justify-center rounded-[7px] border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F1F5F9]"
                  title="Remove image"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[#374151]">Name *</label>
              <input
                placeholder="Full name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[#374151]">Email *</label>
              <input
                type="email"
                placeholder="user@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[#374151]">Image</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <ImageIcon className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9CA3AF]" />
                  <input
                    placeholder="https://example.com/avatar.jpg"
                    value={form.image}
                    onChange={(e) => setForm({ ...form, image: e.target.value })}
                    className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white pl-9 pr-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
                  />
                </div>
                <label className="inline-flex h-[34px] cursor-pointer items-center gap-1.5 rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB]">
                  <Upload className="h-3.5 w-3.5" />
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => setImageFromFile(event.target.files?.[0])}
                  />
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[#374151]">{editingUser ? "New Password (leave blank to keep)" : "Password *"}</label>
              <input
                type="password"
                placeholder={editingUser ? "••••••••" : "Set password"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-[#374151]">Role</label>
                <select
                  value={form.roleId}
                  onChange={(e) => setForm({ ...form, roleId: e.target.value })}
                  className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151]"
                >
                  <option value="">No role</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-[#374151]">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151]"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <button
              className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB]"
              onClick={() => { setShowCreate(false); setEditingUser(null); }}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
              {editingUser ? "Save Changes" : "Create User"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
