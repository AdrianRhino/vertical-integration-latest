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
import { useState, useEffect } from "react";
import { units } from "../helperFunctions/helper";
import { moneyFormatter, toSentenceCase } from "../helperFunctions/helper";

const PricingTable = ({
  order,
  setOrder,
  runServerless,
  setCanGoNext,
}) => {
  // Simple state - just arrays and objects
  const [items, setItems] = useState([]); // Array of items
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]); // Array of products from search
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchCursor, setSearchCursor] = useState(null);
  
  // Simple draft item for manual entry
  const [draftItem, setDraftItem] = useState({
    qty: "",
    uom: "EA",
    sku: "",
    title: "",
    unitPrice: "",
  });

  // Load items from order when page loads
  useEffect(() => {
    if (order.items && order.items.length > 0) {
      setItems(order.items);
    }
  }, []);

  // Save items back to order whenever items change
  useEffect(() => {
    setOrder((prev) => ({ ...prev, items: items }));
    setCanGoNext(items.length > 0);
  }, [items]);

  // Simple function to search products
  const searchProducts = async (query) => {
    if (!query || !order.supplier) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const supplierKey = (order.supplier || "").toUpperCase();
      const response = await runServerless({
        name: "supplierProducts",
        parameters: {
          supplier: supplierKey,
          q: query.trim(),
          pageSize: 50,
        },
      });

      // Simple: extract items from response
      const responseData = response?.response || response || {};
      const body = responseData.body || responseData;
      const products = body.items || body.products || [];

      setSearchResults(products);
      setSearchCursor(body.nextCursor || null);
    } catch (error) {
      console.error("Search error:", error);
      setSearchError(error.message || "Search failed");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Simple function to load more results
  const loadMoreResults = async () => {
    if (!searchCursor || !order.supplier || !searchQuery) return;

    setIsSearching(true);
    try {
      const supplierKey = (order.supplier || "").toUpperCase();
      const response = await runServerless({
        name: "supplierProducts",
        parameters: {
          supplier: supplierKey,
          q: searchQuery.trim(),
          pageSize: 50,
          cursor: JSON.stringify(searchCursor),
        },
      });

      const responseData = response?.response || response || {};
      const body = responseData.body || responseData;
      const newProducts = body.items || body.products || [];

      // Simple: add new products to existing list
      setSearchResults((prev) => [...prev, ...newProducts]);
      setSearchCursor(body.nextCursor || null);
    } catch (error) {
      console.error("Load more error:", error);
      setSearchError(error.message || "Failed to load more");
    } finally {
      setIsSearching(false);
    }
  };

  // Simple function to get product title (just check common fields)
  const getProductTitle = (product) => {
    const fields = ["title", "productName", "product_name", "familyName", "baseProductName", "name", "description"];
    for (let i = 0; i < fields.length; i++) {
      const value = product[fields[i]];
      if (value && typeof value === "string" && value.trim() !== "") {
        return value.trim();
      }
    }
    return "Unnamed Product";
  };

  // Simple function to get product SKU
  const getProductSku = (product) => {
    const fields = ["sku", "itemNumber", "productId", "product_id"];
    for (let i = 0; i < fields.length; i++) {
      const value = product[fields[i]];
      if (value) {
        return String(value).trim();
      }
    }
    return "";
  };

  // Simple function to add product to items
  const addProduct = (product) => {
    const title = getProductTitle(product);
    const sku = getProductSku(product);
    
    if (!sku) {
      console.error("Cannot add product: no SKU found");
      return;
    }

    // Simple: check if item already exists (by SKU)
    let foundIndex = -1;
    for (let i = 0; i < items.length; i++) {
      if (String(items[i].sku).toLowerCase() === String(sku).toLowerCase()) {
        foundIndex = i;
        break;
      }
    }

    const newItem = {
      qty: 1,
      uom: "EA",
      sku: sku,
      title: title,
      unitPrice: 0,
      linePrice: 0,
      uoms: ["EA"],
      pricingFetched: false,
      pricingError: null,
    };

    if (foundIndex >= 0) {
      // Item exists - just increase quantity
      const updatedItems = [...items];
      updatedItems[foundIndex] = {
        ...updatedItems[foundIndex],
        qty: (Number(updatedItems[foundIndex].qty) || 0) + 1,
      };
      setItems(updatedItems);
    } else {
      // New item - add to list
      setItems([...items, newItem]);
    }
  };

  // Simple function to update item quantity
  const updateQuantity = (index, newQty) => {
    const updatedItems = [...items];
    updatedItems[index] = {
      ...updatedItems[index],
      qty: newQty,
      linePrice: (Number(newQty) || 0) * (Number(updatedItems[index].unitPrice) || 0),
    };
    setItems(updatedItems);
  };

  // Simple function to update item UOM
  const updateUom = (index, newUom) => {
    const updatedItems = [...items];
    updatedItems[index] = {
      ...updatedItems[index],
      uom: newUom,
    };
    setItems(updatedItems);
  };

  // Simple function to remove item
  const removeItem = (index) => {
    const updatedItems = [];
    for (let i = 0; i < items.length; i++) {
      if (i !== index) {
        updatedItems.push(items[i]);
      }
    }
    setItems(updatedItems);
  };

  // Simple function to add manual line item
  const addManualItem = () => {
    if (!draftItem.sku || Number(draftItem.qty) <= 0) {
      return;
    }

    const newItem = {
      qty: Number(draftItem.qty) || 1,
      uom: draftItem.uom || "EA",
      sku: draftItem.sku.trim(),
      title: draftItem.title.trim() || "Custom Item",
      unitPrice: Number(draftItem.unitPrice) || 0,
      linePrice: (Number(draftItem.qty) || 1) * (Number(draftItem.unitPrice) || 0),
      uoms: ["EA"],
      pricingFetched: false,
      pricingError: null,
    };

    // Check if SKU already exists
    let foundIndex = -1;
    for (let i = 0; i < items.length; i++) {
      if (String(items[i].sku).toLowerCase() === String(newItem.sku).toLowerCase()) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex >= 0) {
      // Merge quantities
      const updatedItems = [...items];
      updatedItems[foundIndex] = {
        ...updatedItems[foundIndex],
        qty: (Number(updatedItems[foundIndex].qty) || 0) + newItem.qty,
        unitPrice: newItem.unitPrice > 0 ? newItem.unitPrice : updatedItems[foundIndex].unitPrice,
        title: newItem.title || updatedItems[foundIndex].title,
      };
      updatedItems[foundIndex].linePrice = updatedItems[foundIndex].qty * updatedItems[foundIndex].unitPrice;
      setItems(updatedItems);
    } else {
      setItems([...items, newItem]);
    }

    // Clear draft
    setDraftItem({ qty: "", uom: "EA", sku: "", title: "", unitPrice: "" });
  };

  // Simple function to calculate total
  const calculateTotal = () => {
    let total = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const qty = Number(item.qty) || 0;
      const price = Number(item.unitPrice) || 0;
      total = total + qty * price;
    }
    return total;
  };

  // Simple function to get pricing
  const getPricing = async () => {
    const supplier = (order.supplier || "").toLowerCase();
    if (!supplier) return;

    let response;
    try {
      if (supplier === "abc") {
        response = await runServerless({
          name: "abcPricing",
          parameters: { fullOrder: order },
        });
        updatePricesFromABC(response);
      } else if (supplier === "srs") {
        response = await runServerless({
          name: "srsPricing",
          parameters: { fullOrder: order },
        });
        updatePricesFromSRS(response);
      } else if (supplier === "beacon") {
        response = await runServerless({
          name: "beaconPricing",
          parameters: { fullOrder: order },
        });
        updatePricesFromBeacon(response);
      }
    } catch (error) {
      console.error("Pricing error:", error);
    }
  };

  // Simple function to update prices from ABC response
  const updatePricesFromABC = (response) => {
    const priceData = response?.response?.data?.lines || [];
    const updatedItems = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let found = false;

      // Simple loop to find matching price
      for (let j = 0; j < priceData.length; j++) {
        if (priceData[j].itemNumber === item.sku) {
          found = true;
          if (priceData[j].status && priceData[j].status.code === "Error") {
            updatedItems.push({
              ...item,
              pricingError: priceData[j].status.message,
            });
          } else if (priceData[j].unitPrice && priceData[j].unitPrice > 0) {
            updatedItems.push({
              ...item,
              unitPrice: priceData[j].unitPrice,
              linePrice: item.qty * priceData[j].unitPrice,
              pricingError: null,
              pricingFetched: true,
            });
          } else {
            updatedItems.push({
              ...item,
              pricingError: "Price unavailable",
            });
          }
          break;
        }
      }

      if (!found) {
        updatedItems.push({
          ...item,
          pricingError: "SKU not found",
        });
      }
    }

    setItems(updatedItems);
  };

  // Simple function to update prices from SRS response
  const updatePricesFromSRS = (response) => {
    if (!response.success || response.response?.error) {
      // Mark all as needing pricing
      const updatedItems = [];
      for (let i = 0; i < items.length; i++) {
        updatedItems.push({
          ...items[i],
          pricingError: "SKU not found - call for pricing",
        });
      }
      setItems(updatedItems);
      return;
    }

    const priceData = response?.response?.data?.productList || [];
    const updatedItems = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let found = false;

      for (let j = 0; j < priceData.length; j++) {
        if (priceData[j].productId === item.sku) {
          found = true;
          if (priceData[j].error || (priceData[j].unitPrice === 0 && priceData[j].message)) {
            updatedItems.push({
              ...item,
              pricingError: "SKU not found - call for pricing",
            });
          } else if (priceData[j].unitPrice && priceData[j].unitPrice > 0) {
            updatedItems.push({
              ...item,
              unitPrice: priceData[j].unitPrice,
              linePrice: item.qty * priceData[j].unitPrice,
              pricingError: null,
              pricingFetched: true,
            });
          } else {
            updatedItems.push({
              ...item,
              pricingError: "Price unavailable",
            });
          }
          break;
        }
      }

      if (!found) {
        updatedItems.push({
          ...item,
          pricingError: "SKU not found - call for pricing",
        });
      }
    }

    setItems(updatedItems);
  };

  // Simple function to update prices from Beacon response
  const updatePricesFromBeacon = (response) => {
    const beaconData = response?.data || {};
    const priceInfo = beaconData?.priceInfo || {};
    const updatedItems = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const baseSku = item.sku.split(" - ")[0].trim();
      
      // Try exact match, then base SKU
      let itemPriceInfo = priceInfo[item.sku] || priceInfo[baseSku];

      if (itemPriceInfo) {
        // Try exact UOM, then first available
        let unitPrice = itemPriceInfo[item.uom];
        let matchedUom = item.uom;

        if (!unitPrice || unitPrice === 0) {
          const uomKeys = Object.keys(itemPriceInfo);
          if (uomKeys.length > 0) {
            matchedUom = uomKeys[0];
            unitPrice = itemPriceInfo[matchedUom];
          }
        }

        if (unitPrice && unitPrice > 0) {
          updatedItems.push({
            ...item,
            unitPrice: unitPrice,
            uom: matchedUom,
            linePrice: item.qty * unitPrice,
            pricingError: null,
            pricingFetched: true,
          });
        } else {
          updatedItems.push({
            ...item,
            pricingError: "SKU not found - call for pricing",
          });
        }
      } else {
        updatedItems.push({
          ...item,
          pricingError: "SKU not found - call for pricing",
        });
      }
    }

    setItems(updatedItems);
  };

  // Search when query changes (with delay)
  useEffect(() => {
    if (!searchQuery || !order.supplier) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      searchProducts(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, order.supplier]);

  const totalPrice = calculateTotal();

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
          {items.map((line, idx) => (
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
                    updateQuantity(idx, value);
                  }}
                />
              </TableCell>
              <TableCell width="min">
                <Select
                  value={line.uom}
                  options={(line.uoms || ["EA"]).map((code) => ({
                    label: units[code]?.label || code,
                    value: code,
                  }))}
                  onChange={(newUom) => {
                    updateUom(idx, newUom);
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
                <Text variant="microcopy">{line.variant || "-"}</Text>
              </TableCell>
              <TableCell width="min">
                <Text variant="microcopy">
                  ${moneyFormatter("unitPrice", line.unitPrice)}/{line.qty}
                </Text>
              </TableCell>
              <TableCell width="min">
                <Text variant="microcopy">
                  ${moneyFormatter("linePrice", line.unitPrice, line.qty)}
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
                <Button onClick={() => removeItem(idx)}>X</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Text></Text>
      <Divider />
      <Text></Text>
      <Flex direction={"row"} gap={"small"}>
        <Button variant="secondary" onClick={getPricing}>
          {`Get ${toSentenceCase(order.supplier || "")} Pricing`}
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
          onChange={(value) => setDraftItem((prev) => ({ ...prev, qty: value }))}
        />
        <Select
          label="U/M:"
          value={draftItem.uom}
          options={Object.values(units).map((unit) => ({
            label: unit.label,
            value: unit.value,
          }))}
          onChange={(value) => setDraftItem((prev) => ({ ...prev, uom: value }))}
        />
        <Input
          label="SKU:"
          value={draftItem.sku}
          onChange={(value) => setDraftItem((prev) => ({ ...prev, sku: value }))}
        />
        <Input
          label="Title:"
          value={draftItem.title}
          onChange={(value) => setDraftItem((prev) => ({ ...prev, title: value }))}
        />
        <Input
          label="Unit Price:"
          value={draftItem.unitPrice}
          onChange={(value) => setDraftItem((prev) => ({ ...prev, unitPrice: value }))}
        />
      </Flex>
      <Text></Text>
      <Button variant="secondary" onClick={addManualItem}>
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
          disabled={isSearching}
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
                  {isSearching && <Text variant="microcopy">Searching...</Text>}
                  {searchError && (
                    <Text variant="microcopy" style={{ color: "#c0392b" }}>
                      {searchError}
                    </Text>
                  )}
                  {!isSearching && searchResults.length === 0 && searchQuery && (
                    <Text variant="microcopy">No products found. Try a different search.</Text>
                  )}

                  <Text></Text>
                  <Text>Results:</Text>
                  {searchResults.map((product, index) => {
                    const title = getProductTitle(product);
                    const sku = getProductSku(product);
                    const description = product.description || product.marketingDescription || "";

                    return (
                      <Tile key={product.id || index} compact={true}>
                        <Flex direction="row" justify="between">
                          <Flex direction="column" gap="xs">
                            <Text variant="microcopy">{title}</Text>
                            <Text variant="microcopy">{`SKU: ${sku}`}</Text>
                            {description && (
                              <Text variant="microcopy">
                                {description.length > 50 ? description.substring(0, 50) + "..." : description}
                              </Text>
                            )}
                          </Flex>
                          <Button onClick={() => addProduct(product)}>Add</Button>
                        </Flex>
                      </Tile>
                    );
                  })}
                  <Text></Text>
                  {searchCursor && (
                    <Button
                      variant="secondary"
                      onClick={loadMoreResults}
                      disabled={isSearching}
                    >
                      {isSearching ? "Loading…" : "Load more"}
                    </Button>
                  )}
                </PanelSection>
              </PanelBody>
              <PanelFooter></PanelFooter>
            </Panel>
          }
        >
          Search All Products
        </Button>
      </Flex>
      <Text></Text>
    </>
  );
};

export default PricingTable;
