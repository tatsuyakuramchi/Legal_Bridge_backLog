import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

let prismaSingleton: PrismaClient | null = null;

function resolveConnectionConfig():
  | {
      host: string;
      port: number;
      database: string;
      user: string;
      password: string;
      schema: string;
      ssl: false | { rejectUnauthorized: boolean };
    }
  | null {
  const host = String(process.env.RDS_HOST ?? "").trim();
  const db = String(process.env.RDS_DB ?? "").trim();
  const user = String(process.env.RDS_USER ?? "").trim();
  const password = String(process.env.RDS_PASSWORD ?? "").trim();
  if (!host || !db || !user || !password) {
    return null;
  }

  const schema = String(process.env.PRISMA_SCHEMA ?? "lb_core").trim() || "lb_core";
  return {
    host,
    port: Number(process.env.RDS_PORT ?? 5432),
    database: db,
    user,
    password,
    schema,
    ssl: String(process.env.RDS_SSL ?? "true").toLowerCase() === "false" ? false : { rejectUnauthorized: false }
  };
}

export function isPrismaConfigured(): boolean {
  return Boolean(resolveConnectionConfig());
}

export function getPrismaClient(): PrismaClient | null {
  const config = resolveConnectionConfig();
  if (!config) {
    return null;
  }
  if (!prismaSingleton) {
    const adapter = new PrismaPg({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl
    }, {
      schema: config.schema
    });
    prismaSingleton = new PrismaClient({ adapter });
  }
  return prismaSingleton;
}
