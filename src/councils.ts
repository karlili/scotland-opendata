/**
 * How a council publishes open data on its own website:
 * - portal:       a data portal with a machine-readable catalogue the hub harvests
 *                 (or could, for USMART), listed in src/sources/registry.ts
 * - landing-page: a page on the council site with downloads or feeds, no catalogue API
 * - none:         nothing found on the council's own site
 *
 * Every council also publishes standardised spatial datasets on Spatial Hub
 * Scotland (source `spatial-hub`), so "none" never means no data at all.
 */
export type Provision = "portal" | "landing-page" | "none";

export interface CouncilEndpoint {
  title: string;
  url: string;
  format: string;
}

export interface CouncilDefinition {
  /** Slug; equals the source id when the council has a harvested portal. */
  id: string;
  name: string;
  /** GSS council area code, as used by statistics.gov.scot. */
  gss: string;
  website: string;
  provision: Provision;
  /** The council's own open data portal or page. */
  openDataUrl: string | null;
  platform: string | null;
  /** Feeds and services the hub does not harvest, recorded so they are tracked. */
  endpoints: CouncilEndpoint[];
  notes: string;
}

/** When this register was last checked against the councils' websites. */
export const COUNCILS_CHECKED_AT = "2026-10-14";

export const councils: CouncilDefinition[] = [
  {
    id: "aberdeen-city", name: "Aberdeen City Council", gss: "S12000033", website: "https://www.aberdeencity.gov.uk",
    provision: "portal", openDataUrl: "https://spatialdata-accabdn.opendata.arcgis.com", platform: "ArcGIS Hub",
    endpoints: [], notes: "Spatial Open Data Portal; the council says it aims to be open by default.",
  },
  {
    id: "aberdeenshire", name: "Aberdeenshire Council", gss: "S12000034", website: "https://www.aberdeenshire.gov.uk",
    provision: "landing-page", openDataUrl: "https://www.aberdeenshire.gov.uk/data/open-data", platform: null,
    endpoints: [],
    notes: "Page links news and road closure RSS feeds, a contracts register and a cooling tower register. Spatial data is published only through Spatial Hub.",
  },
  {
    id: "angus", name: "Angus Council", gss: "S12000041", website: "https://www.angus.gov.uk",
    provision: "portal", openDataUrl: "https://opendata.angus.gov.uk", platform: "CKAN",
    endpoints: [],
    notes: "Run jointly with ANGUSalive. Open Data Scotland's weekly harvest of this portal produced no output in its latest run, so it may be down.",
  },
  {
    id: "argyll-and-bute", name: "Argyll and Bute Council", gss: "S12000035", website: "https://www.argyll-bute.gov.uk",
    provision: "portal", openDataUrl: "https://data-argyll-bute.opendata.arcgis.com", platform: "ArcGIS Hub",
    endpoints: [
      { title: "Open_Data map service", url: "https://arcgis.argyll-bute.gov.uk/arcgis/rest/services/Open_Data/MapServer", format: "ArcGIS REST" },
    ],
    notes: "Harvested through its ArcGIS open data group. https://www.argyll-bute.gov.uk/my-council/datasets-and-open-data also lists contracts, licensing, environmental health and short-term let registers.",
  },
  {
    id: "clackmannanshire", name: "Clackmannanshire Council", gss: "S12000005", website: "https://www.clacks.gov.uk",
    provision: "none", openDataUrl: null, platform: null, endpoints: [],
    notes: "No portal on the council site; its old gis.clacksweb.org.uk portal is gone. Publishes 30+ datasets on Spatial Hub, served from its Cadcorp WFS.",
  },
  {
    id: "dumfries-and-galloway", name: "Dumfries and Galloway Council", gss: "S12000006", website: "https://www.dumfriesandgalloway.gov.uk",
    provision: "portal",
    openDataUrl: "https://www.dumfriesandgalloway.gov.uk/council-elections/data-finance-performance/data-privacy-information-requests/open-data",
    platform: "USMART", endpoints: [],
    notes: "Datasets are hosted on USMART (usmart.io), which has an API, but the council's USMART organisation id could not be confirmed, so it is not harvested yet. Contact OpenData@dumgal.gov.uk.",
  },
  {
    id: "dundee-city", name: "Dundee City Council", gss: "S12000042", website: "https://www.dundeecity.gov.uk",
    provision: "portal", openDataUrl: "https://data.dundeecity.gov.uk", platform: "ArcGIS Hub",
    endpoints: [], notes: "Moved from CKAN to ArcGIS Hub on the same domain.",
  },
  {
    id: "east-ayrshire", name: "East Ayrshire Council", gss: "S12000008", website: "https://www.east-ayrshire.gov.uk",
    provision: "landing-page", openDataUrl: "https://eabn.east-ayrshire.gov.uk", platform: null, endpoints: [],
    notes: "East Ayrshire by Numbers: OGL data profiles by ward and locality, last refreshed August 2024 and under review. The older Open-Data.aspx page no longer lists datasets.",
  },
  {
    id: "east-dunbartonshire", name: "East Dunbartonshire Council", gss: "S12000045", website: "https://www.eastdunbarton.gov.uk",
    provision: "none", openDataUrl: null, platform: null,
    endpoints: [{ title: "Council ArcGIS server", url: "https://maps.eastdunbarton.gov.uk/arcgis/rest/services", format: "ArcGIS REST" }],
    notes: "Only one dataset on Spatial Hub. The public ArcGIS server has no licence statement.",
  },
  {
    id: "east-lothian", name: "East Lothian Council", gss: "S12000010", website: "https://www.eastlothian.gov.uk",
    provision: "none", openDataUrl: null, platform: null, endpoints: [],
    notes: "Statistics pages only (East Lothian by Numbers). Spatial data on Spatial Hub.",
  },
  {
    id: "east-renfrewshire", name: "East Renfrewshire Council", gss: "S12000011", website: "https://www.eastrenfrewshire.gov.uk",
    provision: "none", openDataUrl: null, platform: null, endpoints: [],
    notes: "A handful of datasets on data.gov.uk (https://www.data.gov.uk/publisher/east-renfrewshire-council), mostly from 2017 or earlier, plus Spatial Hub.",
  },
  {
    id: "edinburgh", name: "City of Edinburgh Council", gss: "S12000036", website: "https://www.edinburgh.gov.uk",
    provision: "portal", openDataUrl: "https://city-of-edinburgh-council-open-spatial-data-cityofedinburgh.hub.arcgis.com",
    platform: "ArcGIS Hub", endpoints: [],
    notes: "Open Spatial Data hub. The older edinburghopendata.info CKAN portal has been retired.",
  },
  {
    id: "eilean-siar", name: "Comhairle nan Eilean Siar", gss: "S12000013", website: "https://www.cne-siar.gov.uk",
    provision: "none", openDataUrl: null, platform: null, endpoints: [],
    notes: "Only a few datasets on Spatial Hub, listed under Na h-Eileanan an Iar.",
  },
  {
    id: "falkirk", name: "Falkirk Council", gss: "S12000014", website: "https://www.falkirk.gov.uk",
    provision: "landing-page", openDataUrl: "https://data.falkirk.gov.uk", platform: null, endpoints: [],
    notes: "Feeds for school term dates (iCalendar), bin collections per property by UPRN (iCal and JSON) and recycling centre permit analytics, plus a link to its Open Spatial Data Hub. 20 datasets on Spatial Hub.",
  },
  {
    id: "fife", name: "Fife Council", gss: "S12000047", website: "https://www.fife.gov.uk",
    provision: "none", openDataUrl: null, platform: null,
    endpoints: [{ title: "Council ArcGIS server", url: "https://arcgis-live-as.fife.gov.uk/server/rest/services", format: "ArcGIS REST" }],
    notes: "No portal. Older WFS/WMS records on data.gov.uk and spatialdata.gov.scot point at arcgisweb.fife.gov.uk. Spatial data on Spatial Hub.",
  },
  {
    id: "glasgow-city", name: "Glasgow City Council", gss: "S12000049", website: "https://www.glasgow.gov.uk",
    provision: "portal", openDataUrl: "https://open-data-design-glasgowgis.hub.arcgis.com", platform: "ArcGIS Hub",
    endpoints: [], notes: "Replaced the data.glasgow.gov.uk CKAN portal.",
  },
  {
    id: "highland", name: "Highland Council", gss: "S12000017", website: "https://www.highland.gov.uk",
    provision: "portal", openDataUrl: "https://map-highland.opendata.arcgis.com", platform: "ArcGIS Hub",
    endpoints: [], notes: "",
  },
  {
    id: "inverclyde", name: "Inverclyde Council", gss: "S12000018", website: "https://www.inverclyde.gov.uk",
    provision: "none", openDataUrl: null, platform: null, endpoints: [], notes: "Only Spatial Hub.",
  },
  {
    id: "midlothian", name: "Midlothian Council", gss: "S12000019", website: "https://www.midlothian.gov.uk",
    provision: "none", openDataUrl: null, platform: null, endpoints: [],
    notes: "Performance reports and area profiles as PDFs only. Spatial data on Spatial Hub.",
  },
  {
    id: "moray", name: "Moray Council", gss: "S12000020", website: "https://www.moray.gov.uk",
    provision: "portal", openDataUrl: "https://data-moray.opendata.arcgis.com", platform: "ArcGIS Hub", endpoints: [],
    notes: "Harvested through its ArcGIS open data group. https://www.moray.gov.uk/a-z-of-online-forms/open-data/ also has a few CSV downloads.",
  },
  {
    id: "north-ayrshire", name: "North Ayrshire Council", gss: "S12000021", website: "https://www.north-ayrshire.gov.uk",
    provision: "portal", openDataUrl: "https://maps-north-ayrshire.opendata.arcgis.com", platform: "ArcGIS Hub",
    endpoints: [], notes: "",
  },
  {
    id: "north-lanarkshire", name: "North Lanarkshire Council", gss: "S12000050", website: "https://www.northlanarkshire.gov.uk",
    provision: "portal", openDataUrl: "https://gisdata-nlcmaps.opendata.arcgis.com", platform: "ArcGIS Hub", endpoints: [],
    notes: "Open Data Scotland lists this hub, but its latest harvest produced no output, so the feed may be empty or moved.",
  },
  {
    id: "orkney", name: "Orkney Islands Council", gss: "S12000023", website: "https://www.orkney.gov.uk",
    provision: "none", openDataUrl: null, platform: null, endpoints: [],
    notes: "Has an Open Data Plan but no portal. 30+ datasets on Spatial Hub.",
  },
  {
    id: "perth-and-kinross", name: "Perth and Kinross Council", gss: "S12000048", website: "https://www.pkc.gov.uk",
    provision: "portal", openDataUrl: "https://data.pkc.gov.uk", platform: "ArcGIS Hub", endpoints: [],
    notes: "Moved from CKAN to ArcGIS Hub on the same domain.",
  },
  {
    id: "renfrewshire", name: "Renfrewshire Council", gss: "S12000038", website: "https://www.renfrewshire.gov.uk",
    provision: "portal", openDataUrl: "https://data-ren.opendata.arcgis.com", platform: "ArcGIS Hub", endpoints: [],
    notes: "Harvested through its two ArcGIS open data groups.",
  },
  {
    id: "scottish-borders", name: "Scottish Borders Council", gss: "S12000026", website: "https://www.scotborders.gov.uk",
    provision: "none", openDataUrl: null, platform: null, endpoints: [],
    notes: "A few datasets (such as core paths) on data.gov.uk and Spatial Hub.",
  },
  {
    id: "shetland", name: "Shetland Islands Council", gss: "S12000027", website: "https://www.shetland.gov.uk",
    provision: "landing-page", openDataUrl: "https://www.shetland.gov.uk/information-rights/OpenData.asp", platform: null,
    endpoints: [],
    notes: "Landing page recorded in 2018; not found by search in 2026, so the URL may have moved. Datasets also on data.gov.uk and Spatial Hub.",
  },
  {
    id: "south-ayrshire", name: "South Ayrshire Council", gss: "S12000028", website: "https://www.south-ayrshire.gov.uk",
    provision: "portal", openDataUrl: "https://maps-southayrshire.opendata.arcgis.com", platform: "ArcGIS Hub",
    endpoints: [
      { title: "INSPIRE open data WFS", url: "https://gisext.south-ayrshire.gov.uk/server/services/Inspire/OpenData/MapServer/WFSServer?request=GetCapabilities&service=WFS", format: "WFS" },
    ],
    notes: "Least recently updated portal: no dataset changed since April 2025.",
  },
  {
    id: "south-lanarkshire", name: "South Lanarkshire Council", gss: "S12000029", website: "https://www.southlanarkshire.gov.uk",
    provision: "none", openDataUrl: null, platform: null,
    endpoints: [{ title: "Council ArcGIS server", url: "https://gis.southlanarkshire.gov.uk/arcgis/rest/services/Public", format: "ArcGIS REST" }],
    notes: "Publication scheme says open data is \"under development\" (2019). Licence of the public ArcGIS services is not stated.",
  },
  {
    id: "stirling", name: "Stirling Council", gss: "S12000030", website: "https://www.stirling.gov.uk",
    provision: "portal", openDataUrl: "https://data-stirling-council.hub.arcgis.com", platform: "ArcGIS Hub", endpoints: [],
    notes: "The largest council portal, with about 600 datasets.",
  },
  {
    id: "west-dunbartonshire", name: "West Dunbartonshire Council", gss: "S12000039", website: "https://www.west-dunbarton.gov.uk",
    provision: "none", openDataUrl: null, platform: null, endpoints: [], notes: "Only Spatial Hub.",
  },
  {
    id: "west-lothian", name: "West Lothian Council", gss: "S12000040", website: "https://www.westlothian.gov.uk",
    provision: "none", openDataUrl: null, platform: null, endpoints: [], notes: "Only Spatial Hub.",
  },
];
