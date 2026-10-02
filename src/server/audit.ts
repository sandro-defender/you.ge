import { desc, eq, inArray } from "drizzle-orm";
import { auditLog, notifications } from "../db/schema";
import type { Database } from "../lib/db";
import type { AuditEntry, NotificationItem } from "../lib/types";

type Actor = {
	id?: string | null;
	name?: string | null;
	email?: string | null;
};

type AuditInput = {
	action: string;
	entityType: string;
	entityId?: string | null;
	summary: string;
	metadata?: Record<string, unknown> | null;
	actor?: Actor | null;
};

type NotificationInput = {
	audience: string;
	kind: string;
	level: "info" | "success" | "warning" | "error";
	title: string;
	message: string;
	link?: string | null;
	metadata?: Record<string, unknown> | null;
};

export async function writeAudit(db: Database, input: AuditInput): Promise<void> {
	await db.insert(auditLog).values({
		action: input.action,
		entityType: input.entityType,
		entityId: input.entityId ?? null,
		summary: input.summary,
		metadata: input.metadata ? JSON.stringify(input.metadata) : null,
		actorUserId: input.actor?.id ?? null,
		actorName: input.actor?.name ?? null,
		actorEmail: input.actor?.email ?? null,
	});
}

export async function notify(db: Database, input: NotificationInput): Promise<void> {
	await db.insert(notifications).values({
		audience: input.audience,
		kind: input.kind,
		level: input.level,
		title: input.title,
		message: input.message,
		link: input.link ?? null,
		metadata: input.metadata ? JSON.stringify(input.metadata) : null,
	});
}

export async function notifyAdmins(db: Database, input: Omit<NotificationInput, "audience">) {
	await notify(db, { ...input, audience: "admin" });
}

export async function notifyUser(
	db: Database,
	userId: string,
	input: Omit<NotificationInput, "audience">,
) {
	await notify(db, { ...input, audience: `user:${userId}` });
}

export async function recentAuditEntries(db: Database, limit = 12): Promise<AuditEntry[]> {
	const rows = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
	return rows.map((row) => ({
		id: row.id,
		action: row.action,
		entityType: row.entityType,
		entityId: row.entityId,
		summary: row.summary,
		actorUserId: row.actorUserId,
		actorName: row.actorName,
		actorEmail: row.actorEmail,
		metadata: parseJsonRecord(row.metadata),
		createdAt: row.createdAt.toISOString(),
	}));
}

export async function notificationFeed(
	db: Database,
	options: { audience: string[]; limit?: number },
): Promise<{ items: NotificationItem[]; unreadCount: number }> {
	const audience = options.audience.length === 1 ? options.audience[0] : null;
	const where = audience ? eq(notifications.audience, audience) : inArray(notifications.audience, options.audience);
	const rows = await db
		.select()
		.from(notifications)
		.where(where)
		.orderBy(desc(notifications.createdAt))
		.limit(options.limit ?? 30);
	const items = rows.map((row) => ({
		id: row.id,
		kind: row.kind,
		level: row.level as NotificationItem["level"],
		title: row.title,
		message: row.message,
		link: row.link,
		metadata: parseJsonRecord(row.metadata),
		createdAt: row.createdAt.toISOString(),
		readAt: row.readAt?.toISOString() ?? null,
	}));
	return {
		items,
		unreadCount: items.filter((item) => item.readAt === null).length,
	};
}

function parseJsonRecord(raw: string | null): Record<string, unknown> | null {
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}
