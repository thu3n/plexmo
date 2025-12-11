import type { NextConfig } from "next";
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";

// --- Auto-Generate JWT Secret Logic ---
const resolveSecret = () => {
  // 1. Environment Variable (Priority)
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  // 2. Persistent File
  // Try to use the same 'config' volume convention as the DB
  let secretPath = path.join(process.cwd(), "jwt.secret");

  if (fs.existsSync("/app/config")) {
    secretPath = "/app/config/jwt.secret";
  } else if (fs.existsSync(path.join(process.cwd(), "config"))) {
    secretPath = path.join(process.cwd(), "config", "jwt.secret");
  }

  // Check if file exists
  if (fs.existsSync(secretPath)) {
    const fileSecret = fs.readFileSync(secretPath, "utf-8").trim();
    if (fileSecret.length > 0) {
      return fileSecret;
    }
  }

  // 3. Generate New Secret if missing
  const newSecret = randomBytes(32).toString("hex");
  try {
    const dir = path.dirname(secretPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(secretPath, newSecret);
    console.log(`[NextConfig] Generated new JWT secret at: ${secretPath}`);
  } catch (e) {
    console.error("[NextConfig] Failed to write auto-generated JWT secret:", e);
  }
  return newSecret;
};

const jwtSecret = resolveSecret();

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    // Inject the resolved secret into the build/runtime environment
    JWT_SECRET: jwtSecret,
  }
};

export default nextConfig;
