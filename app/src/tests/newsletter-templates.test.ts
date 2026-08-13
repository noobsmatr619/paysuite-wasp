import { describe, expect, it, vi } from "vitest";
import {
  getNewsletterSubscribers,
  subscribeNewsletter,
  deleteNewsletterSubscriber,
} from "../paysuite/newsletter/operations";
import {
  getEmailTemplateTypes,
  getEmailTemplate,
  updateEmailTemplate,
} from "../paysuite/templates/operations";
import {
  EMAIL_TEMPLATE_TYPES,
  EMAIL_TEMPLATES,
} from "../paysuite/templates/defaults";

const admin = { id: "u1", isAdmin: true };
const member = { id: "u2", isAdmin: false };

function ctx(user: any, entities: any) {
  return { user, entities } as any;
}

describe("newsletter", () => {
  it("lists subscribers for an admin and refuses a member", async () => {
    const rows = [{ id: "n1", email: "a@b.com", createdAt: new Date() }];
    const entities = { Newsletter: { findMany: vi.fn().mockResolvedValue(rows) } };

    await expect(
      getNewsletterSubscribers(undefined as any, ctx(admin, entities)),
    ).resolves.toEqual(rows);

    await expect(
      getNewsletterSubscribers(undefined as any, ctx(member, entities)),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects a malformed email", async () => {
    const entities = { Newsletter: { findUnique: vi.fn(), create: vi.fn() } };
    await expect(
      subscribeNewsletter({ email: "not-an-email" }, ctx(null, entities)),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(entities.Newsletter.create).not.toHaveBeenCalled();
  });

  it("subscribes anonymously, lowercased, and is idempotent", async () => {
    const create = vi.fn();
    const entities = {
      Newsletter: { findUnique: vi.fn().mockResolvedValue(null), create },
    };
    await expect(
      subscribeNewsletter({ email: "  New@Example.COM " }, ctx(null, entities)),
    ).resolves.toEqual({ ok: true, alreadySubscribed: false });
    expect(create).toHaveBeenCalledWith({ data: { email: "new@example.com" } });

    const already = {
      Newsletter: {
        findUnique: vi.fn().mockResolvedValue({ id: "n1" }),
        create: vi.fn(),
      },
    };
    await expect(
      subscribeNewsletter({ email: "new@example.com" }, ctx(null, already)),
    ).resolves.toEqual({ ok: true, alreadySubscribed: true });
    expect(already.Newsletter.create).not.toHaveBeenCalled();
  });

  it("only an admin can remove a subscriber", async () => {
    const entities = { Newsletter: { delete: vi.fn() } };
    await expect(
      deleteNewsletterSubscriber({ id: "n1" }, ctx(member, entities)),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(entities.Newsletter.delete).not.toHaveBeenCalled();
  });
});

describe("email templates", () => {
  it("groups the types by group name", async () => {
    const entities = {
      EmailTemplateType: {
        findMany: vi.fn().mockResolvedValue([
          { id: "t1", name: "forget_password", displayName: "Forgot password", groupName: "password" },
          { id: "t2", name: "user_invitation", displayName: "User invitation", groupName: "users" },
          { id: "t3", name: "user_joined", displayName: "User joined", groupName: "users" },
        ]),
      },
    };
    const grouped: any = await getEmailTemplateTypes(undefined as any, ctx(admin, entities));
    expect(Object.keys(grouped).sort()).toEqual(["password", "users"]);
    expect(grouped.users).toHaveLength(2);
  });

  it("finds the template for a type", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "tpl1" });
    const entities = { EmailTemplate: { findFirst } };
    await getEmailTemplate({ typeId: "t1" }, ctx(admin, entities));
    expect(findFirst.mock.calls[0][0].where).toEqual({ templateTypeId: "t1" });
  });

  it("writes only the subject and the override, never the shipped default", async () => {
    const update = vi.fn();
    const entities = {
      EmailTemplate: {
        findUnique: vi.fn().mockResolvedValue({ id: "tpl1", defaultContent: "<p>shipped</p>" }),
        update,
      },
    };
    await updateEmailTemplate(
      { id: "tpl1", subject: " Hello ", description: "<p>mine</p>" },
      ctx(admin, entities),
    );
    expect(update.mock.calls[0][0].data).toEqual({
      subject: "Hello",
      customContent: "<p>mine</p>",
    });
  });

  it("clears the override back to the default when the body is emptied", async () => {
    const update = vi.fn();
    const entities = {
      EmailTemplate: {
        findUnique: vi.fn().mockResolvedValue({ id: "tpl1" }),
        update,
      },
    };
    await updateEmailTemplate(
      { id: "tpl1", subject: "Hi", description: "   " },
      ctx(admin, entities),
    );
    expect(update.mock.calls[0][0].data.customContent).toBeNull();
  });

  it("requires a subject", async () => {
    const entities = {
      EmailTemplate: { findUnique: vi.fn().mockResolvedValue({ id: "tpl1" }), update: vi.fn() },
    };
    await expect(
      updateEmailTemplate({ id: "tpl1", subject: "  " }, ctx(admin, entities)),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("seeded template defaults", () => {
  it("carries every Laravel template type", () => {
    expect(EMAIL_TEMPLATE_TYPES).toHaveLength(13);
    expect(EMAIL_TEMPLATE_TYPES.map((t) => t.name)).toContain("forget_password");
  });

  it("gives every template a type that exists, a subject and a body", () => {
    const names = new Set(EMAIL_TEMPLATE_TYPES.map((t) => t.name));
    for (const template of EMAIL_TEMPLATES) {
      expect(names.has(template.type)).toBe(true);
      expect(template.subject.length).toBeGreaterThan(0);
      expect(template.defaultContent.length).toBeGreaterThan(50);
    }
  });
});
