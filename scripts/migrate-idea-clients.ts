import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import "dotenv/config";

// Create Prisma client with Neon adapter
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL or POSTGRES_PRISMA_URL must be set");
}
const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter });

async function migrateIdeaClients() {
  console.log("Starting client migration from evidence field...\n");

  // Get all ideas with "Companies:" in evidence
  const ideas = await prisma.idea.findMany({
    where: {
      evidence: { contains: "Companies:" },
    },
    include: {
      impactedClients: true,
    },
  });

  console.log(`Found ${ideas.length} ideas with company data in evidence\n`);

  // Get all existing clients
  const existingClients = await prisma.client.findMany();
  const clientMap = new Map<string, string>(); // lowercase name -> id

  for (const client of existingClients) {
    clientMap.set(client.name.toLowerCase().trim(), client.id);
  }

  console.log(`Found ${existingClients.length} existing clients\n`);

  let ideasUpdated = 0;
  let clientsCreated = 0;
  let linksCreated = 0;

  for (const idea of ideas) {
    // Extract companies from evidence
    const companiesMatch = idea.evidence?.match(/Companies:\s*([^\n]+)/);
    if (!companiesMatch) continue;

    const companiesStr = companiesMatch[1];
    // Split by semicolon or comma, clean up
    const companyNames = companiesStr
      .split(/[;,]/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0 && c !== "INDY (Internal)"); // Skip internal

    if (companyNames.length === 0) continue;

    const clientIdsToLink: string[] = [];

    for (const companyName of companyNames) {
      const normalizedName = companyName.toLowerCase().trim();

      // Check if client exists
      let clientId = clientMap.get(normalizedName);

      if (!clientId) {
        // Create new client
        const newClient = await prisma.client.create({
          data: { name: companyName },
        });
        clientId = newClient.id;
        clientMap.set(normalizedName, clientId);
        clientsCreated++;
        console.log(`  Created client: "${companyName}"`);
      }

      // Check if link already exists
      const existingLink = idea.impactedClients.find(
        (ic) => ic.clientId === clientId
      );

      if (!existingLink) {
        clientIdsToLink.push(clientId);
      }
    }

    // Create links and update clientImpactType
    if (clientIdsToLink.length > 0) {
      await prisma.ideaClientImpact.createMany({
        data: clientIdsToLink.map((clientId) => ({
          ideaId: idea.id,
          clientId,
        })),
        skipDuplicates: true,
      });

      // Update clientImpactType to SPECIFIC
      await prisma.idea.update({
        where: { id: idea.id },
        data: { clientImpactType: "SPECIFIC" },
      });

      linksCreated += clientIdsToLink.length;
      ideasUpdated++;
      console.log(`✓ Updated idea "${idea.title.substring(0, 50)}..." with ${clientIdsToLink.length} clients`);
    }
  }

  console.log("\n========== Migration Summary ==========");
  console.log(`Ideas processed: ${ideas.length}`);
  console.log(`Ideas updated: ${ideasUpdated}`);
  console.log(`New clients created: ${clientsCreated}`);
  console.log(`Client links created: ${linksCreated}`);

  await prisma.$disconnect();
}

migrateIdeaClients().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
