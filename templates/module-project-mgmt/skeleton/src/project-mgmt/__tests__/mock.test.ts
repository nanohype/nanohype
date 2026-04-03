import { describe, it, expect } from "vitest";
import { getProvider } from "../providers/registry.js";
import "../providers/mock.js";

// ── Mock Provider Tests ────────────────────────────────────────────
//
// Validates CRUD operations, pagination, priority mapping, and
// deterministic IDs for the in-memory mock provider.
//

describe("mock provider", () => {
  function getMock() {
    return getProvider("mock");
  }

  describe("projects", () => {
    it("creates a project with deterministic ID", async () => {
      const provider = getMock();
      const project = await provider.createProject({
        name: "Test Project",
        description: "A test project",
      });

      expect(project.id).toMatch(/^proj-\d{4}$/);
      expect(project.name).toBe("Test Project");
      expect(project.description).toBe("A test project");
      expect(project.createdAt).toBeTruthy();
      expect(project.updatedAt).toBeTruthy();
    });

    it("lists projects", async () => {
      const provider = getMock();
      await provider.createProject({ name: "Project A" });
      await provider.createProject({ name: "Project B" });

      const result = await provider.listProjects();
      expect(result.items.length).toBeGreaterThanOrEqual(2);
      expect(result.totalCount).toBeGreaterThanOrEqual(2);
    });

    it("paginates projects", async () => {
      const provider = getMock();
      await provider.createProject({ name: "Page 1" });
      await provider.createProject({ name: "Page 2" });
      await provider.createProject({ name: "Page 3" });

      const page1 = await provider.listProjects({ limit: 2 });
      expect(page1.items.length).toBe(2);
      expect(page1.nextCursor).toBeTruthy();

      const page2 = await provider.listProjects({ limit: 2, cursor: page1.nextCursor });
      expect(page2.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("issues", () => {
    it("creates an issue with default priority", async () => {
      const provider = getMock();
      const project = await provider.createProject({ name: "Issue Project" });
      const issue = await provider.createIssue({
        projectId: project.id,
        title: "First Task",
        description: "Do the thing",
      });

      expect(issue.id).toMatch(/^issue-\d{4}$/);
      expect(issue.projectId).toBe(project.id);
      expect(issue.title).toBe("First Task");
      expect(issue.description).toBe("Do the thing");
      expect(issue.status).toBe("backlog");
      expect(issue.priority).toBe("none");
      expect(issue.labels).toEqual([]);
    });

    it("creates an issue with specified priority", async () => {
      const provider = getMock();
      const project = await provider.createProject({ name: "Priority Project" });
      const issue = await provider.createIssue({
        projectId: project.id,
        title: "Urgent Task",
        priority: "urgent",
      });

      expect(issue.priority).toBe("urgent");
    });

    it("gets an issue by ID", async () => {
      const provider = getMock();
      const project = await provider.createProject({ name: "Get Project" });
      const created = await provider.createIssue({
        projectId: project.id,
        title: "Find Me",
      });

      const found = await provider.getIssue(created.id);
      expect(found.id).toBe(created.id);
      expect(found.title).toBe("Find Me");
    });

    it("throws when getting a non-existent issue", async () => {
      const provider = getMock();
      await expect(provider.getIssue("nonexistent")).rejects.toThrow(/not found/);
    });

    it("updates an issue", async () => {
      const provider = getMock();
      const project = await provider.createProject({ name: "Update Project" });
      const issue = await provider.createIssue({
        projectId: project.id,
        title: "Original Title",
        priority: "low",
      });

      const updated = await provider.updateIssue(issue.id, {
        title: "Updated Title",
        status: "in_progress",
        priority: "high",
      });

      expect(updated.title).toBe("Updated Title");
      expect(updated.status).toBe("in_progress");
      expect(updated.priority).toBe("high");
    });

    it("preserves unchanged fields on update", async () => {
      const provider = getMock();
      const project = await provider.createProject({ name: "Partial Update" });
      const issue = await provider.createIssue({
        projectId: project.id,
        title: "Keep Title",
        description: "Keep Description",
        priority: "medium",
      });

      const updated = await provider.updateIssue(issue.id, {
        status: "done",
      });

      expect(updated.title).toBe("Keep Title");
      expect(updated.description).toBe("Keep Description");
      expect(updated.priority).toBe("medium");
      expect(updated.status).toBe("done");
    });

    it("throws when updating a non-existent issue", async () => {
      const provider = getMock();
      await expect(
        provider.updateIssue("nonexistent", { title: "nope" }),
      ).rejects.toThrow(/not found/);
    });

    it("lists issues filtered by project", async () => {
      const provider = getMock();
      const projectA = await provider.createProject({ name: "List A" });
      const projectB = await provider.createProject({ name: "List B" });

      await provider.createIssue({ projectId: projectA.id, title: "A-1" });
      await provider.createIssue({ projectId: projectA.id, title: "A-2" });
      await provider.createIssue({ projectId: projectB.id, title: "B-1" });

      const resultA = await provider.listIssues(projectA.id);
      expect(resultA.items.length).toBe(2);
      expect(resultA.totalCount).toBe(2);
      expect(resultA.items.every((i) => i.projectId === projectA.id)).toBe(true);

      const resultB = await provider.listIssues(projectB.id);
      expect(resultB.items.length).toBe(1);
    });

    it("paginates issues", async () => {
      const provider = getMock();
      const project = await provider.createProject({ name: "Paginate Issues" });

      await provider.createIssue({ projectId: project.id, title: "I-1" });
      await provider.createIssue({ projectId: project.id, title: "I-2" });
      await provider.createIssue({ projectId: project.id, title: "I-3" });

      const page1 = await provider.listIssues(project.id, { limit: 2 });
      expect(page1.items.length).toBe(2);
      expect(page1.nextCursor).toBeTruthy();

      const page2 = await provider.listIssues(project.id, {
        limit: 2,
        cursor: page1.nextCursor,
      });
      expect(page2.items.length).toBe(1);
      expect(page2.nextCursor).toBeUndefined();
    });
  });

  describe("comments", () => {
    it("adds a comment to an issue", async () => {
      const provider = getMock();
      const project = await provider.createProject({ name: "Comment Project" });
      const issue = await provider.createIssue({
        projectId: project.id,
        title: "Commentable",
      });

      const comment = await provider.addComment(issue.id, "Great work!");

      expect(comment.id).toMatch(/^comment-\d{4}$/);
      expect(comment.issueId).toBe(issue.id);
      expect(comment.body).toBe("Great work!");
      expect(comment.createdAt).toBeTruthy();
    });

    it("throws when commenting on a non-existent issue", async () => {
      const provider = getMock();
      await expect(
        provider.addComment("nonexistent", "nope"),
      ).rejects.toThrow(/not found/);
    });
  });

  describe("priority mapping", () => {
    it("supports all priority values", async () => {
      const provider = getMock();
      const project = await provider.createProject({ name: "Priority Map" });

      const priorities = ["urgent", "high", "medium", "low", "none"] as const;
      for (const priority of priorities) {
        const issue = await provider.createIssue({
          projectId: project.id,
          title: `Priority: ${priority}`,
          priority,
        });
        expect(issue.priority).toBe(priority);
      }
    });
  });

  describe("factory pattern", () => {
    it("creates independent instances", () => {
      const a = getMock();
      const b = getMock();
      expect(a).not.toBe(b);
      expect(a.name).toBe(b.name);
    });

    it("instances have isolated state", async () => {
      const a = getMock();
      const b = getMock();

      const projectA = await a.createProject({ name: "Instance A" });
      const resultB = await b.listProjects();

      // Instance B should not see projects from instance A
      const found = resultB.items.find((p) => p.id === projectA.id);
      expect(found).toBeUndefined();
    });
  });
});
