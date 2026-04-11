import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth } from "./_shared";
import { broadcastTaskNotif } from "./_sse";

export function registerTasksStatusRoutes(app: Express) {
  app.patch("/api/tasks/:id/status", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const taskId = req.params.id;
      const { status } = req.body;

      const VALID_STATUSES = ["new", "in_progress", "done", "deferred", "needs_clarification", "cancelled"];
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ message: "حالة غير صالحة" });
      }

      const taskResult = await db.execute(sql`
        SELECT t.id, t.title, t.created_by AS "createdBy"
        FROM tasks t
        JOIN task_assignees a ON a.task_id = t.id
        WHERE t.id = ${taskId} AND a.user_id = ${userId}
      `);
      if (!taskResult.rows.length) return res.status(403).json({ message: "غير مصرح" });

      const task = taskResult.rows[0] as any;

      await db.execute(sql`
        UPDATE task_assignees SET status = ${status}
        WHERE task_id = ${taskId} AND user_id = ${userId}
      `);

      const allAssignees = await db.execute(sql`
        SELECT status FROM task_assignees WHERE task_id = ${taskId}
      `);
      const allDone = allAssignees.rows.every((r: any) => r.status === "done");
      if (allDone) {
        await db.execute(sql`UPDATE tasks SET status = 'done' WHERE id = ${taskId}`);
      } else if (status === "in_progress") {
        await db.execute(sql`UPDATE tasks SET status = 'in_progress' WHERE id = ${taskId}`);
      }

      const actorResult = await db.execute(sql`SELECT full_name FROM users WHERE id = ${userId}`);
      const actorName = (actorResult.rows[0] as any)?.full_name ?? "مستخدم";

      const notifType = status === "done" ? "task_completed" : "task_status_updated";
      const notifResult = await db.execute(sql`
        INSERT INTO task_notifications (user_id, actor_id, type, task_id, is_read)
        VALUES (${task.createdBy}, ${userId}, ${notifType}, ${taskId}, false)
        RETURNING id, type, task_id AS "taskId", created_at AS "createdAt"
      `);
      broadcastTaskNotif(task.createdBy, {
        ...notifResult.rows[0],
        actorName,
        taskTitle: task.title,
        isRead: false,
      });

      res.json({ ok: true, status });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/tasks/:id/comments", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const taskId = req.params.id;
      const { body, statusAfterUpdate } = req.body;

      if (!body?.trim()) return res.status(400).json({ message: "نص التعليق مطلوب" });

      const taskResult = await db.execute(sql`
        SELECT t.id, t.title, t.created_by AS "createdBy"
        FROM tasks t
        WHERE t.id = ${taskId}
          AND (
            t.created_by = ${userId}
            OR EXISTS (SELECT 1 FROM task_assignees WHERE task_id = t.id AND user_id = ${userId})
          )
      `);
      if (!taskResult.rows.length) return res.status(403).json({ message: "غير مصرح" });

      const task = taskResult.rows[0] as any;

      const commentResult = await db.execute(sql`
        INSERT INTO task_comments (task_id, user_id, body, status_after_update)
        VALUES (${taskId}, ${userId}, ${body.trim()}, ${statusAfterUpdate ?? null})
        RETURNING id, body, status_after_update AS "statusAfterUpdate", created_at AS "createdAt"
      `);
      const comment = commentResult.rows[0] as any;

      if (statusAfterUpdate) {
        await db.execute(sql`
          UPDATE task_assignees SET status = ${statusAfterUpdate}
          WHERE task_id = ${taskId} AND user_id = ${userId}
        `);
      }

      const actorResult = await db.execute(sql`SELECT full_name FROM users WHERE id = ${userId}`);
      const actorName = (actorResult.rows[0] as any)?.full_name ?? "مستخدم";

      const assigneesResult = await db.execute(sql`
        SELECT user_id AS "userId" FROM task_assignees WHERE task_id = ${taskId}
      `);
      const targets = new Set<string>();
      assigneesResult.rows.forEach((r: any) => {
        if (r.userId !== userId) targets.add(r.userId);
      });
      if (task.createdBy !== userId) targets.add(task.createdBy);

      for (const targetId of targets) {
        const notifResult = await db.execute(sql`
          INSERT INTO task_notifications (user_id, actor_id, type, task_id, is_read)
          VALUES (${targetId}, ${userId}, 'task_commented', ${taskId}, false)
          RETURNING id, type, task_id AS "taskId", created_at AS "createdAt"
        `);
        broadcastTaskNotif(targetId, {
          ...notifResult.rows[0],
          actorName,
          taskTitle: task.title,
          isRead: false,
        });
      }

      res.status(201).json({ ...comment, userName: actorName, userId });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
