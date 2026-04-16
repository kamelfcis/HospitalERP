import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth, capSseForVercel } from "./_shared";
import { taskNotifSseClients, broadcastTaskNotif } from "./_sse";

export function registerTasksCrudRoutes(app: Express) {
  app.get("/api/tasks/notifications/sse", requireAuth, (req, res) => {
    const userId = req.session.userId!;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    taskNotifSseClients.set(userId, res);
    const ping = setInterval(() => {
      try { res.write(": ping\n\n"); } catch { clearInterval(ping); }
    }, 25000);
    const dispose = capSseForVercel(req, res, () => {
      clearInterval(ping);
      taskNotifSseClients.delete(userId);
    });
    req.on("close", dispose);
  });

  app.get("/api/tasks/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const result = await db.execute(sql`
        SELECT COUNT(*) AS count
        FROM task_notifications
        WHERE user_id = ${userId} AND is_read = false
      `);
      res.json({ count: Number((result.rows[0] as any)?.count ?? 0) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/tasks/notifications", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const result = await db.execute(sql`
        SELECT
          tn.id,
          tn.type,
          tn.task_id   AS "taskId",
          tn.is_read   AS "isRead",
          tn.created_at AS "createdAt",
          u.full_name  AS "actorName",
          t.title      AS "taskTitle"
        FROM task_notifications tn
        JOIN users u ON u.id = tn.actor_id
        JOIN tasks  t ON t.id = tn.task_id
        WHERE tn.user_id = ${userId}
        ORDER BY tn.created_at DESC
        LIMIT 30
      `);
      res.json(result.rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/tasks/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      await db.execute(sql`
        UPDATE task_notifications
        SET is_read = true
        WHERE id = ${req.params.id} AND user_id = ${userId}
      `);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/tasks/notifications/read-all", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      await db.execute(sql`
        UPDATE task_notifications
        SET is_read = true
        WHERE user_id = ${userId} AND is_read = false
      `);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/tasks", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const tab = (req.query.tab as string) ?? "inbox";
      const status = req.query.status as string | undefined;

      const statusFilter = status && status !== "__all__"
        ? sql`AND t.status = ${status}`
        : sql``;

      let query;
      if (tab === "sent") {
        query = sql`
          SELECT
            t.id, t.title, t.description, t.priority, t.status,
            t.created_at AS "createdAt", t.due_date AS "dueDate",
            u.full_name  AS "createdByName",
            COALESCE(
              json_agg(json_build_object('userId', a.user_id, 'userName', au.full_name, 'status', a.status))
              FILTER (WHERE a.id IS NOT NULL), '[]'
            ) AS assignees
          FROM tasks t
          JOIN users u ON u.id = t.created_by
          LEFT JOIN task_assignees a ON a.task_id = t.id
          LEFT JOIN users au ON au.id = a.user_id
          WHERE t.created_by = ${userId} ${statusFilter}
          GROUP BY t.id, u.full_name
          ORDER BY t.created_at DESC
          LIMIT 100
        `;
      } else {
        query = sql`
          SELECT
            t.id, t.title, t.description, t.priority, t.status,
            t.created_at AS "createdAt", t.due_date AS "dueDate",
            u.full_name  AS "createdByName",
            a.status     AS "myStatus",
            a.read_at    AS "readAt",
            COALESCE(
              json_agg(json_build_object('userId', a2.user_id, 'userName', au2.full_name, 'status', a2.status))
              FILTER (WHERE a2.id IS NOT NULL), '[]'
            ) AS assignees
          FROM task_assignees a
          JOIN tasks t ON t.id = a.task_id
          JOIN users u ON u.id = t.created_by
          LEFT JOIN task_assignees a2 ON a2.task_id = t.id
          LEFT JOIN users au2 ON au2.id = a2.user_id
          WHERE a.user_id = ${userId} ${statusFilter}
          GROUP BY t.id, u.full_name, a.status, a.read_at
          ORDER BY t.created_at DESC
          LIMIT 100
        `;
      }

      const result = await db.execute(query);
      res.json(result.rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const taskId = req.params.id;

      const taskResult = await db.execute(sql`
        SELECT
          t.id, t.title, t.description, t.priority, t.status,
          t.created_at AS "createdAt", t.due_date AS "dueDate",
          t.created_by AS "createdBy",
          u.full_name  AS "createdByName"
        FROM tasks t
        JOIN users u ON u.id = t.created_by
        WHERE t.id = ${taskId}
          AND (
            t.created_by = ${userId}
            OR EXISTS (SELECT 1 FROM task_assignees WHERE task_id = t.id AND user_id = ${userId})
          )
      `);

      if (!taskResult.rows.length) return res.status(404).json({ message: "المهمة غير موجودة أو لا تملك صلاحية عرضها" });

      const task = taskResult.rows[0] as any;

      const assigneesResult = await db.execute(sql`
        SELECT a.id, a.user_id AS "userId", u.full_name AS "userName", a.status, a.read_at AS "readAt"
        FROM task_assignees a
        JOIN users u ON u.id = a.user_id
        WHERE a.task_id = ${taskId}
      `);

      const commentsResult = await db.execute(sql`
        SELECT c.id, c.body, c.status_after_update AS "statusAfterUpdate", c.created_at AS "createdAt",
               u.full_name AS "userName", u.id AS "userId"
        FROM task_comments c
        JOIN users u ON u.id = c.user_id
        WHERE c.task_id = ${taskId}
        ORDER BY c.created_at ASC
      `);

      await db.execute(sql`
        UPDATE task_assignees
        SET read_at = NOW()
        WHERE task_id = ${taskId} AND user_id = ${userId} AND read_at IS NULL
      `);

      res.json({
        ...task,
        assignees: assigneesResult.rows,
        comments: commentsResult.rows,
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/tasks", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { title, description, priority, dueDate, assigneeIds } = req.body;

      if (!title?.trim()) return res.status(400).json({ message: "عنوان المهمة مطلوب" });
      if (!Array.isArray(assigneeIds) || assigneeIds.length === 0) {
        return res.status(400).json({ message: "يجب تحديد مستلم واحد على الأقل" });
      }

      const taskResult = await db.execute(sql`
        INSERT INTO tasks (title, description, priority, status, created_by, due_date)
        VALUES (
          ${title.trim()},
          ${description?.trim() ?? null},
          ${priority ?? "normal"},
          'new',
          ${userId},
          ${dueDate ?? null}
        )
        RETURNING id, title, description, priority, status, created_at AS "createdAt", due_date AS "dueDate"
      `);
      const task = taskResult.rows[0] as any;

      const senderResult = await db.execute(sql`SELECT full_name FROM users WHERE id = ${userId}`);
      const senderName = (senderResult.rows[0] as any)?.full_name ?? "مستخدم";

      for (const assigneeId of assigneeIds) {
        if (assigneeId === userId) continue;
        await db.execute(sql`
          INSERT INTO task_assignees (task_id, user_id, status)
          VALUES (${task.id}, ${assigneeId}, 'new')
        `);
        const notifResult = await db.execute(sql`
          INSERT INTO task_notifications (user_id, actor_id, type, task_id, is_read)
          VALUES (${assigneeId}, ${userId}, 'task_created', ${task.id}, false)
          RETURNING id, type, task_id AS "taskId", created_at AS "createdAt"
        `);
        broadcastTaskNotif(assigneeId, {
          ...notifResult.rows[0],
          actorName: senderName,
          taskTitle: task.title,
          isRead: false,
        });
      }

      res.status(201).json(task);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/tasks/users/list", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const result = await db.execute(sql`
        SELECT id, full_name AS "fullName", role
        FROM users
        WHERE is_active = true AND id != ${userId}
        ORDER BY full_name
      `);
      res.json(result.rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
