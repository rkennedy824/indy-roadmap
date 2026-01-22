import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  streamDocumentGeneration,
  generateDocument,
  DocumentInputs,
  DocumentType,
} from "@/lib/anthropic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if API key is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "AI service not configured. Please add ANTHROPIC_API_KEY to environment." },
        { status: 503 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const {
      documentType = "all",
      inputs,
      stream = true,
      useDescription = false,
    }: {
      documentType?: "all" | "prd" | "executive" | "client";
      inputs?: {
        problem: string;
        goals: string;
        targetUsers: string;
        keyFeatures: string;
        successMetrics?: string;
        technicalNotes?: string;
      };
      stream?: boolean;
      useDescription?: boolean;
    } = body;

    // Fetch the initiative with relations including schedule blocks
    const initiative = await db.initiative.findUnique({
      where: { id },
      include: {
        tags: { include: { specialty: true } },
        dependencies: { include: { dependency: true } },
        scheduledBlocks: {
          select: {
            startDate: true,
            endDate: true,
          },
        },
      },
    });

    if (!initiative) {
      return NextResponse.json({ error: "Initiative not found" }, { status: 404 });
    }

    // Calculate work period from scheduled blocks
    let workStartDate: Date | null = null;
    let workEndDate: Date | null = null;

    if (initiative.scheduledBlocks.length > 0) {
      const startDates = initiative.scheduledBlocks.map(b => new Date(b.startDate));
      const endDates = initiative.scheduledBlocks.map(b => new Date(b.endDate));
      workStartDate = new Date(Math.min(...startDates.map(d => d.getTime())));
      workEndDate = new Date(Math.max(...endDates.map(d => d.getTime())));
    }

    // Use provided inputs or fall back to stored inputs
    const docInputs: DocumentInputs = {
      title: initiative.title,
      description: initiative.description,
      tags: initiative.tags.map((t) => t.specialty.name),
      dependencies: initiative.dependencies.map((d) => d.dependency.title),
      effortEstimate: initiative.effortEstimate,
      priority: initiative.priority,
      betaTargetDate: initiative.betaTargetDate,
      masterTargetDate: initiative.masterTargetDate,
      workStartDate,
      workEndDate,
      problem: inputs?.problem || initiative.docInputProblem || "",
      goals: inputs?.goals || initiative.docInputGoals || "",
      targetUsers: inputs?.targetUsers || initiative.docInputTargetUsers || "",
      keyFeatures: inputs?.keyFeatures || initiative.docInputKeyFeatures || "",
      successMetrics: inputs?.successMetrics || initiative.docInputSuccessMetrics || undefined,
      technicalNotes: inputs?.technicalNotes || initiative.docInputTechnicalNotes || undefined,
      useDescriptionOnly: useDescription,
    };

    // Validate required inputs (unless using description-only mode)
    if (!useDescription && (!docInputs.problem || !docInputs.goals || !docInputs.targetUsers || !docInputs.keyFeatures)) {
      return NextResponse.json(
        { error: "Missing required inputs: problem, goals, targetUsers, and keyFeatures are required" },
        { status: 400 }
      );
    }

    // For description-only mode, validate that description exists
    if (useDescription && !initiative.description) {
      return NextResponse.json(
        { error: "Cannot generate from description: initiative has no description" },
        { status: 400 }
      );
    }

    // Save the inputs to the initiative for future regeneration
    if (inputs) {
      await db.initiative.update({
        where: { id },
        data: {
          docInputProblem: inputs.problem,
          docInputGoals: inputs.goals,
          docInputTargetUsers: inputs.targetUsers,
          docInputKeyFeatures: inputs.keyFeatures,
          docInputSuccessMetrics: inputs.successMetrics || null,
          docInputTechnicalNotes: inputs.technicalNotes || null,
        },
      });
    }

    // Determine which documents to generate
    const documentsToGenerate: DocumentType[] =
      documentType === "all"
        ? ["prd", "executive", "client"]
        : [documentType];

    if (stream) {
      // Streaming response for single document
      if (documentsToGenerate.length === 1) {
        const docType = documentsToGenerate[0];
        const encoder = new TextEncoder();

        const readableStream = new ReadableStream({
          async start(controller) {
            try {
              let fullContent = "";

              for await (const chunk of streamDocumentGeneration(docInputs, docType)) {
                fullContent += chunk;
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`)
                );
              }

              // Save the generated content
              const updateData: Record<string, unknown> = {
                docsGeneratedAt: new Date(),
              };

              if (docType === "prd") {
                updateData.prdContent = fullContent;
              } else if (docType === "executive") {
                updateData.executiveOverview = fullContent;
              } else if (docType === "client") {
                updateData.clientOverview = fullContent;
              }

              await db.initiative.update({
                where: { id },
                data: updateData,
              });

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "done", documentType: docType })}\n\n`)
              );
              controller.close();
            } catch (error) {
              console.error("Streaming error:", error);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "error", message: "Generation failed" })}\n\n`
                )
              );
              controller.close();
            }
          },
        });

        return new Response(readableStream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      // For multiple documents, stream them sequentially
      const encoder = new TextEncoder();

      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            const results: Record<string, string> = {};

            for (const docType of documentsToGenerate) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "start", documentType: docType })}\n\n`
                )
              );

              let fullContent = "";

              for await (const chunk of streamDocumentGeneration(docInputs, docType)) {
                fullContent += chunk;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "chunk", documentType: docType, content: chunk })}\n\n`
                  )
                );
              }

              results[docType] = fullContent;

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "complete", documentType: docType })}\n\n`
                )
              );
            }

            // Save all generated content
            await db.initiative.update({
              where: { id },
              data: {
                ...(results.prd && { prdContent: results.prd }),
                ...(results.executive && { executiveOverview: results.executive }),
                ...(results.client && { clientOverview: results.client }),
                docsGeneratedAt: new Date(),
              },
            });

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "done", results: Object.keys(results) })}\n\n`)
            );
            controller.close();
          } catch (error) {
            console.error("Streaming error:", error);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "error", message: "Generation failed" })}\n\n`
              )
            );
            controller.close();
          }
        },
      });

      return new Response(readableStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Non-streaming response
    const results: Record<string, string> = {};

    for (const docType of documentsToGenerate) {
      results[docType] = await generateDocument(docInputs, docType);
    }

    // Save all generated content
    await db.initiative.update({
      where: { id },
      data: {
        ...(results.prd && { prdContent: results.prd }),
        ...(results.executive && { executiveOverview: results.executive }),
        ...(results.client && { clientOverview: results.client }),
        docsGeneratedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      documents: results,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to generate documents:", error);
    return NextResponse.json(
      { error: "Failed to generate documents" },
      { status: 500 }
    );
  }
}
