"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  getVaultRoles,
  getApplications,
  createVaultRole,
  updateVaultRole,
  deleteVaultRole,
  type TalosVaultRole,
  type TalosApplication,
} from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { useState } from "react";
import { KeyRound, Plus, Trash2, Edit, Shield, User, UserCog } from "lucide-react";
import { toast } from "sonner";

const roleTypeIcons: Record<string, React.ElementType> = {
  admin: Shield,
  standard: User,
  guest: User,
  service: UserCog,
  user: User,
};

function VaultRoleCard({
  role,
  appName,
  onToggle,
  onEdit,
  onDelete,
}: {
  role: TalosVaultRole;
  appName: string;
  onToggle: (id: string, isActive: boolean) => void;
  onEdit: (role: TalosVaultRole) => void;
  onDelete: (id: string) => void;
}) {
  const Icon = roleTypeIcons[role.roleType] || User;

  return (
    <Card className="animate-slide-in" data-testid="vault-role-card" data-role-name={role.name}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{role.name}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={role.isActive ? "success" : "secondary"}>
              {role.isActive ? "Active" : "Inactive"}
            </Badge>
            <Switch
              checked={role.isActive}
              onCheckedChange={(checked) => onToggle(role.id, checked)}
            />
          </div>
        </div>
        <CardDescription>{role.description || appName}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Role Type:</span>
            <Badge variant="outline">{role.roleType}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Username Ref:</span>
            <code className="rounded bg-muted px-1 text-xs">{role.usernameRef}</code>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Password Ref:</span>
            <code className="rounded bg-muted px-1 text-xs">{role.passwordRef}</code>
          </div>
          {Object.keys(role.additionalRefs).length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Additional Refs:</span>
              <span className="text-xs">{Object.keys(role.additionalRefs).length} keys</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Updated:</span>
            <span className="text-xs">{formatRelativeTime(role.updatedAt)}</span>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onEdit(role)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button size="sm" variant="destructive" onClick={() => onDelete(role.id)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AddVaultRoleDialog({
  applications,
  onAdd,
}: {
  applications: TalosApplication[];
  onAdd: (data: Partial<TalosVaultRole>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [applicationId, setApplicationId] = useState("");
  const [name, setName] = useState("");
  const [roleType, setRoleType] = useState<string>("standard");
  const [description, setDescription] = useState("");
  const [usernameRef, setUsernameRef] = useState("");
  const [passwordRef, setPasswordRef] = useState("");

  const handleSubmit = () => {
    if (applicationId && name.trim() && usernameRef.trim() && passwordRef.trim()) {
      onAdd({
        applicationId,
        name: name.trim(),
        roleType: roleType as TalosVaultRole["roleType"],
        description: description.trim(),
        usernameRef: usernameRef.trim(),
        passwordRef: passwordRef.trim(),
      });
      resetForm();
      setOpen(false);
    }
  };

  const resetForm = () => {
    setApplicationId("");
    setName("");
    setRoleType("standard");
    setDescription("");
    setUsernameRef("");
    setPasswordRef("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Vault Role
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Vault Role</DialogTitle>
          <DialogDescription>
            Create credential references for multi-role testing.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Application <span className="text-destructive">*</span></label>
            <Select value={applicationId} onValueChange={setApplicationId}>
              <SelectTrigger>
                <SelectValue placeholder="Select application" />
              </SelectTrigger>
              <SelectContent>
                {applications.map((app) => (
                  <SelectItem key={app.id} value={app.id}>
                    {app.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Role Name <span className="text-destructive">*</span></label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Admin User"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Role Type</label>
            <Select value={roleType} onValueChange={setRoleType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="guest">Guest</SelectItem>
                <SelectItem value="service">Service</SelectItem>
                <SelectItem value="user">User</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description <span className="text-xs text-muted-foreground">(optional)</span></label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Username Reference <span className="text-destructive">*</span></label>
            <Input
              value={usernameRef}
              onChange={(e) => setUsernameRef(e.target.value)}
              placeholder="vault:app/admin/username"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Password Reference <span className="text-destructive">*</span></label>
            <Input
              value={passwordRef}
              onChange={(e) => setPasswordRef(e.target.value)}
              placeholder="vault:app/admin/password"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!applicationId || !name.trim() || !usernameRef.trim() || !passwordRef.trim()}
          >
            Create Role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Edit dialog (#531) — modeled after AddVaultRoleDialog. Operates as a controlled
// component so the parent can open it for the currently-selected role.
function EditVaultRoleDialog({
  role,
  open,
  onOpenChange,
  onSave,
}: {
  role: TalosVaultRole | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, data: Partial<TalosVaultRole>) => void;
}) {
  const [name, setName] = useState("");
  const [roleType, setRoleType] = useState<string>("standard");
  const [description, setDescription] = useState("");
  const [usernameRef, setUsernameRef] = useState("");
  const [passwordRef, setPasswordRef] = useState("");
  const [additionalRefsJson, setAdditionalRefsJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Hydrate form when the dialog opens for a new role
  React.useEffect(() => {
    if (role && open) {
      setName(role.name ?? "");
      setRoleType(role.roleType ?? "standard");
      setDescription(role.description ?? "");
      setUsernameRef(role.usernameRef ?? "");
      setPasswordRef(role.passwordRef ?? "");
      setAdditionalRefsJson(
        role.additionalRefs && Object.keys(role.additionalRefs).length > 0
          ? JSON.stringify(role.additionalRefs, null, 2)
          : ""
      );
      setJsonError(null);
    }
  }, [role, open]);

  const handleSubmit = () => {
    if (!role) return;

    let additionalRefs: Record<string, string> = {};
    if (additionalRefsJson.trim()) {
      try {
        const parsed = JSON.parse(additionalRefsJson) as unknown;
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          setJsonError("Additional refs must be a JSON object");
          return;
        }
        // Reject non-string values to keep contract aligned with TalosVaultRole.additionalRefs
        const next: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v !== "string") {
            setJsonError(`Value for "${k}" must be a string`);
            return;
          }
          next[k] = v;
        }
        additionalRefs = next;
      } catch (err) {
        setJsonError(err instanceof Error ? err.message : "Invalid JSON");
        return;
      }
    }
    setJsonError(null);

    if (!name.trim() || !usernameRef.trim() || !passwordRef.trim()) {
      return;
    }

    // Note: we deliberately do NOT send createdAt/updatedAt — the server
    // preserves createdAt and updates updatedAt automatically.
    onSave(role.id, {
      name: name.trim(),
      roleType: roleType as TalosVaultRole["roleType"],
      description: description.trim(),
      usernameRef: usernameRef.trim(),
      passwordRef: passwordRef.trim(),
      additionalRefs,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Vault Role</DialogTitle>
          <DialogDescription>
            Update credential references. The application binding cannot be changed; delete and
            re-create the role to move it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Role Name <span className="text-destructive">*</span></label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Admin User" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Role Type</label>
            <Select value={roleType} onValueChange={setRoleType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="guest">Guest</SelectItem>
                <SelectItem value="service">Service</SelectItem>
                <SelectItem value="user">User</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description <span className="text-xs text-muted-foreground">(optional)</span></label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Username Reference <span className="text-destructive">*</span></label>
            <Input
              value={usernameRef}
              onChange={(e) => setUsernameRef(e.target.value)}
              placeholder="vault:app/admin/username"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Password Reference <span className="text-destructive">*</span></label>
            <Input
              value={passwordRef}
              onChange={(e) => setPasswordRef(e.target.value)}
              placeholder="vault:app/admin/password"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Additional Refs <span className="text-xs text-muted-foreground">(optional JSON object of string values)</span>
            </label>
            <textarea
              className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
              value={additionalRefsJson}
              onChange={(e) => setAdditionalRefsJson(e.target.value)}
              placeholder={'{ "totp": "vault:app/admin/totp" }'}
            />
            {jsonError && (
              <p className="text-xs text-destructive" data-testid="vault-role-refs-error">
                {jsonError}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || !usernameRef.trim() || !passwordRef.trim()}
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VaultManager() {
  const queryClient = useQueryClient();
  const [selectedApp, setSelectedApp] = useState<string>("all");
  const [editingRole, setEditingRole] = useState<TalosVaultRole | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const { data: apps = [] } = useQuery({
    queryKey: ["applications"],
    queryFn: getApplications,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["vaultRoles", selectedApp],
    queryFn: () => getVaultRoles(selectedApp === "all" ? undefined : selectedApp),
  });

  const createMutation = useMutation({
    mutationFn: createVaultRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vaultRoles"] });
      toast.success("Vault role created");
    },
    onError: (err: unknown) => {
      toast.error("Failed to create vault role", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TalosVaultRole> }) =>
      updateVaultRole(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vaultRoles"] });
      toast.success("Vault role updated");
    },
    onError: (err: unknown) => {
      toast.error("Failed to update vault role", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteVaultRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vaultRoles"] });
      toast.success("Vault role deleted");
    },
    onError: (err: unknown) => {
      toast.error("Failed to delete vault role", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });

  const getAppName = (applicationId: string) => {
    const app = apps.find((a) => a.id === applicationId);
    return app?.name || "Unknown App";
  };

  const handleToggle = (id: string, isActive: boolean) => {
    updateMutation.mutate({ id, data: { isActive } });
  };

  const handleEdit = (role: TalosVaultRole) => {
    setEditingRole(role);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = (id: string, data: Partial<TalosVaultRole>) => {
    updateMutation.mutate({ id, data });
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this vault role?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleAdd = (data: Partial<TalosVaultRole>) => {
    createMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vault Roles</h1>
          <p className="text-muted-foreground">
            Manage credential references for multi-role testing
          </p>
        </div>
        <AddVaultRoleDialog applications={apps} onAdd={handleAdd} />
      </div>

      <div className="flex items-center gap-4">
        <Select value={selectedApp} onValueChange={setSelectedApp}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by app" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Applications</SelectItem>
            {apps.map((app) => (
              <SelectItem key={app.id} value={app.id}>
                {app.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {roles.length > 0 ? (
        <div className="test-grid">
          {roles.map((role) => (
            <VaultRoleCard
              key={role.id}
              role={role}
              appName={getAppName(role.applicationId)}
              onToggle={handleToggle}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <KeyRound className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No vault roles yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Create vault roles to enable multi-role testing with different credentials.
          </p>
        </Card>
      )}

      <EditVaultRoleDialog
        role={editingRole}
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditingRole(null);
        }}
        onSave={handleSaveEdit}
      />
    </div>
  );
}
