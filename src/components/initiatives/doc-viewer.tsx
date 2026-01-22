"use client";

import { useState } from "react";
import { Initiative } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileText,
  Users,
  Briefcase,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { DocGenerationWizard } from "./doc-generation-wizard";

type InitiativeWithDocs = Initiative & {
  prdContent?: string | null;
  executiveOverview?: string | null;
  clientOverview?: string | null;
  docsGeneratedAt?: Date | null;
};

interface DocViewerProps {
  initiative: InitiativeWithDocs;
  showGenerateButton?: boolean;
}

type DocumentType = "prd" | "executive" | "client";

export function DocViewer({ initiative, showGenerateButton = true }: DocViewerProps) {
  const [copiedDoc, setCopiedDoc] = useState<DocumentType | null>(null);

  const hasAnyDocs =
    initiative.prdContent || initiative.executiveOverview || initiative.clientOverview;

  const copyToClipboard = async (content: string, docType: DocumentType) => {
    await navigator.clipboard.writeText(content);
    setCopiedDoc(docType);
    setTimeout(() => setCopiedDoc(null), 2000);
  };

  const getDocContent = (type: DocumentType) => {
    switch (type) {
      case "prd":
        return initiative.prdContent;
      case "executive":
        return initiative.executiveOverview;
      case "client":
        return initiative.clientOverview;
    }
  };

  const renderDocContent = (type: DocumentType) => {
    const content = getDocContent(type);

    if (!content) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mb-4 opacity-50" />
          <p className="text-center">
            No {type === "prd" ? "PRD" : type === "executive" ? "Executive Overview" : "Client Overview"} generated yet.
          </p>
          {showGenerateButton && (
            <DocGenerationWizard
              initiative={initiative}
              trigger={
                <Button variant="outline" className="mt-4">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Now
                </Button>
              }
            />
          )}
        </div>
      );
    }

    return (
      <div>
        <div className="flex justify-end mb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(content, type)}
          >
            {copiedDoc === type ? (
              <>
                <Check className="h-4 w-4 mr-2 text-green-500" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </>
            )}
          </Button>
        </div>
        <ScrollArea className="h-[500px] w-full rounded-md border p-4">
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
              {content}
            </pre>
          </div>
        </ScrollArea>
      </div>
    );
  };

  if (!hasAnyDocs && !showGenerateButton) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documentation
          </CardTitle>
          {initiative.docsGeneratedAt && (
            <p className="text-sm text-muted-foreground mt-1">
              Last generated: {format(new Date(initiative.docsGeneratedAt), "MMM d, yyyy 'at' h:mm a")}
            </p>
          )}
        </div>
        {showGenerateButton && hasAnyDocs && (
          <DocGenerationWizard
            initiative={initiative}
            trigger={
              <Button variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenerate
              </Button>
            }
          />
        )}
      </CardHeader>
      <CardContent>
        {!hasAnyDocs ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Sparkles className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-center mb-4">
              No documentation has been generated yet.
            </p>
            {showGenerateButton && (
              <DocGenerationWizard
                initiative={initiative}
                trigger={
                  <Button>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Documentation
                  </Button>
                }
              />
            )}
          </div>
        ) : (
          <Tabs defaultValue={initiative.prdContent ? "prd" : initiative.executiveOverview ? "executive" : "client"}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="prd" disabled={!initiative.prdContent}>
                <FileText className="h-4 w-4 mr-2" />
                PRD
                {initiative.prdContent && (
                  <Check className="h-3 w-3 ml-2 text-green-500" />
                )}
              </TabsTrigger>
              <TabsTrigger value="executive" disabled={!initiative.executiveOverview}>
                <Briefcase className="h-4 w-4 mr-2" />
                Executive
                {initiative.executiveOverview && (
                  <Check className="h-3 w-3 ml-2 text-green-500" />
                )}
              </TabsTrigger>
              <TabsTrigger value="client" disabled={!initiative.clientOverview}>
                <Users className="h-4 w-4 mr-2" />
                Client
                {initiative.clientOverview && (
                  <Check className="h-3 w-3 ml-2 text-green-500" />
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="prd" className="mt-4">
              {renderDocContent("prd")}
            </TabsContent>

            <TabsContent value="executive" className="mt-4">
              {renderDocContent("executive")}
            </TabsContent>

            <TabsContent value="client" className="mt-4">
              {renderDocContent("client")}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
