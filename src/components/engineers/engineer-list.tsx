"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Engineer, EngineerSpecialty, Specialty, ScheduledBlock, UnavailabilityBlock } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, MoreHorizontal, Calendar, Clock, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type EngineerWithRelations = Engineer & {
  specialties: (EngineerSpecialty & { specialty: Specialty })[];
  scheduledBlocks: ScheduledBlock[];
  unavailability: UnavailabilityBlock[];
};

interface EngineerListProps {
  engineers: EngineerWithRelations[];
}

export function EngineerList({ engineers: initialEngineers }: EngineerListProps) {
  const router = useRouter();
  const [engineers, setEngineers] = useState(initialEngineers);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<EngineerWithRelations | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/engineers/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setEngineers(engineers.filter(e => e.id !== deleteTarget.id));
        setDeleteTarget(null);
        router.refresh();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to delete engineer");
      }
    } catch (error) {
      console.error("Failed to delete engineer:", error);
      alert("Failed to delete engineer");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredEngineers = engineers.filter(
    (engineer) =>
      engineer.name.toLowerCase().includes(search.toLowerCase()) ||
      engineer.email?.toLowerCase().includes(search.toLowerCase()) ||
      engineer.specialties.some((s) =>
        s.specialty.name.toLowerCase().includes(search.toLowerCase())
      )
  );

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getPrimarySpecialties = (engineer: EngineerWithRelations) => {
    return engineer.specialties
      .filter((s) => s.level === "PRIMARY")
      .map((s) => s.specialty);
  };

  const getSecondarySpecialties = (engineer: EngineerWithRelations) => {
    return engineer.specialties
      .filter((s) => s.level === "SECONDARY")
      .map((s) => s.specialty);
  };

  const getCurrentLoad = (engineer: EngineerWithRelations) => {
    const now = new Date();
    const activeBlocks = engineer.scheduledBlocks.filter(
      (block) => new Date(block.startDate) <= now && new Date(block.endDate) >= now
    );
    return activeBlocks.reduce((sum, block) => sum + block.hoursAllocated, 0);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search engineers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Engineer</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Specialties</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Current Load</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEngineers.map((engineer) => (
                <TableRow key={engineer.id}>
                  <TableCell>
                    <Link href={`/engineers/${engineer.id}`} className="flex items-center gap-3 hover:underline">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback>{getInitials(engineer.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{engineer.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {engineer.email}
                        </div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>{engineer.role || "-"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {getPrimarySpecialties(engineer).map((specialty) => (
                        <Badge
                          key={specialty.id}
                          style={{ backgroundColor: specialty.color || undefined }}
                        >
                          {specialty.name}
                        </Badge>
                      ))}
                      {getSecondarySpecialties(engineer).map((specialty) => (
                        <Badge
                          key={specialty.id}
                          variant="outline"
                          style={{ borderColor: specialty.color || undefined, color: specialty.color || undefined }}
                        >
                          {specialty.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      {engineer.weeklyCapacity}h/week
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-16 rounded-full bg-secondary">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{
                            width: `${Math.min(
                              (getCurrentLoad(engineer) / engineer.weeklyCapacity) * 100,
                              100
                            )}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {getCurrentLoad(engineer)}h
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {engineer.isActive ? (
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/engineers/${engineer.id}`}>View Details</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/engineers/${engineer.id}/edit`}>Edit</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/engineers/${engineer.id}/availability`}>
                            <Calendar className="mr-2 h-4 w-4" />
                            Manage Availability
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(engineer)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filteredEngineers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No engineers found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Engineer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteTarget?.name}? This will also remove all their scheduled blocks and assignments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
