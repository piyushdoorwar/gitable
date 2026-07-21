import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

class FakeClassList {
  private readonly values = new Set<string>();

  toggle(name: string, force: boolean): void {
    if (force) this.values.add(name);
    else this.values.delete(name);
  }

  contains(name: string): boolean {
    return this.values.has(name);
  }
}

class FakeElement {
  readonly classList = new FakeClassList();
  readonly attributes = new Map<string, string>();
  disabled = false;

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
}

type DisabledHelpers = {
  setDisabled(elm: FakeElement, disabled: boolean): void;
  isDisabledAction(elm: FakeElement | null): boolean;
};

function loadDisabledHelpers(): DisabledHelpers {
  const source = readFileSync(path.resolve(__dirname, "../../media/main.js"), "utf8");
  const match = source.match(
    /function setDisabled\(elm, disabled\) \{[\s\S]*?\n  \}\n  function isDisabledAction\(elm\) \{[\s\S]*?\n  \}/
  );
  if (!match) throw new Error("Could not find disabled-action helpers in media/main.js");
  return Function(`${match[0]}\nreturn { setDisabled, isDisabledAction };`)() as DisabledHelpers;
}

describe("webview disabled actions", () => {
  const { setDisabled, isDisabledAction } = loadDisabledHelpers();

  it("writes an explicit ARIA value that the action guard recognizes", () => {
    const button = new FakeElement();

    setDisabled(button, true);

    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.classList.contains("gx-disabled")).toBe(true);
    expect(isDisabledAction(button)).toBe(true);
  });

  it("allows an action again after the control is enabled", () => {
    const button = new FakeElement();
    setDisabled(button, true);

    setDisabled(button, false);

    expect(button.getAttribute("aria-disabled")).toBe("false");
    expect(button.classList.contains("gx-disabled")).toBe(false);
    expect(isDisabledAction(button)).toBe(false);
  });

  it("also rejects native-disabled and disabled-class controls", () => {
    const nativeDisabled = new FakeElement();
    nativeDisabled.disabled = true;
    expect(isDisabledAction(nativeDisabled)).toBe(true);

    const classDisabled = new FakeElement();
    classDisabled.classList.toggle("gx-disabled", true);
    expect(isDisabledAction(classDisabled)).toBe(true);
  });
});
