import Anthropic from "@anthropic-ai/sdk";

// Initialize Anthropic client
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export type DocumentType = "prd" | "executive" | "client";

export interface DocumentInputs {
  // Initiative context
  title: string;
  description?: string | null;
  tags?: string[];
  dependencies?: string[];
  effortEstimate?: number | null;
  priority?: number;
  betaTargetDate?: Date | null;
  masterTargetDate?: Date | null;

  // Scheduled work timeline (when work actually happens)
  workStartDate?: Date | null;
  workEndDate?: Date | null;

  // Structured inputs from user (optional when using description-only mode)
  problem?: string;
  goals?: string;
  targetUsers?: string;
  keyFeatures?: string;
  successMetrics?: string;
  technicalNotes?: string;

  // Flag to use description-only generation
  useDescriptionOnly?: boolean;
}

// Stream document generation
export async function* streamDocumentGeneration(
  inputs: DocumentInputs,
  documentType: DocumentType
): AsyncGenerator<string> {
  const systemPrompt = getSystemPrompt(documentType);
  const userPrompt = buildUserPrompt(inputs, documentType);

  const stream = await anthropic.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

// Non-streaming generation for simpler use cases
export async function generateDocument(
  inputs: DocumentInputs,
  documentType: DocumentType
): Promise<string> {
  const systemPrompt = getSystemPrompt(documentType);
  const userPrompt = buildUserPrompt(inputs, documentType);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.type === "text" ? textBlock.text : "";
}

function getSystemPrompt(documentType: DocumentType): string {
  switch (documentType) {
    case "prd":
      return `You are a senior product manager creating comprehensive Product Requirements Documents (PRDs).
Your PRDs are clear, detailed, and actionable. They serve as the source of truth for engineering teams.
Write in a professional but accessible tone. Use markdown formatting for structure.
Include specific details and avoid vague language.`;

    case "executive":
      return `You are writing ultra-brief executive summaries for very busy senior leaders.
Your summaries are 4-6 sentences MAX. No fluff, no jargon, just the essentials.
Focus on: what we're building, why it matters to the business, and when it ships.
Use plain language. Be direct. Think "elevator pitch" brevity.`;

    case "client":
      return `You are writing ultra-brief client-facing feature summaries.
Your summaries are 4-6 sentences MAX split into two short sections.
Never mention internal costs, technical debt, or internal resource constraints.
Focus on what we're building and why it matters to the client.
Be direct, clear, and professional. No fluff or marketing speak.`;
  }
}

function buildUserPrompt(inputs: DocumentInputs, documentType: DocumentType): string {
  // Description-only mode - simpler context
  if (inputs.useDescriptionOnly) {
    return buildDescriptionOnlyPrompt(inputs, documentType);
  }

  const contextSection = `
## Initiative Context
- **Title:** ${inputs.title}
${inputs.description ? `- **Description:** ${inputs.description}` : ""}
${inputs.tags?.length ? `- **Work Types:** ${inputs.tags.join(", ")}` : ""}
${inputs.dependencies?.length ? `- **Dependencies:** ${inputs.dependencies.join(", ")}` : ""}
${inputs.priority ? `- **Priority:** ${inputs.priority}/100` : ""}

## Timeline
${inputs.workStartDate && inputs.workEndDate ? `- **Scheduled Work Period:** ${inputs.workStartDate.toLocaleDateString()} to ${inputs.workEndDate.toLocaleDateString()}` : ""}
${inputs.betaTargetDate ? `- **Beta Release Target:** ${inputs.betaTargetDate.toLocaleDateString()}` : ""}
${inputs.masterTargetDate ? `- **Production Release Target:** ${inputs.masterTargetDate.toLocaleDateString()}` : ""}

## Structured Inputs
**Problem Statement:**
${inputs.problem}

**Goals:**
${inputs.goals}

**Target Users:**
${inputs.targetUsers}

**Key Features:**
${inputs.keyFeatures}

${inputs.successMetrics ? `**Success Metrics:**\n${inputs.successMetrics}` : ""}

${inputs.technicalNotes ? `**Technical Considerations:**\n${inputs.technicalNotes}` : ""}
`.trim();

  switch (documentType) {
    case "prd":
      return `${contextSection}

---

Please generate a comprehensive Product Requirements Document (PRD) with the following sections:

1. **Executive Summary** - Brief overview of the initiative
2. **Problem Statement** - Detailed explanation of the problem being solved
3. **Goals & Success Metrics** - Clear, measurable objectives
4. **Target Users** - Who will use this and their needs
5. **User Stories** - Specific user stories with acceptance criteria (format: "As a [user], I want [action] so that [benefit]")
6. **Functional Requirements** - Detailed feature requirements
7. **Technical Requirements** - Technical specifications and constraints
8. **Dependencies & Risks** - What this depends on and potential risks
9. **Timeline & Milestones** - Key dates and deliverables
10. **Out of Scope** - What is explicitly NOT included

Use clear markdown formatting with headers, bullet points, and tables where appropriate.`;

    case "executive":
      return `${contextSection}

---

Write a 4-6 sentence executive summary. Cover:
1. What we're building (1 sentence)
2. Why it matters / business value (1-2 sentences)
3. Timeline - when it ships (1 sentence). IMPORTANT: Use the Scheduled Work Period dates for timeline, NOT the effort estimate. The effort estimate is how much work it requires, but the Scheduled Work Period shows when work actually happens.

No headers, no bullet points, no sections. Just a short paragraph that an exec can read in 15 seconds.`;

    case "client":
      return `${contextSection}

---

Write a brief client-facing summary with exactly this format:

**What We're Building**
[2-3 sentences on a NEW LINE below the header]

**Why It's Important**
[2-3 sentences on a NEW LINE below the header]

CRITICAL FORMATTING RULES:
- Each header must be on its own line with ** markdown bold **
- The paragraph text must start on the NEXT LINE after the header (not on the same line)
- There must be a blank line between the first section and the second header
- Keep it SHORT - no more than 6 sentences total
- Do NOT mention: internal costs, team allocations, technical debt, timelines, or internal challenges
- Do NOT include any other sections
- Just these two sections, nothing else`;
  }
}

function buildDescriptionOnlyPrompt(inputs: DocumentInputs, documentType: DocumentType): string {
  const contextSection = `
## Initiative Information
- **Title:** ${inputs.title}
- **Description:** ${inputs.description || "No description provided"}
${inputs.tags?.length ? `- **Work Types:** ${inputs.tags.join(", ")}` : ""}
${inputs.dependencies?.length ? `- **Dependencies:** ${inputs.dependencies.join(", ")}` : ""}
${inputs.effortEstimate ? `- **Effort Estimate:** ${inputs.effortEstimate} weeks` : ""}
${inputs.priority ? `- **Priority:** ${inputs.priority}/100` : ""}

## Timeline
${inputs.workStartDate && inputs.workEndDate ? `- **Scheduled Work Period:** ${inputs.workStartDate.toLocaleDateString()} to ${inputs.workEndDate.toLocaleDateString()}` : ""}
${inputs.betaTargetDate ? `- **Beta Target:** ${inputs.betaTargetDate.toLocaleDateString()}` : ""}
${inputs.masterTargetDate ? `- **Production Target:** ${inputs.masterTargetDate.toLocaleDateString()}` : ""}
`.trim();

  switch (documentType) {
    case "prd":
      return `${contextSection}

---

Based on the initiative title and description above, generate a comprehensive Product Requirements Document (PRD).

You'll need to intelligently infer and expand upon the description to create:

1. **Executive Summary** - Brief overview of the initiative
2. **Problem Statement** - What problem does this solve? (infer from description)
3. **Goals & Success Metrics** - What are we trying to achieve?
4. **Target Users** - Who will use this? (infer from context)
5. **User Stories** - 3-5 user stories with acceptance criteria
6. **Functional Requirements** - Key features and capabilities
7. **Technical Requirements** - Technical considerations
8. **Dependencies & Risks** - Potential dependencies and risks
9. **Timeline & Milestones** - Based on target dates if available
10. **Out of Scope** - Reasonable exclusions

Use clear markdown formatting. Be specific and actionable. If information is limited, make reasonable assumptions based on the description and note them.`;

    case "executive":
      return `${contextSection}

---

Write a 4-6 sentence executive summary based on this initiative description. Cover:
1. What we're building (1 sentence)
2. Why it matters / business value (1-2 sentences)
3. Timeline - when it ships (1 sentence). IMPORTANT: Use the Scheduled Work Period dates for timeline, NOT the effort estimate. The effort estimate is how much work it requires, but the Scheduled Work Period shows when work actually happens.

No headers, no bullet points. Just a short paragraph an exec can read in 15 seconds.`;

    case "client":
      return `${contextSection}

---

Write a brief client-facing summary with exactly this format:

**What We're Building**
[2-3 sentences on a NEW LINE below the header]

**Why It's Important**
[2-3 sentences on a NEW LINE below the header]

CRITICAL FORMATTING RULES:
- Each header must be on its own line with ** markdown bold **
- The paragraph text must start on the NEXT LINE after the header (not on the same line)
- There must be a blank line between the first section and the second header
- Keep it SHORT - no more than 6 sentences total
- Do NOT mention: internal costs, team allocations, technical debt, timelines, or internal challenges
- Do NOT include any other sections
- Just these two sections, nothing else`;
  }
}

// ============================================
// Executive Brief Generation
// ============================================

export interface BriefInitiative {
  title: string;
  description?: string | null;
  status: string;
  executiveOverview?: string | null;
  priority?: number;
  betaTargetDate?: Date | null;
  masterTargetDate?: Date | null;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PROPOSED: "Proposed",
  APPROVED: "Approved",
  IN_PROGRESS: "In Progress",
  DONE: "Completed",
  BLOCKED: "Blocked",
};

export async function generateExecutiveBrief(
  initiatives: BriefInitiative[]
): Promise<string> {
  // Group initiatives by status
  const inProgress = initiatives.filter((i) => i.status === "IN_PROGRESS");
  const planned = initiatives.filter((i) =>
    ["APPROVED", "PROPOSED"].includes(i.status)
  );
  const completed = initiatives.filter((i) => i.status === "DONE");

  const formatInitiative = (i: BriefInitiative) => {
    const summary = i.executiveOverview
      ? i.executiveOverview.split("\n")[0].substring(0, 200)
      : i.description?.substring(0, 200) || "No description";
    const dates = [];
    if (i.betaTargetDate)
      dates.push(`Beta: ${new Date(i.betaTargetDate).toLocaleDateString()}`);
    if (i.masterTargetDate)
      dates.push(
        `Production: ${new Date(i.masterTargetDate).toLocaleDateString()}`
      );
    return `- **${i.title}** (Priority: ${i.priority || "N/A"}${dates.length ? `, ${dates.join(", ")}` : ""})\n  ${summary}`;
  };

  const initiativeList = `
## Currently In Progress (${inProgress.length})
${inProgress.length > 0 ? inProgress.map(formatInitiative).join("\n\n") : "No initiatives currently in progress."}

## Planned & Approved (${planned.length})
${planned.length > 0 ? planned.map(formatInitiative).join("\n\n") : "No initiatives currently planned."}

## Recently Completed (${completed.length})
${completed.length > 0 ? completed.slice(0, 5).map(formatInitiative).join("\n\n") : "No recently completed initiatives."}
`.trim();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    system: `You are writing an ultra-brief executive snapshot for very busy senior leaders.

CRITICAL RULES:
- Maximum 3-4 sentences total
- Use simple, plain language
- No jargon, no fluff, no filler phrases
- Just state what's happening and what's coming up next
- Think "elevator pitch" brevity

Example tone: "The team is focused on [X]. [Y] ships next month. [Z] is planned for Q2."`,
    messages: [
      {
        role: "user",
        content: `Write a 3-4 sentence executive snapshot based on:\n\n${initiativeList}`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.type === "text" ? textBlock.text : "";
}
