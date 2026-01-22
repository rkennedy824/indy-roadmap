import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { parse } from "csv-parse/sync";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";

// Create Prisma client with Neon adapter (matching src/lib/db.ts)
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL or POSTGRES_PRISMA_URL must be set");
}
const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter });

// Configuration - update these as needed
const CSV_FILE_PATH = process.argv[2] || "./scripts/ideas-import.csv";
const DEFAULT_SUBMITTER_EMAIL = process.argv[3] || "ryan@custodysync.com"; // Fallback submitter

interface CsvRow {
  rank: string;
  unique_request_id: string;
  short_title?: string; // May not exist
  request_summary: string;
  request_text_representative: string;
  submitters: string;
  first_requested_date: string;
  all_request_dates: string;
  companies: string;
  occurrences: string;
  note_ids: string;
}

// Extract a title from request_summary (first sentence or first N chars)
function extractTitle(summary: string): string {
  if (!summary) return "";

  // Try to get first sentence
  const firstSentence = summary.split(/[.!?]/)[0]?.trim();
  if (firstSentence && firstSentence.length <= 150) {
    return firstSentence;
  }

  // Otherwise truncate at word boundary
  if (summary.length <= 100) return summary;
  const truncated = summary.substring(0, 100);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 50 ? truncated.substring(0, lastSpace) : truncated) + "...";
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function rankToPriority(rank: string, occurrences: string): number {
  // Convert rank/occurrences to priority (0=unset, 1=P1 highest, 2=P2, 3=P3)
  const rankNum = parseInt(rank) || 999;
  const occNum = parseInt(occurrences) || 0;

  // High occurrence or low rank = high priority
  if (rankNum <= 5 || occNum >= 10) return 1; // P1
  if (rankNum <= 15 || occNum >= 5) return 2; // P2
  if (rankNum <= 30 || occNum >= 2) return 3; // P3
  return 0; // Unset
}

async function importIdeas() {
  const filePath = path.resolve(CSV_FILE_PATH);

  if (!fs.existsSync(filePath)) {
    console.error(`CSV file not found: ${filePath}`);
    console.log("\nUsage: npx tsx scripts/import-ideas.ts <csv-file-path> [default-submitter-email]");
    console.log("Example: npx tsx scripts/import-ideas.ts ./my-ideas.csv ryan@example.com");
    process.exit(1);
  }

  console.log(`Reading CSV from: ${filePath}`);
  const fileContent = fs.readFileSync(filePath, "utf-8");

  const records: CsvRow[] = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`Found ${records.length} ideas to import`);

  // Get or create the default submitter
  let submitter = await prisma.user.findFirst({
    where: { email: DEFAULT_SUBMITTER_EMAIL },
  });

  if (!submitter) {
    // Try to find any user to use as submitter
    submitter = await prisma.user.findFirst();
    if (!submitter) {
      console.error("No users found in database. Please create a user first.");
      process.exit(1);
    }
    console.log(`Using fallback submitter: ${submitter.email}`);
  } else {
    console.log(`Using submitter: ${submitter.email}`);
  }

  // Get existing clients for matching
  const existingClients = await prisma.client.findMany();
  const clientMap = new Map(
    existingClients.map((c) => [c.name.toLowerCase(), c.id])
  );
  console.log(`Found ${existingClients.length} existing clients for matching`);

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of records) {
    try {
      // Get title from short_title or extract from request_summary
      const title = row.short_title?.trim() || extractTitle(row.request_summary);

      // Skip if no title
      if (!title) {
        skipped++;
        continue;
      }

      // Check for duplicate by unique_request_id first (more reliable)
      if (row.unique_request_id) {
        const existingById = await prisma.idea.findFirst({
          where: { evidence: { contains: row.unique_request_id } },
        });
        if (existingById) {
          console.log(`  Skipping duplicate (by ID): "${title}"`);
          skipped++;
          continue;
        }
      }

      // Build evidence from metadata
      const evidenceParts: string[] = [];
      if (row.submitters) {
        evidenceParts.push(`Original submitters: ${row.submitters}`);
      }
      if (row.companies) {
        evidenceParts.push(`Companies: ${row.companies}`);
      }
      if (row.occurrences && parseInt(row.occurrences) > 1) {
        evidenceParts.push(`Requested ${row.occurrences} times`);
      }
      if (row.unique_request_id) {
        evidenceParts.push(`Original ID: ${row.unique_request_id}`);
      }

      // Parse dates
      const firstRequestedDate = parseDate(row.first_requested_date);

      // Create the idea
      const idea = await prisma.idea.create({
        data: {
          title: title,
          problemStatement: row.request_summary?.trim() || title,
          desiredOutcome: row.request_text_representative?.trim() || null,
          evidence: evidenceParts.length > 0 ? evidenceParts.join("\n") : null,
          priority: rankToPriority(row.rank, row.occurrences),
          status: "NEW",
          submitterId: submitter.id,
          createdAt: firstRequestedDate || undefined,
        },
      });

      // Try to link to existing clients
      if (row.companies) {
        const companyNames = row.companies.split(/[,;]/).map((c) => c.trim().toLowerCase());
        const matchedClientIds: string[] = [];

        for (const companyName of companyNames) {
          const clientId = clientMap.get(companyName);
          if (clientId) {
            matchedClientIds.push(clientId);
          }
        }

        if (matchedClientIds.length > 0) {
          await prisma.idea.update({
            where: { id: idea.id },
            data: { clientImpactType: "SPECIFIC" },
          });

          await prisma.ideaClientImpact.createMany({
            data: matchedClientIds.map((clientId) => ({
              ideaId: idea.id,
              clientId,
            })),
            skipDuplicates: true,
          });
        }
      }

      imported++;
      console.log(`  ✓ Imported: "${title}"`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const rowTitle = row.short_title?.trim() || extractTitle(row.request_summary) || row.unique_request_id;
      errors.push(`Row "${rowTitle}": ${message}`);
      console.error(`  ✗ Error importing "${rowTitle}": ${message}`);
    }
  }

  console.log("\n========== Import Summary ==========");
  console.log(`Total rows: ${records.length}`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped (duplicates/empty): ${skipped}`);
  console.log(`Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log("\nErrors:");
    errors.forEach((e) => console.log(`  - ${e}`));
  }

  await prisma.$disconnect();
}

importIdeas().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
