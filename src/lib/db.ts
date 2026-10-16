import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import fs from "node:fs";
import path from "node:path";

const useDynamoDb = process.env.USE_DYNAMODB === "true";
const waitlistTable = process.env.APP_AWS_WAITLIST_TABLE || "Wisentry_Waitlist";
const communityTable = process.env.APP_AWS_COMMUNITY_TABLE || "Wisentry_Community";
let sqlite: Database.Database | null = null;
let dynamo: DynamoDBDocumentClient | null = null;

function getSqlite() {
  if (useDynamoDb) throw new Error("Local SQLite is unavailable while USE_DYNAMODB=true.");
  if (process.env.NODE_ENV === "production" && !process.env.WISENTRY_DB_PATH) {
    throw new Error("Configure WISENTRY_DB_PATH for persistent production storage, or use DynamoDB.");
  }
  if (!sqlite) {
    const dbPath = path.resolve(process.env.WISENTRY_DB_PATH || path.join(process.cwd(), ".wisentry-data", "wisentry.db"));
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL");
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fullName TEXT NOT NULL,
        startupName TEXT NOT NULL,
        industry TEXT NOT NULL,
        url TEXT,
        challenge1 TEXT,
        challenge2 TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON waitlist(createdAt);
      CREATE INDEX IF NOT EXISTS idx_waitlist_industry ON waitlist(industry);
      CREATE INDEX IF NOT EXISTS idx_waitlist_startup ON waitlist(startupName);

      CREATE TABLE IF NOT EXISTS community (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_community_email ON community(email);
      CREATE INDEX IF NOT EXISTS idx_community_created_at ON community(createdAt);
    `);
  }
  return sqlite;
}

function getDynamo() {
  if (!dynamo) {
    const accessKeyId = process.env.APP_AWS_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.APP_AWS_SECRET_ACCESS_KEY?.trim();
    dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({
      region: process.env.APP_AWS_REGION || process.env.AWS_REGION || "eu-north-1",
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    }));
  }
  return dynamo;
}

export async function insertWaitlist(data: {
  fullName: string;
  startupName: string;
  industry: string;
  url?: string;
  challenge1: string;
  challenge2?: string;
}) {
  if (useDynamoDb) {
    await getDynamo().send(new PutCommand({
      TableName: waitlistTable,
      Item: { id: randomUUID(), ...data, createdAt: new Date().toISOString() },
      ConditionExpression: "attribute_not_exists(id)",
    }));
    return;
  }
  getSqlite().prepare(`
    INSERT INTO waitlist (fullName, startupName, industry, url, challenge1, challenge2)
    VALUES (@fullName, @startupName, @industry, @url, @challenge1, @challenge2)
  `).run(data);
}

export async function insertCommunityMember(email: string) {
  if (useDynamoDb) {
    try {
      await getDynamo().send(new PutCommand({
        TableName: communityTable,
        Item: { email, createdAt: new Date().toISOString() },
        ConditionExpression: "attribute_not_exists(email)",
      }));
    } catch (error) {
      if ((error as { name?: string })?.name !== "ConditionalCheckFailedException") throw error;
    }
    return;
  }
  try {
    getSqlite().prepare("INSERT INTO community (email) VALUES (@email)").run({ email });
  } catch (error) {
    if ((error as { code?: string })?.code !== "SQLITE_CONSTRAINT_UNIQUE") throw error;
  }
}
