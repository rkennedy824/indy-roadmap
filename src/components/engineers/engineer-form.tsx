"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Engineer, Specialty, EngineerSpecialty } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { X, Plus } from "lucide-react";

type EngineerWithSpecialties = Engineer & {
  specialties: (EngineerSpecialty & { specialty: Specialty })[];
};

interface EngineerFormProps {
  engineer?: EngineerWithSpecialties;
  specialties: Specialty[];
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
];

const WORKING_DAYS = [
  { value: "0", label: "Sun" },
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
];

export function EngineerForm({ engineer, specialties }: EngineerFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: engineer?.name || "",
    email: engineer?.email || "",
    role: engineer?.role || "",
    timezone: engineer?.timezone || "America/New_York",
    weeklyCapacity: engineer?.weeklyCapacity || 40,
    workingDays: engineer?.workingDays?.split(",") || ["1", "2", "3", "4", "5"],
    isActive: engineer?.isActive ?? true,
  });

  const [selectedSpecialties, setSelectedSpecialties] = useState<
    { specialtyId: string; level: "PRIMARY" | "SECONDARY" }[]
  >(
    engineer?.specialties.map((s) => ({
      specialtyId: s.specialtyId,
      level: s.level,
    })) || []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const payload = {
        ...formData,
        workingDays: formData.workingDays.join(","),
        specialties: selectedSpecialties,
      };

      const response = await fetch(
        engineer ? `/api/engineers/${engineer.id}` : "/api/engineers",
        {
          method: engineer ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) throw new Error("Failed to save engineer");

      router.push("/engineers");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Failed to save engineer");
    } finally {
      setIsSubmitting(false);
    }
  };

  const addSpecialty = (specialtyId: string, level: "PRIMARY" | "SECONDARY") => {
    if (selectedSpecialties.some((s) => s.specialtyId === specialtyId)) return;
    setSelectedSpecialties([...selectedSpecialties, { specialtyId, level }]);
  };

  const removeSpecialty = (specialtyId: string) => {
    setSelectedSpecialties(selectedSpecialties.filter((s) => s.specialtyId !== specialtyId));
  };

  const toggleWorkingDay = (day: string) => {
    setFormData((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter((d) => d !== day)
        : [...prev.workingDays, day].sort(),
    }));
  };

  const getSpecialtyById = (id: string) => specialties.find((s) => s.id === id);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Input
                id="role"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                placeholder="e.g., Senior Engineer"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={formData.timezone}
                onValueChange={(value) => setFormData({ ...formData, timezone: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Label htmlFor="isActive">Active</Label>
            <Switch
              id="isActive"
              checked={formData.isActive}
              onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Capacity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="weeklyCapacity">Weekly Capacity (hours)</Label>
            <Input
              id="weeklyCapacity"
              type="number"
              min="0"
              max="168"
              value={formData.weeklyCapacity}
              onChange={(e) =>
                setFormData({ ...formData, weeklyCapacity: parseInt(e.target.value) || 0 })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Working Days</Label>
            <div className="flex flex-wrap gap-2">
              {WORKING_DAYS.map((day) => (
                <Button
                  key={day.value}
                  type="button"
                  variant={formData.workingDays.includes(day.value) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleWorkingDay(day.value)}
                >
                  {day.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Specialties</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Primary Specialties</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedSpecialties
                .filter((s) => s.level === "PRIMARY")
                .map((s) => {
                  const specialty = getSpecialtyById(s.specialtyId);
                  return specialty ? (
                    <Badge
                      key={s.specialtyId}
                      style={{ backgroundColor: specialty.color || undefined }}
                      className="gap-1"
                    >
                      {specialty.name}
                      <button
                        type="button"
                        onClick={() => removeSpecialty(s.specialtyId)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ) : null;
                })}
            </div>
            <Select onValueChange={(value) => addSpecialty(value, "PRIMARY")}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Add primary..." />
              </SelectTrigger>
              <SelectContent>
                {specialties
                  .filter((s) => !selectedSpecialties.some((sel) => sel.specialtyId === s.id))
                  .map((specialty) => (
                    <SelectItem key={specialty.id} value={specialty.id}>
                      {specialty.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Secondary Specialties</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedSpecialties
                .filter((s) => s.level === "SECONDARY")
                .map((s) => {
                  const specialty = getSpecialtyById(s.specialtyId);
                  return specialty ? (
                    <Badge
                      key={s.specialtyId}
                      variant="outline"
                      style={{ borderColor: specialty.color || undefined, color: specialty.color || undefined }}
                      className="gap-1"
                    >
                      {specialty.name}
                      <button
                        type="button"
                        onClick={() => removeSpecialty(s.specialtyId)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ) : null;
                })}
            </div>
            <Select onValueChange={(value) => addSpecialty(value, "SECONDARY")}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Add secondary..." />
              </SelectTrigger>
              <SelectContent>
                {specialties
                  .filter((s) => !selectedSpecialties.some((sel) => sel.specialtyId === s.id))
                  .map((specialty) => (
                    <SelectItem key={specialty.id} value={specialty.id}>
                      {specialty.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : engineer ? "Update Engineer" : "Create Engineer"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
