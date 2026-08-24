#!/usr/bin/env node

/**
 * Supabase Deployment Setup Script
 * This script helps you set up Supabase database connection and run migrations
 */

import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

const basePath = "D:\\posyandu kuncir";

async function setupSupabase() {
  console.log("🔧 Supabase Setup Script");
  console.log("=".repeat(50));
  console.log();

  try {
    // Step 1: Check Supabase connection
    console.log("📊 Step 1: Checking Supabase Connection...");
    const { stdout: connectionCheck } = await execAsync(
      `psql "postgres://postgres:[YOUR_PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require" -c "SELECT version();"`,
    );
    console.log("✅ Connection successful:", connectionCheck.trim().substring(0, 100));

    // Step 2: Run migrations
    console.log();
    console.log("🚀 Step 2: Running Database Migrations...");
    await execAsync('cd "D:\\posyandu kuncir" && npm run db:migrate:prod');
    console.log("✅ Migrations completed");

    // Step 3: Verify database
    console.log();
    console.log("🔍 Step 3: Verifying Database Configuration...");
    const { stdout: dbCheck } = await execAsync(
      'cd "D:\\posyandu kuncir" && npm run db:verify:phase1',
    );
    console.log("✅ Database verification passed");

    // Step 4: Set environment variables
    console.log();
    console.log("🔑 Step 4: Setting Up Environment Variables...");
    console.log("📝 Manual Steps Required:");
    console.log("   1. Copy apps/api/.env.example to apps/api/.env.production");
    console.log("   2. Update DATABASE_URL with your actual password");
    console.log("   3. Update FCM_PROJECT_ID if using separate Firebase project");
    console.log("   4. Generate or use existing JWT secrets");

    // Step 5: Build application
    console.log();
    console.log("📦 Step 5: Building Application...");
    await execAsync('cd "D:\\posyandu kuncir" && npm run build');
    console.log("✅ Build completed");

    console.log();
    console.log("=".repeat(50));
    console.log("✅ Setup Complete!");
    console.log("=".repeat(50));
    console.log();
    console.log("Next Steps:");
    console.log(
      '   1. Execute: set DATABASE_URL="postgresql://postgres:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require"',
    );
    console.log("   2. Execute: npm run db:migrate:prod");
    console.log("   3. Update .env.production files with actual credentials");
    console.log("   4. Deploy to production server");
    console.log();
  } catch (error) {
    console.error("❌ Setup failed:", error.message);
    console.error("Please check:");
    console.error("   1. DATABASE_URL environment variable");
    console.error("   2. Network connection to Supabase");
    console.error("   3. Database credentials in supabase.config.md");
    throw error;
  }
}

// Run setup
setupSupabase().catch(console.error);
