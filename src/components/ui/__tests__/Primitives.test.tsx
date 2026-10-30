// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { nextIntlMock } from "../../../test-utils/componentMocks";
import { Badge, Button, Card, Field, Stat, cn, fieldControlClass } from "..";

vi.mock("next-intl", () => nextIntlMock());

describe("cn", () => {
  test("should keep text-label and text-data next to colour classes", () => {
    const a = cn("text-label", "text-ink-muted").split(" ");
    expect(a).toContain("text-label");
    expect(a).toContain("text-ink-muted");
    const b = cn("text-data", "text-ink").split(" ");
    expect(b).toContain("text-data");
    expect(b).toContain("text-ink");
  });

  test("still merges conflicting colours and sizes", () => {
    expect(cn("text-ink", "text-loss")).toBe("text-loss");
    expect(cn("text-label", "text-data")).toBe("text-data");
    expect(cn("p-2", false, "p-4")).toBe("p-4");
  });
});

describe("Button", () => {
  test("defaults to type=button and supports disabled", () => {
    render(<Button disabled>{"x"}</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("type", "button");
    expect(btn).toBeDisabled();
  });

  test("loading sets aria-busy and disables", () => {
    render(<Button loading variant="primary">{"x"}</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toBeDisabled();
    expect(btn.className).toContain("bg-accent-solid");
  });
});

describe("Field", () => {
  test("wires label, hint and error to the control", () => {
    render(
      <Field label={"Lbl"} hint={"Hnt"} error={"Err"} required>
        {(a11y) => <input {...a11y} className={fieldControlClass} />}
      </Field>,
    );
    const input = screen.getByLabelText(/Lbl/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    const ids = (input.getAttribute("aria-describedby") ?? "").split(" ");
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[0])?.textContent).toBe("Hnt");
    expect(document.getElementById(ids[1])?.textContent).toBe("Err");
    expect(screen.getByRole("alert")).toHaveTextContent("Err");
  });

  test("no hint/error means no aria-describedby or aria-invalid", () => {
    render(<Field label={"Lbl"}>{(a11y) => <input {...a11y} />}</Field>);
    const input = screen.getByLabelText("Lbl");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(input).not.toHaveAttribute("aria-invalid");
  });
});

describe("Card / Stat / Badge", () => {
  test("render with token classes", () => {
    const { container } = render(
      <Card as="section" tone="raised">
        <Stat label={"L"} value={"V"} tone="loss" />
        <Badge tone="profit">{"B"}</Badge>
      </Card>,
    );
    const section = container.querySelector("section");
    expect(section?.className).toContain("rounded-card");
    expect(section?.className).toContain("shadow-raised");
    expect(container.querySelector("dt")?.className).toContain("text-label");
    expect(container.querySelector("dd")?.className).toContain("text-loss");
    expect(screen.getByText("B").className).toContain("text-profit");
  });
});
