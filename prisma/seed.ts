import * as dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { hash } from "bcryptjs";

// Enable WebSocket for Neon
neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}
console.log("Connecting to:", connectionString.substring(0, 30) + "...");

// Pass pool config, not pool instance
const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter });

// Domain tags
const domainSpecialties = [
  { name: "Ticketing", color: "#3B82F6", description: "Ticketing and booking systems" },
  { name: "Payments", color: "#10B981", description: "Payment processing and integrations" },
  { name: "Seat Maps", color: "#6366F1", description: "Venue seat maps and selection" },
  { name: "F&B", color: "#F97316", description: "Food & beverage ordering" },
  { name: "Inventory", color: "#EAB308", description: "Inventory management" },
  { name: "Membership", color: "#8B5CF6", description: "Membership and loyalty programs" },
  { name: "Reporting", color: "#06B6D4", description: "Analytics and reporting" },
  { name: "Websites", color: "#EC4899", description: "Public-facing websites" },
  { name: "Mobile", color: "#A855F7", description: "iOS and Android apps" },
  { name: "Kiosks", color: "#14B8A6", description: "Self-service kiosk systems" },
  { name: "Signage", color: "#F43F5E", description: "Digital signage systems" },
  { name: "Admin", color: "#64748B", description: "Admin portals and back-office tools" },
  { name: "Integrations", color: "#0EA5E9", description: "Third-party integrations and APIs" },
  { name: "Activities", color: "#22C55E", description: "Activities and event programming" },
  { name: "Auth", color: "#DC2626", description: "Authentication and authorization systems" },
  { name: "Point of Sale", color: "#7C3AED", description: "Point of sale and register systems" },
  { name: "Accounting", color: "#059669", description: "Accounting and financial systems" },
  { name: "Box Office Reporting", color: "#0284C7", description: "Box office reporting and analytics" },
  { name: "Business Intelligence", color: "#7C3AED", description: "BI dashboards and data analytics" },
];

// Technical tags
const technicalSpecialties = [
  { name: "Frontend", color: "#FB7185", description: "Web UI/UX development" },
  { name: "Backend", color: "#FBBF24", description: "Server-side development and APIs" },
  { name: "Data", color: "#34D399", description: "Data engineering and pipelines" },
  { name: "DevOps", color: "#6B7280", description: "CI/CD, infrastructure, and deployment" },
  { name: "Security", color: "#EF4444", description: "Security and compliance" },
  { name: "Accessibility", color: "#A78BFA", description: "A11y and inclusive design" },
  { name: "Device/Edge", color: "#2DD4BF", description: "Edge computing and device integration" },
  { name: "QA", color: "#FB923C", description: "Quality assurance and testing" },
];

const specialties = [...domainSpecialties, ...technicalSpecialties];

async function main() {
  console.log("Seeding database...");

  // Create specialties
  for (const specialty of specialties) {
    await prisma.specialty.upsert({
      where: { name: specialty.name },
      update: {},
      create: specialty,
    });
  }
  console.log(`Created ${specialties.length} specialties`);

  // Create default admin user
  const hashedPassword = await hash("admin123", 12);
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@indy.com" },
    update: {},
    create: {
      email: "admin@indy.com",
      name: "Admin User",
      password: hashedPassword,
      role: "SUPER_ADMIN",
    },
  });
  console.log(`Created admin user: ${adminUser.email}`);

  // Create sample engineers
  const engineers = [
    { name: "Alice Johnson", email: "alice@indy.com", role: "Senior Engineer" },
    { name: "Bob Smith", email: "bob@indy.com", role: "Staff Engineer" },
    { name: "Carol Williams", email: "carol@indy.com", role: "Engineer" },
  ];

  for (const engineer of engineers) {
    const created = await prisma.engineer.upsert({
      where: { id: engineer.email }, // Using email as pseudo-unique for upsert
      update: {},
      create: engineer,
    });

    // Assign random specialties
    const allSpecialties = await prisma.specialty.findMany();
    const primarySpecialty = allSpecialties[Math.floor(Math.random() * allSpecialties.length)];
    const secondarySpecialty = allSpecialties.find(s => s.id !== primarySpecialty.id);

    await prisma.engineerSpecialty.upsert({
      where: {
        engineerId_specialtyId: {
          engineerId: created.id,
          specialtyId: primarySpecialty.id,
        },
      },
      update: {},
      create: {
        engineerId: created.id,
        specialtyId: primarySpecialty.id,
        level: "PRIMARY",
      },
    });

    if (secondarySpecialty) {
      await prisma.engineerSpecialty.upsert({
        where: {
          engineerId_specialtyId: {
            engineerId: created.id,
            specialtyId: secondarySpecialty.id,
          },
        },
        update: {},
        create: {
          engineerId: created.id,
          specialtyId: secondarySpecialty.id,
          level: "SECONDARY",
        },
      });
    }
  }
  console.log(`Created ${engineers.length} sample engineers`);

  console.log("Seeding completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
