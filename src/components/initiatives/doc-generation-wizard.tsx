"use client";

import { useState, useCallback } from "react";
import { Initiative } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  FileText,
  Users,
  Briefcase,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Check,
  AlertCircle,
  Copy,
  Zap,
  PenLine,
} from "lucide-react";
import { useRouter } from "next/navigation";

type InitiativeWithDocs = Initiative & {
  docInputProblem?: string | null;
  docInputGoals?: string | null;
  docInputTargetUsers?: string | null;
  docInputKeyFeatures?: string | null;
  docInputSuccessMetrics?: string | null;
  docInputTechnicalNotes?: string | null;
  executiveOverview?: string | null;
  clientOverview?: string | null;
};

interface DocGenerationWizardProps {
  initiative: InitiativeWithDocs;
  trigger?: React.ReactNode;
}

type Step = "mode" | "input" | "select" | "generate" | "review";
type GenerationMode = "quick" | "detailed";
type DocumentType = "prd" | "executive" | "client";

interface GenerationState {
  prd: { status: "idle" | "generating" | "done" | "error"; content: string };
  executive: { status: "idle" | "generating" | "done" | "error"; content: string };
  client: { status: "idle" | "generating" | "done" | "error"; content: string };
}

export function DocGenerationWizard({ initiative, trigger }: DocGenerationWizardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("mode");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("quick");

  // Form inputs
  const [inputs, setInputs] = useState({
    problem: initiative.docInputProblem || "",
    goals: initiative.docInputGoals || "",
    targetUsers: initiative.docInputTargetUsers || "",
    keyFeatures: initiative.docInputKeyFeatures || "",
    successMetrics: initiative.docInputSuccessMetrics || "",
    technicalNotes: initiative.docInputTechnicalNotes || "",
  });

  // Document selection
  const [selectedDocs, setSelectedDocs] = useState<DocumentType[]>(["prd", "executive", "client"]);

  // Generation state
  const [generationState, setGenerationState] = useState<GenerationState>({
    prd: { status: "idle", content: initiative.prdContent || "" },
    executive: { status: "idle", content: initiative.executiveOverview || "" },
    client: { status: "idle", content: initiative.clientOverview || "" },
  });

  const [activeTab, setActiveTab] = useState<DocumentType>("prd");
  const [isGenerating, setIsGenerating] = useState(false);

  const hasDescription = !!initiative.description?.trim();

  const handleInputChange = (field: keyof typeof inputs, value: string) => {
    setInputs((prev) => ({ ...prev, [field]: value }));
  };

  const toggleDocSelection = (doc: DocumentType) => {
    setSelectedDocs((prev) =>
      prev.includes(doc) ? prev.filter((d) => d !== doc) : [...prev, doc]
    );
  };

  const isInputValid = () => {
    return (
      inputs.problem.trim() !== "" &&
      inputs.goals.trim() !== "" &&
      inputs.targetUsers.trim() !== "" &&
      inputs.keyFeatures.trim() !== ""
    );
  };

  const startGeneration = useCallback(async () => {
    if (selectedDocs.length === 0) return;

    setIsGenerating(true);
    setStep("generate");

    // Reset generation state for selected docs
    setGenerationState((prev) => {
      const newState = { ...prev };
      selectedDocs.forEach((doc) => {
        newState[doc] = { status: "generating", content: "" };
      });
      return newState;
    });

    try {
      const response = await fetch(`/api/initiatives/${initiative.id}/generate-docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: selectedDocs.length === 1 ? selectedDocs[0] : "all",
          inputs: generationMode === "detailed" ? inputs : undefined,
          useDescription: generationMode === "quick",
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to start generation");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let currentDocType: DocumentType | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === "start") {
              currentDocType = data.documentType as DocumentType;
              setActiveTab(data.documentType as DocumentType);
            } else if (data.type === "chunk") {
              const docType: DocumentType = (data.documentType || currentDocType || selectedDocs[0]) as DocumentType;
              setGenerationState((prev) => ({
                ...prev,
                [docType]: {
                  status: "generating" as const,
                  content: prev[docType].content + data.content,
                },
              }));
            } else if (data.type === "complete") {
              const docType: DocumentType = data.documentType as DocumentType;
              setGenerationState((prev) => ({
                ...prev,
                [docType]: {
                  ...prev[docType],
                  status: "done" as const,
                },
              }));
            } else if (data.type === "done") {
              // All documents generated
              selectedDocs.forEach((doc) => {
                setGenerationState((prev) => ({
                  ...prev,
                  [doc]: { ...prev[doc], status: "done" },
                }));
              });
            } else if (data.type === "error") {
              throw new Error(data.message);
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }

      setStep("review");
    } catch (error) {
      console.error("Generation error:", error);
      selectedDocs.forEach((doc) => {
        setGenerationState((prev) => ({
          ...prev,
          [doc]: { ...prev[doc], status: "error" },
        }));
      });
    } finally {
      setIsGenerating(false);
    }
  }, [initiative.id, inputs, selectedDocs, generationMode]);

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const handleClose = () => {
    setOpen(false);
    setStep("mode");
    router.refresh();
  };

  const handleModeSelect = (mode: GenerationMode) => {
    setGenerationMode(mode);
    if (mode === "quick") {
      setStep("select");
    } else {
      setStep("input");
    }
  };

  const renderModeStep = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose how you want to generate documentation for this initiative.
      </p>

      <div className="space-y-3">
        <div
          className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
            !hasDescription ? "opacity-50 cursor-not-allowed" : ""
          }`}
          onClick={() => hasDescription && handleModeSelect("quick")}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">Quick Generate</span>
              <Badge variant="secondary" className="text-xs">Recommended</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Generate documentation from the initiative description. Fast and easy.
            </p>
            {!hasDescription && (
              <p className="text-sm text-destructive mt-2">
                This initiative has no description. Add a description first or use detailed mode.
              </p>
            )}
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground mt-2" />
        </div>

        <div
          className="flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50"
          onClick={() => handleModeSelect("detailed")}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <PenLine className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <span className="font-medium">Detailed Input</span>
            <p className="text-sm text-muted-foreground mt-1">
              Provide structured inputs (problem, goals, features) for more precise documentation.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground mt-2" />
        </div>
      </div>
    </div>
  );

  const renderInputStep = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="problem">
          Problem Statement <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="problem"
          placeholder="What problem are we solving? Why does it matter?"
          value={inputs.problem}
          onChange={(e) => handleInputChange("problem", e.target.value)}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="goals">
          Goals <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="goals"
          placeholder="What are the specific goals? What does success look like?"
          value={inputs.goals}
          onChange={(e) => handleInputChange("goals", e.target.value)}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="targetUsers">
          Target Users <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="targetUsers"
          placeholder="Who will use this? What are their needs?"
          value={inputs.targetUsers}
          onChange={(e) => handleInputChange("targetUsers", e.target.value)}
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="keyFeatures">
          Key Features <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="keyFeatures"
          placeholder="What are the main features or capabilities?"
          value={inputs.keyFeatures}
          onChange={(e) => handleInputChange("keyFeatures", e.target.value)}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="successMetrics">Success Metrics (optional)</Label>
        <Textarea
          id="successMetrics"
          placeholder="How will we measure success?"
          value={inputs.successMetrics}
          onChange={(e) => handleInputChange("successMetrics", e.target.value)}
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="technicalNotes">Technical Notes (optional)</Label>
        <Textarea
          id="technicalNotes"
          placeholder="Any technical considerations or constraints?"
          value={inputs.technicalNotes}
          onChange={(e) => handleInputChange("technicalNotes", e.target.value)}
          rows={2}
        />
      </div>
    </div>
  );

  const renderSelectStep = () => (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Select which documents you want to generate. You can regenerate individual documents later.
      </p>

      {generationMode === "quick" && (
        <div className="p-3 rounded-lg bg-muted/50 border">
          <p className="text-sm">
            <span className="font-medium">Generating from description:</span>{" "}
            <span className="text-muted-foreground">{initiative.description?.slice(0, 150)}...</span>
          </p>
        </div>
      )}

      <div className="space-y-4">
        <div
          className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
            selectedDocs.includes("prd") ? "border-primary bg-primary/5" : "hover:bg-muted/50"
          }`}
          onClick={() => toggleDocSelection("prd")}
        >
          <Checkbox
            checked={selectedDocs.includes("prd")}
            onCheckedChange={() => toggleDocSelection("prd")}
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" />
              <span className="font-medium">Full PRD</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Comprehensive product requirements document with user stories, technical specs, and acceptance criteria.
            </p>
          </div>
        </div>

        <div
          className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
            selectedDocs.includes("executive") ? "border-primary bg-primary/5" : "hover:bg-muted/50"
          }`}
          onClick={() => toggleDocSelection("executive")}
        >
          <Checkbox
            checked={selectedDocs.includes("executive")}
            onCheckedChange={() => toggleDocSelection("executive")}
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-purple-500" />
              <span className="font-medium">Executive Overview</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              High-level strategic summary for internal leadership. Focuses on business value and ROI.
            </p>
          </div>
        </div>

        <div
          className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
            selectedDocs.includes("client") ? "border-primary bg-primary/5" : "hover:bg-muted/50"
          }`}
          onClick={() => toggleDocSelection("client")}
        >
          <Checkbox
            checked={selectedDocs.includes("client")}
            onCheckedChange={() => toggleDocSelection("client")}
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-green-500" />
              <span className="font-medium">Client-Facing Overview</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Benefits-focused summary for external clients. No internal details or costs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderGenerateStep = () => (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DocumentType)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="prd" disabled={!selectedDocs.includes("prd")}>
            <FileText className="h-4 w-4 mr-2" />
            PRD
            {generationState.prd.status === "generating" && (
              <Loader2 className="h-3 w-3 ml-2 animate-spin" />
            )}
            {generationState.prd.status === "done" && (
              <Check className="h-3 w-3 ml-2 text-green-500" />
            )}
          </TabsTrigger>
          <TabsTrigger value="executive" disabled={!selectedDocs.includes("executive")}>
            <Briefcase className="h-4 w-4 mr-2" />
            Executive
            {generationState.executive.status === "generating" && (
              <Loader2 className="h-3 w-3 ml-2 animate-spin" />
            )}
            {generationState.executive.status === "done" && (
              <Check className="h-3 w-3 ml-2 text-green-500" />
            )}
          </TabsTrigger>
          <TabsTrigger value="client" disabled={!selectedDocs.includes("client")}>
            <Users className="h-4 w-4 mr-2" />
            Client
            {generationState.client.status === "generating" && (
              <Loader2 className="h-3 w-3 ml-2 animate-spin" />
            )}
            {generationState.client.status === "done" && (
              <Check className="h-3 w-3 ml-2 text-green-500" />
            )}
          </TabsTrigger>
        </TabsList>

        {(["prd", "executive", "client"] as DocumentType[]).map((docType) => (
          <TabsContent key={docType} value={docType} className="mt-4">
            <ScrollArea className="h-[400px] w-full rounded-md border p-4">
              {generationState[docType].status === "idle" && (
                <p className="text-muted-foreground text-center py-8">
                  Click Generate to start...
                </p>
              )}
              {generationState[docType].status === "error" && (
                <div className="flex flex-col items-center gap-2 py-8 text-destructive">
                  <AlertCircle className="h-8 w-8" />
                  <p>Generation failed. Please try again.</p>
                </div>
              )}
              {(generationState[docType].status === "generating" ||
                generationState[docType].status === "done") && (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <pre className="whitespace-pre-wrap font-sans text-sm">
                    {generationState[docType].content}
                    {generationState[docType].status === "generating" && (
                      <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
                    )}
                  </pre>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-lg">
        <Check className="h-5 w-5 text-green-500" />
        <span className="text-sm">Documents generated and saved successfully!</span>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DocumentType)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="prd" disabled={!selectedDocs.includes("prd")}>
            <FileText className="h-4 w-4 mr-2" />
            PRD
          </TabsTrigger>
          <TabsTrigger value="executive" disabled={!selectedDocs.includes("executive")}>
            <Briefcase className="h-4 w-4 mr-2" />
            Executive
          </TabsTrigger>
          <TabsTrigger value="client" disabled={!selectedDocs.includes("client")}>
            <Users className="h-4 w-4 mr-2" />
            Client
          </TabsTrigger>
        </TabsList>

        {(["prd", "executive", "client"] as DocumentType[]).map((docType) => (
          <TabsContent key={docType} value={docType} className="mt-4">
            <div className="flex justify-end mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(generationState[docType].content)}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
            </div>
            <ScrollArea className="h-[350px] w-full rounded-md border p-4">
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <pre className="whitespace-pre-wrap font-sans text-sm">
                  {generationState[docType].content}
                </pre>
              </div>
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );

  const getStepTitle = () => {
    switch (step) {
      case "mode":
        return "Choose Generation Mode";
      case "input":
        return "Provide Details";
      case "select":
        return "Select Documents";
      case "generate":
        return "Generating...";
      case "review":
        return "Review & Done";
    }
  };

  const getStepNumber = () => {
    if (generationMode === "quick") {
      switch (step) {
        case "mode": return 1;
        case "select": return 2;
        case "generate": return 3;
        case "review": return 4;
        default: return 1;
      }
    } else {
      switch (step) {
        case "mode": return 1;
        case "input": return 2;
        case "select": return 3;
        case "generate": return 4;
        case "review": return 5;
        default: return 1;
      }
    }
  };

  const getTotalSteps = () => generationMode === "quick" ? 4 : 5;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Docs
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Documentation Generator
          </DialogTitle>
          <DialogDescription>
            Step {getStepNumber()} of {getTotalSteps()}: {getStepTitle()} for <span className="font-medium">{initiative.title}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 py-2">
          {Array.from({ length: getTotalSteps() }, (_, i) => (
            <div key={i} className="flex items-center">
              <Badge
                variant={getStepNumber() === i + 1 ? "default" : getStepNumber() > i + 1 ? "secondary" : "outline"}
                className="w-6 h-6 rounded-full p-0 flex items-center justify-center"
              >
                {i + 1}
              </Badge>
              {i < getTotalSteps() - 1 && (
                <div
                  className={`w-8 h-0.5 mx-1 ${
                    getStepNumber() > i + 1 ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          {step === "mode" && renderModeStep()}
          {step === "input" && renderInputStep()}
          {step === "select" && renderSelectStep()}
          {step === "generate" && renderGenerateStep()}
          {step === "review" && renderReviewStep()}
        </div>

        <div className="flex justify-between pt-4 border-t">
          {step !== "mode" && step !== "generate" && (
            <Button
              variant="outline"
              onClick={() => {
                if (step === "input") setStep("mode");
                if (step === "select") setStep(generationMode === "quick" ? "mode" : "input");
                if (step === "review") setStep("select");
              }}
              disabled={isGenerating}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
          {step === "mode" && <div />}
          {step === "generate" && <div />}

          {step === "input" && (
            <Button onClick={() => setStep("select")} disabled={!isInputValid()}>
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}

          {step === "select" && (
            <Button onClick={startGeneration} disabled={selectedDocs.length === 0}>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate {selectedDocs.length} Document{selectedDocs.length !== 1 ? "s" : ""}
            </Button>
          )}

          {step === "generate" && (
            <Button disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                "Processing..."
              )}
            </Button>
          )}

          {step === "review" && (
            <Button onClick={handleClose}>
              <Check className="h-4 w-4 mr-2" />
              Done
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
