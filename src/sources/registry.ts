export type SourceKind = "ckan" | "sparql" | "dcat" | "arcgis";

export interface SourceDefinition {
  id: string;
  title: string;
  publisher: string;
  kind: SourceKind;
  /**
   * CKAN: site root that serves /api/3/action. SPARQL: the query endpoint.
   * DCAT: the DCAT-AP JSON feed. ArcGIS: an opendata.arcgis.com v3 search URL.
   */
  baseUrl: string;
  homepage: string;
  /** Set when the source is one council's own portal (see src/councils.ts). */
  councilId?: string;
}

/** ArcGIS Hub sites all publish their catalogue at the same path. */
const hubFeed = (site: string) => `${site}/api/feed/dcat-ap/2.0.1.json`;
const arcgisGroups = (...groupIds: string[]) =>
  `https://opendata.arcgis.com/api/v3/search?catalog[groupIds]=any(${groupIds.join(",")})`;

const council = (
  councilId: string,
  publisher: string,
  kind: SourceKind,
  baseUrl: string,
  homepage: string,
): SourceDefinition => ({ id: councilId, title: `${publisher} open data`, publisher, kind, baseUrl, homepage, councilId });

/**
 * Upstream portals the hub harvests. National portals first, then every
 * council that runs a portal with a machine-readable catalogue. Councils
 * without one are still listed in src/councils.ts. Base URLs of the
 * national portals can be overridden by env var so a moved endpoint doesn't
 * need a code change.
 */
export const sources: SourceDefinition[] = [
  {
    id: "data-gov-scot",
    title: "data.gov.scot",
    publisher: "Scottish Government",
    kind: "ckan",
    baseUrl: process.env.DATA_GOV_SCOT_CKAN_URL ?? "https://api.data.gov.scot",
    homepage: "https://data.gov.scot/data",
  },
  {
    id: "statistics-gov-scot",
    title: "statistics.gov.scot",
    publisher: "Scottish Government",
    kind: "sparql",
    baseUrl: process.env.STATISTICS_GOV_SCOT_SPARQL_URL ?? "https://statistics.gov.scot/sparql",
    homepage: "https://statistics.gov.scot",
  },
  {
    // Every council publishes standardised spatial datasets here, including
    // the ones with no portal of their own.
    id: "spatial-hub",
    title: "Spatial Hub Scotland",
    publisher: "Improvement Service",
    kind: "ckan",
    baseUrl: process.env.SPATIAL_HUB_CKAN_URL ?? "https://data.spatialhub.scot",
    homepage: "https://data.spatialhub.scot",
  },

  council("aberdeen-city", "Aberdeen City Council", "dcat",
    hubFeed("https://spatialdata-accabdn.opendata.arcgis.com"), "https://spatialdata-accabdn.opendata.arcgis.com"),
  council("angus", "Angus Council", "ckan", "https://opendata.angus.gov.uk", "https://opendata.angus.gov.uk"),
  council("argyll-and-bute", "Argyll and Bute Council", "arcgis",
    arcgisGroups("2391aa86db9148d1857671888aefdc5f"), "https://data-argyll-bute.opendata.arcgis.com"),
  council("dundee-city", "Dundee City Council", "dcat",
    hubFeed("https://data.dundeecity.gov.uk"), "https://data.dundeecity.gov.uk"),
  council("edinburgh", "City of Edinburgh Council", "dcat",
    hubFeed("https://city-of-edinburgh-council-open-spatial-data-cityofedinburgh.hub.arcgis.com"),
    "https://city-of-edinburgh-council-open-spatial-data-cityofedinburgh.hub.arcgis.com"),
  council("glasgow-city", "Glasgow City Council", "dcat",
    hubFeed("https://open-data-design-glasgowgis.hub.arcgis.com"), "https://open-data-design-glasgowgis.hub.arcgis.com"),
  council("highland", "Highland Council", "dcat",
    hubFeed("https://map-highland.opendata.arcgis.com"), "https://map-highland.opendata.arcgis.com"),
  council("moray", "Moray Council", "arcgis",
    arcgisGroups("b42b8e7bce20408684689845a268e8e6"), "https://data-moray.opendata.arcgis.com"),
  council("north-ayrshire", "North Ayrshire Council", "dcat",
    hubFeed("https://maps-north-ayrshire.opendata.arcgis.com"), "https://maps-north-ayrshire.opendata.arcgis.com"),
  council("north-lanarkshire", "North Lanarkshire Council", "dcat",
    hubFeed("https://gisdata-nlcmaps.opendata.arcgis.com"), "https://gisdata-nlcmaps.opendata.arcgis.com"),
  council("perth-and-kinross", "Perth and Kinross Council", "dcat",
    hubFeed("https://data.pkc.gov.uk"), "https://data.pkc.gov.uk"),
  council("renfrewshire", "Renfrewshire Council", "arcgis",
    arcgisGroups("79dc9ae7552e4782bf66dadbdf049a0d", "bcaad01ef27a4457b9c9406818eaca5d"),
    "https://data-ren.opendata.arcgis.com"),
  council("south-ayrshire", "South Ayrshire Council", "dcat",
    hubFeed("https://maps-southayrshire.opendata.arcgis.com"), "https://maps-southayrshire.opendata.arcgis.com"),
  council("stirling", "Stirling Council", "dcat",
    hubFeed("https://data-stirling-council.hub.arcgis.com"), "https://data-stirling-council.hub.arcgis.com"),
];

export function getSourceDefinition(id: string): SourceDefinition | undefined {
  return sources.find((s) => s.id === id);
}
