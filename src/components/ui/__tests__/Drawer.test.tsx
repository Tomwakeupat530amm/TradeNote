// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { nextIntlMock } from "../../../test-utils/componentMocks";
import { Drawer } from "../Drawer";
import { Modal } from "../Modal";

vi.mock("next-intl", () => nextIntlMock());

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {"opener"}
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title={"T"}>
        <button type="button">{"only"}</button>
      </Drawer>
    </>
  );
}

describe("Drawer", () => {
  test("role/aria, focus in, Escape closes, focus and scroll restored", () => {
    render(<Harness />);
    const opener = screen.getByText("opener");
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")?.textContent).toBe("T");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
  });

  test("Tab wraps; scrim closes", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("opener"));
    const close = screen.getByLabelText("Ui.close");
    const only = screen.getByText("only");
    only.focus();
    fireEvent.keyDown(only, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.click(screen.getByTestId("ui-scrim"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("Modal over Drawer: Escape closes the Modal only (shared stack)", () => {
    function Stack() {
      const [d, setD] = useState(true);
      const [m, setM] = useState(true);
      return (
        <>
          <Drawer open={d} onClose={() => setD(false)} title={"Drw"}>
            {null}
          </Drawer>
          <Modal open={m} onClose={() => setM(false)} title={"Mdl"}>
            {null}
          </Modal>
        </>
      );
    }
    render(<Stack />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Mdl")).toBeNull();
    expect(screen.getByText("Drw")).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
  });
});
