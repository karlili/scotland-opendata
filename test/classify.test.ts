import { describe, expect, it } from "vitest";
import { classifyResource } from "../src/sources/classify.ts";

describe("classifyResource", () => {
  it("treats datastore resources as queryable APIs", () => {
    expect(classifyResource({ format: "CSV", datastoreActive: true })).toEqual({ accessType: "api", queryable: true });
  });
  it("treats API formats as API endpoints", () => {
    expect(classifyResource({ format: "GeoJSON" }).accessType).toBe("api");
    expect(classifyResource({ format: "", url: "https://maps.test/arcgis/rest/services/x/MapServer" }).accessType).toBe("api");
  });
  it("keeps a CSV dump a CSV even under an /api/ path", () => {
    expect(classifyResource({ format: "CSV", url: "https://x.test/api/dump.csv" }).accessType).toBe("csv");
    expect(classifyResource({ format: "", url: "https://x.test/file.csv?v=2" }).accessType).toBe("csv");
  });
  it("keeps a declared download format a file even under an /api/ path", () => {
    expect(classifyResource({ format: "ZIP", url: "https://hub.test/api/download/v1/items/x/shapefile" }).accessType).toBe("file");
    expect(classifyResource({ format: "rest", url: "https://maps.test/arcgis/rest/services/x/FeatureServer/0" }).accessType).toBe("api");
  });
  it("files anything else", () => {
    expect(classifyResource({ format: "PDF", url: "https://x.test/r.pdf" }).accessType).toBe("file");
  });
});
