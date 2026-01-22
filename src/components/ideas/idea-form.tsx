"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Idea, IdeaTag, Specialty, Client, IdeaClientImpact, ClientImpactType } from "@prisma/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Loader2 } from "lucide-react";

type IdeaWithTags = Idea & {
  tags: (IdeaTag & { specialty: Specialty })[];
  impactedClients?: (IdeaClientImpact & { client: Client })[];
};

interface IdeaFormProps {
  idea?: IdeaWithTags;
  specialties: Specialty[];
  clients: Client[];
}

const CLIENT_IMPACT_OPTIONS: { value: ClientImpactType | ""; label: string }[] = [
  { value: "", label: "Not specified" },
  { value: "ALL", label: "All Clients" },
  { value: "LARGE_CHAINS", label: "Large Chains" },
  { value: "SMALL_CHAINS", label: "Small Chains" },
  { value: "SPECIFIC", label: "Specific Clients" },
];

export function IdeaForm({ idea, specialties, clients }: IdeaFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    title: idea?.title || "",
    problemStatement: idea?.problemStatement || "",
    whoIsImpacted: idea?.whoIsImpacted || "",
    whereItHappens: idea?.whereItHappens || "",
    frequency: idea?.frequency || "",
    severity: idea?.severity || "",
    currentWorkaround: idea?.currentWorkaround || "",
    desiredOutcome: idea?.desiredOutcome || "",
    evidence: idea?.evidence || "",
    tags: idea?.tags.map((t) => t.specialtyId) || [],
    clientImpactType: (idea?.clientImpactType || "") as ClientImpactType | "",
    impactedClientIds: idea?.impactedClients?.map((ic) => ic.clientId) || [],
  });

  const handleChange = (field: string, value: string | string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleTagToggle = (specialtyId: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.includes(specialtyId)
        ? prev.tags.filter((id) => id !== specialtyId)
        : [...prev.tags, specialtyId],
    }));
  };

  const handleClientToggle = (clientId: string) => {
    setFormData((prev) => ({
      ...prev,
      impactedClientIds: prev.impactedClientIds.includes(clientId)
        ? prev.impactedClientIds.filter((id) => id !== clientId)
        : [...prev.impactedClientIds, clientId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim() || !formData.problemStatement.trim()) {
      alert("Title and Problem Statement are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const url = idea ? `/api/ideas/${idea.id}` : "/api/ideas";
      const method = idea ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error("Failed to save idea");
      }

      const result = await response.json();
      router.push(`/ideas/${result.id}`);
    } catch (error) {
      console.error("Failed to save idea:", error);
      alert("Failed to save idea. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={idea ? `/ideas/${idea.id}` : "/ideas"}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">
          {idea ? "Edit Idea" : "Submit New Idea"}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                  placeholder="Brief, descriptive title for the idea"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="problemStatement">
                  Problem Statement <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="problemStatement"
                  value={formData.problemStatement}
                  onChange={(e) => handleChange("problemStatement", e.target.value)}
                  placeholder="Describe the problem you've observed. What's not working well? What pain points exist?"
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          {/* Context */}
          <Card>
            <CardHeader>
              <CardTitle>Context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="whoIsImpacted">Who is impacted?</Label>
                  <Input
                    id="whoIsImpacted"
                    value={formData.whoIsImpacted}
                    onChange={(e) => handleChange("whoIsImpacted", e.target.value)}
                    placeholder="e.g., All users, Admins, New customers"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whereItHappens">Where does it happen?</Label>
                  <Input
                    id="whereItHappens"
                    value={formData.whereItHappens}
                    onChange={(e) => handleChange("whereItHappens", e.target.value)}
                    placeholder="e.g., Dashboard, Mobile app, Checkout"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="frequency">How often does it happen?</Label>
                  <Input
                    id="frequency"
                    value={formData.frequency}
                    onChange={(e) => handleChange("frequency", e.target.value)}
                    placeholder="e.g., Daily, Weekly, Every transaction"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="severity">Severity / Impact Level</Label>
                  <Input
                    id="severity"
                    value={formData.severity}
                    onChange={(e) => handleChange("severity", e.target.value)}
                    placeholder="e.g., High, Medium, Annoying but minor"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentWorkaround">Current Workaround</Label>
                <Textarea
                  id="currentWorkaround"
                  value={formData.currentWorkaround}
                  onChange={(e) => handleChange("currentWorkaround", e.target.value)}
                  placeholder="How do people currently deal with this problem? What are they doing instead?"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desiredOutcome">Desired Outcome</Label>
                <Textarea
                  id="desiredOutcome"
                  value={formData.desiredOutcome}
                  onChange={(e) => handleChange("desiredOutcome", e.target.value)}
                  placeholder="What would success look like? How would things be better if this were solved?"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="evidence">Evidence / Supporting Links</Label>
                <Textarea
                  id="evidence"
                  value={formData.evidence}
                  onChange={(e) => handleChange("evidence", e.target.value)}
                  placeholder="Links to support tickets, customer quotes, analytics, screenshots, etc."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Tags */}
          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {specialties.map((specialty) => (
                  <div key={specialty.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`tag-${specialty.id}`}
                      checked={formData.tags.includes(specialty.id)}
                      onCheckedChange={() => handleTagToggle(specialty.id)}
                    />
                    <label
                      htmlFor={`tag-${specialty.id}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2"
                    >
                      {specialty.color && (
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: specialty.color }}
                        />
                      )}
                      {specialty.name}
                    </label>
                  </div>
                ))}
                {specialties.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No tags available.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Client Impact */}
          <Card>
            <CardHeader>
              <CardTitle>Client Impact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Which clients are impacted?</Label>
                <Select
                  value={formData.clientImpactType}
                  onValueChange={(value) =>
                    handleChange("clientImpactType", value as ClientImpactType | "")
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select client impact..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CLIENT_IMPACT_OPTIONS.map((option) => (
                      <SelectItem key={option.value || "none"} value={option.value || "none"}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.clientImpactType === "SPECIFIC" && (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    Select specific clients
                  </Label>
                  <div className="max-h-[200px] overflow-y-auto space-y-2 border rounded-md p-2">
                    {clients.map((client) => (
                      <div key={client.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`client-${client.id}`}
                          checked={formData.impactedClientIds.includes(client.id)}
                          onCheckedChange={() => handleClientToggle(client.id)}
                        />
                        <label
                          htmlFor={`client-${client.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {client.name}
                        </label>
                      </div>
                    ))}
                    {clients.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No clients available.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Submit */}
          <Card>
            <CardContent className="pt-6">
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {idea ? "Save Changes" : "Submit Idea"}
              </Button>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                {idea
                  ? "Updates will be saved immediately"
                  : "Your idea will be reviewed by the team"}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
