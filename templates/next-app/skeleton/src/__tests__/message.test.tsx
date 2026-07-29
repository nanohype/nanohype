// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Message } from "@/components/chat/Message";

describe("Message", () => {
  it("renders the message content", () => {
    render(<Message message={{ role: "user", content: "Hello there" }} />);

    expect(screen.getByText("Hello there")).toBeDefined();
  });

  it("aligns user messages right with accent styling", () => {
    const { container } = render(<Message message={{ role: "user", content: "hi" }} />);

    expect(container.firstElementChild?.className).toContain("justify-end");
    expect(screen.getByText("hi").className).toContain("bg-accent");
  });

  it("aligns assistant messages left with card styling", () => {
    const { container } = render(<Message message={{ role: "assistant", content: "hello" }} />);

    expect(container.firstElementChild?.className).toContain("justify-start");
    expect(screen.getByText("hello").className).toContain("bg-card");
  });
});
