import {
  Text,
  Button,
  ButtonRow,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  StepperInput,
  Input,
  Flex,
  Divider,
  Panel,
  PanelSection,
  PanelBody,
  PanelFooter,
  Heading,
  Select,
  StatusTag,
  hubspot,
  Tile,
} from "@hubspot/ui-extensions";
import { useMemo, useState, useEffect, useCallback } from "react";
import { units } from "../helperFunctions/helper";
import { moneyFormatter } from "../helperFunctions/helper";
import {
  savePage,
  clearQuery,
  loadPage,
  getPages,
  searchCache,
  textMatchPredicate,
  getAllItems,
} from "../helperFunctions/catalogCache";
import { buildAbcCatalog } from "../helperFunctions/buildAbcCatalog";
import SyncStatusABC from "../helperFunctions/SyncStatusABC";
import { toSentenceCase } from "../helperFunctions/helper";

const PricingTable = ({
  fullOrder,
  setFullOrder,
  runServerless,
  parsedOrder,
  registerPricingGuard,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [pricingTableItems, setPricingTableItems] = useState([]);
  {
    /* ABC Products */
  }
  const [abcToken, setAbcToken] = useState(null);
  const [abcProducts, setAbcProducts] = useState(null);

  {
    /* SRS Products */
  }
  const [srsToken, setSrsToken] = useState(null);
  const [srsProducts, setSrsProducts] = useState(null);

  {
    /* Beacon Products */
  }
  const [beaconCookies, setBeaconCookies] = useState(null);
  const [beaconProducts, setBeaconProducts] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSupplierProducts, setIsLoadingSupplierProducts] =
    useState(false);

  const [filteredProducts, setFilteredProducts] = useState(null);

  const [draftItem, setDraftItem] = useState({
    qty: "",
    uom: "",
    sku: "",
    title: "",
    unitPrice: "",
  });

  const [abcCache, setAbcCache] = useState(null);
  const [beaconCache, setBeaconCache] = useState(null);

  // inside PricingTable component
  const [supplierCursor, setSupplierCursor] = useState(null);
  const [supplierProducts, setSupplierProducts] = useState([]);
  const [supplierSourceStep, setSupplierSourceStep] = useState(null);
  const [searchStatus, setSearchStatus] = useState("idle"); // idle | loading | ready | error | loading-more
  const [searchError, setSearchError] = useState(null);
  const [activeQueryKey, setActiveQueryKey] = useState("");

  const DEFAULT_SUPPLIER_PAGE_SIZE = 50;
  const MAX_CACHED_RESULTS = 500;

  const SUPPLIER_TITLE_FIELDS = useMemo(
    () => ({
      abc: ["title", "familyName", "itemDescription", "name", "description"],
      srs: ["productName", "product_name", "title", "description", "name"],
      beacon: [
        "title",
        "baseProductName",
        "base_product_name",
        "itemDescription",
        "marketingDescription",
        "description",
        "name",
      ],
    }),
    []
  );

  const SUPPLIER_SKU_FIELDS = useMemo(
    () => ({
      abc: ["itemNumber", "itemnumber", "sku"],
      srs: ["productId", "product_id", "familyId", "familyid", "sku"],
      beacon: ["itemNumber", "itemnumber", "sku"],
    }),
    []
  );

  const SUPPLIER_DESCRIPTION_FIELDS = useMemo(
    () => ({
      abc: ["itemDescription", "description"],
      srs: ["marketingDescription", "familyName", "description", "productDescription", "product_description"],
      beacon: ["marketingDescription", "familyName", "itemDescription", "description"],
    }),
    []
  );

  const pickFirstField = useCallback((record = {}, fields = []) => {
    for (const field of fields) {
      const value = record?.[field];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
    return null;
  }, []);

  // Eventually add a Status Tag for Found pricing items

  useEffect(() => {
    console.log("Parsed Order: ", parsedOrder);
  }, []);

  useEffect(() => {
    if (
      parsedOrder?.fullOrderItems &&
      Array.isArray(parsedOrder.fullOrderItems)
    ) {
      // Replace items when loading order (not append)
      setPricingTableItems(parsedOrder.fullOrderItems);
    }
  }, [parsedOrder]);

  useEffect(() => {
    if (fullOrder?.templateItems && Array.isArray(fullOrder.templateItems)) {
      // Replace items when loading template (not append)
      setPricingTableItems(fullOrder.templateItems);
    }
    //console.log("Now the Pricing Table fullOrder: ", fullOrder.templateItems);
  }, [fullOrder?.templateItems]);

  useEffect(() => {
    setFullOrder((prev) => ({ ...prev, fullOrderItems: pricingTableItems }));
  }, [pricingTableItems]);

  useEffect(() => {
    console.log("Which Supplier is this?", fullOrder.supplier);
    if (fullOrder.supplier === "abc") {
      loginToABC();
    } else if (fullOrder.supplier === "beacon") {
      loginToBeacon();
    } else if (fullOrder.supplier === "srs") {
      loginToSRS();
    }
  }, []);

  // Watch for token changes and get products when token is available
  useEffect(() => {
    if (
      (abcToken && fullOrder.supplier === "abc") ||
      (parsedOrder && parsedOrder.supplier === "abc")
    ) {
      getABCProducts();
    }
  }, [abcToken, fullOrder.supplier, parsedOrder]);

  useEffect(() => {
    if (
      (srsToken && fullOrder.supplier === "srs") ||
      (parsedOrder && parsedOrder.supplier === "srs")
    ) {
      getSRSProducts();
    }
  }, [srsToken, fullOrder.supplier, parsedOrder]);

  useEffect(() => {
    if (
      (beaconCookies && fullOrder.supplier === "beacon") ||
      (parsedOrder && parsedOrder.supplier === "beacon")
    ) {
      getBeaconProducts();
    }
  }, [beaconCookies, fullOrder.supplier, parsedOrder]);

  useEffect(() => {
    searchLoading().then(() => {
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    console.log("Search Query: ", searchQuery);
    if (searchQuery && fullOrder.supplier) {
      getSearchProducts(searchQuery, fullOrder.supplier);
    } else if (searchQuery && parsedOrder?.supplier) {
      getSearchProducts(searchQuery, parsedOrder.supplier);
    }
  }, [searchQuery, fullOrder.supplier]);

  useEffect(() => {
    if (parsedOrder) {
      getSearchProducts(searchQuery, parsedOrder.supplier);
    }
  }, [parsedOrder]);

  // Load first page for chosen supplier on mount or when supplier changes
  useEffect(() => {
    const supplier = (
      fullOrder?.supplier ||
      parsedOrder?.supplier ||
      ""
    ).toUpperCase();
    if (!supplier) return;

    // Optional: if you’ll fully switch to Supabase, you can skip the vendor logins here.
    loadSupplierProducts({ supplier, q: "", afterId: null, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullOrder?.supplier, parsedOrder?.supplier]);

  const getSearchProducts = (searchQuery, supplier) => {
    let filteredProducts = [];
    if (supplier === "abc") {
      filteredProducts = abcProducts?.filter((product) =>
        product.familyName.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredProducts(filteredProducts);
    } else if (supplier === "srs") {
      filteredProducts = srsProducts?.filter((product) =>
        product.productName.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredProducts(filteredProducts);
    } else if (supplier === "beacon") {
      filteredProducts = beaconProducts?.filter((product) =>
        product.baseProductName
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      );
      setFilteredProducts(filteredProducts);
    }
    console.log("Filtered Products: ", filteredProducts);
  };

  const loginToABC = async () => {
    const response = await runServerless({
      name: "abcLogin",
    });
    console.log("ABC Login Response: ", response.response.data.access_token);
    setAbcToken(response.response.data.access_token);
  };

  const getABCProducts = async () => {
    const response = await runServerless({
      name: "abcProducts",
      parameters: {
        abcAccessToken: abcToken,
      },
    });
    console.log("ABC Products Response: ", response);
    setAbcProducts(response?.response?.data?.items);
  };

  const loginToSRS = async () => {
    const response = await runServerless({
      name: "srsLogin",
    });
    console.log("SRS Login Response: ", response);
    setSrsToken(response?.response?.accessToken);
  };

  const getSRSProducts = async () => {
    const response = await runServerless({
      name: "srsProducts",
      parameters: {
        token: srsToken,
      },
    });
    console.log("SRS Products Response: ", response);
    setSrsProducts(response?.response?.products);
  };

  const loginToBeacon = async () => {
    const response = await runServerless({
      name: "beaconLogin",
    });
    console.log("Beacon Login Response: ", response);
    setBeaconCookies(response?.response?.cookies);
  };

  const getBeaconProducts = async () => {
    const response = await runServerless({
      name: "beaconProducts",
      parameters: {
        cookies: beaconCookies,
      },
    });
    console.log("Beacon Products Response: ", response.response.products.items);
    setBeaconProducts(response?.response?.products?.items);
  };

  const searchLoading = () => {
    return new Promise((resolve) => {
      setTimeout(() => {
        setIsLoading(false);
        resolve();
      }, 6000);
    });
  };

  const totalPrice = useMemo(
    () =>
      pricingTableItems.reduce(
        (sum, row) =>
          sum + (Number(row.qty) || 0) * (Number(row.unitPrice) || 0),
        0
      ),
    [pricingTableItems]
  );

  const mergeLineItemBySku = (incoming) => {
    if (!incoming || !incoming.sku) {
      return;
    }

    const normalizedQty = Number(incoming.qty) || 0;
    const normalizedUnitPrice = Number(incoming.unitPrice) || 0;

    setPricingTableItems((prev) => {
      const index = prev.findIndex((item) => item.sku === incoming.sku);
      if (index === -1) {
        const nextLinePrice = normalizedQty * normalizedUnitPrice;
        return [
          ...prev,
          {
            ...incoming,
            qty: normalizedQty,
            unitPrice: normalizedUnitPrice,
            linePrice: nextLinePrice,
          },
        ];
      }

      return prev.map((item, i) => {
        if (i !== index) return item;

        const mergedQty = (Number(item.qty) || 0) + normalizedQty;
        const nextUnitPrice = normalizedUnitPrice > 0 ? normalizedUnitPrice : Number(item.unitPrice) || 0;
        const mergedTitle = item.title || incoming.title || "";
        const mergedUoms = item.uoms || incoming.uoms || ["EA"];
        const mergedFields = {
          ...item,
          ...incoming,
          qty: mergedQty,
          unitPrice: nextUnitPrice,
          title: mergedTitle,
          uoms: mergedUoms,
        };
        mergedFields.linePrice = (Number(mergedFields.qty) || 0) * (Number(mergedFields.unitPrice) || 0);
        return mergedFields;
      });
    });
  };

  const handleAddItem = (key) => (val) =>
    setDraftItem((prev) => ({ ...prev, [key]: val }));

  const handleAddToLineItems = (product = null) => {
    // If product is passed from search results, map supplier-specific fields
    if (product) {
      let mappedItem = {};

      const supplierKey = (product.supplier || fullOrder.supplier || parsedOrder?.supplier || "")
        .toString()
        .trim()
        .toLowerCase();

      const resolveTitle = (candidate) => {
        if (typeof candidate === "string" && candidate.trim().length > 0) {
          return candidate.trim();
        }
        return null;
      };

      const pickTitle = (p, keys) => {
        for (const key of keys) {
          const value = resolveTitle(p?.[key]);
          if (value) return value;
        }
        return null;
      };

      const titleFallbacks = [
        "productName",
        "product_name",
        "title",
        "name",
        "baseProductName",
        "base_product_name",
        "familyName",
        "familyname",
        "description",
        "marketingDescription",
        "marketingdescription",
      ];

      if (supplierKey === "abc") {
        mappedItem = {
          qty: 1,
          uom: "EA",
          sku: product.itemNumber || product.sku,
          title:
            pickTitle(product, ["familyName", "title", "description", "name"]) ||
            "",
          unitPrice: 0,
          linePrice: 0,
          uoms: ["EA"],
        };
      } else if (supplierKey === "srs") {
        mappedItem = {
          qty: 1,
          uom: "EA",
          sku: product.productId || product.sku,
          title: pickTitle(product, titleFallbacks) || "",
          unitPrice: 0,
          linePrice: 0,
          uoms: ["EA"],
        };
      } else if (supplierKey === "beacon") {
        mappedItem = {
          qty: 1,
          uom: "EA",
          sku: product.itemNumber || product.sku,
          title: pickTitle(product, titleFallbacks) || "",
          unitPrice: 0,
          linePrice: 0,
          uoms: ["EA"],
        };
      }

      if (!mappedItem.title) {
        mappedItem.title = "Unnamed Product";
      }

      mergeLineItemBySku({
        ...mappedItem,
        qty: mappedItem.qty || 1,
      });
      return;
    }

    // Original behavior: use draftItem for manual entry
    // ignore empty sku / zero qty
    if (!draftItem.sku || Number(draftItem.qty) <= 0) return;

    const cleanQty = Number(draftItem.qty) || 0;
    const cleanUnitPrice = Number(draftItem.unitPrice) || 0;

    const clean = {
      ...draftItem,
      qty: cleanQty,
      unitPrice: cleanUnitPrice,
      linePrice: cleanQty * cleanUnitPrice,
      uoms: draftItem.uoms || ["EA"],
    };

    mergeLineItemBySku(clean);
    setDraftItem({ qty: "", uom: "", sku: "", description: "", unitPrice: "" });
  };

  const getPricing = (supplier, fullOrder) => {
    const normalizedSupplier = supplier?.toLowerCase();
    if (normalizedSupplier === "abc") {
      console.log("Getting ABC Pricing");
      return getABCPricing();
    } else if (normalizedSupplier === "srs") {
      console.log("Getting SRS Pricing");
      return getSRSPricing();
    } else if (normalizedSupplier === "beacon") {
      console.log("Getting Beacon Pricing");
      return getBeaconPricing();
    }
    return Promise.resolve();
  };

  const getABCPricing = async () => {
    const response = await runServerless({
      name: "abcPricing",
      parameters: {
        abcAccessToken: abcToken,
        fullOrder: fullOrder,
      },
    });
    //console.log("ABC Pricing Response: ", response);

    // Update unit prices for each item
    console.log("Running ABC Pricing Update");
    console.log("Response: ", response);
    if (response.response.data && response.response.data.lines) {
      console.log("Pricing Table Items: ", pricingTableItems);
      setPricingTableItems((prev) =>
        prev.map((item) => {
          // Find matching price from response
          const priceData = response.response.data.lines.find(
            (priceItem) => priceItem.itemNumber === item.sku
          );

          console.log(
            `Checking SKU ${item.sku}:`,
            priceData ? "Found" : "Not Found"
          );

          // Update unitPrice if found
          if (priceData) {
            console.log(`  Price Data for ${item.sku}:`, priceData);

            // Check if there's an error status
            if (priceData.status && priceData.status.code === "Error") {
              console.log(
                `⚠️ Pricing error for ${item.sku}: ${priceData.status.message}`
              );
              // Keep the item but maybe mark it as having an error
              return {
                ...item,
                unitPrice: 0 || item.unitPrice, // or keep original price
                pricingError: priceData.status.message,
              };
            }

            // Only update if we have a valid price (greater than 0)
            if (priceData.unitPrice && priceData.unitPrice > 0) {
              console.log("✅ Updated Item: ", {
                ...item,
                unitPrice: priceData.unitPrice,
              });
              return {
                ...item,
                unitPrice: priceData.unitPrice,
                pricingError: null,
                pricingFetched: true, // Mark that pricing was fetched
              };
            }

            // Price data exists but unitPrice is 0 or missing
            console.log(
              `⚠️ Price data found for ${item.sku} but no valid price`
            );
            return {
              ...item,
              pricingError: "Price unavailable - call for pricing",
            };
          }

          // No price data found for this item at all
          console.log(`❌ No price data returned for SKU: ${item.sku}`);
          return {
            ...item,
            pricingError: "SKU not found - call for pricing",
          };
        })
      );
    }
  };

  const getSRSPricing = async () => {
    const response = await runServerless({
      name: "srsPricing",
      parameters: {
        token: srsToken,
        fullOrder: fullOrder,
      },
    });
    console.log("SRS Pricing Response: ", response);

    // Check if the API call failed (400 error means SKUs don't exist)
    if (!response.success || response.response?.error) {
      console.log("⚠️ SRS pricing failed - marking items as call for pricing");
      // Mark all items as needing manual pricing
      setPricingTableItems((prev) =>
        prev.map((item) => ({
          ...item,
          pricingError: "SKU not found - call for pricing",
        }))
      );
      return;
    }

    // Update prices for items that were found
    if (
      response.response &&
      response.response.data &&
      response.response.data.productList
    ) {
      setPricingTableItems((prev) =>
        prev.map((item) => {
          const priceData = response.response.data.productList.find(
            (priceItem) => priceItem.productId === item.sku
          );

          if (priceData) {
            // Check if there's an error for this specific item
            if (
              priceData.error ||
              (priceData.unitPrice === 0 && priceData.message)
            ) {
              return {
                ...item,
                pricingError: "SKU not found - call for pricing",
              };
            }

            // Valid price found
            if (priceData.unitPrice && priceData.unitPrice > 0) {
              return {
                ...item,
                unitPrice: priceData.unitPrice,
                pricingError: null,
                pricingFetched: true,
              };
            }
          }
          // No price data found for this item
          return {
            ...item,
            pricingError: "SKU not found - call for pricing",
          };
        })
      );
    }
  };

  const getBeaconPricing = async () => {
    const response = await hubspot.serverless("beaconPricing", {
      parameters: {
        cookies: beaconCookies,
        fullOrder: fullOrder,
      },
    });
    console.log("Beacon Pricing Response: ", response);

    // The actual Beacon data is in response.data
    const beaconData = response.data;

    console.log("⚠️ Beacon pricing message:", beaconData?.message);
    console.log("Beacon priceInfo:", beaconData?.priceInfo);
    console.log(
      "Beacon priceInfo keys:",
      Object.keys(beaconData?.priceInfo || {})
    );

    // Check if we have priceInfo
    if (beaconData && beaconData.priceInfo) {
      // Get list of invalid SKUs from the message
      const invalidSkus =
        beaconData?.message
          ?.match(/These skuIds (.+) are invalid/)?.[1]
          ?.split(",")
          .map((s) => s.trim()) || [];

      setPricingTableItems((prev) =>
        prev.map((item) => {
          console.log(`\nChecking item: SKU="${item.sku}", UOM="${item.uom}"`);

          // Try to find price - first try exact SKU, then try without variant
          const baseSku = item.sku.split(" - ")[0].trim(); // "660455 - A" becomes "660455"
          console.log(`  Base SKU: "${baseSku}"`);
          console.log(
            `  Looking for priceInfo["${item.sku}"] or priceInfo["${baseSku}"]`
          );

          // Try exact match first, then base SKU
          let priceInfo = beaconData?.priceInfo?.[item.sku];
          console.log(`  Exact match result:`, priceInfo);

          if (!priceInfo) {
            priceInfo = beaconData?.priceInfo?.[baseSku];
            console.log(`  Base SKU match result:`, priceInfo);
          }

          console.log(`  Final price info:`, priceInfo);

          if (priceInfo) {
            // First try exact UOM match
            let unitPrice = priceInfo[item.uom];
            let matchedUom = item.uom;

            // If no exact match, take the first available UOM price
            if (!unitPrice || unitPrice === 0) {
              const availableUoms = Object.keys(priceInfo);
              if (availableUoms.length > 0) {
                matchedUom = availableUoms[0];
                unitPrice = priceInfo[matchedUom];
                console.log(
                  `  ⚠️ UOM "${item.uom}" not found, using "${matchedUom}" instead`
                );
              }
            }

            console.log(`  Price for UOM "${matchedUom}":`, unitPrice);

            if (unitPrice && unitPrice > 0) {
              console.log(
                `  ✅ Setting price to ${unitPrice} with UOM ${matchedUom}`
              );
              return {
                ...item,
                unitPrice: unitPrice,
                uom: matchedUom, // Update UOM to match what supplier returned
                pricingError: null,
                pricingFetched: true,
              };
            }
          }

          // No price found or invalid
          console.log(`  ❌ No valid price found`);
          return {
            ...item,
            pricingError: "SKU not found - call for pricing",
          };
        })
      );
    }
  };

  async function loadSupplierProducts({
    supplier,
    query = "",
    cursor = null,
    pageSize = DEFAULT_SUPPLIER_PAGE_SIZE,
    replace = false,
  }) {
    const normalizedQuery = (query || "").trim();
    const isLoadMore = Boolean(cursor) && !replace;
    const supplierCode = (supplier || "").trim();
    const supplierKey = supplierCode.toLowerCase();
    const queryKey = buildQueryKey(supplierKey, normalizedQuery);
    const isNewQuery = replace || queryKey !== activeQueryKey;

    if (isNewQuery) {
      setActiveQueryKey(queryKey);
      setSupplierProducts([]);
      setSupplierCursor(null);
      setSupplierSourceStep(null);
      try {
        await clearQuery(supplierKey, queryKey);
      } catch (error) {
        console.warn("Failed to clear cached query", queryKey, error.message);
      }
    }

    try {
      setIsLoadingSupplierProducts(true);
      setSearchStatus(isLoadMore ? "loading-more" : "loading");
      setSearchError(null);

      const parameters = {
        supplier: supplierKey,
        q: normalizedQuery,
        pageSize,
      };

      if (cursor) {
        parameters.cursor = JSON.stringify(cursor);
      }

      console.log("Loading supplier products:", {
        supplier: supplierKey,
        query: normalizedQuery,
        cursor,
        pageSize,
        replace,
      });

      const res = await runServerless({
        name: "supplierProducts",
        parameters,
      });

      const { body, statusCode } = unpackServerlessResponse(res);

      if (statusCode >= 400 || body?.success === false) {
        const errorMessage =
          body?.error ||
          body?.details ||
          "Supplier search failed. Please adjust your search and try again.";
        console.error("Error from supplierProducts:", errorMessage, body);
        setSearchError(errorMessage);
        setSearchStatus("error");
        if (replace) {
          setSupplierProducts([]);
          setSupplierCursor(null);
          setSupplierSourceStep(null);
        }
        return;
      }

      const items = body?.items || body?.products || [];
      const nextCursor = body?.nextCursor || null;
      const sourceStep =
        body?.sourceStep || body?.meta?.sourceStep || body?.meta?.step || null;

      let nextItemsSnapshot = [];
      setSupplierProducts((prev) => {
        const merged = isNewQuery ? items : prev.concat(items);
        const trimmed = merged.slice(0, MAX_CACHED_RESULTS);
        nextItemsSnapshot = trimmed;
        return trimmed;
      });

      try {
        if (nextItemsSnapshot.length) {
          await savePage(supplierKey, queryKey, 1, nextItemsSnapshot);
        }
      } catch (error) {
        console.warn("Failed to save search cache", queryKey, error.message);
      }

      setSupplierCursor(nextCursor);
      setSupplierSourceStep(sourceStep);
      setSearchStatus("ready");
    } catch (error) {
      console.error("Error loading supplier products:", error);
      setSearchError(error.message);
      setSearchStatus("error");
      if (replace) {
        setSupplierProducts([]);
        setSupplierCursor(null);
        setSupplierSourceStep(null);
      }
    } finally {
      setIsLoadingSupplierProducts(false);
    }
  }

  function unpackServerlessResponse(res) {
    const envelope = res?.response || res || {};
    const statusCode = envelope?.statusCode || envelope?.status || 200;
    let body = envelope?.body ?? envelope;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (error) {
        console.warn("Failed to parse supplierProducts body", error.message);
      }
    }

    if (body && typeof body === "object" && "body" in body && body.body) {
      return {
        statusCode,
        body: body.body,
      };
    }

    return { statusCode, body };
  }

  function buildQueryKey(supplierKey, query) {
    const normalizedSupplier = (supplierKey || "").toLowerCase();
    const normalizedQuery = (query || "").trim().toLowerCase();
    return `${normalizedSupplier}:${normalizedQuery || "featured"}`;
  }

  function describeSourceStep(step, query) {
    const normalized = (step || "").toUpperCase();
    const hasQuery = Boolean((query || "").trim());

    switch (normalized) {
      case "RECENT":
        return hasQuery ? "recent suggestions" : "featured picks";
      case "SKU":
        return "SKU matches";
      case "FUZZY":
        return "fuzzy matches";
      case "SKU+FUZZY":
        return "blended matches";
      default:
        return hasQuery ? "search results" : "catalog snapshot";
    }
  }

  useEffect(() => {
    setSupplierProducts([]);
    setSupplierCursor(null);
    setSupplierSourceStep(null);
  }, [fullOrder?.supplier, parsedOrder?.supplier]);

  useEffect(() => {
    const supplier = (
      fullOrder?.supplier ||
      parsedOrder?.supplier ||
      ""
    ).toUpperCase();
    if (!supplier) return;

    const normalizedQuery = (searchQuery || "").trim();
    const timeoutId = setTimeout(() => {
      loadSupplierProducts({
        supplier,
        query: normalizedQuery,
        cursor: null,
        replace: true,
      });
    }, 300);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, fullOrder?.supplier, parsedOrder?.supplier]);

  // If you want a "Load more" in your panel:
  async function loadMoreSupplier() {
    const supplier = (
      fullOrder?.supplier ||
      parsedOrder?.supplier ||
      ""
    ).toUpperCase();
    if (!supplier || !supplierCursor) return;
    await loadSupplierProducts({
      supplier,
      query: searchQuery || "",
      cursor: supplierCursor,
      replace: false,
    });
  }

  {
    /*
    const testSaveABCCache = async () => {
    const response = await hubspot.serverless("fetchAbcPage", {
      parameters: {
        abcAccessToken: abcToken,
        pageNumber: 1,
        itemsPerPage: 500,
      },
    });
    console.log("ABC Page Response: ", response);
    savePage("abc", "abcPage", 1, response.body.data.items);
    setAbcCache(response.body.data.items);
  };

  const testSaveBeaconCache = async () => {
    const response = await hubspot.serverless("fetchBeaconPage", {
      parameters: {
        beaconCookies: beaconCookies,
        accountId: "557799",
        pageNumber: 1,
        pageSize: 30,
      },
    });
    console.log("Beacon Page Response: ", response);
  };

  const testLoadABCCache = async () => {
    const abcCache = await loadPage("abc", "abcPage", 1);
    setAbcCache(abcCache);
  };

  const testLoadBeaconCache = async () => {
    const beaconCache = await loadPage("beacon", "beaconPage");
    setBeaconCache(beaconCache);
  };

  const buildAbcCatalogPrint = async () => {
    await buildAbcCatalog({
      abcAccessToken: abcToken,
      itemsPerPage: 200,
      onProgress: (progress) => {
        console.log("ABC Progress: ", progress);
      },
    });
  };

  const testPrintABCProducts = async () => {
    const abcProducts = await getPages("abc", "abc:all");
    console.log("These are the ABC Products: ", abcProducts);
  };

  const testSearchABCProducts = async () => {
    const predicate = textMatchPredicate("gaf", [
      "itemDescription",
      "itemNumber",
    ]);
    const abcProducts = await searchCache({
      supplier: "abc",
      queryKey: "abc:all",
      predicate,
      maxResults: 50, // optional: stop early
      onProgress: ({ pageNo, matchesSoFar }) => {
        // optional: see it working
        // console.log('scanned page', pageNo, 'matches so far', matchesSoFar);
      },
    });
    console.log("These are the ABC Products: ", abcProducts);
  };

  const testGetAllABCProducts = async () => {
    const abcProducts = await getAllItems("abc", "abc:all");
    console.log("These are the ABC Products: ", abcProducts);
  };

  // Test ABC Catalog
  const testABCProductsCatalog = async () => {
    const abcProducts = await hubspot.serverless("catalogAbc", {
      parameters: {
        mode: "lsit",
        limit: 50,
      },
    });
    console.log("These are the ABC Products: ", abcProducts);
  };
    */
  }

  useEffect(() => {
    if (!registerPricingGuard) {
      return;
    }

    const guard = async () => {
      const supplier = fullOrder?.supplier || parsedOrder?.supplier;
      if (!supplier) {
        return;
      }
      await getPricing(supplier, fullOrder);
    };

    registerPricingGuard(guard);

    return () => {
      registerPricingGuard(null);
    };
  }, [registerPricingGuard, fullOrder, parsedOrder]);

  return (
    <>
      <Text>Price Table</Text>
      <Text></Text>
      <Table bordered={true} paginated={false}>
        <TableHead>
          <TableRow>
            <TableHeader width="min">Quantity</TableHeader>
            <TableHeader width="min">U/M</TableHeader>
            <TableHeader width="min">SKU</TableHeader>
            <TableHeader width="min">Title</TableHeader>
            <TableHeader width="min">Variant</TableHeader>
            <TableHeader width="min">Unit Price</TableHeader>
            <TableHeader width="min">Line Price</TableHeader>
            <TableHeader width="min">Status</TableHeader>
            <TableHeader width="min">Delete</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {pricingTableItems.map((line, idx) => (
            <TableRow key={idx}>
              <TableCell width="min">
                <StepperInput
                  min={1}
                  max={999}
                  label=""
                  name="itemField"
                  value={line.qty}
                  stepSize={1}
                  onChange={(value) => {
                    setPricingTableItems((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, qty: value } : row
                      )
                    );
                  }}
                />
              </TableCell>
              <TableCell width="min">
                <Select
                  value={line.uom}
                  options={line?.uoms?.map((code) => ({
                    label: units[code].label,
                    value: code,
                  }))}
                  onChange={(newUom) => {
                    setPricingTableItems((prev) =>
                      prev.map((row, i) =>
                        i === idx ? reprice({ ...row, uom: newUom }) : row
                      )
                    );
                  }}
                />
              </TableCell>
              <TableCell width="min">
                <Text variant="microcopy">{line.sku}</Text>
              </TableCell>
              <TableCell width="min">
                <Text variant="microcopy">{line.title}</Text>
              </TableCell>
              <TableCell width="min">
                {Array.isArray(line.variants) && line.variants.length > 0 ? (
                  <Select
                    value={line.variant}
                    options={line.variants.map((col) => ({
                      label: col.label,
                      value: col.value,
                    }))}
                    onChange={(value) => {
                      setPricingTableItems((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, variant: value } : row
                        )
                      );
                    }}
                  />
                ) : (
                  <Text variation="microcopy">{line.variant || "-"}</Text>
                )}
              </TableCell>
              <TableCell width="min">
                <Text variant="microcopy">
                  {`$` +
                    moneyFormatter("unitPrice", line.unitPrice) +
                    `/${line.qty}`}
                </Text>
              </TableCell>
              <TableCell width="min">
                <Text variant="microcopy">
                  {"$" + moneyFormatter("linePrice", line.unitPrice, line.qty)}
                </Text>
              </TableCell>
              <TableCell width="min">
                {line.pricingError ? (
                  <StatusTag variant="danger">Call</StatusTag>
                ) : line.pricingFetched ? (
                  <StatusTag variant="success">Priced</StatusTag>
                ) : (
                  <StatusTag variant="default">Not yet priced</StatusTag>
                )}
              </TableCell>
              <TableCell width="min">
                <Button
                  onClick={() => {
                    setPricingTableItems((prev) =>
                      prev.filter((_, i) => i !== idx)
                    );
                  }}
                >
                  X
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Text></Text>
      <Divider />
      <Text></Text>
      <Flex direction={"row"} gap={"small"}>
        {/* This button is for getting the pricing from the ABC Products */}
        <Button
          variant="secondary"
          onClick={() => getPricing(fullOrder.supplier, fullOrder)}
        >
          {`Get ${toSentenceCase(
            fullOrder.supplier || parsedOrder.supplier
          )} Pricing`}
        </Button>
        <Flex justify="end" gap="xs">
          <Heading>Price: </Heading>
          <Heading>${totalPrice.toFixed(2)}</Heading>
        </Flex>
      </Flex>
      <Text></Text>
      <Text>Add Custom Line Item</Text>
      <Flex direction={"row"} gap={"small"}>
        <Input
          label="Quantity:"
          value={draftItem.qty}
          onChange={handleAddItem("qty")}
        />

        <Select
          label="U/M:"
          value={draftItem.uom}
          options={Object.values(units).map((unit) => ({
            label: unit.label,
            value: unit.value,
          }))}
          onChange={handleAddItem("uom")}
        />
        <Input
          label="SKU:"
          value={draftItem.sku}
          onChange={handleAddItem("sku")}
        />
        <Input
          label="Title:"
          value={draftItem.description}
          onChange={handleAddItem("title")}
        />
        <Input
          label="Unit Price:"
          value={draftItem.unitPrice}
          onChange={handleAddItem("unitPrice")}
        />
      </Flex>
      <Text></Text>
      <Button
        variant="secondary"
        onClick={() => {
          handleAddToLineItems();
          console.log("draftItem: ", draftItem);
          console.log("Price Table Items: ", pricingTableItems);
        }}
      >
        + Add Line Item
      </Button>

      <Text></Text>

      <Divider />

      <Text></Text>

      <Text>Search Products</Text>
      <Text></Text>
      <Flex direction={"row"} gap={"small"}>
        <Button
          variant="secondary"
          onClick={() => console.log("Searching...")}
          disabled={isLoading}
          overlay={
            <Panel id="my-panel" title="Search Products">
              <PanelBody>
                <PanelSection>
                  <Text>Search for products from your supplier catalog:</Text>
                  <Input
                    label="Search Query"
                    value={searchQuery || ""}
                    onChange={(value) => setSearchQuery(value)}
                    placeholder="Enter SKU, product name, or keywords..."
                  />
                  <Text></Text>
                  {searchQuery && (
                    <Text variant="microcopy">{`Searching for: "${searchQuery}"`}</Text>
                  )}
                  {!searchQuery && (
                    <Text variant="microcopy">
                      Enter a search term to find products
                    </Text>
                  )}

                  <Text></Text>
                  <Text>Results:</Text>
                  {searchStatus === "loading" && (
                    <Text variant="microcopy">Searching supplier catalog…</Text>
                  )}
                  {searchStatus === "loading-more" && (
                    <Text variant="microcopy">Loading more results…</Text>
                  )}
                  {searchStatus === "error" && (
                    <Text variant="microcopy" style={{ color: "#c0392b" }}>
                      {searchError || "Unable to load products. Please try again."}
                    </Text>
                  )}
                  {searchStatus === "ready" &&
                    supplierProducts?.length === 0 &&
                    (searchQuery ? (
                      <Text variant="microcopy">
                        No products found. Try a different search term or check spelling.
                      </Text>
                    ) : (
                      <Text variant="microcopy">
                        Start typing above to search, or explore the featured list.
                      </Text>
                    ))}
                  {supplierProducts && supplierProducts.length > 0 && (
                    <>
                      <Text variant="microcopy">
                        {`Showing ${supplierProducts.length} product${
                          supplierProducts.length === 1 ? "" : "s"
                        } (${describeSourceStep(supplierSourceStep, searchQuery)})`}
                      </Text>
                      {supplierProducts.map((product, index) => {
                        const supplierKey =
                          (fullOrder?.supplier ||
                            parsedOrder?.supplier ||
                            product?.supplier ||
                            "")
                            .toString()
                            .trim()
                            .toLowerCase();

                        const title =
                          supplierKey === "abc"
                            ? pickFirstField(product, ["itemdescription", "description", "familyname", "title"])
                            : supplierKey === "srs" || supplierKey === "beacon"
                              ? pickFirstField(product, ["familyname", "title", "productname", "marketingdescription", "name"])
                              : pickFirstField(
                                  product,
                                  SUPPLIER_TITLE_FIELDS[supplierKey] || []
                                ) || "N/A!";
                        const sku =
                          pickFirstField(
                            product,
                            SUPPLIER_SKU_FIELDS[supplierKey] || []
                          ) || "N/A!!";
                        const description = pickFirstField(
                          product,
                          SUPPLIER_DESCRIPTION_FIELDS[supplierKey] || []
                        );

                        const descriptionPreview =
                          typeof description === "string" && description.length
                            ? `${description.substring(0, 50)}${
                                description.length > 50 ? "..." : ""
                              }`
                            : null;

                        return (
                          <Tile key={product.id || index} compact={true}>
                            <Flex direction="row" justify="between">
                              <Flex direction="column" gap="xs">
                                <Text variant="microcopy">{title}</Text>
                                <Text variant="microcopy">{`SKU: ${sku}`}</Text>
                                {descriptionPreview && (
                                  <Text variant="microcopy">
                                    {descriptionPreview}
                                  </Text>
                                )}
                              </Flex>
                              <Button
                                onClick={() =>
                                  handleAddToLineItems({
                                    supplier:
                                      fullOrder?.supplier ||
                                      parsedOrder?.supplier ||
                                      product.supplier,
                                    itemNumber: sku,
                                    familyName: title,
                                    productId:
                                      product.sku ||
                                      product.productId ||
                                      product.product_id ||
                                      sku,
                                    productName: title,
                                    baseProductName:
                                      product.base_product_name ||
                                      product.baseProductName ||
                                      title,
                                    description: description,
                                    title: title,
                                    name: product.name || title,
                                    familyname:
                                      product.familyname || product.familyName,
                                    marketingDescription:
                                      product.marketingDescription ||
                                      product.marketingdescription ||
                                      description,
                                    marketingdescription:
                                      product.marketingDescription ||
                                      product.marketingdescription ||
                                      description,
                                  })
                                }
                              >
                                Add
                              </Button>
                            </Flex>
                          </Tile>
                        );
                      })}
                      <Text></Text>
                      {supplierCursor && (
                        <Button
                          variant="secondary"
                          onClick={loadMoreSupplier}
                          disabled={searchStatus === "loading" || searchStatus === "loading-more"}
                        >
                          {searchStatus === "loading-more" ? "Loading…" : "Load more"}
                        </Button>
                      )}
                    </>
                  )}
                </PanelSection>
              </PanelBody>
              <PanelFooter></PanelFooter>
            </Panel>
          }
        >
          Search All Products
        </Button>
        {isLoading && <Text>Loading Products...</Text>}
      </Flex>
      <Text></Text>
    </>
  );
};

export default PricingTable;
