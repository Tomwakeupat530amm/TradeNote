// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import "../../../test-utils/componentMocks";
import { SafeImage } from "../SafeImage";

describe("SafeImage", () => {
  test("renders alt, size, lazy and async decoding", () => {
    render(<SafeImage src="data:image/webp;base64,AAAA" alt={"shot"} width={320} height={180} />);
    const img = screen.getByAltText("shot");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
    expect(img).toHaveAttribute("width", "320");
    expect(img).toHaveAttribute("height", "180");
  });

  test("priority loads eagerly", () => {
    render(<SafeImage src="blob:x" alt={"p"} width={1} height={1} priority />);
    expect(screen.getByAltText("p")).toHaveAttribute("loading", "eager");
  });
});
