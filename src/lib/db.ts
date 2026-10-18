import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import fs from "node:fs";
import path from "node:path";

const useDynamoDb = process.env.USE_DYNAMODB === "true";
const waitlistTable = process.env.APP_AWS_WAITLIST_TABLE || "Wisentry_Waitlist";
const communityTable = process.env.APP_AWS_COMMUNITY_TABLE || "Wisentry_Community";
let sqlite: Database.Database | null = null;
let dynamo: DynamoDBDocumentClient | null = null;

export type WaitlistStatus = "pending" | "approved" | "rejected";
export type WaitlistRequest = {
  id: string | number;
  uid: string;
  email: string;
  fullName: string;
  startupName: string;
  industry: string;
  url: string;
  challenge1: string;
  challenge2: string;
  status: WaitlistStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

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
    const columns = new Set((sqlite.pragma("table_info(waitlist)") as Array<{ name: string }>).map(column => column.name));
    for (const [name, definition] of [
      ["uid", "TEXT"], ["email", "TEXT NOT NULL DEFAULT ''"], ["status", "TEXT NOT NULL DEFAULT 'pending'"],
      ["reviewedAt", "TEXT"], ["reviewedBy", "TEXT"], ["updatedAt", "TEXT"],
    ] as const) {
      if (!columns.has(name)) sqlite.exec(`ALTER TABLE waitlist ADD COLUMN ${name} ${definition}`);
    }
    sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_uid ON waitlist(uid) WHERE uid IS NOT NULL");
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
  uid: string;
  email: string;
  fullName: string;
  startupName: string;
  industry: string;
  url?: string;
  challenge1: string;
  challenge2?: string;
}) {
  if (useDynamoDb) {
    const existing = (await scanWaitlist()).find(item => item.uid === data.uid);
    if (existing) {
      const clearReview = existing.status === "approved" ? "" : " REMOVE reviewedAt, reviewedBy";
      await getDynamo().send(new UpdateCommand({
        TableName: waitlistTable,
        Key: { id: existing.id },
        UpdateExpression: `SET email = :email, fullName = :fullName, startupName = :startupName, industry = :industry, #url = :url, challenge1 = :challenge1, challenge2 = :challenge2, updatedAt = :updatedAt, #status = :status${clearReview}`,
        ExpressionAttributeNames: { "#url": "url", "#status": "status" },
        ExpressionAttributeValues: {
          ":email": data.email, ":fullName": data.fullName, ":startupName": data.startupName,
          ":industry": data.industry, ":url": data.url || "", ":challenge1": data.challenge1,
          ":challenge2": data.challenge2 || "", ":updatedAt": new Date().toISOString(),
          ":status": existing.status === "approved" ? "approved" : "pending",
        },
      }));
    } else {
      await getDynamo().send(new PutCommand({
        TableName: waitlistTable,
        Item: { id: `user-${data.uid}`, ...data, status: "pending", createdAt: new Date().toISOString() },
        ConditionExpression: "attribute_not_exists(id)",
      }));
    }
    return;
  }
  getSqlite().prepare(`
    INSERT INTO waitlist (uid, email, fullName, startupName, industry, url, challenge1, challenge2, status)
    VALUES (@uid, @email, @fullName, @startupName, @industry, @url, @challenge1, @challenge2, 'pending')
    ON CONFLICT(uid) WHERE uid IS NOT NULL DO UPDATE SET
      email = excluded.email, fullName = excluded.fullName, startupName = excluded.startupName,
      industry = excluded.industry, url = excluded.url, challenge1 = excluded.challenge1,
      challenge2 = excluded.challenge2,
      status = CASE WHEN waitlist.status = 'approved' THEN 'approved' ELSE 'pending' END,
      reviewedAt = CASE WHEN waitlist.status = 'approved' THEN waitlist.reviewedAt ELSE NULL END,
      reviewedBy = CASE WHEN waitlist.status = 'approved' THEN waitlist.reviewedBy ELSE NULL END,
      updatedAt = CURRENT_TIMESTAMP
  `).run(data);
}

async function scanWaitlist(): Promise<WaitlistRequest[]> {
  if (!useDynamoDb) {
    return getSqlite().prepare("SELECT * FROM waitlist WHERE uid IS NOT NULL ORDER BY createdAt DESC")
      .all() as WaitlistRequest[];
  }
  const items: WaitlistRequest[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await getDynamo().send(new ScanCommand({ TableName: waitlistTable, ExclusiveStartKey }));
    items.push(...(result.Items || []) as WaitlistRequest[]);
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getWaitlistRequest(uid: string): Promise<WaitlistRequest | null> {
  if (!useDynamoDb) {
    return (getSqlite().prepare("SELECT * FROM waitlist WHERE uid = ? LIMIT 1").get(uid) as WaitlistRequest | undefined) ?? null;
  }
  return (await scanWaitlist()).find(item => item.uid === uid) ?? null;
}

export async function listWaitlistRequests(): Promise<WaitlistRequest[]> {
  return scanWaitlist();
}

export async function reviewWaitlistRequest(id: string, status: WaitlistStatus, reviewedBy: string): Promise<boolean> {
  const reviewedAt = new Date().toISOString();
  if (useDynamoDb) {
    if (!(await scanWaitlist()).some(item => String(item.id) === id && item.uid)) return false;
    await getDynamo().send(new UpdateCommand({
      TableName: waitlistTable,
      Key: { id },
      UpdateExpression: "SET #status = :status, reviewedAt = :reviewedAt, reviewedBy = :reviewedBy",
      ConditionExpression: "attribute_exists(id)",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": status, ":reviewedAt": reviewedAt, ":reviewedBy": reviewedBy },
    }));
    return true;
  }
  const result = getSqlite().prepare("UPDATE waitlist SET status = ?, reviewedAt = ?, reviewedBy = ? WHERE CAST(id AS TEXT) = ? AND uid IS NOT NULL")
    .run(status, reviewedAt, reviewedBy, id);
  return result.changes > 0;
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
