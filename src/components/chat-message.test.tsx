import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatMessage } from "./chat-message";

describe("<ChatMessage />", () => {
  test("renders user message text inside a <p> with whitespace-pre-wrap", () => {
    render(<ChatMessage role="user" content="Hello user world" />);
    const p = screen.getByText("Hello user world");
    expect(p.tagName.toLowerCase()).toBe("p");
    expect(p.className).toMatch(/whitespace-pre-wrap/);
  });

  test("renders assistant message via markdown (bold becomes <strong>)", () => {
    render(<ChatMessage role="assistant" content="this is **bold** text" />);
    const strong = screen.getByText("bold");
    expect(strong.tagName.toLowerCase()).toBe("strong");
  });

  test("renders a PDF file as an external link with the file name", () => {
    render(
      <ChatMessage
        role="user"
        content="see attached"
        fileUrls={["https://example.com/doc.pdf"]}
        fileTypes={["application/pdf"]}
        fileNames={["report.pdf"]}
      />
    );
    const link = screen.getByRole("link", { name: /report\.pdf/ });
    expect(link).toHaveAttribute("href", "https://example.com/doc.pdf");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  test("renders an image file as an <img> with the URL as src", () => {
    render(
      <ChatMessage
        role="user"
        content=""
        fileUrls={["https://example.com/photo.png"]}
        fileTypes={["image/png"]}
      />
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/photo.png");
  });
});
