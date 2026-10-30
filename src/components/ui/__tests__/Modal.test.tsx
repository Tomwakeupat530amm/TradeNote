// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { useRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { nextIntlMock } from "../../../test-utils/componentMocks";
import { Modal } from "../Modal";
import { overlayDepth } from "../overlayStack";

vi.mock("next-intl", () => nextIntlMock());

function Harness({ role }: { role?: "dialog" | "alertdialog" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {"opener"}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={"T"} description={"D"} role={role}>
        <button type="button">{"first"}</button>
        <button type="button">{"last"}</button>
      </Modal>
    </>
  );
}

function openHarness(role?: "dialog" | "alertdialog") {
  render(<Harness role={role} />);
  const opener = screen.getByText("opener");
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe("Modal", () => {
  test("renders nothing when closed", () => {
    render(<Modal open={false} onClose={() => {}} title={"T"} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("role, aria-modal, labelledby, describedby, close label", () => {
    openHarness();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")?.textContent).toBe("T");
    expect(document.getElementById(dialog.getAttribute("aria-describedby") ?? "")?.textContent).toBe("D");
    expect(screen.getByLabelText("Ui.close")).toBeInTheDocument();
    expect(dialog.parentElement?.parentElement).toBe(document.body);
  });

  test("should close only the top-most overlay on Escape and restore focus", () => {
    const opener = openHarness();
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
    expect(overlayDepth()).toBe(0);
  });

  test("nested: Escape closes inner only; scroll lock held until last closes", () => {
    function Nested() {
      const [outer, setOuter] = useState(true);
      const [inner, setInner] = useState(true);
      return (
        <Modal open={outer} onClose={() => setOuter(false)} title={"Outer"}>
          <Modal open={inner} onClose={() => setInner(false)} title={"Inner"}>
            <button type="button">{"in"}</button>
          </Modal>
        </Modal>
      );
    }
    render(<Nested />);
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    fireEvent.keyDown(document, { key: "Escape" });
    const left = screen.getAllByRole("dialog");
    expect(left).toHaveLength(1);
    expect(screen.getByText("Outer")).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  test("Tab and Shift+Tab wrap inside the dialog", () => {
    openHarness();
    const close = screen.getByLabelText("Ui.close");
    const last = screen.getByText("last");
    expect(document.activeElement).toBe(close);
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  test("scrim click closes a dialog but not an alertdialog", () => {
    openHarness();
    fireEvent.click(screen.getByTestId("ui-scrim"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("alertdialog ignores scrim click", () => {
    openHarness("alertdialog");
    fireEvent.click(screen.getByTestId("ui-scrim"));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  test("dismissOnEscape=false keeps it open; initialFocusRef receives focus", () => {
    function Focus() {
      const ref = useRef<HTMLInputElement>(null);
      return (
        <Modal open onClose={() => {}} title={"T"} dismissOnEscape={false} initialFocusRef={ref}>
          <input ref={ref} aria-label={"field"} />
        </Modal>
      );
    }
    render(<Focus />);
    expect(document.activeElement).toBe(screen.getByLabelText("field"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
