import { describe, expect, it } from "vitest";

import barWidgetSource from "../../src/BarWidget.qml?raw";
import panelSource from "../../src/Panel.qml?raw";
import settingsSource from "../../src/Settings.qml?raw";

function extractFunctionSource(source: string, functionName: string): string {
  const normalized = source.replace(/\r\n/g, "\n");
  const startToken = `function ${functionName}()`;
  const startIndex = normalized.indexOf(startToken);
  expect(startIndex).toBeGreaterThanOrEqual(0);

  let depth = 0;
  let bodyStarted = false;
  let endIndex = -1;

  for (let index = startIndex; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "{") {
      depth += 1;
      bodyStarted = true;
    } else if (character === "}") {
      depth -= 1;
      if (bodyStarted && depth === 0) {
        endIndex = index + 1;
        break;
      }
    }
  }

  expect(endIndex).toBeGreaterThan(startIndex);
  return normalized.slice(startIndex, endIndex);
}

describe("QML entrypoint bridge contract", () => {
  it("keeps bar, panel, and settings on the shared bridge path with main-instance QML fallback", () => {
    const entrypoints = [
      { name: "BarWidget.qml", source: barWidgetSource },
      { name: "Panel.qml", source: panelSource },
      { name: "Settings.qml", source: settingsSource }
    ] as const;

    for (const entrypoint of entrypoints) {
      expect(entrypoint.source).toContain("property var runtimeBridge: null");
      expect(entrypoint.source).toContain("property var uiBridge: null");
      expect(entrypoint.source).toContain("typeof pluginApi !== \"undefined\"");
      expect(entrypoint.source).toContain("pluginApi.mainInstance");
      expect(entrypoint.source).toContain("mainInstance.runtimeBridge");
    }

    const pluginMainInstanceResolver = entrypoints.map(({ source }) => extractFunctionSource(source, "getPluginMainInstance"));
    const runtimeBridgeResolver = entrypoints.map(({ source }) => extractFunctionSource(source, "getRuntimeBridge"));

    expect(new Set(pluginMainInstanceResolver)).toEqual(new Set([pluginMainInstanceResolver[0]]));

    for (const resolver of runtimeBridgeResolver) {
      expect(resolver).toContain("if (root.runtimeBridge)");
      expect(resolver).toContain("if (root.uiBridge)");
      expect(resolver).toContain("if (mainInstance && mainInstance.runtimeBridge)");
      expect(resolver).toContain("if (mainInstance && mainInstance.ensureSharedRuntimeBridge)");
      expect(resolver).toContain("return ensuredBridge");
    }

    expect(barWidgetSource).toContain("if (mainInstance && mainInstance.getSnapshot && mainInstance.runPeriodicRefresh)");
    expect(panelSource).toContain("if (mainInstance && mainInstance.getSnapshot && mainInstance.createTaskFromDraft)");
    expect(settingsSource).toContain("if (mainInstance && mainInstance.updateSettingsFromDraft)");
  });
});
